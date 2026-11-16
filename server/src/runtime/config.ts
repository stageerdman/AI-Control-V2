/* Runtime settings: which Claude Code binary, which model. The binary is resolved to a
   real file path and spawned directly — never through a shell, so shell aliases (e.g. a
   personal `--plugin-dir`) never apply to agent runs. */
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/* Turn caps: real work needs room (B6 live: 8 turns were too tight for read → write → status → commit).
   Budgets are the CLI's API-equivalent size cap (`--max-budget-usd`); runs use the Claude Code subscription, nothing is charged. */
/** An agent's run (a checklist item, a chat turn with an agent) — per session: a build that reaches it carries
    on in a fresh session while it keeps committing (runtime/limits.ts). */
export const DEFAULT_CAPS = { maxTurns: 120, maxBudgetUsd: 10 };
/** A reviewer's run at a collaboration gate. */
export const REVIEW_CAPS = { maxTurns: 15, maxBudgetUsd: 5 };
/** The orchestrator / Agent Creator (big picture, no tools): plans, designs, office chat. */
export const ORCHESTRATOR_CAPS = { maxTurns: 6, maxBudgetUsd: 2 };
export type StudioCaps = {
  agent: typeof DEFAULT_CAPS;
  review: typeof REVIEW_CAPS;
  orchestrator: typeof ORCHESTRATOR_CAPS;
};

/** Defaults, with turn caps overridable: AI_STUDIO_AGENT_TURNS, AI_STUDIO_REVIEW_TURNS, AI_STUDIO_ORCHESTRATOR_TURNS (1–200). */
export function loadCaps(env: NodeJS.ProcessEnv = process.env): StudioCaps {
  const turns = (name: string, fallback: number) => {
    const n = Number(env[name]);
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : fallback;
  };
  return {
    agent: { ...DEFAULT_CAPS, maxTurns: turns('AI_STUDIO_AGENT_TURNS', DEFAULT_CAPS.maxTurns) },
    review: { ...REVIEW_CAPS, maxTurns: turns('AI_STUDIO_REVIEW_TURNS', REVIEW_CAPS.maxTurns) },
    orchestrator: {
      ...ORCHESTRATOR_CAPS,
      maxTurns: turns('AI_STUDIO_ORCHESTRATOR_TURNS', ORCHESTRATOR_CAPS.maxTurns),
    },
  };
}

const executable = (p: string) => {
  try {
    accessSync(p, constants.X_OK);
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

export function claudeCandidates(home = homedir()): string[] {
  return [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    join(home, '.claude/local/claude'),
    join(home, '.local/bin/claude'),
  ];
}

/** Configured path (must be absolute + executable) or the first known install location. */
export function resolveClaudeBin(configured?: string, candidates = claudeCandidates()): string {
  if (configured) {
    if (!isAbsolute(configured))
      throw new Error(`AI_STUDIO_CLAUDE_BIN must be an absolute path, got '${configured}'`);
    if (!executable(configured))
      throw new Error(`AI_STUDIO_CLAUDE_BIN is not an executable file: ${configured}`);
    return realpathSync(configured);
  }
  const hit = candidates.find(executable);
  if (!hit)
    throw new Error(
      `Claude Code CLI not found (looked in ${candidates.join(', ')}); set AI_STUDIO_CLAUDE_BIN`,
    );
  return realpathSync(hit);
}

export type RuntimeConfig = { claudeBin: string | null; model: string };

/** Never throws: a missing CLI only matters when someone starts a live run. */
export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig & { binError?: string } {
  const model = env.AI_STUDIO_MODEL?.trim() || DEFAULT_MODEL;
  try {
    return { claudeBin: resolveClaudeBin(env.AI_STUDIO_CLAUDE_BIN?.trim() || undefined), model };
  } catch (e) {
    return { claudeBin: null, model, binError: (e as Error).message };
  }
}

/** Shell commands an agent run may use (one plain command at a time; anything else is refused).
    `dev` (default) adds what building a real app needs — make folders, install and run JS tooling and tests;
    `safe` keeps B5's read-only shell + git. AI_STUDIO_AGENT_SHELL=safe|dev. */
export const AGENT_SHELL = {
  safe: ['git', 'ls', 'cat', 'pwd'],
  dev: ['git', 'ls', 'cat', 'pwd', 'mkdir', 'npm', 'npx', 'node'],
} as const;
export const loadShell = (env: NodeJS.ProcessEnv = process.env): readonly string[] =>
  env.AI_STUDIO_AGENT_SHELL?.trim() === 'safe' ? AGENT_SHELL.safe : AGENT_SHELL.dev;
