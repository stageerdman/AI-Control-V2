/* Stall alerts, delivered (src/office/stall-alerts.ts): the stalled goal's own project's orchestrator hears it —
   in their live run, in the comms log and as a work.stalled event — and no other project's. */
import { afterEach, describe, expect, it } from 'vitest';
import { createComms } from '../../src/comms/comms.ts';
import { goalStall } from '../../src/crew/stall.ts';
import type { Goal } from '../../src/db/work.ts';
import { createStallAlerts } from '../../src/office/stall-alerts.ts';
import { testApp } from '../helpers.ts';

type Ev = { type: string; payload: Record<string, unknown> };
const goalIn = (projectId: string): Goal =>
  ({
    id: `g-${projectId}`,
    projectId,
    text: 'Ship the thing',
    status: 'failed',
    items: [
      { id: 'i1', text: 'Build it', status: 'failed', note: 'npm test: 3 failed', sendBacks: 0, reviews: [] },
    ],
  }) as unknown as Goal;

describe('stall alerts reach the right orchestrator', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());

  it('each project’s stall goes to that project’s orchestrator only', () => {
    h = testApp({ seed: true });
    const [p1, p2] = (() => {
      const all = h.store.projects.list();
      const a = all.find((p) => p.id === 'aurora');
      const b = all.find((p) => p.orchestratorId !== a?.orchestratorId);
      if (!a || !b) throw new Error('the seed needs two projects with different orchestrators');
      return [a, b];
    })();
    const comms = createComms({ db: h.db, events: h.events });
    const told: { projectId: string; agentId: string; text: string }[] = [];
    const deliver = createStallAlerts({
      store: h.store,
      events: h.events,
      comms,
      tell: (projectId, agentId, _from, text) => {
        told.push({ projectId, agentId, text });
        return agentId === p1.orchestratorId;
      },
    });

    for (const p of [p1, p2]) {
      const g = goalIn(p.id);
      deliver(goalStall(g, 1), g);
    }

    expect(told.map((t) => `${t.projectId}:${t.agentId}`)).toEqual([
      `${p1.id}:${p1.orchestratorId}`,
      `${p2.id}:${p2.orchestratorId}`,
    ]);
    expect(told[0]?.text).toContain('Why: “Build it” failed: npm test: 3 failed');
    expect(told[0]?.text).toContain('Done so far: Nothing is finished yet.');
    for (const [p, live] of [
      [p1, true],
      [p2, false],
    ] as const) {
      const alerts = comms.list('project', p.id).filter((c) => c.kind === 'alert');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ to: p.orchestratorId, refs: { goalId: `g-${p.id}`, live } });
      const ev = (h.events.after('project', p.id) as Ev[]).filter((e) => e.type === 'work.stalled');
      expect(ev.map((e) => e.payload)).toMatchObject([
        { goalId: `g-${p.id}`, orchestratorId: p.orchestratorId, kind: 'goal-stopped' },
      ]);
    }
  });
});
