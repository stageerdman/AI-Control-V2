/* The setup plan (v6 N2–N4): who staffs a project. Pure — shape (zod) + studio rules.

   - Teams first: whole existing teams carry the work; their captains come with them
     (the plan has no captain field at all — strict objects reject one).
   - Individuals (specialists / new agents) are the orchestrator's call (user, 2026-11-13: "Orchestrator
     decides freely") — guided by its prompt, not capped here. Each one carries a `why` or a brief.
   - Hard rules are data integrity only: ids exist, no duplicates, no studio crew as specialists, no
     specialist who already comes with a planned team (redundant), at least someone staffed.
   - Anything the Cast lacks is a brief for the Agent Creator (`newAgents` / `newTeams`);
     accepting the plan mints them and rewrites the plan to real ids. */
import { z } from 'zod';
import { conflict, invalid } from '../errors.ts';

/** Payload-size sanity bound per list — not a staffing rule. */
export const PLAN_LIST_MAX = 20;

const id = z.string().trim().min(1).max(80);
const why = z.string().trim().min(1).max(500);
const brief = z.string().trim().min(1).max(1000);

export const PlanSchema = z.strictObject({
  teams: z
    .array(z.strictObject({ teamId: id, why }))
    .max(PLAN_LIST_MAX)
    .default([]),
  specialists: z
    .array(z.strictObject({ agentId: id, why }))
    .max(PLAN_LIST_MAX)
    .default([]),
  newAgents: z.array(z.strictObject({ brief })).max(PLAN_LIST_MAX).default([]),
  newTeams: z.array(z.strictObject({ brief })).max(PLAN_LIST_MAX).default([]),
  summary: z.string().trim().min(1).max(1000),
});
export type Plan = z.output<typeof PlanSchema>;

/** What the rules need to know about the Cast. */
export type CastView = {
  team(id: string): { name: string; members: readonly string[] } | null;
  agent(id: string): { name: string; kind: string } | null;
};
export type PlanIssue = { path: string; message: string; kind: 'unknown' | 'rule' };

export function planIssues(plan: Plan, cast: CastView): PlanIssue[] {
  const out: PlanIssue[] = [];
  const unknown = (path: string, message: string): void => {
    out.push({ path, message, kind: 'unknown' });
  };
  const rule = (path: string, message: string): void => {
    out.push({ path, message, kind: 'rule' });
  };

  const teamIds = plan.teams.map((t) => t.teamId);
  const crewInTeams = new Map<string, string>();
  for (const [i, t] of plan.teams.entries()) {
    const team = cast.team(t.teamId);
    if (!team) unknown(`teams.${i}.teamId`, `No team '${t.teamId}' in the Cast`);
    else if (teamIds.indexOf(t.teamId) !== i) rule(`teams.${i}.teamId`, `${team.name} is listed twice`);
    else for (const m of team.members) if (!crewInTeams.has(m)) crewInTeams.set(m, team.name);
  }
  const agentIds = plan.specialists.map((s) => s.agentId);
  for (const [i, s] of plan.specialists.entries()) {
    const path = `specialists.${i}.agentId`;
    const a = cast.agent(s.agentId);
    const team = crewInTeams.get(s.agentId);
    if (!a) unknown(path, `No agent '${s.agentId}' in the Cast`);
    else if (agentIds.indexOf(s.agentId) !== i) rule(path, `${a.name} is listed twice`);
    else if (a.kind !== 'agent') rule(path, `${a.name} is studio crew, not a specialist`);
    else if (team) rule(path, `${a.name} already comes with ${team} — teams stay whole; drop the specialist`);
  }

  const staffed = plan.teams.length + plan.newTeams.length + plan.specialists.length + plan.newAgents.length;
  if (staffed === 0) rule('', 'The plan staffs nobody — propose at least one team');
  return out;
}

/** Throw the first problem as the API error: unknown id → 422, broken rule → 409; all issues in details. */
export function assertPlan(plan: Plan, cast: CastView): void {
  const issues = planIssues(plan, cast);
  const first = issues[0];
  if (!first) return;
  const details = issues.map(({ path, message }) => ({ path, message }));
  throw first.kind === 'unknown' ? invalid(first.message, details) : conflict(first.message, details);
}

/** Briefs still waiting for the Agent Creator (finish refuses until the plan is accepted). */
export const pendingBriefs = (plan: Plan) => plan.newAgents.length + plan.newTeams.length;

/** The project's staffing once every brief is minted. */
export const staffingOf = (plan: Plan) => ({
  teamIds: plan.teams.map((t) => t.teamId),
  agentIds: plan.specialists.map((s) => s.agentId),
});
