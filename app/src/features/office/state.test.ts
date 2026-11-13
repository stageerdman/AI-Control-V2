import { describe, expect, it } from 'vitest';
import type { Goal, StudioEvent } from '../../api';
import type { OfficeView, ThreadMessage } from './api';
import {
  boardFacts,
  boardProgress,
  boardTasks,
  changedActors,
  deriveActor,
  initLive,
  type Live,
  looksLikeGoal,
  mergeMessage,
  reduce,
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
    expect(boardProgress(goals)).toEqual({ pct: 50, toward: 'summary g2' });
    expect(boardTasks([goals[1]]).map((t) => t.text)).toEqual(['a1']);
    expect(boardProgress([])).toEqual({ pct: 0, toward: null });
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
  it('goal intent: imperative asks become work, questions stay conversation', () => {
    expect(looksLikeGoal('Build the checkout page')).toBe(true);
    expect(looksLikeGoal('Research payment providers')).toBe(true);
    expect(looksLikeGoal('please add dark mode')).toBe(true);
    expect(looksLikeGoal('Can you build the checkout?')).toBe(false);
    expect(looksLikeGoal('how is it going')).toBe(false);
    expect(looksLikeGoal('fix it?')).toBe(false);
  });
});
