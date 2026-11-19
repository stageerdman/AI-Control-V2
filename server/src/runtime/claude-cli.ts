/* ClaudeCliRunner: one headless `claude -p` process per run, stream-json both ways.
   Isolation: spawned directly (no shell → no aliases), its own process group (cancel
   kills everything it started), env built from scratch, `--restricted` (no user/project
   settings → no personal plugins or hooks; file tools confined to cwd), only OUR MCP
   server (`--strict-mcp-config`), no skills/slash commands, no Chrome. */
import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { redactSecrets } from '../events/redact.ts';
import { stopTree } from '../running/processes.ts';
import { AGENT_SHELL } from './config.ts';
import { turnCapError } from './limits.ts';
import type { RunHandle, RunIO, Runner, RunOutcome, RunSpec } from './runner.ts';
import { ASK_TOOL, createStreamParser, REPORT_TOOL, studioTool } from './stream.ts';

export const TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];
/** Pre-approved patterns for a shell allow-list (`Bash(npm *)`…); everything else is denied (dontAsk). */
export const shellAllowed = (commands: readonly string[]) =>
  commands.flatMap((c) => (c === 'pwd' ? ['Bash(pwd)'] : [`Bash(${c})`, `Bash(${c} *)`]));
/** Pre-approved by default; everything else is denied (dontAsk). Bash: the dev shell (src/runtime/config.ts). */
export const DEFAULT_ALLOWED = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  ...shellAllowed(AGENT_SHELL.dev),
  ASK_TOOL,
];
/** Agents never push (G1: projects have a GitHub origin now) — deny rules beat any allow. The studio pushes. */
export const DENIED = ['Bash(git push)', 'Bash(git push *)'];
/** Reporter runs research the web (read-only). */
export const WEB_TOOLS = ['WebSearch', 'WebFetch'];
const KILL_GRACE_MS = 3000;
/** After the answer (result line + stdin closed) the CLI normally exits at once; one that lingers is waiting on a
    command its agent left running in the background (`npm start` with run_in_background, no timeout) — F3 live: the
    item sat "running" forever. Past this grace the whole group is stopped; the answer stands. */
const AFTER_RESULT_MS = 10_000;

export type CliOptions = {
  bin: string;
  /** Absolute path of src/mcp/ask-server.ts (run by this node). */
  askServer: string;
  node?: string;
  /** Raw (redacted) stream log per run, for debugging and fixtures. */
  logDir?: string;
  allowedTools?: string[];
  /** G1: the PreToolUse hook command that approves setting-prefixed commands (`PORT=… node …`); see shell-hook.ts. */
  shellHook?: string;
  /** STUDIO LIFE: the PostToolUse hook command that nudges a full run to forget (nudge-hook.ts). */
  nudgeHook?: string;
  /** How long the CLI may linger after its answer before its process group is stopped (tests shorten it). */
  afterResultMs?: number;
};

export function cliArgs(
  spec: RunSpec,
  opts: Pick<CliOptions, 'askServer' | 'node' | 'allowedTools' | 'shellHook' | 'nudgeHook'>,
): string[] {
  const remote = spec.studioTools?.remote;
  const mcp =
    spec.askBridge || remote
      ? {
          mcpServers: {
            studio: {
              type: 'stdio',
              command: opts.node ?? process.execPath,
              args: [opts.askServer],
              env: {
                ...(spec.askBridge
                  ? {
                      AI_STUDIO_ASK_URL: spec.askBridge.url,
                      AI_STUDIO_RUN_TOKEN: spec.askBridge.token,
                      /* reporter runs only: the server then also lists file_report */
                      ...(spec.askBridge.reportUrl ? { AI_STUDIO_REPORT_URL: spec.askBridge.reportUrl } : {}),
                    }
                  : {}),
                /* the bridge's tools (room, call_agent, the Agent Creator's create_*) */
                ...(remote ? { AI_STUDIO_TOOLS_URL: remote.url, AI_STUDIO_TOOLS_TOKEN: remote.token } : {}),
              },
            },
          },
        }
      : { mcpServers: {} };
  const studio = remote ? (spec.studioTools?.names ?? []).map(studioTool) : [];
  /* big-picture runs (orchestrator, Agent Creator) pass their own, usually empty, tool list */
  const web = spec.web ? WEB_TOOLS : [];
  const tools = [...(spec.tools ?? TOOLS), ...web];
  const report = spec.askBridge?.reportUrl ? [REPORT_TOOL] : [];
  const allowed = spec.tools
    ? [
        ...(spec.allowedTools ?? spec.tools),
        ...(spec.askBridge ? [ASK_TOOL] : []),
        ...report,
        ...web,
        ...studio,
      ]
    : [...(opts.allowedTools ?? DEFAULT_ALLOWED), ...report, ...web, ...studio];
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--model',
    spec.model,
    ...(spec.effort ? ['--effort', spec.effort] : []),
    '--append-system-prompt',
    spec.systemPrompt,
    '--restricted',
    '--tools',
    tools.join(','), // '' disables every built-in tool
    ...(allowed.length ? ['--allowed-tools', allowed.join(',')] : []),
    ...(tools.includes('Bash') ? ['--disallowed-tools', DENIED.join(',')] : []),
    ...(() => {
      const shell =
        tools.includes('Bash') && opts.shellHook && (!spec.tools || spec.fullShell) ? opts.shellHook : null;
      const nudge = opts.nudgeHook && spec.env.AI_STUDIO_NUDGE_URL ? opts.nudgeHook : null;
      return shell || nudge ? ['--settings', JSON.stringify(hookSettings(shell, nudge))] : [];
    })(),
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify(mcp),
    ...(spec.addDirs ?? []).flatMap((d) => ['--add-dir', d]),
    '--disable-slash-commands',
    '--no-chrome',
    '--max-budget-usd',
    String(spec.caps.maxBudgetUsd),
    ...(spec.resumeSessionId
      ? ['--resume', spec.resumeSessionId]
      : ['--session-id', spec.sessionId ?? spec.runId]),
  ];
}

