/* A team's own workflow (updates/2026-11-17 WORKFLOWS), drawn in the Cast: read, save whole, clear. Only the
   team's members stand on it; its sign-off arrows check that team's work on every project it joins
   (`gatesOf` in src/crew/dispatch.ts reads `store.teams.workflow`). */
import type { Store } from '../db/store.ts';
import { gatesFromGraph, graphIssues, under } from '../domain/graph.ts';
import { type Gate, type TeamWorkflow, TeamWorkflowSchema, teamGraphRules } from '../domain/workflows.ts';
import { invalid, parse } from '../errors.ts';

/** As the Cast shows it: the drawing plus the checks it implies. */
export type TeamWorkflowView = { workflow: (TeamWorkflow & { gates: Gate[] }) | null };

const view = (w: TeamWorkflow | null): TeamWorkflowView => ({
  workflow: w ? { ...w, gates: gatesFromGraph(w.graph) } : null,
});

export function createTeamWorkflows(store: Store) {
  return {
    get: (teamId: string): TeamWorkflowView => view(store.teams.workflow(teamId)),

    /** 422 with every problem by path (`graph.edges.2.to`). */
    save(teamId: string, raw: unknown): TeamWorkflowView {
      const w = parse(TeamWorkflowSchema, raw);
      const members = store.teams.require(teamId).members.map((m) => m.agentId);
      const issues = under('graph', graphIssues(w.graph, teamGraphRules(members)));
      if (issues.length) throw invalid(`The drawing has ${issues.length} problem(s): ${issues[0]?.message}`, issues);
      store.teams.setWorkflow(teamId, w);
      return view(w);
    },

    clear(teamId: string): TeamWorkflowView {
      store.teams.setWorkflow(teamId, null);
      return view(null);
    },
  };
}
