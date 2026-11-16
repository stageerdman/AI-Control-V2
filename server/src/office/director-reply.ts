/* The director's office-chat answer (one Send): every orchestrator chat turn ends in ONE JSON object
   `{reply, work}` — `work: {goal}` only when the user clearly asked for work now, else null. The thread
   (threads.ts) posts the reply and, for work, makes the goal exactly as `POST /work` would; `staff` adds people;
   `rebuild` changes teams. Asking, continuing and stopping are tools (action-tools.ts), so their result is
   known before the reply is written.

   Read with the crew's structured-output helpers (extractJson + zod). Anything that isn't a valid answer
   is a plain reply and never starts work: a question must never auto-start. */
import { z } from 'zod';
import { extractJson, validateWith } from '../crew/structured.ts';
import { type Rebuild, RebuildSchema } from './rebuild.ts';
import { type Staff, StaffSchema } from './staffing.ts';

const json = (v: unknown) => JSON.stringify(v);

export const DirectorReplySchema = z.object({
  reply: z.string().trim().min(1).max(4000),
  work: z
    .object({ goal: z.string().trim().min(1).max(4000) })
    .nullable()
    .optional(),
  staff: StaffSchema.nullable().optional(),
  rebuild: RebuildSchema.nullable().optional(),
});
const validate = validateWith(DirectorReplySchema);

export type DirectorReply = {
  reply: string;
  goal: string | null;
  staff?: Staff | null;
  rebuild?: Rebuild | null;
};

/** Every action field of the answer (all but `reply`). */
export type AnswerField = Exclude<keyof typeof DirectorReplySchema.shape, 'reply'>;

/** Each answer field: the one plain line the capability list shows (capabilities.ts), and when and how to set
    it. Keyed by every field, so a new field without its line doesn't compile. */
export const ANSWER_FIELDS: Record<AnswerField, { can: string; rule: string[]; example?: object }> = {
  work: {
    can: 'put work the user asks for on the whiteboard as one goal; you break it into checklist items right after',
    rule: [
      '- WORK: the user clearly asks for something to be done now (build, add, fix, change, remove, research, compare, write up…), or says yes to work you offered. Set "work": {"goal": "…"} — ONE whiteboard goal in the user’s words, complete on its own (resolve "yes, do it" from this chat). The studio posts it on the whiteboard and you break it into checklist items right after. "reply" says in one or two sentences what will happen and who you will brief — no checklist here.',
    ],
    example: {
      reply: 'On it — I’ll brief the Ship-It Squad.',
      work: { goal: 'Add a dark mode toggle in Settings' },
    },
  },
  staff: {
    can: 'bring Cast people and teams onto the project',
    rule: [
      '- STAFF: the user asks you to set up a team or bring people onto this project. Set "staff" using ONLY names from `castAvailable` (people and teams already in the Cast): "team" = a NEW team made of those agents {name, captain, members: [{agent, job}]}, "teams" = whole Cast teams by name, "specialists" = single agents by name. Never invent people — new agents are designed with Tinker in the Cast (say so if the user wants someone who doesn’t exist). The studio adds them before any work in the same answer; "reply" says who joined. Combine with "work" when the user also asked for work.',
      '  People in `castAvailable` with "wasHere": true used to be on this project — bring one back as a solo specialist with "staff": {"specialists": [their name]}.',
    ],
    example: {
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
  },
  rebuild: {
    can: 'take people or teams off the project, split or merge teams, move someone, or change a captain (the user confirms on a card)',
    rule: [
      '- REBUILD: the user asks to take people or teams off this project, split, merge or reshuffle teams, move someone to another team, make someone a solo specialist, or change a captain. Set "rebuild" using ONLY names of the summary’s teams and specialists (who is on this project now): {"remove": [people], "removeTeams": [teams], "move": [{agent, to: team name or "specialist", job?}], "split": [{team, into: [{name, captain, members}]}], "captain": [{team, agent}]}. Removing never deletes anyone from the Cast. Never claim it is done when it needs a confirm — say "Here’s the plan — confirm below." (the studio shows the card; plain moves with no open work apply at once with an Undo).',
    ],
  },
};

/** The last block of every orchestrator chat task: how to answer — only with the fields attached here. */
export function directorAnswer(fields: AnswerField[]): string {
  const examples = [
    { reply: 'Plain, friendly words.', work: null },
    ...fields.flatMap((f) => ANSWER_FIELDS[f].example ?? []),
  ];
  return [
    'Decide what this message is, then answer.',
    ...fields.flatMap((f) => ANSWER_FIELDS[f].rule),
    `- NOT WORK: a question, an idea, a maybe ("maybe we could add dark mode?", "should we…?", "what about…?"), status, priorities, small talk, or anything unclear. Set "work": null. Answer it${fields.includes('work') ? '; for an idea, ask whether they want it on the whiteboard' : ''}. Never start work on a question.`,
    `Answer with ONE JSON object and nothing else, shaped like ${examples.map(json).join(' or ')}.`,
  ].join('\n');
}

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
      ...(v.value.rebuild ? { rebuild: v.value.rebuild } : {}),
    };
  const reply = (parsed as { reply?: unknown } | null)?.reply;
  return { reply: typeof reply === 'string' && reply.trim() ? reply.trim() : text, goal: null };
}
