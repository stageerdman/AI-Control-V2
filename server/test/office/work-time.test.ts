/* OFFICE: the work clock. GET /projects/:id/time = agent time on a project from the runs table (+ the crew calls
   that never become runs), by kind of work and by agent; running work counts up to now; no money anywhere. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkClock, kindOfRun } from '../../src/office/work-time.ts';
import { scriptedCrew } from '../crew/brain.ts';
import { testApp } from '../helpers.ts';

const T0 = Date.parse('2026-11-14T10:00:00.000Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

describe('the work clock', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  /* a run row as the runtime writes it (kind null = an older run) */
  const run = (
    id: string,
    o: { agent: string; kind?: string | null; task?: string; from: number; to?: number; turns?: number },
  ) =>
    h.db
      .prepare(
        `INSERT INTO runs (id, project_id, agent_id, task, status, runner, caps, turns, started_at, ended_at, kind, cost_usd)
         VALUES (?, 'aurora', ?, ?, ?, 'fake', '{}', ?, ?, ?, ?, 4.2)`,
      )
      .run(
        id,
        o.agent,
        o.task ?? 'Build it',
        o.to === undefined ? 'running' : 'succeeded',
        o.turns ?? 0,
        at(o.from),
        o.to === undefined ? null : at(o.to),
        o.kind ?? null,
      );

  it('an adopted project with no runs: 0, every kind listed at 0, nothing live; unknown project → 404', async () => {
    h = testApp({ seed: true });
    const r = await h.call('GET', '/projects/aurora/time');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      totalMs: 0,
      byKind: [
        { kind: 'thinking', label: 'Thinking & planning', ms: 0 },
        { kind: 'building', label: 'Coding & building', ms: 0 },
        { kind: 'reviewing', label: 'Reviewing', ms: 0 },
        { kind: 'research', label: 'Research & reports', ms: 0 },
        { kind: 'setup', label: 'Setup', ms: 0 },
      ],
      byAgent: [],
      runs: 0,
      turns: 0,
      since: null,
      live: 0,
    });
    expect((await h.call('GET', '/projects/nope/time')).status).toBe(404);
  });

  it('sums runs + crew time by kind and agent; a running run counts up to now; old rows get a kind; no dollars', () => {
    h = testApp({ seed: true });
    const clock = createWorkClock(h.db);
    run('r1', { agent: 'a-semic', kind: 'building', from: 0, to: 60, turns: 20 });
    run('r2', { agent: 'a-lint', kind: 'reviewing', from: 60, to: 75, turns: 5 });
    run('r3', { agent: 'a-pixel', from: 80, to: 82, turns: 1 }); // older run: the orchestrator → thinking
    run('r4', { agent: 'a-lint', task: 'You are reviewing Build search', from: 90, to: 100, turns: 3 });
    run('r5', { agent: 'a-prof', kind: 'research', from: 100 }); // still running
    h.db
      .prepare(
        `INSERT INTO crew_time (id, scope, owner_id, agent_id, kind, turns, started_at, ended_at) VALUES
         ('c1', 'project', 'aurora', 'a-pixel', 'thinking', 2, ?, ?),
         ('c2', 'project', 'aurora', 'a-setter', 'setup', 0, ?, ?),
         ('c3', 'project', 'other', 'a-pixel', 'thinking', 9, ?, ?)`,
      )
      .run(at(-5), at(-3), at(-10), at(-9), at(0), at(600));
    const t = clock.summary('aurora', new Date(T0 + 130 * 60_000));
    const min = (ms: number) => ms / 60_000;
    expect(min(t.totalMs)).toBe(60 + 15 + 2 + 10 + 30 + 2 + 1);
    expect(Object.fromEntries(t.byKind.map((k) => [k.kind, min(k.ms)]))).toEqual({
      thinking: 4,
      building: 60,
      reviewing: 25,
      research: 30,
      setup: 1,
    });
    expect(t.byAgent.map((a) => [a.agentId, min(a.ms), a.runs])).toEqual([
      ['a-semic', 60, 1],
      ['a-prof', 30, 1],
      ['a-lint', 25, 2],
      ['a-pixel', 4, 2],
      ['a-setter', 1, 1],
    ]);
    expect(t).toMatchObject({ runs: 7, turns: 31, since: at(-10), live: 1 });
    expect(JSON.stringify(t)).not.toMatch(/cost|usd|\$/i);
    // ten minutes later the running one has counted up
    expect(min(clock.summary('aurora', new Date(T0 + 140 * 60_000)).totalMs)).toBe(130);
  });

  it('kindOfRun: a stored kind wins; else orchestrator → thinking, review → reviewing, report → research', () => {
    expect(kindOfRun({ kind: 'setup', task: 'x', agentKind: 'agent' })).toBe('setup');
    expect(kindOfRun({ kind: null, task: 'x', agentKind: 'orchestrator' })).toBe('thinking');
    expect(kindOfRun({ kind: null, task: 'You are reviewing X', agentKind: 'agent' })).toBe('reviewing');
    expect(kindOfRun({ kind: null, task: 'answer with file_report', agentKind: 'agent' })).toBe('research');
    expect(kindOfRun({ kind: 'bogus', task: 'x', agentKind: 'agent' })).toBe('building');
  });

  it('live: Rivet’s setup moves to the project; planning is thinking, the work is building; chat turns too', async () => {
    const plan = {
      summary: 'Search.',
      items: [{ text: 'Build search', assignee: 'a-semic', teamId: 'ship-it', brief: 'b' }],
    };
    const crew = scriptedCrew({ dispatch: [plan] });
    h = testApp({ seed: true, runner: crew.runner });
    const d = (
      await h.call('POST', '/drafts', { mode: 'new', name: 'Clock Shop', orchestratorId: 'a-pixel' })
    ).body;
    await h.call('PATCH', `/drafts/${d.id}`, {
      plan: { teams: [{ teamId: 'ship-it', why: 'builds' }], summary: 'Ship-It builds.' },
    });
    expect((await h.call('POST', `/drafts/${d.id}/setup`)).status).toBe(200);
    expect((await h.call('POST', `/drafts/${d.id}/finish`)).status).toBe(201);
    const t0 = (await h.call('GET', '/projects/clock-shop/time')).body;
    expect(t0.runs).toBe(1);
    expect(t0.byAgent.map((a: { agentId: string }) => a.agentId)).toEqual(['a-setter']);

    const g = (await h.call('POST', '/projects/clock-shop/work', { goal: 'Build search' })).body;
    for (let i = 0; i < 200; i++) {
      if ((await h.call('GET', `/projects/clock-shop/work/${g.id}`)).body.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const chat = await h.call('POST', '/projects/clock-shop/threads/a-pixel/messages', {
      text: 'How is it going?',
    });
    await h.runtime.settled(chat.body.runId);
    const t = (await h.call('GET', '/projects/clock-shop/time')).body;
    const runs = h.db.prepare("SELECT agent_id, kind FROM runs WHERE project_id = 'clock-shop'").all();
    expect(runs).toEqual(
      expect.arrayContaining([
        { agent_id: 'a-semic', kind: 'building' },
        { agent_id: 'a-pixel', kind: 'thinking' },
      ]),
    );
    const crewRows = h.db
      .prepare("SELECT agent_id, kind FROM crew_time WHERE scope = 'project' AND owner_id = 'clock-shop'")
      .all() as { agent_id: string; kind: string }[];
    expect(crewRows).toEqual(
      expect.arrayContaining([
        { agent_id: 'a-setter', kind: 'setup' }, // Rivet, moved from the draft
        { agent_id: 'a-pixel', kind: 'thinking' }, // planning the goal
      ]),
    );
    expect(t.runs).toBe(crewRows.length + runs.length);
    expect(t.live).toBe(0);
    expect(t.byAgent.map((a: { agentId: string }) => a.agentId).sort()).toEqual(
      ['a-pixel', 'a-semic', 'a-setter'].sort(),
    );
  });

  it('a crew call cut off by a restart counts as nothing', () => {
    h = testApp({ seed: true });
    mkdirSync(join(h.config.sandbox, 'x'), { recursive: true });
    const clock = createWorkClock(h.db);
    clock.start({ scope: 'project', ownerId: 'aurora', agentId: 'a-pixel', kind: 'thinking' });
    expect(clock.summary('aurora').live).toBe(1);
    clock.recover();
    expect(clock.summary('aurora')).toMatchObject({ live: 0, totalMs: 0, runs: 1 });
  });
});
