/* Claude Code `--output-format stream-json` → RunEvents (pure, line by line).
   The stream is newline-delimited JSON: system/init (session, tools, MCP servers),
   assistant messages (text / thinking / tool_use blocks + usage), user messages
   (tool results), and one final `result` (status, totals, cost). Unknown lines are
   ignored, so new CLI message types never break a run. */
import { redactSecrets } from '../events/redact.ts';
import type { Activity, RunEvent, RunOutcome } from './runner.ts';

export const ASK_TOOL = 'mcp__studio__ask_user';
export const REPORT_TOOL = 'mcp__studio__file_report';
/** A bridge tool as the CLI names it (pre-approved by this name). */
export const studioTool = (name: string) => `mcp__studio__${name}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const base = (p: string) => p.split('/').filter(Boolean).at(-1) ?? p;

/** Plain-words activity for a tool call — what the office shows over the agent's desk. */
export function activityFor(
  name: string,
  input: Record<string, unknown>,
): { status: 'working' | 'waiting'; activity: Activity } {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
  const file = s('file_path') || s('notebook_path') || s('path');
  switch (name) {
    case 'Read':
      return {
        status: 'working',
        activity: { kind: 'reading', label: clip(`Reading ${base(file)}`, 120), target: clip(file, 300) },
      };
    case 'Glob':
    case 'Grep':
      return {
        status: 'working',
        activity: {
          kind: 'searching',
          label: clip(`Searching for ${s('pattern')}`, 120),
          target: clip(file, 300),
        },
      };
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return {
        status: 'working',
        activity: { kind: 'editing', label: clip(`Editing ${base(file)}`, 120), target: clip(file, 300) },
      };
    case 'Write':
      return {
        status: 'working',
        activity: { kind: 'editing', label: clip(`Writing ${base(file)}`, 120), target: clip(file, 300) },
      };
    case 'Bash': {
      const cmd = s('command');
      return {
        status: 'working',
        activity: {
          kind: 'running',
          label: clip(s('description') || `Running ${cmd.split(/\s+/).slice(0, 3).join(' ')}`, 120),
          detail: clip(cmd, 2000),
        },
      };
    }
    case REPORT_TOOL:
      return {
        status: 'working',
        activity: { kind: 'writing', label: clip(`Filing a report: ${s('title')}`, 120) },
      };
    case 'mcp__studio__call_agent':
      return {
        status: 'waiting',
        activity: {
          kind: 'calling',
          label: clip(`Asking ${s('agent')} for a hand`, 120),
          detail: clip(s('request'), 2000),
        },
      };
    case ASK_TOOL:
      return {
        status: 'waiting',
        activity: { kind: 'asking', label: 'Waiting for your answer', detail: clip(s('question'), 2000) },
      };
    default:
      return {
        status: 'working',
        activity: { kind: 'tool', label: clip(`Using ${name.replace(/^mcp__[^_]+__/, '')}`, 120) },
      };
  }
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};
type Block = { type: string; text?: string; name?: string; input?: Record<string, unknown> };
type Line = {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: { id?: string; content?: Block[] | string; usage?: Usage };
  is_error?: boolean;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: Usage;
  errors?: string[];
  /** Why the CLI produced this result: `task-notification` = its own background-task notice, not the task. */
  origin?: { kind?: string };
};

/** One parser per run. feed() a stdout line → events; outcome() once the stream ends. */
export function createStreamParser(secretValues: readonly string[] = []) {
  const seenMessages = new Set<string>();
  let sessionId: string | undefined;
  let turns = 0;
  let final: RunOutcome | undefined;
  let lastText = '';
  /** Turns and tokens of background-task notices that came before the answer. */
  let extra = { turns: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  let cost: number | undefined;
  /* per-message usage (last line wins): the fallback when a run is stopped before its result line */
  const perMessage = new Map<string, Usage>();
  const streamed = () => {
    const u = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const m of perMessage.values()) {
      u.input += m.input_tokens ?? 0;
      u.output += m.output_tokens ?? 0;
      u.cacheRead += m.cache_read_input_tokens ?? 0;
      u.cacheWrite += m.cache_creation_input_tokens ?? 0;
    }
    return u;
  };
  const scrub = <T>(v: T) => redactSecrets(v, secretValues).value;

  return {
    /** Assistant messages seen so far (≈ model turns) — used to enforce maxTurns. */
    turns: () => turns,
    sessionId: () => sessionId,
    /** True once the `result` message arrived (its keys aren't ordered — never sniff the raw line). */
    finished: () => final !== undefined,
    feed(raw: string): RunEvent[] {
      let m: Line;
      try {
        m = JSON.parse(raw) as Line;
      } catch {
        return [];
      }
      const out: RunEvent[] = [];
      if (m.session_id && m.session_id !== sessionId) {
        sessionId = m.session_id;
        out.push({ kind: 'session', sessionId });
      }
      if (m.type === 'assistant' && m.message) {
        const id = m.message.id;
        const fresh = !id || !seenMessages.has(id);
        if (id) seenMessages.add(id);
        if (id && m.message.usage) perMessage.set(id, m.message.usage);
        if (fresh) {
          turns++;
          const u = m.message.usage;
          if (u) {
            const input =
              (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            out.push({ kind: 'tokens', input, output: u.output_tokens ?? 0 });
          }
        }
        for (const b of Array.isArray(m.message.content) ? m.message.content : []) {
          if (b.type === 'tool_use' && b.name)
            out.push({ kind: 'activity', ...scrub(activityFor(b.name, b.input ?? {})) });
          else if (b.type === 'thinking')
            out.push({
              kind: 'activity',
              status: 'working',
              activity: { kind: 'thinking', label: 'Thinking' },
            });
          else if (b.type === 'text' && b.text?.trim()) {
            lastText = scrub(b.text);
            out.push({ kind: 'text', text: lastText });
          }
        }
      }
      if (m.type === 'result') {
        const u = m.usage ?? {};
        const add = (to: RunOutcome['usage']) => ({
          input: to.input + (u.input_tokens ?? 0),
          output: to.output + (u.output_tokens ?? 0),
          cacheRead: to.cacheRead + (u.cache_read_input_tokens ?? 0),
          cacheWrite: to.cacheWrite + (u.cache_creation_input_tokens ?? 0),
        });
        if (m.total_cost_usd !== undefined) cost = Math.max(cost ?? 0, m.total_cost_usd); // the CLI's total is cumulative
        /* F3 live: the CLI also answers its own background-task notices with a result (`origin.kind:
           task-notification`) — AFTER the task's answer (a background `npm start` stopped: "the test server stopped…")
           or, on --resume, BEFORE it (the last session's killed shell: an empty 0-turn result). Neither is the answer:
           it only adds turns, tokens and cost. A second plain result after a successful answer is treated the same. */
        const notice = m.origin?.kind === 'task-notification' || final?.status === 'succeeded';
        if (notice) {
          extra = { turns: extra.turns + (m.num_turns ?? 0), usage: add(extra.usage) };
          if (final)
            final = {
              ...final,
              turns: (final.turns ?? 0) + (m.num_turns ?? 0),
              usage: add(final.usage),
              ...(cost === undefined ? {} : { costUsd: cost }),
            };
          return out;
        }
        const ok = m.subtype === 'success' && !m.is_error;
        final = {
          status: ok ? 'succeeded' : 'failed',
          turns: (m.num_turns ?? turns) + extra.turns,
          usage: add(extra.usage),
          ...(m.result ? { result: scrub(m.result) } : {}),
          ...(ok ? {} : { error: scrub(m.errors?.join('; ') || m.subtype || 'error') }),
          ...(sessionId ? { sessionId } : {}),
          ...(cost === undefined ? {} : { costUsd: cost }),
        };
      }
      return out;
    },
    /** The final result, or a failure if the stream ended without one. */
    outcome(fallbackError = 'Claude Code exited without a result'): RunOutcome {
      return (
        final ?? {
          status: 'failed',
          error: fallbackError,
          turns,
          usage: streamed(),
          ...(lastText ? { result: lastText } : {}),
          ...(sessionId ? { sessionId } : {}),
        }
      );
    },
  };
}
