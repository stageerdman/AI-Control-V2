/* The director's office-chat answer (one Send): every orchestrator chat turn ends in ONE JSON object
   `{reply, work}` — `work: {goal}` only when the user clearly asked for work now, else null. The thread
   (threads.ts) posts the reply and, for work, makes the goal exactly as `POST /work` would.

   Read with the crew's structured-output helpers (extractJson + zod). Anything that isn't a valid answer
   is a plain reply and never starts work: a question must never auto-start. */
import { z } from 'zod';
import { extractJson, validateWith } from '../crew/structured.ts';
import { type Staff, StaffSchema } from './staffing.ts';

const json = (v: unknown) => JSON.stringify(v);

export const DirectorReplySchema = z.object({
  reply: z.string().trim().min(1).max(4000),
  work: z
    .object({ goal: z.string().trim().min(1).max(4000) })
    .nullable()
    .optional(),
  staff: StaffSchema.nullable().optional(),
});
const validate = validateWith(DirectorReplySchema);

export type DirectorReply = { reply: string; goal: string | null; staff?: Staff | null };

/** The last block of every orchestrator chat task: how to answer, and when it's work. */
export const DIRECTOR_ANSWER = [
  'Decide what this message is, then answer.',
  '- WORK: the user clearly asks for something to be done now (build, add, fix, change, remove, research, compare, write up…), or says yes to work you offered. Set "work": {"goal": "…"} — ONE whiteboard goal in the user’s words, complete on its own (resolve "yes, do it" from this chat). The studio posts it on the whiteboard and you break it into checklist items right after. "reply" says in one or two sentences what will happen and who you will brief — no checklist here.',
  '- STAFF: the user asks you to set up a team or bring people onto this project. Set "staff" using ONLY names from `castAvailable` (people and teams already in the Cast): "team" = a NEW team made of those agents {name, captain, members: [{agent, job}]}, "teams" = whole Cast teams by name, "specialists" = single agents by name. Never invent people — new agents are designed with Tinker in the Cast (say so if the user wants someone who doesn’t exist). The studio adds them before any work in the same answer; "reply" says who joined. Combine with "work" when the user also asked for work.',
  '- NOT WORK: a question, an idea, a maybe ("maybe we could add dark mode?", "should we…?", "what about…?"), status, priorities, small talk, or anything unclear. Set "work": null. Answer it; for an idea, ask whether they want it on the whiteboard. Never start work on a question.',
  `Answer with ONE JSON object and nothing else, shaped like ${json({ reply: 'Plain, friendly words.', work: null })} or ${json({ reply: 'On it — I’ll brief the Ship-It Squad.', work: { goal: 'Add a dark mode toggle in Settings' } })} or ${json(
    {
      reply:
        'Done — Jony, Uncle Bob and HR are the Founders now, Jony captains; Blair joins as a specialist.',
      work: null,
      staff: {
        team: {
          name: 'The Founders',
          captain: 'Jony',
          members: [
            { agent: 'Jony', job: 'Lead and design' },
            { agent: 'Uncle Bob', job: 'Backend' },
          ],
        },
        specialists: ['Blair Disney'],
      },
    },
  )}.`,
].join('\n');

/** The run's final text → the reply (+ a goal only from a valid answer). */
export function parseDirectorReply(raw: string): DirectorReply {
  const text = raw.trim();
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    return { reply: text, goal: null }; // plain words: a reply, never work
  }
  const v = validate(parsed);
  if (v.ok)
    return {
      reply: v.value.reply,
      goal: v.value.work?.goal ?? null,
      ...(v.value.staff ? { staff: v.value.staff } : {}),
    };
  const reply = (parsed as { reply?: unknown } | null)?.reply;
  return { reply: typeof reply === 'string' && reply.trim() ? reply.trim() : text, goal: null };
}
