/* "Build me a team for X" in one step: the director hands the team-building work straight to the Agent Creator —
   only once the user said yes in chat. The yes (the user's words and when) is saved as an approved team request
   (db/team-requests.ts), and its id goes in the whiteboard brief and on the Agent Creator's to-do: Tinker builds
   from it with `build_team` (office/team-build.ts), and everything built links back to it. */
import type { Store } from '../db/store.ts';
import type { TeamRequestsRepo } from '../db/team-requests.ts';
import { conflict, invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import { type ChatLine, findUserYes, type UserYes } from './user-yes.ts';

export type HandoffServices = {
  store: Store;
  /** Where the approved request is kept (the yes, and later what was built from it). */
  requests: TeamRequestsRepo;
  /** The director's current chat, oldest first (threads.get). */
  chat: (projectId: string, directorId: string) => readonly ChatLine[];
  /** A room call from the director that hands `work` over (it goes on the whiteboard) → the callee's answer. */
  ask: (projectId: string, directorId: string, to: string, request: string, work?: string) => Promise<string>;
};

export const ASK_FIRST =
  'Ask the user first: say which agents you would have the Agent Creator design and the team they would form, and wait for their yes in chat. Then call again with `user_yes`: their words.';

/** The request as it goes on the whiteboard: the work first (its first line is the task title), then the yes. */
export function handoffBrief(work: string, director: string, yes: UserYes, requestId: string): string {
  return [
    work,
    `(Handed to you by ${director}, your orchestrator, for the user.)`,
    `The user said yes in chat on ${yes.at}: ${JSON.stringify(yes.words)}`,
    `Approved request: ${requestId}`,
    `Design the agents and the team, then call \`build_team\` once with request "${requestId}": it adds the new agents to the Cast and puts the team, with its captain and members, on this project. The user can see, change or undo all of it afterward.`,
  ].join('\n\n');
}

const text = (a: Record<string, unknown>, k: string) => (typeof a[k] === 'string' ? a[k].trim() : '');

export function creatorHandoffTool(s: HandoffServices, projectId: string, directorId: string): CapableTool {
  async function handOff(a: Record<string, unknown>): Promise<string> {
    const work = text(a, 'work');
    if (!work) throw invalid('"work" is required: the team to build, with the context the Agent Creator needs.');
    const said = text(a, 'user_yes');
    if (!said) throw invalid(ASK_FIRST);
    const yes = findUserYes(s.chat(projectId, directorId), said);
    if (!yes) throw invalid(`The user’s messages here, after you asked, don’t say ${JSON.stringify(said)}. ${ASK_FIRST}`);
    const creator = s.store.agents.list().find((x) => x.kind === 'creator');
    if (!creator) throw conflict('The studio has no Agent Creator.');
    const director = s.store.agents.get(directorId)?.name ?? 'The director';
    const request = s.requests.create({ projectId, directorId, work, yes });
    const brief = handoffBrief(work, director, yes, request.id);
    const answer = await s.ask(
      projectId,
      directorId,
      creator.name,
      `${director}, your orchestrator, hands you this work for the user — they said yes in chat: ${JSON.stringify(work)}\nSay in two to four short, plain sentences how you will do it; the studio starts it for you.`,
      brief,
    );
    return `Handed to ${creator.name} as request ${request.id}, with the user’s yes recorded (${yes.at}: ${JSON.stringify(yes.words)}). Their answer, for you to act on: “${answer.trim()}”`;
  }

  return {
    name: 'hand_to_agent_creator',
    can: 'hand team-building work ("build me a team for X") straight to the Agent Creator — only after the user said yes in chat to the agents and team you proposed',
    description: `Hand team-building work to the Agent Creator: they design the new agents, add them to the Cast and set up the project team (captain and members). Only after the user said yes in chat: first propose the agents and team, wait for their yes, then call this with \`user_yes\` quoting their words — the studio checks them against the chat and records the yes, with its time, on the request. Without it the call is refused.`,
    inputSchema: {
      type: 'object',
      properties: {
        work: {
          type: 'string',
          description: 'The team to build: which agents, what for, the captain and members — with context.',
        },
        user_yes: { type: 'string', description: 'The user’s yes, quoted from their message in this chat.' },
      },
      required: ['work', 'user_yes'],
    },
    run: handOff,
  };
}
