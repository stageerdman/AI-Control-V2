/* "Start it": an agent's reply in one of its past chats offered work (meta.offer); one tap puts that work on
   the whiteboard as a goal for the same agent, through the normal dispatch path. The chat then says so
   (meta.started), which is also what stops a second tap from starting it twice.
   The new run gets its own checkout, where the old session can't be resumed (sessions live per folder), so its
   brief carries the user's words and points at the chat to read with my_history. */

import { appendChatMessage, type ChatMessage, getChat, getChatMessages } from '../db/chats.ts';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import type { Goal } from '../db/work.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { NewGoal } from '../whiteboard/board.ts';

export type Offer = { work: string };
export type Started = { goalId: string; offer: number };
type Board = { addDirectGoal: (projectId: string, by: string, a: NewGoal) => Goal };

const BY_USER = 'user';
const OFFER_CHARS = 1500;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const offerOf = (m: ChatMessage): Offer | null => (m.meta?.offer as Offer | undefined) ?? null;
const startedOf = (m: ChatMessage): Started | null => (m.meta?.started as Started | undefined) ?? null;

/** The brief: what the user asked, what the agent said it would do, and where the chat is. */
export function startBrief(a: { asked: string; said: string; task: string; runId: string }): string {
  return [
    a.asked,
    `This picks up your earlier chat “${clip(a.task, 200)}”. Read it first with my_history (runId ${a.runId}), so you know what was said.`,
    `In that chat you answered: ${clip(a.said, OFFER_CHARS)}`,
  ].join('\n\n');
}

export function createChatWork({ db, store, board }: { db: Db; store: Store; board: Board }) {
  return {
    /** Only someone who can own whiteboard work gets the button: never the project's director. */
    canOffer(projectId: string, agentId: string): boolean {
      const p = store.projects.get(projectId);
      return !!p?.folder && p.orchestratorId !== agentId;
    },

    /** Start the work offered by the reply at `seq` → the chat's new line and the goal. */
    start(runId: string, seq: number): { message: ChatMessage; goalId: string } {
      const chat = getChat(db, runId);
      if (!chat) throw notFound('Chat', runId);
      const messages = getChatMessages(db, runId);
      const reply = messages.find((m) => m.seq === seq && m.role === 'assistant');
      const offer = reply && offerOf(reply);
      if (!reply || !offer) throw invalid('That message offers no work to start.');
      if (messages.some((m) => startedOf(m)?.offer === seq))
        throw conflict(`“${offer.work}” is already on the whiteboard.`);
      const asked = messages.filter((m) => m.seq < seq && m.role === 'user').at(-1)?.text ?? offer.work;
      const goal = board.addDirectGoal(chat.projectId, BY_USER, {
        text: offer.work,
        tasks: [
          {
            text: offer.work,
            owner: chat.agentId,
            brief: startBrief({ asked, said: reply.text, task: chat.task, runId }),
          },
        ],
      });
      const message = appendChatMessage(db, {
        runId,
        projectId: chat.projectId,
        agentId: chat.agentId,
        role: 'assistant',
        text: `On the whiteboard now: “${offer.work}”. I’m picking it up from this chat.`,
        meta: { followUp: true, started: { goalId: goal.id, offer: seq } satisfies Started },
      });
      return { message, goalId: goal.id };
    },
  };
}
export type ChatWork = ReturnType<typeof createChatWork>;
