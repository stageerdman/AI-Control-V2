/* Runtime settings: which Claude Code binary, which model. The binary is resolved to a
   real file path and spawned directly — never through a shell, so shell aliases (e.g. a
   personal `--plugin-dir`) never apply to agent runs. */
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_CAPS = { maxTurns: 12, maxBudgetUsd: 1 };

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
