import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';

/* Aurora: orchestrator a-pixel; teams ship-it (a-pete, a-semic, a-scar) + polish; specialists a-baron, a-query, a-merge */
function studio(script: (s: RunSpec) => FakeStep[], seen: RunSpec[] = []) {
  const h = testApp({
    seed: true,
    longPollMs: 50,
    runner: fakeRunner((s) => {
      seen.push(s);
      return script(s);
    }),
  });
  mkdirSync(join(h.config.sandbox, 'aurora'));
  h.store.projects.update('aurora', { folder: 'aurora' });
  return h;
}
const url = (agentId: string) => `/projects/aurora/threads/${agentId}/messages`;
const threadEvents = (h: ReturnType<typeof testApp>) =>
  h.events
    .after('project', 'aurora')
    .filter((e) => e.type === 'thread.message')
    .map((e) => e.payload as { from: string; text: string; agentId: string; kind: string });

describe('project conversations (threads)', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('an agent turn: runs with its composed prompt + tools in the project folder, reply stored + announced, next turn resumes', async () => {
    const seen: RunSpec[] = [];
    h = studio(
      (s) => [
        { tokens: { input: 10, output: 5 } },
        { result: s.task.includes('how far') ? 'About 70% — the dropdown is next.' : 'Hi!' },
      ],
      seen,
    );
    const r = await h.call('POST', url('a-pete'), { text: 'Hey Pete, how far along is the voice bar?' });
    expect(r.status).toBe(202);
    expect(r.body.message).toMatchObject({ from: 'user', kind: 'text', runId: r.body.runId });
    expect((await h.call('GET', url('a-pete'))).body.busy).toBe(true);
    await h.runtime.settled(r.body.runId);
    const t = (await h.call('GET', url('a-pete'))).body;
    expect(t).toMatchObject({ projectId: 'aurora', agentId: 'a-pete', busy: false });
    expect(t.messages.map((m: { from: string; text: string }) => [m.from, m.text])).toEqual([
      ['user', 'Hey Pete, how far along is the voice bar?'],
      ['a-pete', 'About 70% — the dropdown is next.'],
    ]);
    const spec = seen[0] as RunSpec;
    expect(spec.cwd).toBe(join(h.config.sandbox, 'aurora'));
    expect(spec.tools).toBeUndefined(); // the agent's normal tool set
    expect(spec.systemPrompt).toMatch(/Your team: The Ship-It Squad/);
    expect(spec.task).toMatch(/office chat[\s\S]*how far along[\s\S]*Pixel, the orchestrator/);
    expect(spec.resumeSessionId).toBeUndefined();
    expect(threadEvents(h).map((e) => [e.from, e.agentId])).toEqual([
      ['user', 'a-pete'],
      ['agent', 'a-pete'],
    ]);
    // turn 2 resumes the thread's session
    const r2 = await h.call('POST', url('a-pete'), { text: 'Thanks' });
    await h.runtime.settled(r2.body.runId);
    expect(seen[1]?.resumeSessionId).toBe(`fake-${r.body.runId}`);
    expect((await h.call('GET', url('a-pete'))).body.messages).toHaveLength(4);
  });

  it('the orchestrator turn: big picture — no tools, no secrets, no ask tool, a fresh studio summary', async () => {
    const seen: RunSpec[] = [];
    h = studio(() => [{ result: 'Voice search is the priority; Checkout next.' }], seen);
    h.runtime.setBaseUrl('http://127.0.0.1:9');
    const cred = (
      await h.call('POST', '/credentials', {
        name: 'Stripe',
        envVar: 'STRIPE_KEY',
        value: 'sk_test_orch_never_77',
      })
    ).body;
    await h.call('PUT', '/projects/aurora/access', { grants: { [cred.id]: true } });
    await h.call('POST', '/projects/aurora/features', {
      name: 'Voice search',
      status: 'now',
      pct: 72,
      owner: 'a-pete',
    });
    const r = await h.call('POST', url('a-pixel'), { text: 'What should we focus on?' });
    expect(r.status).toBe(202);
    await h.runtime.settled(r.body.runId);
    const spec = seen[0] as RunSpec;
    expect(spec.tools).toEqual([]);
    expect(spec.askBridge).toBeUndefined();
    expect(spec.env.STRIPE_KEY).toBeUndefined();
    expect(spec.cwd).toBe(join(h.config.sandbox, 'aurora'));
    expect(spec.caps).toEqual({ maxTurns: 6, maxBudgetUsd: 2 }); // the orchestrator's caps
    expect(spec.systemPrompt).toMatch(
      /orchestrator of the project "Aurora Storefront"[\s\S]*Big picture only/,
    );
    expect(spec.task).toMatch(/^Studio summary right now: /);
    const summary = JSON.parse(
      (spec.task.split('\n')[0] as string).replace('Studio summary right now: ', ''),
    );
    expect(summary.features).toEqual([
      { name: 'Voice search', status: 'now', pct: 72, owner: 'Pixel Pete', description: '' },
    ]);
    expect(summary).toMatchObject({ whiteboard: [], health: null, openQuestions: [] });
    // F3 live: without the staffing the orchestrator told a staffed project "I don't see a team yet"
    expect(summary.people.teams.map((t: { name: string }) => t.name)).toEqual([
      'The Ship-It Squad',
      'The Polish Patrol',
    ]);
    expect(summary.people.teams[0]).toMatchObject({ captain: 'Captain Semicolon' });
    expect(summary.people.teams[0].members).toContainEqual({ name: 'Pixel Pete', role: 'Frontend' });
    expect(summary.people.specialists.map((s: { name: string }) => s.name)).toContain('Baron von Backup');
    expect(summary.people.howWeWork).toBeTruthy();
    expect(spec.systemPrompt).toMatch(/ONE goal/);
    expect((await h.call('GET', url('a-pixel'))).body.messages.at(-1)).toMatchObject({
      from: 'a-pixel',
      text: 'Voice search is the priority; Checkout next.',
    });
    // an agent turn, by contrast, gets the granted secret and the ask tool
    const r2 = await h.call('POST', url('a-semic'), { text: 'Status?' });
    await h.runtime.settled(r2.body.runId);
    expect(seen[1]?.env.STRIPE_KEY).toBe('sk_test_orch_never_77');
    expect(seen[1]?.askBridge?.url).toMatch(/\/internal\/runs\/.+\/asks$/);
    // a specialist whose role files reports is marked (F3 live: Maestro said nobody on the project could file one)
    h.store.projects.update('aurora', { agentIds: ['a-prof'] });
    const r3 = await h.call('POST', url('a-pixel'), { text: 'Who can write reports?' });
    await h.runtime.settled(r3.body.runId);
    const s3 = JSON.parse(
      ((seen.at(-1) as RunSpec).task.split('\n')[0] as string).replace('Studio summary right now: ', ''),
    );
    expect(s3.people.specialists).toEqual([{ name: 'Professor Prompt', role: 'Research', reporter: true }]);
  });

  it('a message to an agent at work becomes a note for its run, not a refusal', async () => {
    h = studio(() => [{ wait: 150 }, { result: 'ok' }]);
    const a = await h.call('POST', url('a-pete'), { text: 'one' });
    // while it answers: the second message goes to the same run as a note
    const b = await h.call('POST', url('a-pete'), { text: 'two' });
    expect(b.status).toBe(202);
    expect(b.body.runId).toBe(a.body.runId);
    // another thread runs alongside
    expect((await h.call('POST', url('a-scar'), { text: 'hi' })).status).toBe(202);
    // an agent on dispatched work: the note reaches that run, and the thread keeps the message
    const work = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'deploy' })).body
      .id;
    const c = await h.call('POST', url('a-baron'), { text: 'hello?' });
    expect(c.status).toBe(202);
    expect(c.body.runId).toBe(work);
    expect(getChatMessages(h.db, work).some((m) => m.text === 'hello?')).toBe(true);
    expect((await h.call('GET', url('a-baron'))).body.messages.map((m: { text: string }) => m.text)).toEqual([
      'hello?',
    ]);
    await h.runtime.settled(a.body.runId);
    expect((await h.call('POST', url('a-pete'), { text: 'three' })).status).toBe(202);
  });

  it('only the orchestrator and people on the project; unknown ids; strict body', async () => {
    h = studio(() => [{ result: 'ok' }]);
    expect((await h.call('POST', url('a-prof'), { text: 'hi' })).status).toBe(409); // on The Expedition, not on Aurora
    expect((await h.call('GET', url('a-maestro'))).status).toBe(409); // another orchestrator
    expect((await h.call('POST', url('a-ghost'), { text: 'hi' })).status).toBe(422);
    expect((await h.call('POST', '/projects/ghost/threads/a-pete/messages', { text: 'hi' })).status).toBe(
      404,
    );
    expect((await h.call('POST', url('a-pete'), { text: '  ' })).status).toBe(422);
    expect((await h.call('POST', url('a-pete'), { text: 'hi', from: 'x' })).status).toBe(422);
    expect((await h.call('POST', '/projects/atlas/threads/a-query/messages', { text: 'hi' })).status).toBe(
      409,
    ); // no folder
    expect((await h.call('GET', url('a-query'))).body).toMatchObject({ busy: false, messages: [] }); // a specialist
  });

  it('an answered question stays in the agent’s chat: the agent’s question, then the user’s answer', async () => {
    const seen: RunSpec[] = [];
    h = studio(
      () => [{ ask: 'Blue or green?', options: ['Blue', 'Green'] }, { result: 'Green it is.' }],
      seen,
    );
    const answerOpen = async () => {
      let open: { id: string }[] = [];
      while (open.length === 0) {
        await new Promise((x) => setTimeout(x, 10));
        open = (await h.call('GET', '/projects/aurora/asks?status=open')).body;
      }
      const r = await h.call('POST', `/projects/aurora/asks/${open[0]?.id}/answer`, { answer: 'Green' });
      expect(r.status).toBe(200);
    };
    const lines = async (agentId: string) =>
      ((await h.call('GET', url(agentId))).body.messages as { from: string; text: string }[]).map((m) => [
        m.from,
        m.text,
      ]);

    // asked during a chat turn
    const q = await h.call('POST', url('a-twinkle'), { text: 'pick a colour' });
    await answerOpen();
    await h.runtime.settled(q.body.runId);
    expect(await lines('a-twinkle')).toEqual([
      ['user', 'pick a colour'],
      ['a-twinkle', 'Blue or green?'],
      ['user', 'Green'],
      ['a-twinkle', 'Green it is.'],
    ]);
    expect(
      threadEvents(h)
        .filter((e) => e.agentId === 'a-twinkle')
        .map((e) => [e.from, e.text]),
    ).toEqual([
      ['user', 'pick a colour'],
      ['agent', 'Blue or green?'],
      ['user', 'Green'],
      ['agent', 'Green it is.'],
    ]);
    // the saved question and answer never take over which session the next turn resumes
    const next = await h.call('POST', url('a-twinkle'), { text: 'thanks' });
    await answerOpen();
    await h.runtime.settled(next.body.runId);
    expect(seen[1]?.resumeSessionId).toBe(`fake-${q.body.runId}`);

    // asked during dispatched work (not a chat turn): it still lands in that agent's chat
    const run = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'deploy' })).body;
    await answerOpen();
    await h.runtime.settled(run.id);
    expect(await lines('a-baron')).toEqual([
      ['a-baron', 'Blue or green?'],
      ['user', 'Green'],
    ]);
  });

  describe('the question first, then the answer — however the user answers', () => {
    const openAsk = async (agentId: string) => {
      for (;;) {
        const open = (await h.call('GET', '/projects/aurora/asks?status=open')).body as {
          id: string;
          agentId: string;
          runId: string;
          createdAt: string;
        }[];
        const a = open.find((x) => x.agentId === agentId);
        if (a) return a;
        await new Promise((x) => setTimeout(x, 10));
      }
    };
    const lines = async (agentId: string) =>
      ((await h.call('GET', url(agentId))).body.messages as { from: string; text: string }[]).map((m) => [
        m.from,
        m.text,
      ]);
    const runs = () => (h.db.prepare('SELECT COUNT(*) AS n FROM runs').get() as { n: number }).n;

    it('typed in the chat while an agent at work waits on its question: it answers it (no note, no new run)', async () => {
      h = studio(() => [{ ask: 'Blue or green?', options: ['Blue', 'Green'] }, { result: 'Green it is.' }]);
      const work = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'deploy' }))
        .body;
      const ask = await openAsk('a-baron');
      const before = runs();
      const r = await h.call('POST', url('a-baron'), { text: 'Green, please' });
      expect(r.status).toBe(202);
      expect(r.body.runId).toBe(work.id);
      expect(r.body.message).toMatchObject({ from: 'user', text: 'Green, please', runId: null });
      expect(runs()).toBe(before);
      const done = (await h.call('GET', '/projects/aurora/asks')).body.find(
        (a: { id: string }) => a.id === ask.id,
      );
      expect(done).toMatchObject({ status: 'answered', answer: 'Green, please', answeredBy: 'user' });
      // the run got it as its answer, not as a note it would never read
      const said = getChatMessages(h.db, work.id);
      expect(said.some((m) => m.meta?.kind === 'answer' && m.text === 'Green, please')).toBe(true);
      expect(said.some((m) => m.meta?.kind === 'note')).toBe(false);
      await h.runtime.settled(work.id);
      expect(await lines('a-baron')).toEqual([
        ['a-baron', 'Blue or green?'],
        ['user', 'Green, please'],
      ]);
    });

    it('the director waiting on its question: a typed message answers it instead of a 409', async () => {
      h = studio(() => [
        { ask: 'Checkout or search first?', options: ['Checkout', 'Search'] },
        { result: 'Search first.' },
      ]);
      const turn = await h.call('POST', url('a-pixel'), { text: 'which first?' });
      await openAsk('a-pixel');
      const r = await h.call('POST', url('a-pixel'), { text: 'Search' });
      expect(r.status).toBe(202);
      expect(r.body.runId).toBe(turn.body.runId);
      await h.runtime.settled(turn.body.runId);
      expect(await lines('a-pixel')).toEqual([
        ['user', 'which first?'],
        ['a-pixel', 'Checkout or search first?'],
        ['user', 'Search'],
        ['a-pixel', 'Search first.'],
      ]);
    });

    it('the question keeps the time it was asked: a line said in between stays after it, after a reload too', async () => {
      h = studio(() => [
        { ask: 'Ship it tonight?', options: ['Tonight', 'Tomorrow'] },
        { result: 'Shipping.' },
      ]);
      const work = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'deploy' }))
        .body;
      const ask = await openAsk('a-baron');
      await new Promise((x) => setTimeout(x, 5));
      const between = (
        h.db
          .prepare(
            "INSERT INTO thread_messages (id, project_id, agent_id, sender, kind, text, run_id, created_at) VALUES ('m-between', 'aurora', 'a-baron', 'agent', 'text', 'Backups are done.', NULL, ?) RETURNING created_at",
          )
          .get(new Date().toISOString()) as { created_at: string }
      ).created_at;
      await new Promise((x) => setTimeout(x, 5));
      expect(
        (await h.call('POST', `/projects/aurora/asks/${ask.id}/answer`, { answer: 'Tonight' })).status,
      ).toBe(200);
      await h.runtime.settled(work.id);
      const got = (await h.call('GET', url('a-baron'))).body.messages as {
        from: string;
        text: string;
        at: string;
      }[];
      expect(got.map((m) => [m.from, m.text])).toEqual([
        ['a-baron', 'Ship it tonight?'],
        ['a-baron', 'Backups are done.'],
        ['user', 'Tonight'],
      ]);
      expect(got[0]?.at).toBe(ask.createdAt);
      expect((got[0]?.at ?? '') < between).toBe(true);
      // the live event carries the same time, so the open chat puts it in the same place
      const ev = h.events
        .after('project', 'aurora')
        .filter((e) => e.type === 'thread.message')
        .map((e) => e.payload as { text: string; at?: string });
      expect(ev.find((e) => e.text === 'Ship it tonight?')?.at).toBe(ask.createdAt);
    });

    it('the card and the chat answer at once: saved once, the second is a plain message', async () => {
      h = studio(() => [
        { ask: 'Blue or green?', options: ['Blue', 'Green'] },
        { wait: 50 },
        { result: 'Done.' },
      ]);
      const work = (await h.call('POST', '/projects/aurora/runs', { agentId: 'a-baron', task: 'deploy' }))
        .body;
      const ask = await openAsk('a-baron');
      const [card, typed] = await Promise.all([
        h.call('POST', `/projects/aurora/asks/${ask.id}/answer`, { answer: 'Blue' }),
        h.call('POST', url('a-baron'), { text: 'Blue' }),
      ]);
      // whichever lands first answers; the other is refused (the card) or kept as a plain message (the chat)
      expect(typed.status).toBe(202);
      expect([200, 409]).toContain(card.status);
      await h.runtime.settled(work.id);
      const got = await lines('a-baron');
      expect(got.filter(([, t]) => t === 'Blue or green?')).toHaveLength(1);
      expect(got[0]).toEqual(['a-baron', 'Blue or green?']);
      expect(got[1]).toEqual(['user', 'Blue']);
    });
  });

  it('a failed or stopped turn leaves an error message; asks are answered on the asks endpoint; secrets are scrubbed', async () => {
    h = studio((s) =>
      s.task.includes('"please fail"')
        ? [{ fail: 'Claude Code exited (code 1)' }]
        : s.task.includes('"ask me"')
          ? [{ ask: 'Blue or green?', options: ['Blue', 'Green'] }, { result: 'Green it is.' }]
          : [{ result: `My key is ${s.env.STRIPE_KEY}` }],
    );
    const cred = (
      await h.call('POST', '/credentials', {
        name: 'Stripe',
        envVar: 'STRIPE_KEY',
        value: 'sk_test_thread_secret_42',
      })
    ).body;
    await h.call('PUT', '/projects/aurora/access', { grants: { [cred.id]: true } });
    const f = await h.call('POST', url('a-pete'), { text: 'please fail' });
    await h.runtime.settled(f.body.runId);
    expect((await h.call('GET', url('a-pete'))).body.messages.at(-1)).toMatchObject({
      kind: 'error',
      text: 'I couldn’t finish that: Claude Code exited (code 1)',
    });
    const q = await h.call('POST', url('a-twinkle'), { text: 'ask me' });
    let open: { id: string }[] = [];
    while (open.length === 0) {
      await new Promise((x) => setTimeout(x, 10));
      open = (await h.call('GET', '/projects/aurora/asks?status=open')).body;
    }
    await h.call('POST', `/projects/aurora/asks/${open[0]?.id}/answer`, { answer: 'Green' });
    await h.runtime.settled(q.body.runId);
    expect((await h.call('GET', url('a-twinkle'))).body.messages.at(-1).text).toBe('Green it is.');
    const s = await h.call('POST', url('a-semic'), { text: 'what is the key? sk_test_thread_secret_42' });
    await h.runtime.settled(s.body.runId);
    const all = JSON.stringify([
      (await h.call('GET', url('a-semic'))).body,
      h.events.after('project', 'aurora'),
    ]);
    expect(all).not.toContain('sk_test_thread_secret_42');
    expect((await h.call('GET', url('a-semic'))).body.messages.map((m: { text: string }) => m.text)).toEqual([
      'what is the key? ••••',
      'My key is ••••',
    ]);
  });

  it('the free fake brain (AI_STUDIO_RUNNER=fake) answers chat turns with an obvious scripted echo', async () => {
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'aurora'));
    h.store.projects.update('aurora', { folder: 'aurora' });
    const r = await h.call('POST', url('a-pixel'), { text: 'What next?' });
    await h.runtime.settled(r.body.runId);
    expect((await h.call('GET', url('a-pixel'))).body.messages.at(-1).text).toBe(
      'Got it — “What next?”. (A scripted reply: AI_STUDIO_RUNNER=fake.)',
    );
  });
});
