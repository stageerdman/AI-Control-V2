/* The setup chat (v6 N2): the user talks with the draft's orchestrator about who should
   staff the project; every orchestrator turn returns a reply AND the whole updated plan.

   Contract `setup-chat`: {"reply": string, "plan": Plan} — the plan validated by
   src/domain/plan.ts (shape + teams-first rules + real ids). A turn is atomic: on any
   failure nothing is saved, so the UI keeps the user's message and can retry. */
import { z } from 'zod';
import { castView } from '../db/drafts.ts';
import type { Store } from '../db/store.ts';
import { type Plan, PlanSchema, planIssues, staffingOf } from '../domain/plan.ts';
import { conflict } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { castCatalogue, crewSystemPrompt, json, ORCHESTRATOR_ALTITUDE } from './prompts.ts';
import { type Crew, validateWith } from './structured.ts';

export const SETUP_CHAT = 'setup-chat';
const HISTORY = 20;

export const SetupReplySchema = z.strictObject({
  reply: z.string().trim().min(1).max(2000),
  plan: PlanSchema,
});

const RULES = [
  'Propose WHOLE existing teams first (one or more). A team comes with its own members and its own captain.',
  'Never choose or change a captain of an existing team — captains come from the team’s own design. The plan has no captain field.',
  'Individual specialists are the exception: only when a team lacks a skill, or for a very small project (at most 2 people and no team). Each one needs a "why". At most 3 next to teams.',
  'Do not list a specialist who already comes with a planned team — teams stay whole.',
  'If no team or agent in the Cast fits, add a brief to "newTeams" or "newAgents" — the Agent Creator designs it when the user accepts the plan. The brief says what it must be good at.',
  'Use only ids that appear in the Cast. Keep the user’s earlier choices unless they ask to change them.',
];

const CONTRACT_EXAMPLE = {
  reply: 'One or two friendly sentences for the user: what you propose or changed, and why.',
  plan: {
    teams: [{ teamId: '<team id from the Cast>', why: 'why this team' }],
    specialists: [{ agentId: '<agent id from the Cast>', why: 'why this person, outside the teams' }],
    newAgents: [{ brief: 'what the new specialist must be good at' }],
    newTeams: [{ brief: 'what the new team must do' }],
    summary: 'The plan in one sentence.',
  },
};

export function createSetupChat(deps: { store: Store; events: EventLog; crew: Crew }) {
  const { store, events, crew } = deps;
  const busy = new Set<string>();
  const cast = () => castView(store.agents, store.teams);

  return {
    history(draftId: string) {
      const d = store.drafts.require(draftId);
      return { chat: d.chat, plan: d.plan };
    },

    /** One orchestrator turn. No `text` → the orchestrator opens with its proposal. */
    async say(draftId: string, text?: string) {
      const draft = store.drafts.require(draftId);
      if (!draft.orchestratorId) throw conflict('Pick an orchestrator for this draft first');
      const orch = store.agents.require(draft.orchestratorId);
      if (busy.has(draftId)) throw conflict(`${orch.name} is still thinking about your last message`);
      busy.add(draftId);
      const say = (e: Parameters<EventLog['append']>[2]) => events.append('draft', draftId, e);
      try {
        say({
          type: 'agent.status',
          payload: {
            agentId: orch.id,
            status: 'working',
            activity: { kind: 'thinking', label: 'Thinking about the team' },
          },
        });
        const task = [
          `Project being set up: ${json({ name: draft.name, mode: draft.mode, about: draft.about })}`,
          `The Cast: ${json(castCatalogue(store))}`,
          `Current plan: ${draft.plan ? json(draft.plan) : 'none yet'}`,
          `Conversation so far: ${json(draft.chat.slice(-HISTORY))}`,
          text?.trim()
            ? `The user now says: ${json(text.trim())}`
            : 'The user has not said anything yet: open the conversation with your proposal.',
          `Rules for the plan:\n${RULES.map((r) => `- ${r}`).join('\n')}`,
          `Answer with one JSON object shaped like this (arrays may be empty): ${json(CONTRACT_EXAMPLE)}`,
        ].join('\n\n');
        const { value } = await crew.call({
          who: orch.name,
          contract: SETUP_CHAT,
          systemPrompt: crewSystemPrompt(orch, ORCHESTRATOR_ALTITUDE),
          task,
          validate: validateWith(SetupReplySchema, (r) => planIssues(r.plan, cast()).map((i) => i.message)),
          onEvent: (e) => {
            if (e.kind === 'tokens')
              say({ type: 'tokens', payload: { agentId: orch.id, input: e.input, output: e.output } });
          },
        });
        const plan: Plan = value.plan;
        const chat = [
          ...draft.chat,
          ...(text?.trim() ? [{ from: 'user' as const, text: text.trim() }] : []),
          { from: 'orchestrator' as const, text: value.reply },
        ];
        const saved = store.tx(() => store.drafts.update(draftId, { chat, plan }));
        if (text?.trim()) say({ type: 'chat.message', payload: { from: 'user', text: text.trim() } });
        say({ type: 'chat.message', payload: { from: 'orchestrator', agentId: orch.id, text: value.reply } });
        say({
          type: 'plan.changed',
          payload: {
            summary: plan.summary,
            ...staffingOf(plan),
            newAgents: plan.newAgents.length,
            newTeams: plan.newTeams.length,
          },
        });
        return { reply: value.reply, plan: saved.plan, chat: saved.chat };
      } finally {
        busy.delete(draftId);
        if (store.drafts.record(draftId))
          say({ type: 'agent.status', payload: { agentId: orch.id, status: 'idle' } });
      }
    },
  };
}
export type SetupChat = ReturnType<typeof createSetupChat>;
