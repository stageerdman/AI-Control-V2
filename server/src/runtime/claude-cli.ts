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
import type { RunHandle, RunIO, Runner, RunOutcome, RunSpec } from './runner.ts';
import { ASK_TOOL, createStreamParser, REPORT_TOOL } from './stream.ts';

export const TOOLS = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];
/** Pre-approved; everything else is denied (dontAsk). Bash is limited to read-only shell + git. */
export const DEFAULT_ALLOWED = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Bash(git *)',
  'Bash(ls *)',
  'Bash(pwd)',
  'Bash(cat *)',
  ASK_TOOL,
];
const KILL_GRACE_MS = 3000;

export type CliOptions = {
  bin: string;
  /** Absolute path of src/mcp/ask-server.ts (run by this node). */
  askServer: string;
  node?: string;
  /** Raw (redacted) stream log per run, for debugging and fixtures. */
  logDir?: string;
  allowedTools?: string[];
};

export function cliArgs(
  spec: RunSpec,
  opts: Pick<CliOptions, 'askServer' | 'node' | 'allowedTools'>,
): string[] {
  const mcp = spec.askBridge
    ? {
        mcpServers: {
          studio: {
            type: 'stdio',
            command: opts.node ?? process.execPath,
            args: [opts.askServer],
            env: {
              AI_STUDIO_ASK_URL: spec.askBridge.url,
              AI_STUDIO_RUN_TOKEN: spec.askBridge.token,
              /* reporter runs only: the server then also lists file_report */
              ...(spec.askBridge.reportUrl ? { AI_STUDIO_REPORT_URL: spec.askBridge.reportUrl } : {}),
            },
          },
        },
      }
    : { mcpServers: {} };
  /* big-picture runs (orchestrator, Agent Creator) pass their own, usually empty, tool list */
  const tools = spec.tools ?? TOOLS;
  const report = spec.askBridge?.reportUrl ? [REPORT_TOOL] : [];
  const allowed = spec.tools
    ? [...(spec.allowedTools ?? spec.tools), ...(spec.askBridge ? [ASK_TOOL] : []), ...report]
    : [...(opts.allowedTools ?? DEFAULT_ALLOWED), ...report];
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--verbose',
    '--model',
    spec.model,
    '--append-system-prompt',
    spec.systemPrompt,
    '--restricted',
    '--tools',
    tools.join(','), // '' disables every built-in tool
    ...(allowed.length ? ['--allowed-tools', allowed.join(',')] : []),
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    JSON.stringify(mcp),
    '--disable-slash-commands',
    '--no-chrome',
    '--max-budget-usd',
    String(spec.caps.maxBudgetUsd),
    ...(spec.resumeSessionId ? ['--resume', spec.resumeSessionId] : ['--session-id', spec.runId]),
  ];
}

/** Kill the whole process group (the CLI and anything it spawned). */
function killGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
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
        killGroup(child, 'SIGTERM');
        setTimeout(() => killGroup(child, 'SIGKILL'), KILL_GRACE_MS).unref();
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
        if (parser.finished() && !child.stdin.writableEnded) child.stdin.end(); // one task per run: let it exit
        if (parser.turns() > spec.caps.maxTurns)
          stop({ status: 'failed', error: `Stopped: reached the turn cap (${spec.caps.maxTurns})` });
      });

      const done = new Promise<RunOutcome>((resolve) => {
        child.on('error', (err) => {
          stopReason ??= { status: 'failed', error: `Could not start Claude Code: ${err.message}` };
        });
        child.on('close', (code, signal) => {
          const fallback = `Claude Code exited (${signal ?? `code ${code}`})${stderr.trim() ? `: ${redactSecrets(stderr.trim(), spec.secretValues).value.slice(-500)}` : ''}`;
          const o = parser.outcome(fallback);
          resolve(
            stopReason
              ? { ...o, status: stopReason.status, ...(stopReason.error ? { error: stopReason.error } : {}) }
              : o,
          );
        });
      });
      return { done, cancel: () => stop({ status: 'cancelled' }) };
    },
  };
}
