import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const SERVER = join(import.meta.dirname, '../../src/mcp/ask-server.ts');

describe('ask_user MCP server (real stdio process → real HTTP backend)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('speaks MCP, blocks on ask_user until the user answers in AI Studio, and rejects a wrong token', async () => {
    const specs: RunSpec[] = [];
    h = testApp({
      seed: true,
      longPollMs: 100,
      runner: fakeRunner((s) => {
        specs.push(s);
        return [{ wait: 5000 }, { result: 'ok' }];
      }),
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const base = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' })).body;
    const bridge = specs[0]?.askBridge;
    expect(bridge?.url).toBe(`${base}/internal/runs/${run.id}/asks`);

    const bad = await fetch(bridge?.url as string, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-run-token': 'wrong' },
      body: '{"question":"x"}',
    });
    expect(bad.status).toBe(404);

    const mcp = spawn(process.execPath, [SERVER], {
      env: {
        PATH: process.env.PATH ?? '',
        AI_STUDIO_ASK_URL: bridge?.url,
        AI_STUDIO_RUN_TOKEN: bridge?.token,
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const replies = new Map<number, (v: Record<string, unknown>) => void>();
    createInterface({ input: mcp.stdout }).on('line', (l) => {
      const m = JSON.parse(l);
      replies.get(m.id)?.(m);
    });
    const rpc = (id: number, method: string, params?: unknown) =>
      new Promise<Record<string, unknown>>((resolve) => {
        replies.set(id, resolve);
        mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });
    try {
      const init = await rpc(1, 'initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
      });
      expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} } });
      mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const list = (await rpc(2, 'tools/list')).result as { tools: { name: string }[] };
      expect(list.tools.map((t) => t.name)).toEqual(['ask_user']);

      const answered = rpc(3, 'tools/call', {
        name: 'ask_user',
        arguments: { question: 'Which name should it ship under?', options: ['Nova', 'Lumen'] },
      });
      let open: { id: string; question: string }[] = [];
      while (open.length === 0) {
        await new Promise((r) => setTimeout(r, 20));
        open = (await h.call('GET', '/projects/aurora/asks?status=open')).body;
      }
      expect(open[0]?.question).toBe('Which name should it ship under?');
      await new Promise((r) => setTimeout(r, 250)); // let the long-poll time out and retry at least once
      await h.call('POST', `/projects/aurora/asks/${open[0]?.id}/answer`, { answer: 'Nova' });
      expect((await answered).result).toEqual({ content: [{ type: 'text', text: 'Nova' }] });
      /* a yes/no permission check comes straight back from the studio (auto-approve, on by default) */
      const auto = await rpc(5, 'tools/call', {
        name: 'ask_user',
        arguments: { question: 'Ship it?', options: ['Yes', 'No'] },
      });
      expect(auto.result).toEqual({
        content: [{ type: 'text', text: 'Yes. (Auto-approved by the studio.)' }],
      });
      expect((await rpc(4, 'nope/method')).error).toMatchObject({ code: -32601 });
    } finally {
      mcp.kill();
      await h.call('POST', `/projects/aurora/runs/${run.id}/cancel`);
    }
  });
});
