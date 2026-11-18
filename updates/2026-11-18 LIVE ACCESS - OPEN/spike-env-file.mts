/* Spike: how can a running `claude -p` (spawned exactly as the studio does, --restricted) pick up an access that
   is granted AFTER it started? The agent waits ~10s in one command, then reads the value in a second one; 4s in,
   we write the access.
     mode 'env-file'  → write CLAUDE_ENV_FILE mid-run; read $SPIKE_ACCESS            (result: UNSET — read once)
     mode 'before'    → CLAUDE_ENV_FILE written before start (control)              (result: read-at-start)
     mode 'dotenv'    → write <cwd>/.env mid-run; read with `node --env-file=.env`  (result: live-pickup-works)
   Run: npx --prefix server tsx "updates/2026-11-18 LIVE ACCESS - OPEN/spike-env-file.mts" <mode> */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeCliRunner } from '../../server/src/runtime/claude-cli.ts';
import { resolveClaudeBin } from '../../server/src/runtime/config.ts';
import { runEnv } from '../../server/src/runtime/env.ts';

const mode = process.argv[2] ?? 'env-file';
const dir = mkdtempSync(join(tmpdir(), 'envfile-spike-'));
const envFile = join(dir, 'access.sh');
writeFileSync(envFile, mode === 'before' ? "export SPIKE_ACCESS='read-at-start'\n" : '', { mode: 0o600 });
const read =
  mode === 'dotenv'
    ? `node --env-file-if-exists=.env -e "console.log(process.env.SPIKE_ACCESS ?? 'UNSET')"`
    : `node -e "console.log(process.env.SPIKE_ACCESS ?? 'UNSET')"`;
const runner = claudeCliRunner({ bin: resolveClaudeBin(), askServer: '/nonexistent' });
const h = runner.start(
  {
    runId: crypto.randomUUID(),
    cwd: dir,
    systemPrompt: 'You are a test agent. Do exactly what you are told.',
    task: `Step 1: run the bash command \`node -e "setTimeout(()=>{},10000)"\`. Step 2: then run the bash command \`${read}\`. Reply with only the output of step 2.`,
    model: 'claude-haiku-5-5',
    caps: { maxTurns: 6, maxBudgetUsd: 0.5 },
    env: runEnv(process.env, {}, { CLAUDE_ENV_FILE: envFile }),
    secretValues: [],
  },
  { emit: (e) => console.log('event', JSON.stringify(e).slice(0, 200)), ask: async () => 'no' },
);
if (mode === 'env-file')
  setTimeout(() => writeFileSync(envFile, "export SPIKE_ACCESS='live-pickup-works'\n"), 4000);
if (mode === 'dotenv')
  setTimeout(() => writeFileSync(join(dir, '.env'), 'SPIKE_ACCESS=live-pickup-works\n', { mode: 0o600 }), 4000);
const o = await h.done;
console.log('OUTCOME', o.status, JSON.stringify(o.result), o.error ?? '');
