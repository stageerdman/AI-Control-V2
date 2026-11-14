import { describe, expect, it } from 'vitest';
import type { ChecklistItem, Goal, StudioEvent } from '../../api';
import type { OfficeView, ThreadMessage } from './api';
import {
  boardFacts,
  boardProgress,
  boardTasks,
  changedActors,
  deriveActor,
  holderOf,
  initLive,
  type Live,
  mergeMessage,
  reduce,
  taskHover,
  taskStage,
  threadMessageOf,
} from './state';

const office: OfficeView = {
  project: 'aurora',
  name: 'Aurora',
  director: 'orch',
  teams: [{ id: 'ship', name: 'Ship-It', color: 'sun', emblem: 'rocket', captain: 'a', members: ['a', 'b'] }],
  solo: ['c'],
  agents: {
    orch: { status: 'idle' },
    a: {
      status: 'working',
      runId: 'r1',
      activity: { kind: 'editing', label: 'Editing cart.ts' },
      since: '2026-11-13T10:00:00Z',
    },
    b: { status: 'idle', since: '2026-11-13T09:00:00Z' },
    c: { status: 'idle' },
  },
  lastEventId: 41,
};
let seq = 41;
const ev = <T extends StudioEvent['type']>(type: T, payload: Extract<StudioEvent, { type: T }>['payload']) =>
  ({
    id: ++seq,
    projectId: 'aurora',
    type,
    payload,
    at: `2026-11-13T10:${String(seq).padStart(2, '0')}:00Z`,
  }) as StudioEvent;

describe('office state — events → what each robot shows', () => {
  it('on load: working → its activity, reported idle → free, never reported → asleep, director → big picture', () => {
    const live = initLive(office);
    expect(live.ids).toEqual(['orch', 'a', 'b', 'c']);
    expect(deriveActor(live, 'a')).toMatchObject({
      kind: 'coding',
      label: 'Editing cart.ts',
      session: 'running',
    });
    expect(deriveActor(live, 'b')).toMatchObject({ kind: 'idle', session: 'idle' });
    expect(deriveActor(live, 'c')).toMatchObject({ kind: 'sleeping', session: 'asleep' });
    expect(deriveActor(live, 'orch')).toMatchObject({ kind: 'planning', label: 'Big picture' });
  });

  it('server activity kinds map onto the scene’s poses', () => {
    let live = initLive(office);
    const kinds: [string, string][] = [
      ['reading', 'reading'],
      ['searching', 'reading'],
      ['editing', 'coding'],
      ['running', 'testing'],
      ['writing', 'reviewing'],
      ['thinking', 'planning'],
      ['starting', 'planning'],
      ['something-new', 'coding'],
    ];
    for (const [server, scene] of kinds) {
      live = reduce(
        live,
        ev('agent.status', { agentId: 'b', status: 'working', activity: { kind: server, label: 'x' } }),
      );
      expect(deriveActor(live, 'b').kind).toBe(scene);
    }
  });

  it('a sleeper wakes on its first status and goes back to free when the run is done', () => {
    let live = initLive(office);
    live = reduce(
      live,
      ev('agent.status', {
        agentId: 'c',
        runId: 'r9',
        status: 'working',
        activity: { kind: 'starting', label: 'Getting started' },
      }),
    );
    expect(deriveActor(live, 'c')).toMatchObject({
      kind: 'planning',
      session: 'running',
      label: 'Getting started',
    });
    live = reduce(live, ev('agent.status', { agentId: 'c', runId: 'r9', status: 'done' }));
    expect(deriveActor(live, 'c')).toMatchObject({ kind: 'idle', session: 'idle' });
  });

  it('the director thinks while planning a goal and is back to big picture after', () => {
    let live = initLive(office);
    live = reduce(
      live,
      ev('agent.status', {
        agentId: 'orch',
        status: 'working',
        activity: { kind: 'thinking', label: 'Planning the work' },
      }),
    );
    expect(deriveActor(live, 'orch')).toMatchObject({ kind: 'planning', label: 'Planning the work' });
    live = reduce(live, ev('agent.status', { agentId: 'orch', status: 'idle' }));
    expect(deriveActor(live, 'orch').label).toBe('Big picture');
  });

  it('ask.opened → "!" (needs-input) until ask.answered; duplicates and strangers ignored', () => {
    let live = initLive(office);
    const open = ev('ask.opened', {
      askId: 'q1',
      agentId: 'a',
      kind: 'question',
      question: 'Stripe or Adyen?',
      options: ['Stripe', 'Adyen'],
      runId: 'r1',
    });
    live = reduce(live, open);
    live = reduce(live, open);
    live = reduce(
      live,
      ev('ask.opened', { askId: 'q2', agentId: 'stranger', kind: 'question', question: '?' }),
    );
    expect(live.pending).toEqual([
      { id: 'q1', agentId: 'a', question: 'Stripe or Adyen?', options: ['Stripe', 'Adyen'], runId: 'r1' },
    ]);
    expect(deriveActor(live, 'a').kind).toBe('needs-input');
    live = reduce(live, ev('ask.answered', { askId: 'q1', answer: 'Stripe' }));
    expect(live.pending).toEqual([]);
    expect(deriveActor(live, 'a').kind).toBe('coding');
  });

  it('a waiting status without an open ask is just waiting (the "!" only comes from asks)', () => {
    const live = reduce(
      initLive(office),
      ev('agent.status', {
        agentId: 'a',
        status: 'waiting',
        activity: { kind: 'asking', label: 'Waiting for your answer' },
      }),
    );
    expect(deriveActor(live, 'a').kind).toBe('waiting');
  });

  it('asks open at load time show right away; only this office’s agents count', () => {
    const live = initLive(office, [
      { id: 'q1', agentId: 'b', question: 'Ok?', options: null },
      { id: 'q2', agentId: 'zz', question: 'Ok?', options: null },
    ]);
    expect(live.pending.map((p) => p.id)).toEqual(['q1']);
    expect(deriveActor(live, 'b').kind).toBe('needs-input');
  });

  it('changedActors lists only robots whose look changed', () => {
    const a: Live = initLive(office);
    const b = reduce(
      a,
      ev('agent.status', {
        agentId: 'b',
        status: 'working',
        activity: { kind: 'reading', label: 'Reading x' },
      }),
    );
    expect(changedActors(a, b)).toEqual(['b']);
    expect(changedActors(b, b)).toEqual([]);
  });
});

