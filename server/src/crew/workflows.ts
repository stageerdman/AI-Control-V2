/* The project's stable workflows (updates/2026-11-17 WORKFLOWS): read the list, replace it whole, add or
   replace one, remove one. Validated against the people on the project now (src/domain/workflows.ts); every
   change is saved whole and announced as `workflows.changed`. Goals keep their own snapshot, so nothing here
   touches running work. `resolveWorkflow` turns what a new goal asks for (a stable id or a temporary lead +
   crew) into the workflow it snapshots. */
import type { Store } from '../db/store.ts';
import {
  DEFAULT_WORKFLOW,
  pickWorkflow,
  type ScopedWorkflow,
  type Staffing,
  scoped,
  temporaryWorkflow,
  tidyLayout,
  unknownWorkflowIssue,
  type Workflow,
  type WorkflowAsk,
  WorkflowsSchema,
  withoutReadFields,
  workflowIssues,
  workflowsIssues,
} from '../domain/workflows.ts';
import { conflict, invalid, parse, ruleConflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { workflowRefs } from '../office/workflow-refs.ts';

/** Who is on the project as the rules see it: its teams, specialists and Cast guests. */
export function projectStaffing(store: Store, projectId: string): Staffing {
  const p = store.projects.require(projectId);
  const teams = new Map<string, { name: string; members: readonly string[] }>();
  for (const tid of p.teamIds) {
    const t = store.teams.get(tid);
    if (t) teams.set(t.id, { name: t.name, members: t.members.map((m) => m.agentId) });
  }
  return {
    teams,
    specialists: new Set([...p.agentIds, ...store.guests.ids(projectId)]),
    name: (id) => store.agents.get(id)?.name ?? store.teams.get(id)?.name ?? id,
  };
}

/** A goal's workflow, worked out. `toSeat`: Cast agents in a temporary crew (or its lead) who aren't on the
    project yet — they count as on it for the rules and are seated as guests once the goal is accepted. */
export type ResolvedWorkflow = { workflow: Workflow; issues: string[]; toSeat: string[] };

export function resolveWorkflow(store: Store, projectId: string, ask?: WorkflowAsk): ResolvedWorkflow {
  const list = store.projects.require(projectId).workflows ?? [];
  if (typeof ask !== 'object') {
    const issue = unknownWorkflowIssue(list, ask);
    return { workflow: pickWorkflow(list, ask), issues: issue ? [issue] : [], toSeat: [] };
  }
  const refs = workflowRefs(store, projectId);
  const s = projectStaffing(store, projectId);
  const name = (id: string) => store.agents.get(id)?.name ?? id;
  const workflow = temporaryWorkflow(
    pickWorkflow(list),
    {
      ...ask,
      lead: refs.agentId(ask.lead),
      crew: ask.crew.map(refs.agentId),
      ...(ask.gates
        ? {
            gates: ask.gates.map((g) => ({
              ...g,
              after: refs.afterId(g.after),
              reviewer: refs.agentId(g.reviewer),
            })),
          }
        : {}),
    },
    name,
    (id) => store.agents.get(id)?.nick || name(id),
  );
  const here = new Set([...s.specialists, ...[...s.teams.values()].flatMap((t) => t.members)]);
  const toSeat = [workflow.lead as string, ...(workflow.crew ?? [])].filter(
    (id) => !here.has(id) && store.agents.get(id)?.kind === 'agent',
  );
  const issues = workflowIssues(
    workflow,
    { ...s, specialists: new Set([...s.specialists, ...toSeat]) },
    { temporary: true },
  );
  return { workflow, issues, toSeat };
}

export const officeScoped = (list: readonly Workflow[]): ScopedWorkflow[] => list.map((w) => scoped(w, 'office'));

export function createWorkflows(deps: { store: Store; events: EventLog }) {
  const { store, events } = deps;
  const staffing = (projectId: string) => projectStaffing(store, projectId);

  /** 422 = malformed, 409 = breaks a rule (someone not on the project, a bad arrow); every issue's path is the
      body's (`workflows.0.steps.2.to`). Saves and announces the list. */
  function save(projectId: string, raw: unknown): Workflow[] {
    const sent = Array.isArray(raw) ? raw.map(withoutReadFields) : raw;
    const list = parse(WorkflowsSchema, sent, 'workflows').map(tidyLayout);
    const broken = workflowsIssues(list, staffing(projectId));
    if (broken.length) throw ruleConflict(broken);
    store.projects.update(projectId, { workflows: list });
    events.append('project', projectId, {
      type: 'workflows.changed',
      payload: { count: list.length, names: list.map((w) => w.name) },
    });
    return list;
  }

  const stored = (projectId: string) => store.projects.require(projectId).workflows;

  /** The list the project works by (never designed: the studio default alone). */
  function list(projectId: string): { workflows: Workflow[]; designed: boolean } {
    const saved = stored(projectId);
    return { workflows: saved ?? [DEFAULT_WORKFLOW], designed: !!saved };
  }

  return {
    staffing,
    list,
    /** The list as screens read it: each one says it is the office's. */
    view: (projectId: string): { workflows: ScopedWorkflow[]; designed: boolean } => {
      const { workflows, designed } = list(projectId);
      return { workflows: officeScoped(workflows), designed };
    },
    replace: save,

    /** Add a workflow, or replace the one with its id; `first` makes it the default. */
    put(projectId: string, w: Workflow, opts: { first?: boolean } = {}): Workflow[] {
      /* never designed: the studio default stays the usual way, the new one joins it */
      const list = stored(projectId) ?? [DEFAULT_WORKFLOW];
      const at = list.findIndex((x) => x.id === w.id);
      const rest = at < 0 ? [...list, w] : list.map((x, i) => (i === at ? w : x));
      return save(projectId, opts.first ? [w, ...rest.filter((x) => x !== w)] : rest);
    },

    /** Take one off. The last one stays: a project always has a usual way. */
    remove(projectId: string, id: string): Workflow[] {
      const list = stored(projectId) ?? [];
      if (!list.some((w) => w.id === id))
        throw invalid(`No workflow '${id}' — known: ${list.map((w) => `'${w.id}'`).join(', ') || 'none'}.`);
      if (list.length === 1)
        throw conflict(`'${id}' is the only workflow — change it with set_workflow instead of removing it.`);
      return save(
        projectId,
        list.filter((w) => w.id !== id),
      );
    },
  };
}
export type WorkflowsService = ReturnType<typeof createWorkflows>;
