import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

/** A seeded studio whose 'aurora' project has a real sandbox folder. */
function studio(script: (s: RunSpec) => FakeStep[], seen?: RunSpec[]) {
  const h = testApp({
    seed: true,
    longPollMs: 50,
    runner: fakeRunner((s) => {
      seen?.push(s);
      return script(s);
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return h;
}
const types = (h: ReturnType<typeof testApp>) =>
  h.events
    .after('project', 'aurora')
    .map((e) => e.type)
    .filter((t) => !t.startsWith('project.')); // the lifecycle's own lines (test/office/lifecycle.test.ts)

describe('agent runs (FakeRunner end-to-end)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('runs an agent: events in order, usage and session recorded', async () => {
    const seen: RunSpec[] = [];
    h = studio(
      () => [
        { activity: { kind: 'editing', label: 'Writing hello.txt', target: 'hello.txt' } },
        { tokens: { input: 100, output: 10 } },
        { tokens: { input: 50, output: 5 } },
        { result: 'All done.' },
      ],
      seen,
    );
    const r = await h.call('POST', '/projects/aurora/runs', {
      agentId: 'a-pete',
      teamId: 'ship-it',
      task: 'Make hello.txt',
      caps: { maxTurns: 4 },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      status: 'running',
      agentId: 'a-pete',
      teamId: 'ship-it',
      runner: 'fake',
      caps: { maxTurns: 4, maxBudgetUsd: 10 },
    });
    const done = await h.runtime.settled(r.body.id);
    expect(done).toMatchObject({
      status: 'succeeded',
      result: 'All done.',
      turns: 2,
      sessionId: `fake-${r.body.id}`,
      usage: { input: 150, output: 15 },
    });
    expect(types(h)).toEqual([
      'run.started',
      'agent.status',
      'agent.status',
      'tokens',
      'tokens',
      'run.finished',
      'agent.status',
    ]);
    const fin = h.events.after('project', 'aurora').find((e) => e.type === 'run.finished');
    expect(fin?.payload).toMatchObject({ status: 'succeeded', input: 150, output: 15, turns: 2 });
    // composed prompt carries the team context; cwd is the project folder
    expect(seen[0]?.cwd).toBe(join(h.config.sandbox, 'aurora'));
    expect(seen[0]?.systemPrompt).toMatch(/Your team: The Ship-It Squad[\s\S]*Own the storefront UI/);
    expect((await h.call('GET', `/projects/aurora/runs/${r.body.id}`)).body.status).toBe('succeeded');
    expect((await h.call('GET', '/projects/aurora/runs')).body).toHaveLength(1);
  });

  it('one live run per agent per project; others may run alongside', async () => {
    h = studio(() => [{ wait: 200 }, { result: 'ok' }]);
    const a = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
    expect((await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'y' })).status).toBe(
      409,
    );
    expect((await h.call('POST', '/projects/aurora/runs', { agentId: 'a-scar', task: 'z' })).status).toBe(
      201,
    );
    await h.runtime.settled(a.body.id);
    expect((await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'again' })).status).toBe(
      201,
    );
  });

  it('validates the request: folder, agent, team seat, caps', async () => {
    h = studio(() => [{ result: 'ok' }]);
    expect((await h.call('POST', '/projects/atlas/runs', { agentId: 'a-pete', task: 'x' })).status).toBe(409); // no folder
    expect((await h.call('POST', '/projects/aurora/runs', { agentId: 'a-ghost', task: 'x' })).status).toBe(
      422,
    );
    expect(
      (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', teamId: 'polish', task: 'x' }))
        .status,
    ).toBe(409);
    expect(
      (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x', caps: { maxTurns: 0 } }))
        .status,
    ).toBe(422);
    expect((await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: '' })).status).toBe(422);
    expect((await h.call('POST', '/projects/ghost/runs', { agentId: 'a-pete', task: 'x' })).status).toBe(404);
  });

  it('ask the user: the run waits, the user answers, the run goes on', async () => {
    h = studio(() => [{ ask: 'Blue or green?', options: ['Blue', 'Green'] }, { result: 'Painted it.' }]);
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-twinkle', task: 'Paint' });
    let open: { id: string; question: string; options: string[] }[] = [];
    for (let i = 0; i < 50 && open.length === 0; i++) {
      await new Promise((x) => setTimeout(x, 10));
      open = (await h.call('GET', '/projects/aurora/asks?status=open')).body;
    }
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ question: 'Blue or green?', options: ['Blue', 'Green'] });
    expect((await h.call('GET', `/projects/aurora/runs/${r.body.id}`)).body.status).toBe('running');
    const ans = await h.call('POST', `/projects/aurora/asks/${open[0]?.id}/answer`, { answer: 'Green' });
    expect(ans.body).toMatchObject({ status: 'answered', answer: 'Green', answeredBy: 'user' });
    expect(
      (await h.call('POST', `/projects/aurora/asks/${open[0]?.id}/answer`, { answer: 'Blue' })).status,
    ).toBe(409);
    expect((await h.runtime.settled(r.body.id)).status).toBe('succeeded');
    const t = types(h);
    expect(t.indexOf('ask.opened')).toBeLessThan(t.indexOf('ask.answered'));
    expect(t.at(-2)).toBe('run.finished');
  });

  it('auto-approve (on by default): a yes/no permission check is answered by the studio, never pages', async () => {
    h = studio(() => [
      { ask: 'This will delete build/. Should I go ahead?', options: ['Yes, delete it', 'No'] },
      { ask: 'OK to run npm install?' },
      { result: 'Cleaned up.' },
    ]);
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'Clean up' });
    expect((await h.runtime.settled(r.body.id)).status).toBe('succeeded');
    const asks = (await h.call('GET', '/projects/aurora/asks')).body;
    expect(asks).toMatchObject([
      { status: 'answered', answeredBy: 'auto', answer: 'Yes, delete it. (Auto-approved by the studio.)' },
      { status: 'answered', answeredBy: 'auto', answer: 'Yes, go ahead. (Auto-approved by the studio.)' },
    ]);
    expect((await h.call('GET', '/projects/aurora/asks?status=open')).body).toEqual([]);
    expect((await h.call('GET', '/asks')).body).toEqual([]); // the pager
    expect((await h.call('GET', '/asks?status=answered')).body).toHaveLength(2); // still in history
    const t = types(h);
    expect(t).not.toContain('ask.opened');
    expect(t.filter((x) => x === 'ask.answered')).toHaveLength(2);
  });

  it('auto-approve: questions that need the user still page; with the setting off, permission checks do too', async () => {
    h = studio(() => [
      { ask: 'Which database should I use?', options: ['Postgres', 'SQLite'] },
      { result: 'ok' },
    ]);
    let r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
    const waitOpen = async () => {
      for (let i = 0; i < 100; i++) {
        const open = (await h.call('GET', '/asks')).body;
        if (open.length) return open;
        await new Promise((x) => setTimeout(x, 10));
      }
      return [];
    };
    let open = await waitOpen();
    expect(open).toMatchObject([{ question: 'Which database should I use?' }]);
    await h.call('POST', `/projects/aurora/asks/${open[0].id}/answer`, { answer: 'SQLite' });
    await h.runtime.settled(r.body.id);

    expect((await h.call('GET', '/settings')).body).toMatchObject({ autoApprove: true });
    expect((await h.call('PATCH', '/settings', { autoApprove: false })).body).toEqual({
      githubByDefault: true,
      autoApprove: false,
      hqProjectId: null,
    });
    h.close();
    h = studio(() => [
      { ask: 'Should I delete the old build folder?', options: ['Yes', 'No'] },
      { result: 'ok' },
    ]);
    await h.call('PATCH', '/settings', { autoApprove: false });
    r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
    open = await waitOpen();
    expect(open).toMatchObject([{ question: 'Should I delete the old build folder?' }]);
    const ans = await h.call('POST', `/projects/aurora/asks/${open[0].id}/answer`, { answer: 'No' });
    expect(ans.body).toMatchObject({ answeredBy: 'user', answer: 'No' });
    await h.runtime.settled(r.body.id);
  });

  it('cancel stops a run mid-question; its open ask is withdrawn', async () => {
    h = studio(() => [{ ask: 'Which colour should the logo be?' }, { result: 'never' }]);
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
    while ((await h.call('GET', '/projects/aurora/asks?status=open')).body.length === 0)
      await new Promise((x) => setTimeout(x, 10));
    expect((await h.call('POST', `/projects/aurora/runs/${r.body.id}/cancel`)).status).toBe(202);
    expect((await h.runtime.settled(r.body.id)).status).toBe('cancelled');
    expect((await h.call('GET', '/projects/aurora/asks')).body[0].status).toBe('cancelled');
    expect((await h.call('POST', `/projects/aurora/runs/${r.body.id}/cancel`)).status).toBe(409);
  });

  it('env isolation: a run sees only the base env + secrets granted to ITS project, and they never reach events', async () => {
    const seen: RunSpec[] = [];
    h = studio(
      (s) => [
        {
          activity: {
            kind: 'running',
            label: 'Calling Stripe',
            detail: `curl -H "Authorization: ${s.env.STRIPE_KEY}"`,
          },
        },
        { result: 'ok' },
      ],
      seen,
    );
    process.env.AI_STUDIO_TEST_PARENT_SECRET = 'parent-only-value-123';
    const stripe = (
      await h.call('POST', '/credentials', {
        name: 'Stripe',
        envVar: 'STRIPE_KEY',
        value: 'sk_test_granted_value_9',
      })
    ).body;
    await h.call('POST', '/credentials', {
      name: 'OpenAI',
      envVar: 'OPENAI_API_KEY',
      value: 'not-granted-value-77',
    });
    expect((await h.call('PUT', '/projects/aurora/access', { grants: { [stripe.id]: true } })).status).toBe(
      200,
    );
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-semic', task: 'Charge' });
    await h.runtime.settled(r.body.id);
    delete process.env.AI_STUDIO_TEST_PARENT_SECRET;
    const env = seen[0]?.env ?? {};
    expect(env.STRIPE_KEY).toBe('sk_test_granted_value_9');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.AI_STUDIO_TEST_PARENT_SECRET).toBeUndefined();
    expect(
      Object.keys(env).every((k) =>
        [
          'HOME',
          'USER',
          'LOGNAME',
          'SHELL',
          'TMPDIR',
          'LANG',
          'LC_ALL',
          'LC_CTYPE',
          '__CF_USER_TEXT_ENCODING',
          'SSH_AUTH_SOCK', // AGENTS PUSH: ssh origins push through the user's ssh agent
          'GIT_TERMINAL_PROMPT', // AGENTS PUSH: a push never waits on a prompt
          'PATH',
          'STRIPE_KEY',
          'PORT', // G1: the run's port block
          'AI_STUDIO_PORTS',
          'AI_STUDIO_APP_PORT',
          'AI_STUDIO_PROJECT_DIR', // the shell hook checks Mac build paths against it
        ].includes(k),
      ),
    ).toBe(true);
    /* G1: a spare of the project's block (never the app's own port) */
    expect(Number(env.PORT)).toBe(Number(env.AI_STUDIO_APP_PORT) + 1);
    expect(env.AI_STUDIO_PORTS?.split(',').map(Number)).toEqual(
      [1, 2, 3, 4].map((i) => Number(env.AI_STUDIO_APP_PORT) + i),
    );
    const all = JSON.stringify(h.events.after('project', 'aurora'));
    expect(all).not.toContain('sk_test_granted_value_9');
    expect(all).toContain('Authorization: ••••');
  });

  it('a refused runner (CLI missing) is a 409 with the reason, and nothing is recorded', async () => {
    h = testApp({
      seed: true,
      runner: {
        name: 'claude-cli',
        unavailable: 'Claude Code CLI not found',
        start: () => {
          throw new Error('x');
        },
      },
    });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('POST', '/projects/aurora/runs', { agentId: 'a-pete', task: 'x' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/not found/);
    expect((await h.call('GET', '/projects/aurora/runs')).body).toEqual([]);
  });
});
