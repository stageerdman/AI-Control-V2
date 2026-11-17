import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORKFLOW,
  effectiveGates,
  fromCollaboration,
  gatesFor,
  LEAD_SIGNOFF_WHY,
  pickWorkflow,
  resolvePlaceholders,
  type Staffing,
  type Workflow,
  WorkflowSchema,
  WorkflowsSchema,
  workflowIssues,
  workflowsIssues,
  workflowTag,
} from '../../src/domain/workflows.ts';

const staffing: Staffing = {
  teams: new Map([['ship-it', { name: 'Ship-It', members: ['a-semic', 'a-pete'] }]]),
  specialists: new Set(['a-prof', 'a-guest']),
  name: (id) => id.toUpperCase(),
};
const wf = (more: Partial<Workflow> = {}): Workflow =>
  WorkflowSchema.parse({ id: 'feature-build', name: 'Feature build', summary: 's', ...more });
const temp = (more: Partial<Workflow> = {}) => wf({ id: 'temp', lead: 'a-prof', crew: ['a-semic'], ...more });

describe('workflows (pure)', () => {
  it('schema: defaults, and refuses bad ids, a crew of 5, 7 workflows, duplicate ids', () => {
    expect(wf()).toMatchObject({
      when: 'everything',
      orchestratorTalksTo: 'captains',
      gates: [],
      maxSendBacks: 2,
    });
    expect(WorkflowSchema.safeParse({ id: 'Bad Id', name: 'n', summary: 's' }).success).toBe(false);
    expect(
      WorkflowSchema.safeParse({ id: 'x', name: 'n', summary: 's', crew: ['a', 'b', 'c', 'd', 'e'] }).success,
    ).toBe(false);
    expect(WorkflowSchema.safeParse({ id: 'x', name: 'n', summary: 's', crew: ['a', 'a'] }).success).toBe(
      false,
    );
    const many = Array.from({ length: 7 }, (_, i) => wf({ id: `w${i}` }));
    expect(WorkflowsSchema.safeParse(many).success).toBe(false);
    expect(WorkflowsSchema.safeParse([wf(), wf()]).success).toBe(false);
    expect(WorkflowsSchema.safeParse([]).success).toBe(false);
    expect(WorkflowsSchema.safeParse([wf(), wf({ id: 'quick-fix' })]).success).toBe(true);
  });

  it('workflowTag: lead + crew only on a temporary workflow (the office ring needs both)', () => {
    expect(workflowTag(wf())).toEqual({ id: 'feature-build', name: 'Feature build', temporary: false });
    expect(workflowTag(temp())).toEqual({
      id: 'temp',
      name: 'Feature build',
      temporary: true,
      lead: 'a-prof',
      crew: ['a-semic'],
    });
  });

  it('workflowIssues: stable has no command; temporary needs lead + crew on the project, lead not in crew', () => {
    expect(workflowIssues(wf(), staffing, { temporary: false })).toEqual([]);
    expect(workflowIssues(temp(), staffing, { temporary: false })).toEqual([
      expect.stringContaining('a stable workflow names checks, not command'),
    ]);
    expect(workflowIssues(wf({ lead: 'a-prof' }), staffing, { temporary: true })).toEqual([
      expect.stringContaining('needs a crew'),
    ]);
    expect(workflowIssues(temp({ crew: ['a-prof', 'a-pete'] }), staffing, { temporary: true })).toEqual([
      'workflow.crew.0: A-PROF leads — the lead is not in their own crew',
    ]);
    expect(workflowIssues(temp({ crew: ['a-ghost'] }), staffing, { temporary: true })).toEqual([
      "workflow.crew.0: 'a-ghost' is not on this project",
    ]);
    expect(workflowIssues(temp({ crew: ['a-guest'] }), staffing, { temporary: true })).toEqual([]);
  });

  it('workflowsIssues: each valid, ids unique', () => {
    const bad = wf({ id: 'bad', gates: [{ after: '*', reviewer: 'nobody', kind: 'quality', why: 'w' }] });
    expect(workflowsIssues([wf(), wf(), bad], staffing)).toEqual([
      expect.stringContaining("workflows.2.gates.0.reviewer: 'nobody'"),
      "workflows.1.id: 'feature-build' is used twice",
    ]);
  });

  it('effectiveGates: the lead signs off each crew member, never twice', () => {
    const own = { after: 'a-semic', reviewer: 'a-prof', kind: 'review' as const, why: 'mine' };
    const t = temp({ crew: ['a-semic', 'a-pete'], gates: [own] });
    expect(effectiveGates(t)).toEqual([
      own,
      { after: 'a-pete', reviewer: 'a-prof', kind: 'review', why: LEAD_SIGNOFF_WHY },
    ]);
    expect(effectiveGates(wf())).toEqual([]);
    expect(gatesFor(t, { agentId: 'a-pete', teamId: null }).map((g) => g.reviewer)).toEqual(['a-prof']);
  });

  it('pickWorkflow: that id, else the first, else the studio default', () => {
    const list = [wf(), wf({ id: 'quick-fix' })];
    expect(pickWorkflow(list, 'quick-fix').id).toBe('quick-fix');
    expect(pickWorkflow(list, 'nope').id).toBe('feature-build');
    expect(pickWorkflow(list).id).toBe('feature-build');
    expect(pickWorkflow([])).toBe(DEFAULT_WORKFLOW);
  });

  it('fromCollaboration + resolvePlaceholders also rewrite lead and crew', () => {
    expect(
      fromCollaboration({ orchestratorTalksTo: 'captains', gates: [], maxSendBacks: 1, summary: 's' }),
    ).toMatchObject({
      id: 'usual',
      name: 'Our usual way',
      when: 'everything',
      maxSendBacks: 1,
    });
    const r = resolvePlaceholders(temp({ lead: 'new-agent:0', crew: ['new-agent:1'] }), {
      agents: ['a-nova', 'a-zed'],
      teams: [],
    });
    expect([r.lead, r.crew]).toEqual(['a-nova', ['a-zed']]);
  });
});
