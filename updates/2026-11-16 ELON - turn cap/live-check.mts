/* Live check of limit carry-on (runtime/limits.ts): the REAL Claude Code CLI, a tiny step cap, a throwaway studio.
   Scenario "progress": a build that needs ~3x the cap and commits as it goes → must carry on and succeed as ONE run.
   Scenario "stall": a build that never commits → must stop after MAX_STALLS sessions with the "stuck" wording.
   Run from server/: npx tsx "../updates/2026-11-16 ELON - turn cap/live-check.ts" <progress|stall> <cap> */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, secretValuesOf } from '../../server/src/app.ts';
import { ensureDirs } from '../../server/src/config.ts';
import { openDb } from '../../server/src/db/connection.ts';
import { createStore } from '../../server/src/db/store.ts';
import { createBus } from '../../server/src/events/bus.ts';
import { eventLog } from '../../server/src/events/log.ts';
import { claudeCliRunner, shellAllowed, shellHookCommand } from '../../server/src/runtime/claude-cli.ts';
import { AGENT_SHELL, loadCaps, loadRuntimeConfig } from '../../server/src/runtime/config.ts';
import type { Runner, RunOutcome } from '../../server/src/runtime/runner.ts';
import type { Runtime } from '../../server/src/runtime/service.ts';
import { ASK_TOOL } from '../../server/src/runtime/stream.ts';
import { fileSecretStore } from '../../server/src/secrets/secretStore.ts';
import { seedIfNeeded } from '../../server/src/seed.ts';
import { plainProblem } from '../../server/src/whiteboard/plain-problem.ts';
import { writeModules } from '../../server/test/helpers.ts';

const [scenario = 'progress', capArg = '12'] = process.argv.slice(2);
const cap = Number(capArg);
const root = realpathSync(mkdtempSync(join(tmpdir(), 'ais-live-cap-')));
const config = {
  home: join(root, 'home'),
  sandbox: join(root, 'sandbox'),
  controlHome: join(root, 'control'),
  dbPath: join(root, 'studio.db'),
  port: 0,
  host: '127.0.0.1',
};
ensureDirs(config);
writeModules(config.controlHome);
const db = openDb(config.dbPath);
const store = createStore(db, { sandbox: config.sandbox });
seedIfNeeded(store);
const secrets = fileSecretStore(join(config.controlHome, '.env'));
const events = eventLog(db, createBus(), secretValuesOf(secrets));

const rt = loadRuntimeConfig();
if (!rt.claudeBin) throw new Error(rt.binError);
const srv = join(import.meta.dirname, '..', '..', 'server', 'src');
const shell = AGENT_SHELL.dev;
const real = claudeCliRunner({
  bin: rt.claudeBin,
  askServer: join(srv, 'mcp', 'ask-server.ts'),
  logDir: join(config.home, 'runs'),
  allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', ...shellAllowed(shell), ASK_TOOL],
  shellHook: shellHookCommand(join(srv, 'runtime', 'shell-hook.ts'), shell),
  nudgeHook: shellHookCommand(join(srv, 'runtime', 'nudge-hook.ts'), []),
});
/* a tap: every session the runtime starts, and how each one ended (the per-session cost, to check the sum) */
const sessions: { runId: string; sessionId?: string; task: string; outcome?: RunOutcome }[] = [];
const runner: Runner = {
  ...real,
  start(spec, io) {
    const s = { runId: spec.runId, sessionId: spec.sessionId, task: spec.task };
    sessions.push(s);
    console.log(`[session ${sessions.length}] started (session id ${spec.sessionId ?? '-'})`);
    const h = real.start(spec, io);
    void h.done.then((o) => {
      (s as { outcome?: RunOutcome }).outcome = o;
      console.log(`[session ${sessions.indexOf(s) + 1}] ended`, o.status, o.error ?? '', `turns=${o.turns}`, `cost=${o.costUsd}`);
    });
    return h;
  },
};

