/* The Runner seam. The runtime service never knows HOW an agent runs — a scripted
   FakeRunner (tests, demos) or the headless Claude Code CLI — only this contract. */

export type Caps = { maxTurns: number; maxBudgetUsd: number };

export type RunSpec = {
  runId: string;
  /** Absolute project folder (already through the sandbox guard). */
  cwd: string;
  /** Appended to Claude Code's system prompt (see compose.ts). */
  systemPrompt: string;
  task: string;
  model: string;
  caps: Caps;
  /** Complete process env (minimal base + granted secrets). Nothing else is inherited. */
  env: Record<string, string>;
  /** Values to scrub from anything the runner reports (the granted secrets). */
  secretValues: readonly string[];
  resumeSessionId?: string;
  /** Built-in tools the run may use (all pre-approved). Omitted → the agent set; [] → none (big-picture runs). */
  tools?: readonly string[];
  /** Pre-approved permission patterns (e.g. `Bash(git log *)`); defaults to `tools`. Ignored without `tools`. */
  allowedTools?: readonly string[];
  /** Where the ask_user MCP tool reaches the backend (CLI runner only). */
  askBridge?: { url: string; token: string };
};

export type Activity = { kind: string; label: string; detail?: string; target?: string };

export type RunEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'activity'; status: 'working' | 'waiting'; activity: Activity }
  | { kind: 'tokens'; input: number; output: number }
  | { kind: 'text'; text: string };

export type RunOutcome = {
  status: 'succeeded' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  sessionId?: string;
  turns: number;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd?: number;
};

export type RunIO = {
  emit: (e: RunEvent) => void;
  /** Ask the user; resolves with their answer (FakeRunner calls it; the CLI reaches it via MCP). */
  ask: (question: string, options?: string[]) => Promise<string>;
};

export type RunHandle = { done: Promise<RunOutcome>; cancel: () => void };

export interface Runner {
  readonly name: string;
  /** Set when this runner can't run (e.g. the CLI isn't installed): starts are refused with it. */
  readonly unavailable?: string;
  start(spec: RunSpec, io: RunIO): RunHandle;
}

export const ZERO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Stand-in when the Claude Code CLI can't be found: every start is refused with the reason. */
export function unavailableRunner(reason: string): Runner {
  return {
    name: 'claude-cli',
    unavailable: reason,
    start() {
      throw new Error(reason);
    },
  };
}
