import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { cliArgs } from '../../src/runtime/claude-cli.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

const SERVER = join(import.meta.dirname, '../../src/mcp/ask-server.ts');
const REPORT = {
  title: 'Payment providers compared',
  summary: 'Stripe wins on fees under 10k orders a month; Adyen only if we launch in the EU.',
  body: '## What we compared\n\nFees, payouts, EU coverage.\n\n- Stripe — 1.5% + 25c\n- Adyen — interchange++',
  kind: 'research',
  question: 'Which payment provider should the storefront use?',
  sources: [
    { title: 'Stripe pricing', url: 'https://stripe.com/pricing' },
    { title: 'Current code', path: 'src/pay.ts' },
  ],
};

/* Aurora + Professor Prompt (role Research = a reporter) as a specialist */
function studio(script: (s: RunSpec) => FakeStep[], seen: RunSpec[] = [], longPollMs = 50) {
  const h = testApp({
    seed: true,
    longPollMs,
    runner: fakeRunner((s) => {
      seen.push(s);
      return script(s);
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', {
    folder: 'aurora',
    agentIds: ['a-baron', 'a-query', 'a-merge', 'a-prof'],
  });
  return h;
}
const run = async (h: ReturnType<typeof testApp>, body: object) => {
  const r = await h.call('POST', '/projects/aurora/runs', body);
  return h.runtime.settled(r.body.id);
};

describe('reports', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('a reporter files one: stamped, listed without body, read + archive, studio-wide; events stay small', async () => {
    h = studio(() => [{ report: REPORT }, { result: 'Filed.' }]);
    const r = await run(h, { agentId: 'a-prof', task: 'Compare payment providers' });
    const list = (await h.call('GET', '/projects/aurora/reports')).body;
    expect(list.unread).toBe(1);
    expect(list.reports).toHaveLength(1);
    const row = list.reports[0];
    expect(row.body).toBeUndefined();
    expect(row).toMatchObject({
      id: expect.stringMatching(/^rep_/),
      projectId: 'aurora',
      kind: 'research',
      title: 'Payment providers compared',
      question: 'Which payment provider should the storefront use?',
      sources: REPORT.sources,
      author: { agentId: 'a-prof', name: 'Professor Prompt', teamId: null, teamName: null },
      runId: r.id,
      goalId: null,
      itemId: null,
      threadId: null,
      readAt: null,
      archivedAt: null,
    });
    const full = (await h.call('GET', `/projects/aurora/reports/${row.id}`)).body;
    expect(full.body).toBe(REPORT.body);
    const filed = h.events.after('project', 'aurora').find((e) => e.type === 'report.filed');
    expect(filed?.payload).toEqual({
      reportId: row.id,
      projectId: 'aurora',
      authorAgentId: 'a-prof',
      title: 'Payment providers compared',
    });

    // mark read, archive, unarchive
    const read = (await h.call('PATCH', `/projects/aurora/reports/${row.id}`, { read: true })).body;
    expect(read.readAt).toEqual(expect.any(String));
    expect((await h.call('GET', '/projects/aurora/reports')).body.unread).toBe(0);
    await h.call('PATCH', `/projects/aurora/reports/${row.id}`, { archived: true });
    expect((await h.call('GET', '/projects/aurora/reports')).body.reports).toEqual([]);
    expect((await h.call('GET', '/projects/aurora/reports?archived=1')).body.reports).toHaveLength(1);
    expect((await h.call('GET', '/reports')).body).toEqual({ reports: [], unread: 0 });
    await h.call('PATCH', `/projects/aurora/reports/${row.id}`, { archived: false });
    const studioWide = (await h.call('GET', '/reports?limit=10')).body;
    expect(studioWide.reports[0]).toMatchObject({ id: row.id, projectName: 'Aurora Storefront' });
    expect(studioWide.reports[0].body).toBeUndefined();
    const types = h.events.after('project', 'aurora').map((e) => e.type);
    expect(types.filter((t) => t.startsWith('report.'))).toEqual([
      'report.filed',
      'report.read',
      'report.archived',
      'report.archived',
    ]);

    // validation + 404s
    expect((await h.call('PATCH', `/projects/aurora/reports/${row.id}`, {})).status).toBe(422);
    expect((await h.call('PATCH', `/projects/aurora/reports/${row.id}`, { title: 'x' })).status).toBe(422);
    expect((await h.call('GET', `/projects/atlas/reports/${row.id}`)).status).toBe(404);
    expect((await h.call('GET', '/projects/ghost/reports')).status).toBe(404);
    expect((await h.call('GET', '/reports?limit=0')).status).toBe(422);
  });

  it('only reporters file: role or team; others (and big-picture runs) never get the tool', async () => {
    const seen: RunSpec[] = [];
    h = studio(() => [{ report: REPORT }, { result: 'ok' }], seen);
    h.runtime.setBaseUrl('http://127.0.0.1:9');
    await run(h, { agentId: 'a-pete', task: 'x' }); // Frontend, Ship-It: not a reporter
    expect((await h.call('GET', '/projects/aurora/reports')).body.reports).toEqual([]);
    expect(seen[0]?.askBridge?.reportUrl).toBeUndefined();
    // a reporter TEAM: Querious (Data) running for The Expedition
    await run(h, { agentId: 'a-query', teamId: 'expedition', task: 'x' });
    expect(seen[1]?.askBridge?.reportUrl).toMatch(/\/internal\/runs\/.+\/reports$/);
    const rep = (await h.call('GET', '/projects/aurora/reports')).body.reports[0];
    expect(rep.author).toMatchObject({
      agentId: 'a-query',
      teamId: 'expedition',
      teamName: 'The Expedition',
    });
    // the same agent without the team is not a reporter
    await run(h, { agentId: 'a-query', task: 'x' });
    expect(seen[2]?.askBridge?.reportUrl).toBeUndefined();
    // turning the flag on for a role makes its agents reporters
    await h.call('PATCH', '/roles/r-frontend', { reporter: true });
    await run(h, { agentId: 'a-pete', task: 'x' });
    expect((await h.call('GET', '/projects/aurora/reports')).body.reports).toHaveLength(2);
    // CLI wiring: the reporter run gets the MCP env + the allowed tool, the others don't
    const argv = (s: RunSpec) => cliArgs(s, { askServer: '/a.ts' });
    const mcp = (s: RunSpec) => JSON.parse(argv(s)[argv(s).indexOf('--mcp-config') + 1] as string);
    const allowed = (s: RunSpec) => argv(s)[argv(s).indexOf('--allowed-tools') + 1];
    expect(mcp(seen[1] as RunSpec).mcpServers.studio.env.AI_STUDIO_REPORT_URL).toBe(
      seen[1]?.askBridge?.reportUrl,
    );
    expect(allowed(seen[1] as RunSpec)).toContain('mcp__studio__file_report');
    expect(mcp(seen[0] as RunSpec).mcpServers.studio.env.AI_STUDIO_REPORT_URL).toBeUndefined();
    expect(allowed(seen[0] as RunSpec)).not.toContain('file_report');
  });

  it('masks secrets in every field, caps 2 per run, refuses malformed input', async () => {
    h = studio((s) => [
      { report: { ...REPORT, body: `The key is ${s.env.STRIPE_KEY} and ghp_${'a'.repeat(36)}` } },
      { report: { ...REPORT, title: 'Second' } },
      { report: { ...REPORT, title: 'Third' } },
      { report: { ...REPORT, title: 'Bad', sources: [{ title: 'x', url: 'javascript:alert(1)' }] } },
      { report: { ...REPORT, title: 'Bad 2', sources: [{ title: 'x', path: '../../etc/passwd' }] } },
      { result: 'ok' },
    ]);
    const cred = (
      await h.call('POST', '/credentials', {
        name: 'Stripe',
        envVar: 'STRIPE_KEY',
        value: 'sk_test_report_secret_9',
      })
    ).body;
    await h.call('PUT', '/projects/aurora/access', { grants: { [cred.id]: true } });
    await run(h, { agentId: 'a-prof', task: 'x' });
    const list = (await h.call('GET', '/projects/aurora/reports')).body.reports;
    expect(list.map((r: { title: string }) => r.title)).toEqual(['Second', 'Payment providers compared']);
    const first = (await h.call('GET', `/projects/aurora/reports/${list[1].id}`)).body;
    expect(first.body).toBe('The key is •••• and ••••');
    // malformed: unknown key, bad kind, short title
    h = await (async () => {
      await h.close();
      return studio(() => [
        { report: { ...REPORT, extra: 1 } },
        { report: { ...REPORT, kind: 'gossip' } },
        { report: { ...REPORT, title: 'Hi' } },
        { result: 'ok' },
      ]);
    })();
    await run(h, { agentId: 'a-prof', task: 'x' });
    expect((await h.call('GET', '/projects/aurora/reports')).body.reports).toEqual([]);
  });

  it('end to end through the real MCP server: file_report listed only for reporters, files over HTTP', async () => {
    const seen: RunSpec[] = [];
    h = studio(() => [{ wait: 5000 }, { result: 'ok' }], seen, 100);
    const base = await h.app.listen({ port: 0, host: '127.0.0.1' });
    const prof = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-prof', task: 'research' }))
      .body;
    const pete = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'build' })).body;
    const bridge = seen[0]?.askBridge;
    expect(bridge?.reportUrl).toBe(`${base}/internal/runs/${prof.id}/reports`);
    // the side door: wrong token 404, non-reporter run 409, malformed 422
    const post = (url: string, token: string, body: unknown) =>
      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-run-token': token },
        body: JSON.stringify(body),
      });
    expect((await post(bridge?.reportUrl as string, 'wrong', REPORT)).status).toBe(404);
    expect(
      (await post(`${base}/internal/runs/${pete.id}/reports`, seen[1]?.askBridge?.token as string, REPORT))
        .status,
    ).toBe(409);
    expect((await post(bridge?.reportUrl as string, bridge?.token as string, { title: 'x' })).status).toBe(
      422,
    );

    const mcp = spawn(process.execPath, [SERVER], {
      env: {
        PATH: process.env.PATH ?? '',
        AI_STUDIO_ASK_URL: bridge?.url,
        AI_STUDIO_RUN_TOKEN: bridge?.token,
        AI_STUDIO_REPORT_URL: bridge?.reportUrl,
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
      const list = (await rpc(1, 'tools/list')).result as { tools: { name: string }[] };
      expect(list.tools.map((t) => t.name)).toEqual(['ask_user', 'file_report']);
      const ok = (await rpc(2, 'tools/call', { name: 'file_report', arguments: REPORT })).result as {
        content: { text: string }[];
      };
      expect(ok.content[0]?.text).toMatch(/^Filed report rep_/);
      const bad = (await rpc(3, 'tools/call', { name: 'file_report', arguments: { ...REPORT, kind: 'x' } }))
        .result as { isError: boolean; content: { text: string }[] };
      expect(bad.isError).toBe(true);
      expect(bad.content[0]?.text).toMatch(/422: Request validation failed.*kind/);
      expect((await h.call('GET', '/projects/aurora/reports')).body.reports).toHaveLength(1);
    } finally {
      mcp.kill();
      await h.call('POST', `/projects/aurora/runs/${prof.id}/cancel`);
      await h.call('POST', `/projects/aurora/runs/${pete.id}/cancel`);
    }
  });

  it('a chat turn that files a report answers in one line pointing at it', async () => {
    h = studio(() => [{ report: REPORT }, { result: 'Here is a long answer the report already holds.' }]);
    const t = await h.call('POST', '/projects/aurora/threads/a-prof/messages', {
      text: 'Compare payment providers',
    });
    await h.runtime.settled(t.body.runId);
    const rep = (await h.call('GET', '/projects/aurora/reports')).body.reports[0];
    expect(rep.threadId).toBe('a-prof');
    const last = (await h.call('GET', '/projects/aurora/threads/a-prof/messages')).body.messages.at(-1);
    expect(last).toMatchObject({
      from: 'a-prof',
      kind: 'text',
      text: 'Professor filed it — Payment providers compared.',
      reportId: rep.id,
    });
    const ev = h.events
      .after('project', 'aurora')
      .filter((e) => e.type === 'thread.message')
      .at(-1);
    expect(ev?.payload).toMatchObject({ reportId: rep.id });
  });

  it('dispatch routes a knowledge goal to a reporter: report item, filed report closes it and links it', async () => {
    const seen: RunSpec[] = [];
    h = studio((s) => {
      seen.push(s);
      return fakeBrain(s);
    });
    const g = await h.call('POST', '/projects/aurora/work', {
      goal: 'Research payment providers for checkout',
    });
    expect(g.status).toBe(201);
    expect(g.body.items).toHaveLength(1);
    expect(g.body.items[0]).toMatchObject({ agentId: 'a-prof', report: true, teamId: null });
    const dispatchTask = seen.find((s) => s.task.startsWith('AI Studio contract: dispatch'))?.task ?? '';
    expect(dispatchTask).toMatch(/"id":"a-prof"[^}]*"reporter":true/);
    expect(dispatchTask).toMatch(/KNOWLEDGE, not change/);
    let goal = g.body;
    for (let i = 0; i < 200 && goal.status === 'running'; i++) {
      await new Promise((x) => setTimeout(x, 5));
      goal = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    }
    expect(goal.status).toBe('done');
    const rep = (await h.call('GET', '/projects/aurora/reports')).body.reports[0];
    expect(goal.items[0].reportId).toBe(rep.id);
    expect(rep).toMatchObject({
      goalId: goal.id,
      itemId: goal.items[0].id,
      question: 'Research payment providers for checkout',
    });
    const itemTask = seen.find((s) => s.task.includes('Your checklist item'))?.task ?? '';
    expect(itemTask).toMatch(/file_report tool \(question: "Research payment providers for checkout"\)/);
  });

  it('a mixed goal: the build item after a report item gets what the report found (F3 live)', async () => {
    const seen: RunSpec[] = [];
    const plan = {
      summary: 'Compare, then build.',
      items: [
        { text: 'Compare providers', assignee: 'a-prof', brief: 'Compare.', report: true },
        { text: 'Build checkout payments', assignee: 'a-baron', brief: 'Build on the report.' },
      ],
    };
    h = studio((s) => {
      seen.push(s);
      if (s.task.startsWith('AI Studio contract: dispatch')) return [{ result: JSON.stringify(plan) }];
      if (s.task.includes('file_report tool')) return [{ report: REPORT }, { result: 'Filed.' }];
      return [{ result: 'Built it.' }];
    });
    const g = await h.call('POST', '/projects/aurora/work', {
      goal: 'Pick a payment provider, then build it',
    });
    expect(g.status).toBe(201);
    let goal = g.body;
    for (let i = 0; i < 200 && goal.status === 'running'; i++) {
      await new Promise((x) => setTimeout(x, 5));
      goal = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    }
    expect(goal.status).toBe('done');
    const build =
      seen.find((s) => s.task.includes('Your checklist item: Build checkout payments'))?.task ?? '';
    expect(build).toContain('Done before you on this goal');
    expect(build).toContain('Professor Prompt filed the report "Payment providers compared"');
    expect(build).toContain(REPORT.summary);
    expect(build).toContain('Stripe — 1.5% + 25c'); // the body excerpt
    // the first item has nothing before it
    const first = seen.find((s) => s.task.includes('Your checklist item: Compare providers'))?.task ?? '';
    expect(first).not.toContain('Done before you');
  });

  it('a report item whose run never files is failed; a report item for a non-reporter is sent back', async () => {
    h = studio((s) =>
      s.task.startsWith('AI Studio contract: dispatch')
        ? s.task.includes('(repair)')
          ? [
              {
                result: JSON.stringify({
                  summary: 's',
                  items: [{ text: 'Look into it', assignee: 'a-prof', brief: 'b', report: true }],
                }),
              },
            ]
          : [
              {
                result: JSON.stringify({
                  summary: 's',
                  items: [{ text: 'Look into it', assignee: 'a-baron', brief: 'b', report: true }],
                }),
              },
            ]
        : [{ result: 'I looked, but wrote nothing down.' }],
    );
    const g = (await h.call('POST', '/projects/aurora/work', { goal: 'Find out why builds are slow' })).body;
    expect(g.items[0]).toMatchObject({ agentId: 'a-prof', report: true }); // repaired to a reporter
    let goal = g;
    for (let i = 0; i < 200 && goal.status === 'running'; i++) {
      await new Promise((x) => setTimeout(x, 5));
      goal = (await h.call('GET', `/projects/aurora/work/${goal.id}`)).body;
    }
    expect(goal.status).toBe('failed');
    expect(goal.items[0]).toMatchObject({
      status: 'failed',
      note: 'Finished without filing the report',
      reportId: null,
    });
  });
});
