/* "New chat with Pixel" (design/new-chat/new-chat.md): the pill's look from data the office already has.
   Same reason table as the server (server/src/office/new-chat.ts), which checks it again on the tap, plus one
   client-only row: a rebuild card still waiting for yes/no. */

import type { RunningItem } from '../running/api';
import type { ThreadMessage } from './api';

export type NewChatLook = { state: 'idle' | 'shining' | 'disabled'; reason?: string };

export type NewChatFacts = {
  pid: string;
  director: string;
  /** The director's own turn is running. */
  busy: boolean;
  running: readonly RunningItem[];
  /** Agents waiting on the user. */
  asks: readonly { agentId: string }[];
  /** The director's live chat. */
  messages: readonly ThreadMessage[];
  /** An agent's short name ("Mira"). */
  nameOf: (agentId: string) => string;
  /** A rebuild card the user answered in this tab. */
  settled: (planId: string) => boolean;
};

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Only live sessions here block: the user's app never does, and code always hangs under a session. */
const sessionsOf = (f: NewChatFacts) =>
  f.running.filter((r) => r.kind === 'session' && r.projectId === f.pid);

/** A rebuild card that still waits for yes/no (no newer user line has made it stale). */
export function cardPending(messages: readonly ThreadMessage[], settled: (planId: string) => boolean) {
  return messages.some(
    (m, i) =>
      m.rebuild?.needsConfirm &&
      !m.rebuild.undoToken &&
      !m.rebuild.card.stale &&
      !settled(m.rebuild.planId) &&
      !messages.slice(i + 1).some((x) => x.from === 'user'),
  );
}

function reasonOf(f: NewChatFacts): string | null {
  const sessions = sessionsOf(f);
  const others = sessions.filter((s) => s.agentId !== f.director);
  const waiting = [...new Set(f.asks.map((a) => a.agentId))];
  /* the director's turn is open on a question to you: it waits for you, it isn't replying */
  if (waiting.includes(f.director)) return `${f.nameOf(f.director)} needs you`;
  if (f.busy || others.length < sessions.length) return `${f.nameOf(f.director)} is replying`;
  if (waiting.length === 1) return `${f.nameOf(waiting[0] as string)} needs you`;
  if (waiting.length > 1) return `${waiting.length} agents need you`;
  const agents = new Set(others.flatMap((s) => (s.agentId ? [s.agentId] : [])));
  if (agents.size) return `${count(agents.size, 'agent', 'agents')} working`;
  if (others.length) return 'The studio is working';
  if (cardPending(f.messages, f.settled)) return 'Answer the card first';
  return null;
}

/** Idle (chat already new), shining (good time to start fresh) or disabled with the reason line. */
export function newChatState(f: NewChatFacts): NewChatLook {
  const reason = reasonOf(f);
  if (reason) return { state: 'disabled', reason };
  return { state: f.messages.length ? 'shining' : 'idle' };
}

/** What the user says to start fresh (the voice path): "new chat", "start fresh", "clear the chat", … */
const ASK =
  /^(?:(?:start )?(?:a )?new (?:chat|session|conversation)(?: with \w+)?|start fresh|start over|clear (?:the )?chat)$/;
export const asksForNewChat = (text: string) =>
  ASK.test(
    text
      .toLowerCase()
      .replace(/[.!?,]/g, '')
      .replace(/^(?:please |can you |let'?s )/, '')
      .replace(/ please$/, '')
      .trim()
      .replace(/\s+/g, ' '),
  );