describe('threads', () => {
  const m = (id: string, at: string, text = id): ThreadMessage => ({
    id,
    from: 'user',
    kind: 'text',
    text,
    runId: null,
    reportId: null,
    at,
  });
  it('thread.message → message (agent replies are from the agent id; report link kept)', () => {
    const e = ev('thread.message', {
      agentId: 'a',
      messageId: 'm9',
      from: 'agent',
      kind: 'text',
      text: 'Scout filed it',
      runId: 'r2',
      reportId: 'rep_1',
    });
    expect(threadMessageOf(e as StudioEvent<'thread.message'>)).toMatchObject({
      id: 'm9',
      from: 'a',
      reportId: 'rep_1',
      runId: 'r2',
    });
  });
  it('merge: no duplicates, oldest first even when an event arrives late', () => {
    let t = [m('1', '2026-11-13T10:00:00Z'), m('3', '2026-11-13T10:02:00Z')];
    t = mergeMessage(t, m('3', '2026-11-13T10:02:00Z', 'again'));
    expect(t.map((x) => x.text)).toEqual(['1', 'again']);
    t = mergeMessage(t, m('2', '2026-11-13T10:01:00Z'));
    expect(t.map((x) => x.id)).toEqual(['1', '2', '3']);
  });
});

describe('the wall', () => {
  const goal = (
    id: string,
    status: Goal['status'],
    pct: number,
    items: [string, Goal['items'][number]['status']][],
  ): Goal =>
    ({
      id,
      projectId: 'aurora',
      text: `goal ${id}`,
      summary: `summary ${id}`,
      status,
      pct,
      caps: null,
      createdAt: '',
      updatedAt: '',
      items: items.map(([text, s], i) => ({ id: `${id}-${i}`, text, status: s }) as Goal['items'][number]),
    }) as Goal;
  it('tasks: running goals’ items, else the newest goal’s; progress follows the running goal', () => {
    const goals = [
      goal('g2', 'running', 50, [
        ['b1', 'done'],
        ['b2', 'running'],
      ]),
      goal('g1', 'done', 100, [['a1', 'done']]),
    ];
    expect(boardTasks(goals).map((t) => [t.text, t.done])).toEqual([
      ['b1', true],
      ['b2', false],
    ]);
    expect(boardProgress(goals)).toEqual({ pct: 50, target: null, shipped: null, aria: '50% done' });
    expect(boardTasks([goals[1]]).map((t) => t.text)).toEqual(['a1']);
    expect(boardProgress([]).pct).toBe(0);
  });
  it('progress: the project’s overall % labelled by its target, never by a goal text', () => {
    const p = { pct: 64, shipped: 3, total: 8, target: 'v1.0', goal: null };
    expect(boardProgress([goal('g', 'running', 10, [])], p)).toEqual({
      pct: 64,
      target: 'v1.0',
      shipped: '3 of 8 features shipped',
      aria: '64% to v1.0',
    });
    expect(boardProgress([], { ...p, target: null, total: 0 })).toEqual({
      pct: 64,
      target: null,
      shipped: null,
      aria: '64% done',
    });
    expect(boardFacts({ goals: [], progress: p }).overall).toBe(64);
  });
  it('task stages: in review / sent back n× / merging / stopped; hover says who and what', () => {
    const it = (o: Partial<ChecklistItem>) =>
      ({ id: 'i', agentId: 'a', status: 'running', stage: 'build', ...o }) as ChecklistItem;
    const names = (id: string) => ({ a: 'Pete', r: 'Scarlett' })[id] ?? id;
    const gates = [{ reviewer: 'r', kind: 'quality' as const, why: 'tidy' }];
    expect(taskStage(it({})).tag).toBeNull();
    const rev = it({ stage: 'review', gates, gateIndex: 0 });
    expect(taskStage(rev)).toEqual({ tag: 'in review', tone: null, sr: 'In review:' });
    expect(holderOf(rev)).toBe('r');
    expect(taskHover(rev, names)).toBe('Scarlett is reviewing (quality)');
    const back = it({
      sendBacks: 2,
      gates,
      notes: 'split the filter hook out',
      reviews: [{ reviewer: 'r', gate: 0, verdict: 'changes', notes: 'x', runId: null, at: '' }],
    });
    expect(taskStage(back)).toEqual({ tag: 'sent back 2×', tone: 'sun', sr: 'Sent back:' });
    expect(holderOf(back)).toBe('a');
    expect(taskHover(back, names)).toBe('Scarlett: “split the filter hook out”');
    expect(taskStage(it({ stage: 'merge' })).tag).toBe('merging');
    expect(taskStage(it({ status: 'failed' })).tag).toBe('stopped');
    expect(taskStage(it({ status: 'done', stage: 'review' })).tag).toBeNull();
  });
  it('facts: % + in-progress features + tasks + grades + unread sheets', () => {
    const f = boardFacts({
      goals: [goal('g', 'running', 40, [['x', 'todo']])],
      features: [
        { id: 'f2', name: 'Cart', status: 'now', order: 2, pct: null } as never,
        { id: 'f1', name: 'Voice', status: 'now', order: 1, pct: 70 } as never,
        { id: 'f3', name: 'Later', status: 'planned', order: 1, pct: 0 } as never,
      ],
      unreadReports: 2,
    });
    expect(f.overall).toBe(40);
    expect(f.now).toEqual([
      { name: 'Voice', pct: 70 },
      { name: 'Cart', pct: 0 },
    ]);
    expect(f.grades).toEqual([]);
    expect(f.unreadReports).toBe(2);
    expect(f.fresh).toBe(true);
  });
});

