/* Structured calls to the studio crew (orchestrator, Agent Creator): one Runner invocation
   whose final answer must be ONE JSON object that follows a named contract.

   - big picture only: no tools at all, cwd = a scratch dir in the data dir (no project folder);
   - the answer is parsed + validated (zod + studio rules); on a miss we ask ONCE more, in the
     same session when the runner gave us one, listing exactly what was wrong;
   - a second miss, or a failed run, is a clear 502 (`agent_error`) naming the agent. */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { z } from 'zod';
import { agentError, conflict } from '../errors.ts';
import type { Track, WorkClock } from '../office/work-time.ts';
import { ORCHESTRATOR_CAPS } from '../runtime/config.ts';
import { runEnv } from '../runtime/env.ts';
import type { Caps, RunEvent, Runner, RunOutcome } from '../runtime/runner.ts';

export const CREW_CAPS: Caps = ORCHESTRATOR_CAPS;

export type Verdict<T> = { ok: true; value: T } | { ok: false; issues: string[] };
export type Validate<T> = (raw: unknown) => Verdict<T>;

export type CrewDeps = {
  runner: Runner;
  model: string;
  /** Where crew runs execute (created on demand). Never a project folder. */
  scratchDir: string;
  parentEnv?: NodeJS.ProcessEnv;
  /** Default caps for crew calls (the orchestrator's). */
  caps?: Caps;
  /** The office's work clock: calls with a `track` record their time (office/work-time.ts). */
  clock?: WorkClock;
};

export type CrewCall<T> = {
  /** Display name for errors ("Pixel", "Tinker"). */
  who: string;
  /** The contract name; the task's first line announces it (`AI Studio contract: <name>`). */
  contract: string;
  systemPrompt: string;
  /** The body after the contract line. */
  task: string;
  validate: Validate<T>;
  caps?: Caps;
  onEvent?: (e: RunEvent) => void;
  /** A read-only look at a project (health check): its folder + a read-only tool set. Default: scratch, no tools. */
  workspace?: { cwd: string; tools: readonly string[]; allowedTools: readonly string[] };
  /** Whose time this is on the work clock (project or draft, agent, kind of work). */
  track?: Track;
};
export type CrewResult<T> = { value: T; attempts: number; outcomes: RunOutcome[] };

export const contractLine = (name: string, repair = false) =>
  `AI Studio contract: ${name}${repair ? ' (repair)' : ''}`;

/** The contract a crew task announces on its first line (fakes and logs read it). */
export function contractOf(task: string): { name: string; repair: boolean } | null {
  const m = /^AI Studio contract: ([a-z0-9-]+)( \(repair\))?/.exec(task);
  return m ? { name: m[1] as string, repair: !!m[2] } : null;
}

/** The JSON object in a model's answer: plain, fenced, or wrapped in a little prose. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(t)?.[1];
  for (const candidate of [t, fenced, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) {
    if (!candidate?.trim()) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      /* next */
    }
  }
  throw new Error('The answer has no JSON object');
}

/** zod shape first, then the studio rules on the parsed value. */
export function validateWith<S extends z.ZodType>(
  schema: S,
  rules: (v: z.output<S>) => string[] = () => [],
): Validate<z.output<S>> {
  return (raw) => {
    const r = schema.safeParse(raw);
    if (!r.success)
      return {
        ok: false,
        issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      };
    const broken = rules(r.data);
    return broken.length ? { ok: false, issues: broken } : { ok: true, value: r.data };
  };
}

export function createCrew(deps: CrewDeps) {
  const { runner } = deps;

  const invoke = async (call: CrewCall<unknown>, task: string, resumeSessionId?: string) => {
    if (!call.workspace) mkdirSync(deps.scratchDir, { recursive: true, mode: 0o700 });
    const handle = runner.start(
      {
        runId: randomUUID(),
        cwd: call.workspace?.cwd ?? deps.scratchDir,
        systemPrompt: call.systemPrompt,
        task,
        model: deps.model,
        caps: call.caps ?? deps.caps ?? CREW_CAPS,
        env: runEnv(deps.parentEnv ?? process.env, {}),
        secretValues: [],
        tools: call.workspace?.tools ?? [],
        ...(call.workspace ? { allowedTools: call.workspace.allowedTools } : {}),
        ...(resumeSessionId ? { resumeSessionId } : {}),
      },
      {
        emit: (e) => call.onEvent?.(e),
        ask: async () => {
          throw new Error('Crew runs cannot ask the user — they answer in their reply');
        },
      },
    );
    const clock = call.track && deps.clock;
    if (!clock) return handle.done;
    const id = clock.start(call.track as Track);
    let turns = 0;
    try {
      const o = await handle.done;
      turns = o.turns;
      return o;
    } finally {
      clock.end(id, turns);
    }
  };

  return {
    async call<T>(call: CrewCall<T>): Promise<CrewResult<T>> {
      if (runner.unavailable) throw conflict(runner.unavailable);
      const outcomes: RunOutcome[] = [];
      let issues: string[] = [];
      let sessionId: string | undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const task =
          attempt === 1
            ? `${contractLine(call.contract)}\n\n${call.task}`
            : [
                contractLine(call.contract, true),
                '',
                'Your last answer did not follow the contract:',
                ...issues.map((i) => `- ${i}`),
                '',
                'Reply again with ONLY the corrected JSON object.',
                ...(sessionId ? [] : ['', 'The original request, again:', '', call.task]),
              ].join('\n');
        const o = await invoke(call as CrewCall<unknown>, task, attempt === 2 ? sessionId : undefined);
        outcomes.push(o);
        if (o.status !== 'succeeded')
          throw agentError(`${call.who} could not finish: ${o.error ?? o.status}`, {
            contract: call.contract,
          });
        sessionId = o.sessionId;
        let raw: unknown;
        try {
          raw = extractJson(o.result ?? '');
        } catch (e) {
          issues = [(e as Error).message];
          continue;
        }
        const v = (call.validate as Validate<T>)(raw);
        if (v.ok) return { value: v.value, attempts: attempt, outcomes };
        issues = v.issues;
      }
      throw agentError(`${call.who}'s answer didn't follow the ${call.contract} contract (asked twice)`, {
        contract: call.contract,
        issues,
      });
    },
  };
}
export type Crew = ReturnType<typeof createCrew>;
