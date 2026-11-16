/* "New chat with Pixel" (design/new-chat/new-chat.md): when the director's chat may start fresh, and the one
   line that says why not. Pure: the caller hands in what is running; the route and the voice path share it.
   The app runs the same table on its own data (app/src/features/office/new-chat.ts) to pick the pill's look. */

export type NewChatInput = {
  /** The director's own turn is running. */
  busy: boolean;
  /** Live sessions in this project (kind 'session' only — the app and code runs never block). */
  sessions: readonly { agentId: string | null }[];
  /** Agents waiting on the user (open asks). */
  asks: readonly { agentId: string }[];
  /** The director's live chat has at least one message. */
  hasMessages: boolean;
  directorId: string;
  /** An agent's short name ("Mira"). */
  nameOf: (agentId: string) => string;
};

export type NewChatVerdict =
  | { ok: true }
  | { ok: false; code: 'work_running'; reason: string }
  | { ok: false; code: 'chat_empty' };

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Why the chat can't start fresh right now (the first true row of the design's table), or null. */
export function blockReason(i: Omit<NewChatInput, 'hasMessages'>): string | null {
  const others = i.sessions.filter((s) => s.agentId !== i.directorId);
  if (i.busy || others.length < i.sessions.length) return `${i.nameOf(i.directorId)} is replying`;
  const waiting = [...new Set(i.asks.map((a) => a.agentId))];
  if (waiting.length === 1) return `${i.nameOf(waiting[0] as string)} needs you`;
  if (waiting.length > 1) return `${waiting.length} agents need you`;
  const agents = new Set(others.flatMap((s) => (s.agentId ? [s.agentId] : [])));
  if (agents.size) return `${count(agents.size, 'agent', 'agents')} working`;
  if (others.length) return 'The studio is working';
  return null;
}

/** May the director's chat start fresh now? */
export function canStartNew(i: NewChatInput): NewChatVerdict {
  const reason = blockReason(i);
  if (reason) return { ok: false, code: 'work_running', reason };
  return i.hasMessages ? { ok: true } : { ok: false, code: 'chat_empty' };
}