describe('F4 — app view, notes, new work', () => {
  it('app: url + port from the server; a CLI exit 0 ran and finished; only nonzero is a problem', async () => {
    const { appView } = await import('./state');
    const base = { command: 'node x.js', source: '.project', pid: null, startedAt: null, log: ['done'] };
    const run = appView({
      ...base,
      status: 'running',
      url: 'http://localhost:3931',
      port: 3931,
      exitCode: null,
    });
    expect(run).toMatchObject({ label: 'running', url: 'http://localhost:3931', port: 3931, action: 'Stop' });
    const cli = appView({ ...base, status: 'exited', url: null, port: null, exitCode: 0 });
    expect(cli).toMatchObject({ label: 'ran and finished', tone: 'ok', showLog: true, action: 'Run again' });
    const bad = appView({ ...base, status: 'exited', url: null, port: null, exitCode: 1 });
    expect(bad).toMatchObject({ label: 'failed (exit 1)', tone: 'bad', showLog: true });
    expect(appView({ ...base, command: null, status: 'stopped', url: null, exitCode: null }).label).toBe(
      'no run command yet',
    );
  });
  it('notes: first sentence, clipped, ellipsis when there is more', async () => {
    const { noteLine } = await import('./state');
    expect(noteLine("It's committed on my branch and not pushed. Tests pass: 24/24.")).toBe(
      "It's committed on my branch and not pushed. …",
    );
    expect(noteLine('Short.')).toBe('Short.');
    expect(noteLine('x'.repeat(300))?.length).toBe(140);
    expect(noteLine('  ')).toBeNull();
  });
  it('progress: a follow-up on a new feature reads as new work added', async () => {
    const { boardProgress } = await import('./state');
    const g = { id: 'g', status: 'running', pct: 0, featureId: 'f2', items: [] } as unknown as Goal;
    const p = { pct: 50, shipped: 1, total: 2, target: null, goal: null };
    expect(boardProgress([g], p).shipped).toBe('New work added · 1 of 2 features shipped');
    expect(boardProgress([{ ...g, status: 'done' }], { ...p, shipped: 2, pct: 100 }).shipped).toBe(
      '2 of 2 features shipped',
    );
  });
});
