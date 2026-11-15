/* HOW TO USE: copy to server/test/office/rebuild-probe.test.ts (imports are relative to there) and run
   `npx vitest run test/office/rebuild-probe.test.ts` in server/. The tests marked PROBE failed on f114065.
   Review probe for the WIP team-rebuild planner (spec-ux-team-rebuild §2). Seed: Aurora = Ship-It (Semic captain,
   Pete, Scar) + Polish (Lint captain, Doc, Twinkle); specialists Baron, Query, Merge; director a-pixel. */
import { afterEach, describe, expect, it } from 'vitest';
import { workRepo } from '../../src/db/work.ts';
import { planRebuild } from '../../src/office/rebuild.ts';
import { testApp } from '../helpers.ts';

describe('rebuild planner probe', () => {
  let h: ReturnType<typeof testApp>;
  afterEach(() => h.close());
  const boot = () => {
    h = testApp({ seed: true });
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

  it('removing a member hands their open item to the captain and confirms', () => {
    const s = boot();
    items([{ id: 'i1', agentId: 'a-pete', teamId: 'ship-it' }]);
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-pete'] }));
    expect(r.needsConfirm).toBe(true);
    expect(r.steps).toContainEqual(expect.objectContaining({ kind: 'item.assign', itemId: 'i1', agentId: 'a-semic' }));
    expect(r.after).not.toContain('a-pete');
  });

  it('removing a captain promotes the next and the card says so', () => {
    const s = boot();
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-semic'] }));
    expect(r.card.captainChanges).toEqual([expect.objectContaining({ newCaptainId: 'a-pete' })]);
  });

  it('a move past 7 is refused, nothing planned', () => {
    const s = boot();
    s.projects.update('aurora', { agentIds: ['a-baron', 'a-query', 'a-merge', 'a-prof'] });
    const r = planRebuild(s, 'aurora', {
      move: ['a-lint', 'a-doc', 'a-twinkle', 'a-baron', 'a-query'].map((agent) => ({ agent, to: 'The Ship-It Squad' })),
    });
    expect(r.ok).toBe(false);
  });

  it('changing a shared team makes a copy and leaves the original alone', () => {
    const s = boot();
    s.projects.update('atlas', { teamIds: ['polish'] });
    const r = ok(planRebuild(s, 'aurora', { move: [{ agent: 'a-doc', to: 'specialist' }] }));
    expect(r.card.sharedCopies).toEqual([{ teamName: 'The Polish Patrol', otherProjects: ['Atlas Analytics'] }]);
    expect(r.steps.some((x) => x.kind === 'team.update' && x.key === 'polish')).toBe(false);
    const create = r.steps.find((x) => x.kind === 'team.create');
    expect(create).toMatchObject({ from: 'polish', name: 'The Polish Patrol · Aurora Storefront' });
    expect(r.needsConfirm).toBe(true);
  });

  it('a team left with one person: lone member becomes a specialist by default', () => {
    const s = boot();
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-semic', 'a-pete'] }));
    expect(r.card.loneMembers.map((l) => l.agentId)).toEqual(['a-scar']);
    expect(r.after).toContain('a-scar');
  });

  it('a split that leaves someone out is refused', () => {
    const s = boot();
    const r = planRebuild(s, 'aurora', {
      split: [{ team: 'Ship-It Squad', into: [{ name: 'Design', captain: 'a-pete', members: ['a-pete'] }, { name: 'Build', captain: 'a-semic', members: ['a-semic'] }] }],
    });
    expect(r.ok).toBe(false);
  });

  it('PROBE: an item the director already holds (handed back earlier) is not "handed over" again', () => {
    const s = boot();
    items([{ id: 'i9', agentId: 'a-pixel', teamId: null }]);
    const r = ok(planRebuild(s, 'aurora', { move: [{ agent: 'a-baron', to: 'The Ship-It Squad' }] }));
    expect(r.card.leaves).toEqual([]);
    expect(r.steps.filter((x) => x.kind === 'item.assign')).toEqual([]);
    expect(r.needsConfirm).toBe(false);
  });

  it('PROBE: a lone member picked "remove" who also sits on another team', () => {
    const s = boot();
    // Twinkle is on Polish; give Ship-It Twinkle too, then strip Ship-It down to Twinkle
    s.teams.addMember('ship-it', 'a-twinkle', 'Look');
    const r = ok(
      planRebuild(s, 'aurora', { remove: ['a-semic', 'a-pete', 'a-scar'], lone: [{ agentId: 'a-twinkle', to: 'remove' }] }),
    );
    const leaving = r.card.leaves.map((l) => l.id);
    // the card and the lineup must agree
    expect(leaving.includes('a-twinkle')).toBe(!r.after.includes('a-twinkle'));
  });

  it('PROBE: a running item with "finish first" keeps an owner on the project', () => {
    const s = boot();
    items([{ id: 'i2', agentId: 'a-pete', teamId: 'ship-it' }]);
    workRepo(s.db).setItem('i2', { status: 'running' });
    const r = ok(planRebuild(s, 'aurora', { remove: ['a-pete'] }));
    const assigned = r.steps.some((x) => x.kind === 'item.assign' && x.itemId === 'i2');
    // either it's reassigned now, or the plan must say who gets it when the run ends
    expect(assigned || r.card.leaves[0]?.openItems[0]?.to === 'finish-first').toBe(true);
    expect(r.after).not.toContain('a-pete'); // seat is gone at once, though spec says "seat stays until the run ends"
  });
});