/** `--settings` for the setting-prefix hook (restricted mode still applies --settings). */
export const shellHookSettings = (command: string) => hookSettings(command, null);
/** The run's hooks: the shell's PreToolUse (setting prefixes) and the forget nudge's PostToolUse. */
export const hookSettings = (shell: string | null, nudge: string | null) => ({
  hooks: {
    ...(shell
      ? { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: shell, timeout: 10 }] }] }
      : {}),
    ...(nudge
      ? { PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: nudge, timeout: 5 }] }] }
      : {}),
  },
});
/** The hook's command line: this node + shell-hook.ts + the allowed commands. */
export const shellHookCommand = (hookScript: string, allowed: readonly string[], node = process.execPath) =>
  [node, hookScript, allowed.join(',')].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');

/** Stop the CLI and everything it started (its group + children that made their own). */
function stopAll(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  stopTree(child.pid, KILL_GRACE_MS);
}
/** The CLI is gone: a command it left running in its group (a server never stopped) goes with it. */
function sweepLeftovers(child: ChildProcess) {
  if (child.pid !== undefined) stopTree(child.pid, KILL_GRACE_MS);
}

export function claudeCliRunner(opts: CliOptions): Runner {
  return {
    name: 'claude-cli',
    start(spec: RunSpec, io: RunIO): RunHandle {
      const parser = createStreamParser(spec.secretValues);
      const child = spawn(opts.bin, cliArgs(spec, opts), {
        cwd: spec.cwd,
        env: { ...spec.env, MCP_TOOL_TIMEOUT: String(24 * 3600 * 1000) },
        detached: true, // own process group → cancel reaches grandchildren
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const logFile = opts.logDir ? join(opts.logDir, `${spec.runId}.jsonl`) : null;
      if (opts.logDir) mkdirSync(opts.logDir, { recursive: true });
      let stopReason: { status: 'cancelled' | 'failed'; error?: string } | null = null;
      let stderr = '';
      const stop = (reason: NonNullable<typeof stopReason>) => {
        if (stopReason) return;
        stopReason = reason;
        stopAll(child);
      };

      child.stdin.on('error', () => {}); // the CLI may exit before reading
      child.stdin.write(
        `${JSON.stringify({ type: 'user', message: { role: 'user', content: spec.task } })}\n`,
      );
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d: string) => {
        stderr = (stderr + d).slice(-4000);
      });
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        if (logFile) appendFileSync(logFile, `${redactSecrets(line, spec.secretValues).value}\n`);
        for (const e of parser.feed(line)) io.emit(e);
        if (parser.finished() && !child.stdin.writableEnded) {
          child.stdin.end(); // one task per run: let it exit
          /* still here: it waits on a leftover background command */
          setTimeout(() => stopAll(child), opts.afterResultMs ?? AFTER_RESULT_MS).unref();
        }
        if (parser.turns() > spec.caps.maxTurns)
          stop({ status: 'failed', error: turnCapError(spec.caps.maxTurns) });
      });

      const done = new Promise<RunOutcome>((resolve) => {
        child.on('error', (err) => {
          stopReason ??= { status: 'failed', error: `Could not start Claude Code: ${err.message}` };
        });
        child.on('close', (code, signal) => {
          sweepLeftovers(child);
          const fallback = `Claude Code exited (${signal ?? `code ${code}`})${stderr.trim() ? `: ${redactSecrets(stderr.trim(), spec.secretValues).value.slice(-500)}` : ''}`;
          const o = parser.outcome(fallback);
          resolve(
            stopReason
              ? { ...o, status: stopReason.status, ...(stopReason.error ? { error: stopReason.error } : {}) }
              : o,
          );
        });
      });
      return {
        done,
        cancel: () => stop({ status: 'cancelled' }),
        ...(child.pid === undefined ? {} : { pid: child.pid }),
      };
    },
  };
}
