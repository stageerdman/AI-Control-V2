import { describe, expect, it } from 'vitest';
import {
  type Collaboration,
  CollaborationSchema,
  collaborationIssues,
  gatesFor,
  parseVerdict,
  resolvePlaceholders,
  type Staffing,
} from '../../src/domain/collaboration.ts';
import { PlanSchema, planIssues } from '../../src/domain/plan.ts';
import { branchLabels } from '../../src/domain/workflows.ts';

const staffing: Staffing = {
  teams: new Map([
    ['ship-it', { name: 'Ship-It', members: ['a-semic', 'a-pete'] }],
    ['polish', { name: 'Polish', members: ['a-lint'] }],
  ]),
  specialists: new Set(['a-prof']),
  name: (id) => id.toUpperCase(),
};
const collab = (gates: Collaboration['gates'], more: Partial<Collaboration> = {}): Collaboration =>
  CollaborationSchema.parse({ gates, summary: 'How we work.', ...more });
const gate = (after: string, reviewer: string, kind = 'quality') =>
  ({ after, reviewer, kind, why: 'w' }) as never;

describe('collaboration design (pure)', () => {
  it('defaults: captains, no gates, two send-backs', () => {
    expect(CollaborationSchema.parse({ summary: 's' })).toEqual({
      orchestratorTalksTo: 'captains',
      gates: [],
      maxSendBacks: 2,
      summary: 's',
    });
    expect(CollaborationSchema.safeParse({ summary: 's', maxSendBacks: 9 }).success).toBe(false);
    expect(CollaborationSchema.safeParse({ summary: 's', gates: [gate('*', 'a', 'poke')] }).success).toBe(
      false,
    );
  });

  it('gates must name people on the project; no self-review, no duplicates', () => {
    expect(
      collaborationIssues(collab([gate('*', 'a-lint'), gate('ship-it', 'a-prof', 'user-test')]), staffing),
    ).toEqual([]);
    expect(
      collaborationIssues(
        collab([
          gate('ghost', 'a-lint'),
          gate('*', 'nobody'),
          gate('a-lint', 'a-lint'),
          gate('*', 'a-lint'),
          gate('*', 'a-lint'),
        ]),
        staffing,
      ),
    ).toEqual([
      expect.stringContaining("collaboration.gates.0.after: 'ghost' is not a team or agent"),
      expect.stringContaining("collaboration.gates.1.reviewer: 'nobody' is not on this project"),
      "collaboration.gates.2: A-LINT can't review their own work",
      'collaboration.gates.4: the same gate is listed twice',
    ]);
  });

  it('placeholders for briefs: valid within the counts, resolved on accept', () => {
    const c = collab([gate('new-team:0', 'new-agent:0'), gate('*', 'new-agent:3')]);
    const issues = collaborationIssues(c, { ...staffing, newAgents: 1, newTeams: 1 });
    expect(issues).toEqual([expect.stringContaining("'new-agent:3' is not on this project")]);
    expect(resolvePlaceholders(c, { agents: ['a-nova'], teams: ['night-shift'] }).gates[0]).toMatchObject({
      after: 'night-shift',
      reviewer: 'a-nova',
    });
  });

  it('gatesFor: by team, by agent or "*", in order, never the builder themself, once per reviewer+kind', () => {
    const c = collab([
      gate('ship-it', 'a-lint'),
      gate('*', 'a-prof', 'user-test'),
      gate('a-semic', 'a-lint'),
      gate('*', 'a-semic', 'crash-test'),
    ]);
    expect(gatesFor(c, { agentId: 'a-semic', teamId: 'ship-it' }).map((g) => [g.reviewer, g.kind])).toEqual([
      ['a-lint', 'quality'],
      ['a-prof', 'user-test'],
    ]);
    expect(gatesFor(c, { agentId: 'a-prof', teamId: null }).map((g) => g.reviewer)).toEqual(['a-semic']);
    expect(gatesFor(null, { agentId: 'a-semic', teamId: 'ship-it' })).toEqual([]);
  });

  it('gatesFor: who signs last (the drawing’s `final`) comes last, the rest keep their order', () => {
    const c = collab([gate('*', 'a-lint'), gate('*', 'a-prof', 'user-test'), gate('*', 'a-nova')]);
    const order = gatesFor({ ...c, final: 'a-lint' }, { agentId: 'a-semic', teamId: null }).map(
      (g) => g.reviewer,
    );
    expect(order).toEqual(['a-prof', 'a-nova', 'a-lint']);
  });

  it('gatesFor: a branched gate (`when`) holds only on items that name it; no branches named = it holds', () => {
    const branched = (after: string, when: string) =>
      ({ ...(gate(after, 'a-scar', 'crash-test') as object), when }) as never;
    const pay = branched('a-semic', 'if it touches payments');
    const c = collab([pay, gate('*', 'a-lint')]);
    const semic = { agentId: 'a-semic', teamId: 'ship-it' };
    const who = (branches?: string[]) => gatesFor(c, { ...semic, branches }).map((g) => g.reviewer);
    expect(who([])).toEqual(['a-lint']); // "Set up the project stack": no payments, no crash-test
    expect(who([' If it touches PAYMENTS '])).toEqual(['a-scar', 'a-lint']); // copied by hand: loose match
    expect(who(['if it touches the UI'])).toEqual(['a-lint']);
    expect(who(undefined)).toEqual(['a-scar', 'a-lint']); // the planner said nothing: today's safe default
    expect(branchLabels(collab([pay, branched('*', 'If it touches payments')]))).toEqual([
      'if it touches payments',
    ]);
  });

  it('parseVerdict: the last JSON verdict line, a plain word, or changes when unclear', () => {
    expect(parseVerdict('All good.\n{"verdict": "approve", "notes": "Nice."}')).toEqual({
      verdict: 'approve',
      notes: 'Nice.',
    });
    expect(
      parseVerdict(
        '{"verdict":"approve","notes":"x"} then I looked again\n{"verdict":"changes","notes":"Fix the test."}',
      ),
    ).toEqual({ verdict: 'changes', notes: 'Fix the test.' });
    expect(parseVerdict('APPROVED — ship it.').verdict).toBe('approve');
    expect(parseVerdict('Hmm, the button is broken.')).toEqual({
      verdict: 'changes',
      notes: 'Hmm, the button is broken.',
    });
    expect(parseVerdict('').notes).toBe('The review ended without a clear verdict.');
  });

  it('the setup plan carries a validated collaboration', () => {
    const cast = {
      team: (id: string) => (id === 'ship-it' ? { name: 'Ship-It', members: ['a-semic', 'a-pete'] } : null),
      agent: (id: string) => ({ name: id, kind: 'agent' }),
    };
    const plan = PlanSchema.parse({
      teams: [{ teamId: 'ship-it', why: 'w' }],
      specialists: [{ agentId: 'a-lint', why: 'w' }],
      summary: 's',
      collaboration: { gates: [gate('ship-it', 'a-lint'), gate('*', 'a-zed')], summary: 'c' },
    });
    expect(planIssues(plan, cast)).toEqual([
      {
        path: 'collaboration',
        kind: 'rule',
        message: expect.stringContaining("'a-zed' is not on this project"),
      },
    ]);
  });
});
