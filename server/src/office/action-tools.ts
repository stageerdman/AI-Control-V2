/* The director's action tools: ask someone, continue stopped goals, stop work, tell someone running. Thin adapters
   over the services the studio already has (room.call, dispatch.resume, the stopper, runtime.tell). They run during the director's
   turn, so it reads what really happened — an answer, or why not — before it writes its reply. */
import type { Store } from '../db/store.ts';
import type { Goal, WorkRepo } from '../db/work.ts';
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { DirectorStopper } from './director-stop.ts';
import { agentByName, seatOf } from './people.ts';

export type ActionServices = {
  store: Store;
  work: WorkRepo;
  /** The director asks someone (a room call from the director) → their answer. */
  ask: (projectId: string, directorId: string, to: string, request: string) => Promise<string>;
  /** Continue a stopped goal where it was (dispatch.resume). */
  resumeGoal: (projectId: string, goalId: string) => Goal;
  stops: DirectorStopper;
  /** A note for someone's live run, read after their next step (runtime.tell) → false when they aren't running. */
  tell: (projectId: string, agentId: string, from: string, text: string) => boolean;
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

export function actionTools(s: ActionServices, projectId: string, directorId: string): CapableTool[] {
  const { store, work } = s;
  const project = () => store.projects.require(projectId);

  /** Someone on the project the director may ask (never itself). */
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
    const them = callee(need(a, 'to'));
    const director = store.agents.get(directorId)?.name ?? 'The director';
    const request = [
      `${director}, your orchestrator, asks you this for the user: ${json(question)}`,
      `Your steps on the whiteboard now: ${json(stepsOf(them.id))}`,
      'Answer in two to four short, plain sentences: facts your orchestrator can act on.',
    ].join('\n');
    const nick = them.nick || them.name.split(' ')[0];
    try {
      const answer = clip((await s.ask(projectId, directorId, them.name, request)).trim(), 2000);
      return `${nick}’s answer, for you to act on (tell the user the outcome, not who said what): “${answer}”`;
    } catch (e) {
      throw new Error(`Couldn’t reach ${nick}: ${clip(message(e), 500)}`);
    }
  }

  /** Continue stopped goals by their `n` in the summary's `stopped` list; one line each. */
  function resumeGoals(a: Args): string {
    const picks = [...new Set(list(a, 'goals').map(Number))].filter((n) => Number.isInteger(n) && n >= 1);
    if (!picks.length) throw invalid('"goals" is required: the `n` of each stopped goal to continue.');
    const stopped = work.goals(projectId).filter((g) => g.status === 'failed');
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

  function stopWork(a: Args): string {
    const agents = list(a, 'agents')
      .map(String)
      .map((x) => x.trim())
      .filter(Boolean);
    const message = typeof a.message === 'string' ? a.message : undefined;
    if (a.everyone === true)
      return s.stops.apply(projectId, directorId, { everyone: true }, { message }).join('\n');
    if (!agents.length) throw invalid('Say who to stop: "agents" (names) or "everyone": true.');
    return s.stops.apply(projectId, directorId, { agents }, { message }).join('\n');
  }

  function tellAgent(a: Args): string {
    const text = need(a, 'message');
    const them = callee(need(a, 'to'));
    const director = store.agents.get(directorId)?.name ?? 'your orchestrator';
    const nick = them.nick || them.name.split(' ')[0];
    if (s.tell(projectId, them.id, director, text)) return `${nick} will read it after their next step.`;
    return `${nick} isn’t running now — use ask_person, or put the work on the whiteboard.`;
  }

  return [
    {
      name: 'ask_person',
      can: 'ask anyone on the project a question ("ask Jony how it’s going", "have you asked him?") — you get their answer in this turn; use it to act or decide, and tell the user the result, not who said what',
      description:
        'Ask someone on the project a question and wait for their answer (the office shows you talking). Put the context they need in the question. Use the answer to act or decide (call more tools if it says what to do), then tell the user the outcome in your own words — don’t relay “X said…”. Never claim you asked someone without calling this.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Their name, from the summary’s people.' },
          question: { type: 'string', description: 'What you ask them, in your own words, with context.' },
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
    {
      name: 'stop_work',
      can: 'stop anyone’s work, or everything on the project, at once, optionally with a message for them (the summary’s `runningNow` shows who is working)',
      description:
        'Stop work now: these people, or everyone (every agent and code run on this project; running goals stop too). Their chats and saved work stay, so it can be continued later. A `message` (why, or what to do instead) is left on each stopped agent’s desk. Do not start work in the same turn.',
      inputSchema: {
        type: 'object',
        properties: {
          agents: { type: 'array', items: { type: 'string' }, description: 'Names from the summary’s people.' },
          everyone: { type: 'boolean', description: 'Stop everything on the project.' },
          message: { type: 'string', description: 'Optional: why, left on their desk.' },
        },
      },
      run: async (a) => stopWork(a),
    },
    {
      name: 'tell_agent',
      can: 'tell someone who is working right now something without stopping them ("tell Bob to use the existing logger") — they read it after their next step',
      description:
        'Send a note to someone running on this project; it reaches them after their next tool step and they take it into account without starting over. Use this for suggestions or corrections while they work; stop_work to stop them.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Their name, from the summary’s people.' },
          message: { type: 'string', description: 'What to tell them, with the context they need.' },
        },
        required: ['to', 'message'],
      },
      run: async (a) => tellAgent(a),
    },
  ];
}
