/* A team's own workflow (updates/2026-11-17 WORKFLOWS, Phase 5b), edited in the Cast: read it, save it whole,
   clear it (null). Checked against the team's members only — no lead or crew. Stored and shown; dispatch
   starts using it in Phase 6. Every save tells each office the team works in (`team.workflow.changed`). */
import type { Store } from '../db/store.ts';
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

export type TeamWorkflowView = { workflow: ScopedWorkflow | null };

export function createTeamWorkflows({ store, events }: { store: Store; events: EventLog }) {
  const view = (teamId: string, w: Workflow | null): TeamWorkflowView => ({
    workflow: w ? scoped(w, 'team', teamId) : null,
  });

  /** 422 = malformed, 409 = names someone not on the team or breaks an arrow rule (paths `workflow.…`). */
  function check(teamId: string, raw: unknown): Workflow {
    const team = store.teams.require(teamId);
    const w = tidyLayout(parse(TeamWorkflowSchema, withoutReadFields(raw), 'workflow'));
    const name = (id: string) => store.agents.get(id)?.name ?? (id === team.id ? team.name : id);
    const members = team.members.map((m) => m.agentId);
    const issues = workflowIssues(w, teamStaffing({ ...team, members }, name), { temporary: false }, 'workflow');
    if (issues.length) throw ruleConflict(issues);
    return w;
  }

  return {
    get: (teamId: string): TeamWorkflowView => view(teamId, store.teams.workflow(teamId)),

    /** Save it whole, or clear it with null → as it now reads. */
    save(teamId: string, raw: unknown): TeamWorkflowView {
      const w = raw === null ? null : check(teamId, raw);
      store.teams.setWorkflow(teamId, w);
      for (const projectId of store.teams.require(teamId).projectIds)
        events.append('project', projectId, {
          type: 'team.workflow.changed',
          payload: { teamId, name: w?.name ?? null },
        });
      return view(teamId, w);
    },
  };
}
export type TeamWorkflows = ReturnType<typeof createTeamWorkflows>;
