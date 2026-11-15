/* The director's office-chat answer (one Send): every orchestrator chat turn ends in ONE JSON object
   `{reply, work}` — `work: {goal}` only when the user clearly asked for work now, else null. The thread
   (threads.ts) posts the reply and, for work, makes the goal exactly as `POST /work` would; `staff` adds people;
   `ask: {to, question}` sends a question to someone on the project and relays their answer into the chat;
   `resume: [n…]` continues stopped goals (the summary's `stopped`, by number) where they were;
   `stop: {everyone} | {agents}` stops work now — the whole project, or those people.

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
  ask: z
    .object({ to: z.string().trim().min(1).max(80), question: z.string().trim().min(1).max(2000) })
    .nullable()
    .optional(),
  resume: z.array(z.number().int().min(1)).max(20).nullable().optional(),
  stop: z
    .object({
      everyone: z.boolean().optional(),
      agents: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    })
    .nullable()
    .optional(),
});
const validate = validateWith(DirectorReplySchema);

export type DirectorAsk = { to: string; question: string };
export type DirectorReply = {
  reply: string;
  goal: string | null;
  staff?: Staff | null;
  rebuild?: Rebuild | null;
  ask?: DirectorAsk;
  /** Stopped goals to continue (1-based, the summary's `stopped` list). */
  resume?: number[];
  /** Stop work now: everything in the project, or these people (names). */
  stop?: DirectorStop;
};
export type DirectorStop = { everyone: true } | { agents: string[] };

/** The last block of every orchestrator chat task: how to answer, and when it's work. */
export const DIRECTOR_ANSWER = [
  'Decide what this message is, then answer.',
  '- WORK: the user clearly asks for something to be done now (build, add, fix, change, remove, research, compare, write up…), or says yes to work you offered. Set "work": {"goal": "…"} — ONE whiteboard goal in the user’s words, complete on its own (resolve "yes, do it" from this chat). The studio posts it on the whiteboard and you break it into checklist items right after. "reply" says in one or two sentences what will happen and who you will brief — no checklist here.',
  '- STAFF: the user asks you to set up a team or bring people onto this project. Set "staff" using ONLY names from `castAvailable` (people and teams already in the Cast): "team" = a NEW team made of those agents {name, captain, members: [{agent, job}]}, "teams" = whole Cast teams by name, "specialists" = single agents by name. Never invent people — new agents are designed with Tinker in the Cast (say so if the user wants someone who doesn’t exist). The studio adds them before any work in the same answer; "reply" says who joined. Combine with "work" when the user also asked for work.',
  '  People in `castAvailable` with "wasHere": true used to be on this project — bring one back as a solo specialist with "staff": {"specialists": [their name]}.',
  '- REBUILD: the user asks to take people or teams off this project, split, merge or reshuffle teams, move someone to another team, make someone a solo specialist, or change a captain. Set "rebuild" using ONLY names of the summary’s teams and specialists (who is on this project now): {"remove": [people], "removeTeams": [teams], "move": [{agent, to: team name or "specialist", job?}], "split": [{team, into: [{name, captain, members}]}], "captain": [{team, agent}]}. Removing never deletes anyone from the Cast. Never claim it is done when it needs a confirm — say "Here’s the plan — confirm below." (the studio shows the card; plain moves with no open work apply at once with an Undo).',
  '- ASK: the user wants you to check with, ask, brief or nudge someone on the project ("ask Jony how it’s going", "tell Uncle Bob to…", or "have you asked him?" — then ask now instead of offering to). Set "ask": {"to": "<a name from people>", "question": "what you ask them, in your own words, with the context they need"}. The studio asks them right away (the office shows you talking) and posts their answer in this chat; "reply" says in one short line that you’re asking them. Never claim you asked someone without setting "ask".',
  '- CONTINUE: the user wants stopped work picked up again ("continue", "carry on", "get Jony back on it", "restart the chat history work") and the summary lists it under `stopped`. Set "resume": [the `n` of each stopped goal to continue] — every one when they don’t say which. The studio puts them back on the whiteboard and their owners carry on where they stopped, from their saved work. Do this instead of asking anyone to continue, and never make a new goal for stopped work. "reply" says in one short line what is back on.',
  '- STOP: the user wants work stopped now ("stop Jony", "stop everything", "everyone stop", "kill it all"). The summary’s `runningNow` shows who is working on what. Set "stop": {"everyone": true} to stop every agent and code run on this project at once (running goals stop too; nothing new starts), or "stop": {"agents": [names from people]} to stop just those people. It takes effect at once — their chat and saved work stay, so it can be continued later. "reply" says in one short line who you stopped. Never set "work" in the same answer.',
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

/** `everyone` wins over a name list; an empty ask is no stop at all. */
function toStop(s: z.output<typeof DirectorReplySchema>['stop']): DirectorStop | null {
  if (s?.everyone) return { everyone: true };
  return s?.agents?.length ? { agents: s.agents } : null;
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
  if (v.ok) {
    const stop = toStop(v.value.stop);
    return {
      reply: v.value.reply,
      goal: v.value.work?.goal ?? null,
      ...(v.value.staff ? { staff: v.value.staff } : {}),
      ...(v.value.rebuild ? { rebuild: v.value.rebuild } : {}),
      ...(v.value.ask ? { ask: v.value.ask } : {}),
      ...(v.value.resume?.length ? { resume: v.value.resume } : {}),
      ...(stop ? { stop } : {}),
    };
  }
  const reply = (parsed as { reply?: unknown } | null)?.reply;
  return { reply: typeof reply === 'string' && reply.trim() ? reply.trim() : text, goal: null };
}
