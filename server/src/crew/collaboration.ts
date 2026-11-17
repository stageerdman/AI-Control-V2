/* The project's collaboration design (B8), grown into workflows: B8's single design is the FIRST workflow
   (GET/PUT …/collaboration read and write it), and the orchestrator's (re)design now writes the whole list
   for the people on the project now. Storage and rules live in the workflows service (src/crew/workflows.ts);
   a change to the first one is also announced as `collaboration.changed`.

   Contract `collaboration`: {"reply": string, "workflows": Workflow[]}. */
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import {
  type Collaboration,
  CollaborationSchema,
  DEFAULT_COLLABORATION,
  DEFAULT_WORKFLOW,
  toCollaboration,
  type Workflow,
  WorkflowsSchema,
  workflowsIssues,
} from '../domain/workflows.ts';
import { conflict, parse } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import {
  crewSystemPrompt,
  json,
  ORCHESTRATOR_ALTITUDE,
  WORKFLOWS_EXAMPLE,
  WORKFLOWS_RULE,
} from './prompts.ts';
import { type Crew, validateWith } from './structured.ts';
import type { WorkflowsService } from './workflows.ts';

export const COLLABORATION = 'collaboration';
const DesignSchema = z.strictObject({
  reply: z.string().trim().min(1).max(2000),
  workflows: WorkflowsSchema,
});

export function createCollaboration(deps: {
  store: Store;
  events: EventLog;
  crew: Crew;
  workflows: WorkflowsService;
  /** The orchestrator's reply after a (re)design: the office thread records it. */
  onDesigned?: (e: { projectId: string; orchestratorId: string; reply: string; ask?: string }) => void;
}) {
  const { store, events, crew, workflows } = deps;
  const busy = new Set<string>();

  /** Save the list; the first one is B8's design, so it is announced as that too. */
  function save(projectId: string, list: Workflow[]): Workflow[] {
    const saved = workflows.replace(projectId, list);
    const c = toCollaboration(saved[0] as Workflow);
    events.append('project', projectId, {
      type: 'collaboration.changed',
      payload: { orchestratorTalksTo: c.orchestratorTalksTo, gates: c.gates.length, summary: c.summary },
    });
    return saved;
  }

  return {
    get(projectId: string): { collaboration: Collaboration; designed: boolean } {
      const first = store.projects.require(projectId).workflows?.[0];
      return { collaboration: first ? toCollaboration(first) : DEFAULT_COLLABORATION, designed: !!first };
    },

    /** Set by hand (the UI): the first workflow's checks; its name and scenario stay. 422 / 409 as the list's. */
    set(projectId: string, raw: unknown): Collaboration {
      const c = parse(CollaborationSchema, raw);
      const [first, ...rest] = store.projects.require(projectId).workflows ?? [];
      save(projectId, [{ ...(first ?? DEFAULT_WORKFLOW), ...c }, ...rest]);
      return c;
    },

    /** The orchestrator designs (or reworks, following `ask`) the workflows for the people on the project now. */
    async design(
      projectId: string,
      ask?: string,
    ): Promise<{ reply: string; collaboration: Collaboration; workflows: Workflow[] }> {
      const p = store.projects.require(projectId);
      const s = workflows.staffing(projectId);
      if (s.teams.size + s.specialists.size === 0)
        throw conflict('Nobody staffs this project yet — add a team or a specialist first');
      if (busy.has(projectId)) throw conflict('The orchestrator is already designing how this team works');
      const orch = store.agents.require(p.orchestratorId);
      const who = (id: string) => {
        const a = store.agents.get(id);
        return { id, name: a?.name ?? id, role: a?.role ?? '' };
      };
      const people = {
        teams: [...s.teams.entries()].map(([id, t]) => ({
          teamId: id,
          name: t.name,
          captain: store.teams.get(id)?.captainId ?? null,
          members: t.members.map(who),
        })),
        specialists: [...s.specialists].map(who),
      };
      busy.add(projectId);
      try {
        const { value } = await crew.call({
          who: orch.name,
          contract: COLLABORATION,
          track: { scope: 'project', ownerId: projectId, agentId: orch.id, kind: 'thinking' },
          systemPrompt: crewSystemPrompt(orch, ORCHESTRATOR_ALTITUDE),
          task: [
            `Project: ${json({ name: p.name, about: p.note })}`,
            `Who works on it: ${json(people)}`,
            `Current workflows: ${json(p.workflows)}`,
            ask?.trim()
              ? `The user asks: ${json(ask.trim())}`
              : 'Design how these people work together on this project.',
            WORKFLOWS_RULE,
            `Answer with one JSON object shaped like this: ${json({
              reply: 'One or two friendly sentences for the user: who checks whose work, and why.',
              workflows: WORKFLOWS_EXAMPLE,
            })}`,
          ].join('\n\n'),
          validate: validateWith(DesignSchema, (d) => workflowsIssues(d.workflows, s)),
        });
        const saved = save(projectId, value.workflows);
        deps.onDesigned?.({
          projectId,
          orchestratorId: orch.id,
          reply: value.reply,
          ...(ask?.trim() ? { ask: ask.trim() } : {}),
        });
        return { reply: value.reply, collaboration: toCollaboration(saved[0] as Workflow), workflows: saved };
      } finally {
        busy.delete(projectId);
      }
    },
  };
}
export type CollaborationService = ReturnType<typeof createCollaboration>;
