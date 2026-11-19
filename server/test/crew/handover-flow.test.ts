/* Handovers end to end (the Pensieve case): a builder hands its item to someone else mid-build with
   `call_agent` handover: true, or the director reassigns it with edit_task. The item, its branch and its reviews
   follow the new owner; nothing goes back to the old one. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getChatMessages } from '../../src/db/chats.ts';
import { type ChecklistItem, workRepo } from '../../src/db/work.ts';
import type { Workflow } from '../../src/domain/workflows.ts';
import type { FakeStep } from '../../src/runtime/fake.ts';
import type { RunSpec } from '../../src/runtime/runner.ts';
import { testApp } from '../helpers.ts';
import { scriptedCrew } from './brain.ts';

/* Aurora: Columbo's part is played by Captain Semicolon (ship-it), Uncle Bob's by Baron von Backup (a specialist);
   Sir Lint-a-lot reviews everyone's work */
const [COLUMBO, BOB, LINT] = ['a-semic', 'a-baron', 'a-lint'];
const CHECKED: Workflow = {
  id: 'checked',
  name: 'Checked',
  when: 'always',
  orchestratorTalksTo: 'captains',
  gates: [{ after: '*', reviewer: LINT, kind: 'review', why: 'A second pair of eyes.' }],
  maxSendBacks: 1,
  summary: 'Lint reviews all work.',
};
const PLAN = {
  summary: 'One item.',
  items: [{ text: 'Build the Pensieve', assignee: COLUMBO, teamId: 'ship-it', brief: 'Store memories.' }],
};
const ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...ENV } }).trim();

type Ev = { type: string; payload: Record<string, unknown> };
const isReview = (s: RunSpec) => s.task.startsWith('You are reviewing');
const isChat = (s: RunSpec) => s.task.startsWith('Studio summary right now: ');

/** Aurora with a git folder; `work` scripts every run but the director's chat turns (played by `director`). */
function studio(work: (h: ReturnType<typeof testApp>, s: RunSpec) => FakeStep[]) {
  const box: { h?: ReturnType<typeof testApp> } = {};
  const turns: FakeStep[][] = [];
  const crew = scriptedCrew({ dispatch: [PLAN], help: [{ answer: 'On it.', say: 'on it' }] }, (s) =>
    isChat(s) ? [...(turns.shift() ?? []), { result: '{"reply":"Done."}' }] : work(box.h as never, s),
  );
  const h = testApp({ seed: true, runner: crew.runner });
  box.h = h;
  const repo = join(h.config.sandbox, 'aurora');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'README.md'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  h.store.projects.update('aurora', { folder: 'aurora', workflows: [CHECKED] });
  /** One director chat turn calling this whiteboard tool → what the tool answered. */
  const director = async (tool: string, args: Record<string, unknown>) => {
    turns.push([{ tool, args }]);
    const r = await h.call('POST', '/projects/aurora/threads/a-pixel/messages', { text: 'board' });
    await h.runtime.settled(r.body.runId);
    return getChatMessages(h.db, r.body.runId).find((m) => m.role === 'assistant')?.text ?? '';
  };
  return { h, crew, director };
}
const isRunOf = (h: ReturnType<typeof testApp>, s: RunSpec, agentId: string) =>
  s.systemPrompt.startsWith(`# ${h.store.agents.require(agentId).name}\n`);
/** The builder commits a file of its own, so the merge has its work. */
const commit = (s: RunSpec, file: string): FakeStep[] => {
  writeFileSync(join(s.cwd, file), `${file}\n`);
  git(s.cwd, 'add', '.');
  git(s.cwd, 'commit', '-q', '-m', file);
  return [{ result: `Built ${file}.` }];
};
async function until<T>(read: () => T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 10))) {
    const v = read();
    if (ok(v)) return v;
  }
  throw new Error(`timed out; now: ${JSON.stringify(read())}`);
}

