/* AGENT MCP: the real stdio MCP server lists and runs a run's bridge tools over HTTP (no ask_user without its URL). */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, expect, it } from 'vitest';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const SERVER = join(import.meta.dirname, '../../src/mcp/ask-server.ts');
let h: ReturnType<typeof testApp>;
afterEach(() => h.close());

it('relays room + call_agent from the backend, and the CLI pre-approves them by their MCP names', async () => {
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
  await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
  const remote = specs[0]?.studioTools?.remote;
  expect(remote?.url).toMatch(new RegExp(`^${base}/internal/bridges/`));

  const args = cliArgs(specs[0] as RunSpec, { askServer: SERVER });
  const mcp = JSON.parse(args[args.indexOf('--mcp-config') + 1] as string);
  expect(mcp.mcpServers.studio.env.AI_STUDIO_TOOLS_URL).toBe(remote?.url);
  expect(args[args.indexOf('--allowed-tools') + 1]).toContain('mcp__studio__call_agent');

  const bad = await fetch(`${remote?.url}/tools`, { headers: { 'x-run-token': 'wrong' } });
  expect(bad.status).toBe(404);

  const child = spawn(process.execPath, [SERVER], {
    env: {
      PATH: process.env.PATH ?? '',
      AI_STUDIO_TOOLS_URL: remote?.url,
      AI_STUDIO_TOOLS_TOKEN: remote?.token,
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const replies = new Map<number, (v: Record<string, unknown>) => void>();
  createInterface({ input: child.stdout }).on('line', (l) => {
    const m = JSON.parse(l);
    replies.get(m.id)?.(m);
  });
  const rpc = (id: number, method: string, params?: unknown) =>
    new Promise<Record<string, unknown>>((resolve) => {
      replies.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  try {
    await rpc(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '0' },
    });
    const list = (await rpc(2, 'tools/list')).result as { tools: { name: string }[] };
    expect(list.tools.map((t) => t.name)).toEqual([
      'room',
      'call_agent',
      'comms_log',
      'my_runs',
      'cancel_run',
      'my_history',
      'feature',
      'send_mail',
      'mail_directory',
      'forget',
    ]);
    const room = (await rpc(3, 'tools/call', { name: 'room', arguments: {} })).result as {
      content: { text: string }[];
    };
    const view = JSON.parse(room.content[0]?.text ?? '{}');
    expect(view.inTheRoom[0]).toEqual({ name: 'Pixel', role: 'Orchestrator' });
    expect(view.inTheRoom.find((p: { you?: boolean }) => p.you)).toMatchObject({
      name: 'Pixel Pete',
      team: 'The Ship-It Squad',
    });
    const self = (
      await rpc(4, 'tools/call', {
        name: 'call_agent',
        arguments: { agent: 'Pixel Pete', request: 'x', why: 'y' },
      })
    ).result as { isError?: boolean; content: { text: string }[] };
    expect(self.isError).toBe(true);
    expect(self.content[0]?.text).toMatch(/yourself/);
  } finally {
    child.kill();
  }
});
