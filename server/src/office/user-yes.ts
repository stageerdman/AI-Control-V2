/* The user's yes in chat: the gate before the director hands team-building work to the Agent Creator. The director
   quotes the user's words; they count only if the user really wrote them in this chat, in reply to the director
   (after it spoke) — so a yes can't be invented, and the opening ask alone is not a yes. */

/** A chat line, as the thread keeps it ('user' or the director's id). */
export type ChatLine = { id: string; from: string; text: string; at: string };
/** The yes kept on the request: the user's own message, word for word, and when they said it. */
export type UserYes = { words: string; at: string; messageId: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s"'“”‘’«»]+/g, ' ')
    .trim();

/** The newest user message (after the director first spoke) that contains `said` → the yes; else null. */
export function findUserYes(chat: readonly ChatLine[], said: string): UserYes | null {
  const quote = norm(said);
  if (!quote) return null;
  const spoke = chat.findIndex((m) => m.from !== 'user');
  if (spoke < 0) return null;
  const yes = chat
    .slice(spoke + 1)
    .filter((m) => m.from === 'user' && norm(m.text).includes(quote))
    .at(-1);
  return yes ? { words: yes.text.trim(), at: yes.at, messageId: yes.id } : null;
}
