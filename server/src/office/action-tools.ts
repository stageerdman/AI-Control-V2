/* The director's action tools: ask someone, continue stopped goals, and a leader's stop/tell (leader-tools.ts). Thin adapters
   over the services the studio already has (room.call, dispatch.resume, the stopper, runtime.tell). They run during the director's
   turn, so it reads what really happened — an answer, or why not — before it writes its reply. */
import { type Goal, resumable, type WorkRepo } from '../db/work.ts';
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import { type LeaderServices, leaderTools } from './leader-tools.ts';
import { agentByName, seatOf } from './people.ts';

export type ActionServices = LeaderServices & {
  work: WorkRepo;
  /** The director asks someone (a room call from the director) → their answer. `work`: the work handed over, which
      also goes on the board as their task — the work itself, never the call's "say how you will do it". */
  ask: (projectId: string, directorId: string, to: string, request: string, work?: string) => Promise<string>;
  /** Continue a stopped goal where it was (dispatch.resume). */
  resumeGoal: (projectId: string, goalId: string) => Goal;
};

type Args = Record<string, unknown>;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const json = (v: unknown) => JSON.stringify(v);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function need(a: Args, k: string): string {
  const v = typeof a[k] === 'string' ? (a[k] as string).trim() : '';
  if (!v) throw invalid(`"${k}" is required.`);
  return v;
}
const list = (a: Args, k: string) => (Array.isArray(a[k]) ? (a[k] as unknown[]) : []);
/** Who the director may call: Cast agents and the Agent Creator (the room's own rule). */
const ASKABLE = new Set(['agent', 'creator']);

export function actionTools(s: ActionServices, projectId: string, directorId: string): CapableTool[] {
  const { store, work } = s;
  const project = () => store.projects.require(projectId);

  /** Anyone in the studio the director may ask (never itself): off the project, the call brings them into the room. */
  function anyone(said: string) {
    const who = agentByName(store, said);
    if (who && who.id !== directorId && ASKABLE.has(who.kind)) return who;
    throw invalid(
      `Nobody called ${said} is in the studio — use a name from the summary’s people or the Cast.`,
    );
  }

  /** Someone on the project (a leader's reach: stop and tell). */
  function callee(said: string) {
    const p = project();
    const who = agentByName(store, said);
    try {
      if (who && who.id !== p.orchestratorId) return seatOf(store, p, who.id).agent;
    } catch {
      /* in the studio but not on this project: the same answer as nobody */
    }
    throw invalid(`Nobody called ${said} is on ${p.name} — use a name from the summary’s people.`);
  }

  /** Their steps on running and stopped goals (stopped ones are still on the board: "my whiteboard is empty" was wrong). */
  const stepsOf = (agentId: string) =>
    work
      .goals(projectId)
      .filter((g) => g.status === 'running' || g.status === 'failed')
      .flatMap((g) =>
        g.items.flatMap((i) => [i, ...i.subtasks]).map((i) => ({ i, stopped: g.status === 'failed' })),
      )
      .filter(({ i }) => i.agentId === agentId)
      .map(({ i, stopped }) => ({
        step: clip(i.text, 160),
        status: i.status,
        ...(stopped ? { goal: 'stopped partway — the director can continue it' } : {}),
      }));

  async function askPerson(a: Args): Promise<string> {
    const question = need(a, 'question');
    const them = anyone(need(a, 'to'));
    const work = a.work === true;
    const director = store.agents.get(directorId)?.name ?? 'The director';
    const request = [
      `${director}, your orchestrator, ${work ? 'hands you this work' : 'asks you this'} for the user: ${json(question)}`,
      `Your steps on the whiteboard now: ${json(stepsOf(them.id))}`,
      work
        ? 'Say in two to four short, plain sentences how you will do it; the studio starts it for you.'
        : 'Answer in two to four short, plain sentences: facts your orchestrator can act on.',
    ].join('\n');
    const nick = them.nick || them.name.split(' ')[0];
    try {
      /* the board's task title is its brief's first line: the work comes first */
      const handed = work
        ? `${question}\n\n(Handed to you by ${director}, your orchestrator, for the user.)`
        : undefined;
      const answer = clip((await s.ask(projectId, directorId, them.name, request, handed)).trim(), 2000);
      return `${nick}’s answer, for you to act on (tell the user the outcome, not who said what): “${answer}”`;
    } catch (e) {
      throw new Error(`Couldn’t reach ${nick}: ${clip(message(e), 500)}`);
    }
  }

  /** Continue stopped goals by their `n` in the summary's `stopped` list; one line each. */
  function resumeGoals(a: Args): string {
    const picks = [...new Set(list(a, 'goals').map(Number))].filter((n) => Number.isInteger(n) && n >= 1);
    if (!picks.length) throw invalid('"goals" is required: the `n` of each stopped goal to continue.');
    const stopped = work.goals(projectId).filter((g) => resumable(g.status));
    return picks
      .map((n) => {
        const g = stopped[n - 1];
        if (!g) return `No stopped goal ${n} — the summary lists ${stopped.length}.`;
        try {
          s.resumeGoal(projectId, g.id);
          return `Back on the whiteboard: ${clip(g.summary || g.text, 300)}`;
        } catch (e) {
          return `Couldn’t continue “${clip(g.text, 80)}”: ${clip(message(e), 500)}`;
        }
      })
      .join('\n');
  }

  return [
    {
      name: 'ask_person',
      can: 'ask anyone in the studio a question, on this project or not ("ask Jony how it’s going", "ask Elon directly"), or hand them work face to face (`work: true`) — you get their answer in this turn; use it to act or decide, and tell the user the result, not who said what',
      description:
        'Ask someone a question and wait for their answer (the office shows you talking). Anyone in the studio: someone off the project is brought into the room. Put the context they need in the question. `work: true` hands them the work: it goes on the whiteboard as their task, so it really gets done and is tracked. Use the answer to act or decide (call more tools if it says what to do), then tell the user the outcome in your own words — don’t relay “X said…”. Never claim you asked someone without calling this.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Their name: the summary’s people, or anyone in the Cast.' },
          question: { type: 'string', description: 'What you ask them, in your own words, with context.' },
          work: { type: 'boolean', description: 'true = this is work for them (a side quest): start it.' },
        },
        required: ['to', 'question'],
      },
      run: askPerson,
    },
    {
      name: 'resume_goal',
      can: 'continue goals that stopped partway (the summary’s `stopped`), where they were — instead of asking anyone to continue or making a new goal',
      description:
        'Put stopped goals back on the whiteboard; their owners carry on where they stopped, from their saved work. Every stopped goal when the user does not say which.',
      inputSchema: {
        type: 'object',
        properties: {
          goals: {
            type: 'array',
            items: { type: 'number' },
            description: 'The `n` of each goal in the summary’s `stopped` list.',
          },
        },
        required: ['goals'],
      },
      run: async (a) => resumeGoals(a),
    },
    ...leaderTools(s, { projectId, byId: directorId }, (said) => callee(said)),
  ];
}
