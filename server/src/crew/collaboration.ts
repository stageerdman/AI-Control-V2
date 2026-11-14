/* The project's collaboration design (B8): read it, set it by hand, or let the orchestrator (re)design it
   for the people on the project now. Validated against the project's staffing (src/domain/collaboration.ts);
   every change is announced as `collaboration.changed`.

   Contract `collaboration`: {"reply": string, "collaboration": Collaboration}. */
import { z } from 'zod';
import type { Store } from '../db/store.ts';
import {
  type Collaboration,
  CollaborationSchema,
  collaborationIssues,
  DEFAULT_MAX_SEND_BACKS,
  type Staffing,
} from '../domain/collaboration.ts';
import { conflict, parse } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import {
  COLLABORATION_EXAMPLE,
  COLLABORATION_RULE,
  crewSystemPrompt,
  json,
  ORCHESTRATOR_ALTITUDE,
} from './prompts.ts';
import { type Crew, validateWith } from './structured.ts';

export const COLLABORATION = 'collaboration';
const DesignSchema = z.strictObject({
  reply: z.string().trim().min(1).max(2000),
  collaboration: CollaborationSchema,
});

/** No design yet: the orchestrator briefs captains, no review gates. */
export const DEFAULT_COLLABORATION: Collaboration = {
  orchestratorTalksTo: 'captains',
  gates: [],
  maxSendBacks: DEFAULT_MAX_SEND_BACKS,
  summary: 'The orchestrator briefs team captains; no review gates yet.',
};

export function createCollaboration(deps: {
  store: Store;
  events: EventLog;
  crew: Crew;
  /** The orchestrator's reply after a (re)design: the office thread records it. */
  onDesigned?: (e: { projectId: string; orchestratorId: string; reply: string; ask?: string }) => void;
}) {
  const { store, events, crew } = deps;
  const busy = new Set<string>();

  function staffing(projectId: string): Staffing {
    const p = store.projects.require(projectId);
    const teams = new Map<string, { name: string; members: readonly string[] }>();
    for (const tid of p.teamIds) {
      const t = store.teams.get(tid);
      if (t) teams.set(t.id, { name: t.name, members: t.members.map((m) => m.agentId) });
    }
    return {
      teams,
      specialists: new Set(p.agentIds),
      name: (id) => store.agents.get(id)?.name ?? store.teams.get(id)?.name ?? id,
    };
  }
  const issues = (projectId: string, c: Collaboration) => collaborationIssues(c, staffing(projectId));

  function save(projectId: string, c: Collaboration): Collaboration {
    store.tx(() => store.projects.update(projectId, { collaboration: c }));
    events.append('project', projectId, {
      type: 'collaboration.changed',
      payload: { orchestratorTalksTo: c.orchestratorTalksTo, gates: c.gates.length, summary: c.summary },
    });
    return c;
  }

  return {
    staffing,
    get(projectId: string): { collaboration: Collaboration; designed: boolean } {
      const p = store.projects.require(projectId);
      return { collaboration: p.collaboration ?? DEFAULT_COLLABORATION, designed: !!p.collaboration };
    },

    /** Set by hand (the UI): 422 = malformed, 409 = a gate names someone not on the project. */
    set(projectId: string, raw: unknown): Collaboration {
      store.projects.require(projectId);
      const c = parse(CollaborationSchema, raw);
      const broken = issues(projectId, c);
      if (broken.length)
        throw conflict(
          broken[0] as string,
          broken.map((message) => ({ path: 'collaboration', message })),
        );
      return save(projectId, c);
    },

    /** The orchestrator designs (or reworks, following `ask`) the collaboration for the people on the project now. */
    async design(projectId: string, ask?: string): Promise<{ reply: string; collaboration: Collaboration }> {
      const p = store.projects.require(projectId);
      const s = staffing(projectId);
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
            `Current design: ${json(p.collaboration ?? null)}`,
            ask?.trim()
              ? `The user asks: ${json(ask.trim())}`
              : 'Design how these people work together on this project.',
            COLLABORATION_RULE.replace(/ For agents the Agent Creator[^.]*\./, ''),
            `Answer with one JSON object shaped like this: ${json({
              reply: 'One or two friendly sentences for the user: who checks whose work, and why.',
              collaboration: COLLABORATION_EXAMPLE,
            })}`,
          ].join('\n\n'),
          validate: validateWith(DesignSchema, (d) => issues(projectId, d.collaboration)),
        });
        const saved = save(projectId, value.collaboration);
        deps.onDesigned?.({
          projectId,
          orchestratorId: orch.id,
          reply: value.reply,
          ...(ask?.trim() ? { ask: ask.trim() } : {}),
        });
        return { reply: value.reply, collaboration: saved };
      } finally {
        busy.delete(projectId);
      }
    },
  };
}
export type CollaborationService = ReturnType<typeof createCollaboration>;
