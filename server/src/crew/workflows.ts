/* The project's stable workflows (updates/2026-11-17 WORKFLOWS): read the list, replace it whole, add or
   replace one, remove one. Validated against the people on the project now (src/domain/workflows.ts); every
   change is saved whole and announced as `workflows.changed`. Goals keep their own snapshot, so nothing here
   touches running work. */
import type { Store } from '../db/store.ts';
import {
  DEFAULT_WORKFLOW,
  type Staffing,
  type Workflow,
  WorkflowsSchema,
  workflowsIssues,
} from '../domain/workflows.ts';
import { conflict, invalid, parse } from '../errors.ts';
import type { EventLog } from '../events/log.ts';

export function createWorkflows(deps: { store: Store; events: EventLog }) {
  const { store, events } = deps;

  /** Who is on the project as the rules see it: its teams, specialists and Cast guests. */
  function staffing(projectId: string): Staffing {
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

  /** 422 = malformed, 409 = a gate names someone not on the project. Saves and announces the list. */
  function save(projectId: string, raw: unknown): Workflow[] {
    const list = parse(WorkflowsSchema, raw);
    const broken = workflowsIssues(list, staffing(projectId));
    if (broken.length)
      throw conflict(
        broken[0] as string,
        broken.map((message) => ({ path: 'workflows', message })),
      );
    store.projects.update(projectId, { workflows: list });
    events.append('project', projectId, {
      type: 'workflows.changed',
      payload: { count: list.length, names: list.map((w) => w.name) },
    });
    return list;
  }

  const stored = (projectId: string) => store.projects.require(projectId).workflows;

  return {
    staffing,
    /** The list the project works by (never designed: the studio default alone). */
    list(projectId: string): { workflows: Workflow[]; designed: boolean } {
      const list = stored(projectId);
      return { workflows: list ?? [DEFAULT_WORKFLOW], designed: !!list };
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