let runtime: Runtime | undefined;
const caps = loadCaps({ AI_STUDIO_AGENT_TURNS: String(cap) });
const app = buildApp({
  config,
  db,
  store,
  secrets,
  events,
  runner,
  model: rt.model,
  shell,
  caps,
  onRuntime: (r) => {
    runtime = r;
  },
});
await app.ready();
const statuses: string[] = [];
events.bus.subscribeAll((e) => {
  const label = (e.payload as { activity?: { label?: string } } | undefined)?.activity?.label;
  if (e.type === 'agent.status' && label) statuses.push(label);
});

/* the project: a real git repo; HEAD is the progress mark */
const dir = join(config.sandbox, 'aurora');
mkdirSync(dir);
const git = (...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
writeFileSync(join(dir, 'README.md'), '# Aurora\n');
/* a chain: each file names the next (random names), so the reads can't be batched — one step per file */
const names = Array.from({ length: 31 }, (_, i) => (i === 0 ? 'data1.txt' : `n${Math.random().toString(36).slice(2, 8)}.txt`));
for (let i = 0; i < 30; i++)
  writeFileSync(join(dir, names[i] as string), i === 29 ? 'value 30. End of chain.\n' : `value ${i + 1}. Next: ${names[i + 1]}\n`);
git('init', '-q');
git('add', '.');
git('commit', '-qm', 'start');
store.projects.update('aurora', { folder: 'aurora' });

const TASKS: Record<string, string> = {
  progress: [
    'Create 10 files, steps/01.txt through steps/10.txt, ONE AT A TIME. Each file holds one line: its number in words.',
    'After each single file: run `git add <that file>` as one command, then `git commit -m "step NN"` as another command.',
    'Do not batch: one Write, one git add, one git commit per file. Use `ls steps` (or `git log --oneline`) first to see which are done.',
    'When all 10 are committed, reply with exactly: DONE-10.',
  ].join('\n'),
  stall: [
    'Audit task, READ-ONLY: start with `cat data1.txt`. Each file holds a value and names the next file; follow the chain with `cat`, one file per step, until "End of chain".',
    'Do not list or search the folder — follow the chain only. Never write, edit or commit anything; the folder must stay unchanged.',
    'At the end, reply with the sum of all values.',
  ].join('\n'),
};
const t0 = Date.now();
const started = (runtime as Runtime).start('aurora', {
  agentId: 'a-pete',
  task: TASKS[scenario] as string,
  kind: 'building',
});
const run = await (runtime as Runtime).settled(started.id);
const mins = ((Date.now() - t0) / 60000).toFixed(1);

const rows = db.prepare('SELECT id, status, turns, cost_usd, error, result, session_id FROM runs').all();
const sys = db
  .prepare(`SELECT seq, text, meta FROM chat_messages WHERE run_id = ? AND role = 'system' ORDER BY seq`)
  .all(started.id) as { seq: number; text: string; meta: string }[];
const sumCost = sessions.reduce((a, s) => a + (s.outcome?.costUsd ?? 0), 0);
const sumTurns = sessions.reduce((a, s) => a + (s.outcome?.turns ?? 0), 0);
console.log('\n===== RESULT', scenario, `cap=${cap}`, `${mins} min`);
console.log('run:', JSON.stringify({ status: run.status, turns: run.turns, costUsd: run.costUsd, error: run.error, result: run.result }));
console.log('runs rows:', JSON.stringify(rows));
console.log('sessions:', sessions.length, 'distinct runIds:', new Set(sessions.map((s) => s.runId)).size);
console.log('sum of session turns:', sumTurns, 'sum of session cost:', sumCost.toFixed(4));
console.log('activity labels:', JSON.stringify([...new Set(statuses)]));
console.log('system chat lines:');
for (const m of sys) console.log(`  #${m.seq} [${JSON.parse(m.meta ?? 'null')?.kind}] ${m.text.slice(0, 200).replace(/\n/g, ' ⏎ ')}`);
console.log('git log:\n' + git('log', '--oneline'));
const board = run.status === 'failed' ? plainProblem('failed', run.error ?? null) : null;
console.log('board wording if this were a checklist item:', JSON.stringify(board));
if (sessions[1]) console.log('2nd session brief:\n' + sessions[1].task.slice(0, 1500));
await app.close();
db.close();
console.log('studio home kept at', root);
