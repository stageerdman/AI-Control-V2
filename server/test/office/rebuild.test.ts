/* Team rebuilds (spec-ux-team-rebuild §2, §3): the planner (card + steps, nothing written), apply in one go,
   undo from the snapshot, stale cards, and the director's chat reply carrying a rebuild.
   Seed: Aurora = Ship-It (Semic captain, Pete, Scar) + Polish (Lint captain, Doc, Twinkle); specialists Baron,
   Query, Merge; director a-pixel. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeBrain } from '../../src/crew/fake-brain.ts';
import { getChatMessages } from '../../src/db/chats.ts';
import { runsRepo } from '../../src/db/runs.ts';
import { workRepo } from '../../src/db/work.ts';
import { planRebuild } from '../../src/office/rebuild.ts';
import { createRebuilds } from '../../src/office/rebuild-service.ts';
import { type FakeStep, fakeRunner } from '../../src/runtime/fake.ts';
import { testApp } from '../helpers.ts';

const wait = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 200 && !(await fn()); i++) await new Promise((ok) => setTimeout(ok, 20));
};

let h: ReturnType<typeof testApp>;
afterEach(() => h.close());
const boot = (opts: Parameters<typeof testApp>[0] = {}) => {
  h = testApp({ seed: true, ...opts });
  return h.store;
};
const items = (list: { id: string; agentId: string; teamId: string | null }[]) =>
  workRepo(h.store.db).insertGoal(
    { id: 'g1', projectId: 'aurora', text: 'Goal', summary: '' },
    list.map((i) => ({ ...i, text: `item ${i.id}`, brief: '' })),
  );
const ok = (r: ReturnType<typeof planRebuild>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('rebuild planner', () => {
  it('removing a member hands their open item to the captain and confirms', () => {
    const s = boot();
    items([{ id: 'i1', agentId: 'a-pete', teamId: 'ship-it' }]);
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-pete'] }));
    expect(r.needsConfirm).toBe(true);
    expect(r.steps).toContainEqual(
      expect.objectContaining({ kind: 'item.assign', itemId: 'i1', agentId: 'a-semic' }),
    );
    expect(r.after).not.toContain('a-pete');
    expect(r.card.leaves[0]?.openItems[0]).toMatchObject({ to: 'captain' });
  });

  it('removing a captain promotes the next and the card says so', () => {
    const s = boot();
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-semic'] }));
    expect(r.card.captains).toEqual([expect.objectContaining({ teamId: 'ship-it', agentId: 'a-pete' })]);
  });

  it('a move past 7 is refused, nothing planned', () => {
    const s = boot();
    s.projects.update('aurora', { agentIds: ['a-baron', 'a-query', 'a-merge', 'a-prof'] });
    const r = planRebuild(s, 'aurora', {
      move: ['a-lint', 'a-doc', 'a-twinkle', 'a-baron', 'a-query'].map((agent) => ({
        agent,
        to: 'The Ship-It Squad',
      })),
    });
    expect(r.ok).toBe(false);
  });

  it('changing a shared team makes a copy and leaves the original alone', () => {
    const s = boot();
    s.projects.update('atlas', { teamIds: ['polish'] });
    const r = ok(planRebuild(s, 'aurora', { move: [{ agent: 'a-doc', to: 'specialist' }] }));
    expect(r.card.copies).toEqual([
      expect.objectContaining({ teamName: 'The Polish Patrol', otherProjects: ['Atlas Analytics'] }),
    ]);
    expect(r.steps.some((x) => x.kind === 'team.update' && x.key === 'polish')).toBe(false);
    expect(r.steps.find((x) => x.kind === 'team.create')).toMatchObject({
      from: 'polish',
      name: 'The Polish Patrol · Aurora Storefront',
    });
    expect(r.needsConfirm).toBe(true);
  });

  it('a team left with one person: lone member becomes a specialist by default', () => {
    const s = boot();
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-semic', 'a-pete'] }));
    expect(r.card.lone.map((l) => l.agentId)).toEqual(['a-scar']);
    expect(r.after).toContain('a-scar');
  });

  it('a split that leaves someone out is refused', () => {
    const s = boot();
    const r = planRebuild(s, 'aurora', {
      split: [
        {
          team: 'Ship-It Squad',
          into: [
            { name: 'Design', captain: 'a-pete', members: ['a-pete'] },
            { name: 'Build', captain: 'a-semic', members: ['a-semic'] },
          ],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('an item the director already holds is not "handed over" again', () => {
    const s = boot();
    items([{ id: 'i9', agentId: 'a-pixel', teamId: null }]);
    const r = ok(planRebuild(s, 'aurora', { move: [{ agent: 'a-baron', to: 'The Ship-It Squad' }] }));
    expect(r.card.leaves).toEqual([]);
    expect(r.steps.filter((x) => x.kind === 'item.assign')).toEqual([]);
    expect(r.needsConfirm).toBe(false);
  });

  it('a lone member picked "remove" who also sits on another team: card and lineup agree', () => {
    const s = boot();
    s.teams.addMember('ship-it', 'a-twinkle', 'Look');
    const r = ok(
      planRebuild(s, 'aurora', {
        remove: ['a-semic', 'a-pete', 'a-scar'],
        lone: [{ agent: 'a-twinkle', to: 'remove' }],
      }),
    );
    const leaving = r.card.leaves.map((l) => l.id);
    expect(leaving.includes('a-twinkle')).toBe(!r.after.includes('a-twinkle'));
  });

  it('a running item with "finish first" gets its new owner now, without stopping the run', () => {
    const s = boot();
    items([{ id: 'i2', agentId: 'a-pete', teamId: 'ship-it' }]);
    workRepo(s.db).setItem('i2', { status: 'running' });
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-pete'] }));
    expect(r.card.leaves[0]?.openItems[0]?.to).toBe('finish-first');
    expect(r.steps).toContainEqual(
      expect.objectContaining({ kind: 'item.assign', itemId: 'i2', agentId: 'a-semic', stopRunId: null }),
    );
  });
});

describe('rebuild apply and undo', () => {
  it('apply writes the lineup and hands items over; undo puts it all back', async () => {
    const s = boot();
    items([{ id: 'i1', agentId: 'a-pete', teamId: 'ship-it' }]);
    const plan = await h.call('POST', '/projects/aurora/rebuild/plan', { remove: ['a-pete'] });
    expect(plan.status).toBe(200);
    expect(plan.body.needsConfirm).toBe(true);
    const done = await h.call('POST', `/rebuild/${plan.body.planId}/apply`, {});
    expect(done.status).toBe(200);
    expect(done.body.summary).toContain('Pete');
    expect(s.teams.require('ship-it').members.map((m) => m.agentId)).not.toContain('a-pete');
    expect(workRepo(s.db).item('i1')?.agentId).toBe('a-semic');
    const evs = h.events.after('project', 'aurora');
    expect(evs.find((e) => e.type === 'staff.changed')?.payload).toMatchObject({ removed: ['a-pete'] });

    const undo = await h.call('POST', `/rebuild/undo/${done.body.undoToken}`);
    expect(undo.status).toBe(200);
    expect(s.teams.require('ship-it').members.map((m) => m.agentId)).toContain('a-pete');
    expect(workRepo(s.db).item('i1')?.agentId).toBe('a-pete');
    // a token works once
    expect((await h.call('POST', `/rebuild/undo/${done.body.undoToken}`)).status).toBe(422);
  });

  it('a shared team is copied on apply; undo deletes the copy and the original is untouched', async () => {
    const s = boot();
    s.projects.update('atlas', { teamIds: ['polish'] });
    const before = s.teams.require('polish').members.map((m) => m.agentId);
    const plan = await h.call('POST', '/projects/aurora/rebuild/plan', {
      move: [{ agent: 'a-doc', to: 'specialist' }],
    });
    const done = await h.call('POST', `/rebuild/${plan.body.planId}/apply`, {});
    expect(done.status).toBe(200);
    expect(s.teams.require('polish').members.map((m) => m.agentId)).toEqual(before);
    const p = s.projects.require('aurora');
    expect(p.teamIds).not.toContain('polish');
    expect(p.agentIds).toContain('a-doc');
    const copy = p.teamIds.find((t) => t !== 'ship-it') as string;
    await h.call('POST', `/rebuild/undo/${done.body.undoToken}`);
    expect(s.projects.require('aurora').teamIds).toContain('polish');
    expect(s.teams.get(copy)).toBeFalsy();
  });

  it('a card goes stale when the lineup changes or a new message reaches the director', async () => {
    const s = boot();
    const a = await h.call('POST', '/projects/aurora/rebuild/plan', { remove: ['a-pete'] });
    s.teams.addMember('ship-it', 'a-baron', 'Help'); // the lineup moved under the card
    expect((await h.call('POST', `/rebuild/${a.body.planId}/apply`, {})).status).toBe(422);
    expect(s.teams.require('ship-it').members.map((m) => m.agentId)).toContain('a-pete');
  });

  it('picks on the card win: stop-now stops the run and the item waits for its new owner', async () => {
    const s = boot();
    items([{ id: 'i2', agentId: 'a-pete', teamId: 'ship-it' }]);
    workRepo(s.db).setItem('i2', { status: 'running', runId: 'r-gone' }); // a run id the runtime doesn't know
    const plan = await h.call('POST', '/projects/aurora/rebuild/plan', { remove: ['a-pete'] });
    expect(plan.body.card.leaves[0].running).toBe(true);
    const done = await h.call('POST', `/rebuild/${plan.body.planId}/apply`, {
      handover: [{ agent: 'a-pete', to: 'stop-now' }],
    });
    expect(done.status).toBe(200);
    const it = workRepo(s.db).item('i2');
    expect(it?.agentId).toBe('a-semic');
    expect(it?.status).toBe('todo'); // stopped: it waits for its new owner
    expect(it?.runId).toBeNull();
  });

  it('stop-now on a step whose run just delivered: not stopped, not handed over, the work is kept', async () => {
    const s = boot();
    items([{ id: 'i3', agentId: 'a-pete', teamId: 'ship-it' }]);
    const runs = runsRepo(s.db);
    runs.insert({
      id: 'r-done',
      projectId: 'aurora',
      agentId: 'a-pete',
      teamId: 'ship-it',
      task: 't',
      runner: 'fake',
      model: 'm',
      caps: { maxTurns: 1, maxBudgetUsd: 1 },
    });
    runs.finish('r-done', {
      status: 'succeeded',
      result: 'Delivered.',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      turns: 1,
    });
    workRepo(s.db).setItem('i3', { status: 'running', runId: 'r-done' }); // the board hasn't caught up yet
    const plan = await h.call('POST', '/projects/aurora/rebuild/plan', { remove: ['a-pete'] });
    const done = await h.call('POST', `/rebuild/${plan.body.planId}/apply`, {
      handover: [{ agent: 'a-pete', to: 'stop-now' }],
    });
    expect(done.status).toBe(200);
    const it = workRepo(s.db).item('i3');
    expect(it).toMatchObject({ agentId: 'a-pete', status: 'running', runId: 'r-done' });
  });

  it('a nonsense name is refused, nothing written', async () => {
    const s = boot();
    const before = JSON.stringify(s.projects.require('aurora'));
    const r = await h.call('POST', '/projects/aurora/rebuild/plan', { remove: ['Nobody At All'] });
    expect(r.status).toBe(422);
    expect(JSON.stringify(s.projects.require('aurora'))).toBe(before);
  });
});

describe('the director rebuilds from chat', () => {
  /** The director's chat turn calls rebuild_teams with `args`, then replies `reply`. */
  /** Every task the director's turns got, oldest first. */
  const tasks: string[] = [];
  const setup = (args: object, reply = 'Done.') => {
    tasks.length = 0;
    boot({
      runner: fakeRunner((spec): FakeStep[] => {
        if (spec.task.startsWith('Studio summary right now: ')) {
          tasks.push(spec.task);
          return [{ tool: 'rebuild_teams', args: args as Record<string, unknown> }, { result: reply }];
        }
        return fakeBrain(spec);
      }),
    });
    const p = h.store.projects.require('aurora');
    mkdirSync(join(h.config.sandbox, p.folder ?? 'aurora'), { recursive: true });
    if (!p.folder) h.store.projects.update('aurora', { folder: 'aurora' });
    return p.orchestratorId;
  };
  const thread = async (orch: string) =>
    (await h.call('GET', `/projects/aurora/threads/${orch}/messages`)).body.messages as {
      from: string;
      kind: string;
      text: string;
      rebuild?: {
        planId: string;
        needsConfirm: boolean;
        undoToken?: string;
        closed?: string;
        reason?: string;
        told?: boolean;
      };
    }[];
  /** The director makes a confirm card (taking Pete off, with open work): its saved offer. */
  const cardFromChat = async () => {
    const orch = setup({ remove: ['Pixel Pete'] }, 'Confirm below.');
    items([{ id: 'i1', agentId: 'a-pete', teamId: 'ship-it' }]);
    const r = await h.call('POST', `/projects/aurora/threads/${orch}/messages`, { text: 'Take Pete off' });
    await h.runtime.settled(r.body.runId);
    const card = async () => (await thread(orch)).find((m) => m.rebuild)?.rebuild;
    return { orch, card, planId: (await card())?.planId as string };
  };

  const turnSaid = (runId: string) =>
    getChatMessages(h.db, runId).find((m) => m.role === 'assistant')?.text ?? '';

  it('a rebuild with something to decide comes back as a card under the reply; nothing changes yet', async () => {
    const orch = setup({ remove: ['Pixel Pete'] }, 'Here is the plan — confirm below.');
    items([{ id: 'i1', agentId: 'a-pete', teamId: 'ship-it' }]);
    const r = await h.call('POST', `/projects/aurora/threads/${orch}/messages`, {
      text: 'Take Pete off the project',
    });
    await h.runtime.settled(r.body.runId);
    expect(turnSaid(r.body.runId)).toMatch(/nothing has changed yet.*confirm below/);
    const reply = (await thread(orch)).find((m) => m.from !== 'user');
    expect(reply?.text).toBe('Here is the plan — confirm below.');
    expect(reply?.rebuild?.needsConfirm).toBe(true);
    expect(h.store.teams.require('ship-it').members.map((m) => m.agentId)).toContain('a-pete');
    const ev = h.events
      .after('project', 'aurora')
      .find((e) => e.type === 'thread.message' && (e.payload as { rebuild?: unknown }).rebuild);
    expect(ev).toBeTruthy();
  });

  it('a rebuild with nothing to decide is applied at once and carries its Undo', async () => {
    const orch = setup(
      { move: [{ agent: 'a-baron', to: 'The Ship-It Squad' }] },
      'Done — Baron joins the Ship-It Squad.',
    );
    const r = await h.call('POST', `/projects/aurora/threads/${orch}/messages`, {
      text: 'Put Baron on Ship-It',
    });
    await h.runtime.settled(r.body.runId);
    expect(turnSaid(r.body.runId)).toMatch(/^Done: .*Undo/);
    const reply = (await thread(orch)).find((m) => m.from !== 'user');
    expect(reply?.rebuild?.undoToken).toBeTruthy();
    expect(h.store.teams.require('ship-it').members.map((m) => m.agentId)).toContain('a-baron');
  });

  /* the HQ bug: the team changed under a waiting card, its answer said "Plan changed", and the card came back
     after every restart and blocked New chat */
  it('a card whose plan went out of date closes itself, stays closed after a restart, and the director hears', async () => {
    const { orch, card, planId } = await cardFromChat();
    h.store.teams.addMember('ship-it', 'a-baron', 'Help'); // the team changed under the card
    const r = await h.call('POST', `/rebuild/${planId}/apply`, {});
    expect(r.status).toBe(422);
    expect(await card()).toMatchObject({
      closed: 'expired',
      reason: expect.stringMatching(/lineup changed/),
    });
    createRebuilds({ store: h.store, events: h.events }); // a fresh start
    expect((await card())?.closed).toBe('expired');
    const next = await h.call('POST', `/projects/aurora/threads/${orch}/messages`, { text: 'Hi' });
    await h.runtime.settled(next.body.runId);
    expect(tasks[1]).toMatch(/rebuild card\(s\) ran out without being applied/);
    expect(tasks[1]).toContain('Pixel Pete left');
    expect((await card())?.told).toBe(true);
  });

  it('a card whose change already holds closes itself as out of date', async () => {
    const { card, planId } = await cardFromChat();
    h.store.teams.saveRoster('ship-it', {
      captainId: 'a-semic',
      members: h.store.teams.require('ship-it').members.filter((m) => m.agentId !== 'a-pete'),
    });
    const r = await h.call('POST', `/rebuild/${planId}/apply`, {});
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toMatch(/already looks like that/);
    expect(await card()).toMatchObject({ closed: 'expired', reason: 'the team already looks like that' });
  });

  it('a card still waiting at a restart closes itself; a dismissed one never comes back', async () => {
    const first = await cardFromChat();
    createRebuilds({ store: h.store, events: h.events });
    expect((await first.card())?.closed).toBe('expired');
    const again = await cardFromChat();
    expect((await h.call('POST', `/rebuild/${again.planId}/dismiss`)).status).toBe(200);
    expect((await again.card())?.closed).toBe('kept');
    // dismissing a card whose plan is long gone works too
    expect((await h.call('POST', `/rebuild/${first.planId}/dismiss`)).status).toBe(200);
  });

  it('a rebuild the planner refuses comes back to the director in the turn; no card, nothing changes', async () => {
    const orch = setup({ remove: ['Nobody At All'] }, 'I couldn’t find them.');
    const lineup = () => {
      const p = h.store.projects.require('aurora');
      return JSON.stringify([p.teamIds, p.agentIds, h.store.teams.require('ship-it').members]);
    };
    const before = lineup();
    const r = await h.call('POST', `/projects/aurora/threads/${orch}/messages`, { text: 'Remove nobody' });
    await h.runtime.settled(r.body.runId);
    expect(turnSaid(r.body.runId)).toMatch(/^rebuild_teams refused: /);
    expect((await thread(orch)).find((m) => m.from !== 'user')?.rebuild).toBeUndefined();
    expect(lineup()).toBe(before);
  });
});