describe('handovers: the item, its branch and its reviews follow the new owner', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('Pensieve: Columbo hands it to Bob mid-build; Lint reviews Bob’s work; nothing goes back to Columbo', async () => {
    const specs: RunSpec[] = [];
    const s = studio((app, spec) => {
      specs.push(spec);
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      if (isRunOf(app, spec, COLUMBO))
        return [
          {
            tool: 'call_agent',
            args: {
              agent: 'Baron',
              request: 'Take the Pensieve, it is backend work.',
              why: 'hand over',
              handover: true,
            },
          },
          { result: 'Handed it to Baron.' },
        ];
      return commit(spec, 'pensieve.txt');
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    expect(r.status).toBe(201);
    const work = workRepo(h.db);
    const it = await until(
      () => work.item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status === 'done' || i.status === 'failed',
    );

    expect(it).toMatchObject({ status: 'done', agentId: BOB, teamId: null });
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
    const bobRun = runs.find((x) => x.agentId === BOB);
    expect(it.buildRunId).toBe(bobRun?.id);
    expect(runs.filter((x) => x.agentId === COLUMBO)).toHaveLength(1); // never sent back to Columbo

    /* one review, of Bob's work, on the item's own branch (the checkout Columbo started) */
    const builds = specs.filter((x) => !isReview(x) && !isChat(x) && x.task.includes('Your checklist item'));
    const reviews = specs.filter(isReview);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.task).toMatch(/^You are reviewing Baron von Backup's work/);
    expect(reviews[0]?.task).not.toContain('Captain Semicolon');
    expect(reviews[0]?.task).toMatch(/Their work is on branch \S+ in this checkout/);
    expect(new Set([...builds, ...reviews].map((x) => x.cwd)).size).toBe(1);
    expect(builds[1]?.task).toContain('Handed over by Captain Semicolon: Take the Pensieve');
    expect(git(join(h.config.sandbox, 'aurora'), 'log', '--format=%s', 'main')).toContain('pensieve.txt');

    /* the story: handed over once, then only Bob ↔ Lint */
    const handoffs = (h.events.after('project', 'aurora') as Ev[])
      .filter((e) => e.type === 'handoff')
      .map((e) => `${e.payload.kind}:${e.payload.from}→${e.payload.to}`);
    const at = handoffs.indexOf(`handover:${COLUMBO}→${BOB}`);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(handoffs.slice(at + 1).some((x) => x.endsWith(`→${COLUMBO}`))).toBe(false);
    expect(handoffs.slice(at + 1)).toContain(`review:${BOB}→${LINT}`);
  }, 20_000);

  it('plain work: true from a build is side work: the caller keeps its item', async () => {
    const s = studio((app, spec) =>
      isRunOf(app, spec, COLUMBO) && spec.task.includes('Your checklist item: Build the Pensieve')
        ? [
            {
              tool: 'call_agent',
              args: { agent: 'Baron', request: 'Back up the memories too.', why: 'back up', work: true },
            },
            { result: 'Built it.' },
          ]
        : isReview(spec)
          ? [{ result: '{"verdict":"approve","notes":"Good."}' }]
          : [{ result: 'Done.' }],
    );
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const it = await until(
      () => work.item(r.body.items[0].id) as ChecklistItem,
      (i) => i.status !== 'todo' && i.status !== 'running',
    );
    expect(it).toMatchObject({ status: 'done', agentId: COLUMBO });
    /* the side quest runs too: let it finish before the app closes */
    const goals = await until(
      () => work.goals('aurora'),
      (gs) => gs.length === 2 && gs.every((g) => g.status !== 'running'),
    );
    expect(goals.find((g) => g.text === 'Back up the memories too.')?.quest).toBe('side');
    await new Promise((x) => setTimeout(x, 100));
  }, 20_000);

  it.each([
    ['handover: true', { handover: true }],
    ['work: true', { work: true }],
  ])(
    'a declined item (%s) comes back to the orchestrator: it waits for a new owner, they give it to Bob',
    async (_, flag) => {
      const s = studio((app, spec) => {
        if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
        if (!isRunOf(app, spec, COLUMBO)) return commit(spec, 'pensieve.txt');
        return [
          {
            tool: 'call_agent',
            args: { agent: 'Pixel', request: 'Not mine, please re-plan it.', why: 'decline', ...flag },
          },
          { result: 'Gave it back.' },
        ];
      });
      h = s.h;
      const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
      const work = workRepo(h.db);
      const id = r.body.items[0].id as string;
      const runs = async () =>
        (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
      await until(
        () => work.item(id) as ChecklistItem,
        (i) => i.agentId === 'a-pixel' && i.status === 'todo',
      );
      await until(
        () => h.runtime.liveCount(),
        (n) => n === 0,
      );
      await new Promise((x) => setTimeout(x, 50)); // let Columbo's run wrap up
      expect(work.item(id)).toMatchObject({ agentId: 'a-pixel', status: 'todo', buildRunId: null });
      expect((await runs()).length).toBe(1); // only Columbo's: the director doesn't build it
      const calls = (h.events.after('project', 'aurora') as Ev[])
        .filter((e) => e.type === 'room.call')
        .map((e) => e.payload.status);
      expect(calls).toContain('answered');
      expect(calls).not.toContain('failed');

      /* the director sees it waiting for a new owner and gives it one: Bob builds it on the same branch */
      expect(await s.director('whiteboard', {})).toMatch(
        /\[waiting for a new owner\] Build the Pensieve — Pixel/,
      );
      expect(await s.director('edit_task', { task: id, owner: 'Baron' })).toContain('Now Baron von Backup');
      const done = await until(
        () => work.item(id) as ChecklistItem,
        (i) => i.status === 'done' || i.status === 'failed',
      );
      expect(done).toMatchObject({ status: 'done', agentId: BOB });
      expect((await runs()).find((x) => x.id === done.buildRunId)?.agentId).toBe(BOB);
    },
    20_000,
  );

  it('work: true to the orchestrator from outside a build waits with them as a side quest', async () => {
    let asked = false;
    const s = studio((_app, spec) => {
      if (isReview(spec) && !asked) {
        asked = true;
        return [
          {
            tool: 'call_agent',
            args: { agent: 'Pixel', request: 'Add backups for the Pensieve.', why: 'flag it', work: true },
          },
          { result: '{"verdict":"approve","notes":"Good."}' },
        ];
      }
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      return commit(spec, `${spec.runId}.txt`);
    });
    h = s.h;
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const goals = await until(
      () => work.goals('aurora'),
      (gs) => gs.length === 2 && work.item(r.body.items[0].id)?.status === 'done',
    );
    /* the reviewed item stays its builder's; the new work waits with the director, never started */
    expect(work.item(r.body.items[0].id)).toMatchObject({ status: 'done', agentId: COLUMBO });
    const side = goals.find((g) => g.id !== r.body.id) as (typeof goals)[number];
    expect(side.quest).toBe('side');
    expect(side.items[0]).toMatchObject({ agentId: 'a-pixel', status: 'todo', runId: null });
    expect(await s.director('whiteboard', {})).toMatch(/\[waiting for a new owner\] Add backups/);
    await h.call('POST', `/projects/aurora/work/${side.id}/cancel`);
    await until(
      () => work.goal(side.id)?.items[0]?.status,
      (st) => st === 'cancelled',
    );
  }, 20_000);

  it('the director reassigns with edit_task: done work stays done; a failed item is rebuilt by the new owner', async () => {
    const s = studio((_app, spec) => {
      if (isReview(spec)) return [{ result: '{"verdict":"approve","notes":"Good."}' }];
      return commit(spec, `${spec.runId}.txt`);
    });
    h = s.h;
    const turn = (args: Record<string, unknown>) => s.director('edit_task', args);
    const r = await h.call('POST', '/projects/aurora/work', { goal: 'Build the Pensieve' });
    const work = workRepo(h.db);
    const id = r.body.items[0].id as string;
    const done = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done',
    );

    /* done: the finished work changes hands as it is, nothing reruns */
    expect(await turn({ task: id, owner: 'Baron' })).toContain('it was done, so their finished work stays');
    expect(work.item(id)).toMatchObject({ status: 'done', agentId: BOB, buildRunId: done.buildRunId });

    /* failed in review: the next owner (back to Columbo here) gets a fresh build, and the review is of theirs */
    work.setItem(id, { status: 'failed', stage: 'review', gateIndex: 0 });
    expect(await turn({ task: id, owner: 'Captain', team: 'ship-it' })).toContain(
      'they build it on the same branch',
    );
    const rebuilt = await until(
      () => work.item(id) as ChecklistItem,
      (i) => i.status === 'done' && i.buildRunId !== done.buildRunId,
    );
    expect(rebuilt).toMatchObject({ agentId: COLUMBO, teamId: 'ship-it' });
    const runs = (await h.call('GET', '/projects/aurora/runs')).body as { id: string; agentId: string }[];
    expect(runs.find((x) => x.id === rebuilt.buildRunId)?.agentId).toBe(COLUMBO);
  }, 20_000);
});
