/* A team's way of working (updates/2026-11-17 WORKFLOWS, v2 S2), edited in the Cast and in team creation.
   The way a team shows and runs by is its own way, else the default derived from its crew and `wayShape`
   (src/domain/team-way.ts) — one source, so the drawing and the run can't disagree. Read it, save an own way
   whole, clear it (null = back to the default). Whenever the shown way changes — an own save or clear, or the
   crew / captain / shape behind the default, or members leaving an own way — each office the team works in
   hears `team.workflow.changed`. */
import type { Store } from '../db/store.ts';
import { defaultTeamWay, type WayShape } from '../domain/team-way.ts';
import {
  type ScopedWorkflow,
  scoped,
  TeamWorkflowSchema,
  teamStaffing,
  tidyLayout,
  type Workflow,
  withoutReadFields,
  workflowIssues,
} from '../domain/workflows.ts';
import { parse, ruleConflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { shortName } from './workflows.ts';

/** `own`: the team drew its own; else `workflow` is the default (null: fewer than 2 members). */
export type TeamWorkflowView = { workflow: ScopedWorkflow | null; own: boolean; shape: WayShape };

/** The way a team runs by: its own, else its default. null: no team, or nothing to hand on. */
export function shownTeamWay(store: Store, teamId: string): Workflow | null {
  const team = store.teams.get(teamId);
  if (!team) return null;
  const crew = { captainId: team.captainId, members: team.members.map((m) => m.agentId) };
  return store.teams.workflow(teamId) ?? defaultTeamWay(crew, team.wayShape);
}

export function createTeamWorkflows({ store, events }: { store: Store; events: EventLog }) {
  const announce = (teamId: string, w: Workflow | null) => {
    for (const projectId of store.teams.require(teamId).projectIds)
      events.append('project', projectId, {
        type: 'team.workflow.changed',
        payload: { teamId, name: w?.name ?? null },
      });
  };

  /** 422 = malformed, 409 = names someone not on the team or breaks an arrow rule (paths `workflow.…`). */
  function check(teamId: string, raw: unknown): Workflow {
    const team = store.teams.require(teamId);
    const w = tidyLayout(parse(TeamWorkflowSchema, withoutReadFields(raw), 'workflow'));
    const name = (id: string) => store.agents.get(id)?.name ?? (id === team.id ? team.name : id);
    const members = team.members.map((m) => m.agentId);
    const issues = workflowIssues(
      w,
      teamStaffing({ ...team, members }, name),
      { temporary: false },
      'workflow',
    );
    if (issues.length) throw ruleConflict(issues);
    return w;
  }

  function get(teamId: string): TeamWorkflowView {
    const team = store.teams.require(teamId);
    const w = shownTeamWay(store, teamId);
    return {
      workflow: w ? scoped(w, 'team', shortName(store), teamId) : null,
      own: store.teams.workflow(teamId) !== null,
      shape: team.wayShape,
    };
  }

  const snapshot = () =>
    new Map(store.teams.list().map((t) => [t.id, JSON.stringify(shownTeamWay(store, t.id))]));

  return {
    get,

    /** Save an own way whole, or clear it with null (back to the default) → as it now reads. */
    save(teamId: string, raw: unknown): TeamWorkflowView {
      const w = raw === null ? null : check(teamId, raw);
      store.teams.setWorkflow(teamId, w);
      announce(teamId, w);
      return get(teamId);
    },

    /** Run a change to teams (roster, captain, shape, a deleted agent…) and announce every team whose shown
        way it changed. */
    watch<T>(change: () => T): T {
      const before = snapshot();
      const out = change();
      for (const [teamId, now] of snapshot())
        if (before.has(teamId) && before.get(teamId) !== now) announce(teamId, shownTeamWay(store, teamId));
      return out;
    },
  };
}
export type TeamWorkflows = ReturnType<typeof createTeamWorkflows>;
