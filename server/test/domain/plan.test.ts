import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { castView } from '../../src/db/drafts.ts';
import { type Plan, PlanSchema, pendingBriefs, planIssues, staffingOf } from '../../src/domain/plan.ts';
import { testApp } from '../helpers.ts';

const plan = (p: Partial<Plan> & Record<string, unknown>) => PlanSchema.parse({ summary: 'A plan.', ...p });

describe('plan: shape + teams-first rules', () => {
  let h: ReturnType<typeof testApp>;
  let issues: (p: Plan) => string[];
  beforeEach(() => {
    h = testApp({ seed: true });
    const cast = castView(h.store.agents, h.store.teams);
    issues = (p) => planIssues(p, cast).map((i) => i.message);
  });
  afterEach(() => h.close());

  it('accepts whole existing teams (+ a justified specialist)', () => {
    const p = plan({
      teams: [{ teamId: 'ship-it', why: 'builds the storefront' }],
      specialists: [{ agentId: 'a-prof', why: 'research before code' }],
    });
    expect(issues(p)).toEqual([]);
    expect(staffingOf(p)).toEqual({ teamIds: ['ship-it'], agentIds: ['a-prof'] });
    expect(pendingBriefs(p)).toBe(0);
  });

  it('never lets the plan pick a captain: strict entries reject a captain key', () => {
    const r = PlanSchema.safeParse({
      teams: [{ teamId: 'ship-it', why: 'x', captainId: 'a-pete' }],
      summary: 's',
    });
    expect(r.success).toBe(false);
    expect(PlanSchema.safeParse({ teams: [], captainId: 'a-pete', summary: 's' }).success).toBe(false);
  });

  it('every specialist needs a why; every brief a text', () => {
    expect(
      PlanSchema.safeParse({ specialists: [{ agentId: 'a-prof', why: ' ' }], summary: 's' }).success,
    ).toBe(false);
    expect(PlanSchema.safeParse({ newAgents: [{ brief: '' }], summary: 's' }).success).toBe(false);
  });

  it('ids must exist', () => {
    expect(
      issues(
        plan({ teams: [{ teamId: 'ghost', why: 'x' }], specialists: [{ agentId: 'a-nope', why: 'x' }] }),
      ),
    ).toEqual(["No team 'ghost' in the Cast", "No agent 'a-nope' in the Cast"]);
  });

  it('teams stay whole: a specialist who already comes with a planned team is refused', () => {
    expect(
      issues(
        plan({
          teams: [{ teamId: 'ship-it', why: 'x' }],
          specialists: [{ agentId: 'a-pete', why: 'more UI' }],
        }),
      ),
    ).toEqual(['Pixel Pete already comes with The Ship-It Squad — teams stay whole; drop the specialist']);
  });

  it('studio crew is never a specialist; duplicates are refused', () => {
    expect(issues(plan({ specialists: [{ agentId: 'a-creator', why: 'x' }] }))[0]).toMatch(/studio crew/);
    expect(
      issues(
        plan({
          teams: [
            { teamId: 'polish', why: 'x' },
            { teamId: 'polish', why: 'y' },
          ],
        }),
      ),
    ).toEqual(['The Polish Patrol is listed twice']);
  });

  it('teams first: individuals are the exception', () => {
    expect(issues(plan({}))).toEqual(['The plan staffs nobody — propose at least one team']);
    // very small project: up to 2 individuals and no team is fine
    expect(
      issues(
        plan({
          specialists: [
            { agentId: 'a-pete', why: 'UI' },
            { agentId: 'a-semic', why: 'API' },
          ],
        }),
      ),
    ).toEqual([]);
    // three individuals and no team → propose a team
    expect(
      issues(
        plan({
          specialists: [
            { agentId: 'a-pete', why: 'UI' },
            { agentId: 'a-semic', why: 'API' },
          ],
          newAgents: [{ brief: 'a mobile dev' }],
        }),
      )[0],
    ).toMatch(/without a team only a very small crew/);
    // a new team counts as a team
    expect(issues(plan({ newTeams: [{ brief: 'mobile crew' }] }))).toEqual([]);
    // next to teams: at most 3 individuals (the schema caps each list too)
    expect(
      issues(
        plan({
          teams: [{ teamId: 'polish', why: 'x' }],
          specialists: [
            { agentId: 'a-pete', why: 'a' },
            { agentId: 'a-semic', why: 'b' },
          ],
          newAgents: [{ brief: 'c' }, { brief: 'd' }],
        }),
      )[0],
    ).toMatch(/at most 3 individual specialists/);
  });

  it('PATCH /drafts validates the plan: 422 shape/unknown id, 409 rule', async () => {
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'P' })).body;
    expect((await h.call('PATCH', `/drafts/${d.id}`, { plan: { teams: 'x' } })).status).toBe(422);
    expect(
      (
        await h.call('PATCH', `/drafts/${d.id}`, {
          plan: { teams: [{ teamId: 'ghost', why: 'x' }], summary: 's' },
        })
      ).status,
    ).toBe(422);
    const r = await h.call('PATCH', `/drafts/${d.id}`, {
      plan: {
        teams: [{ teamId: 'ship-it', why: 'x' }],
        specialists: [{ agentId: 'a-scar', why: 'QA' }],
        summary: 's',
      },
    });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/teams stay whole/);
  });

  it('finish refuses a plan with briefs the Agent Creator has not designed yet', async () => {
    const d = (await h.call('POST', '/drafts', { mode: 'new', name: 'Briefed' })).body;
    await h.call('PATCH', `/drafts/${d.id}`, {
      plan: { newTeams: [{ brief: 'a mobile crew' }], summary: 's' },
    });
    const r = await h.call('POST', `/drafts/${d.id}/finish`);
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Accept the plan first/);
  });
});
