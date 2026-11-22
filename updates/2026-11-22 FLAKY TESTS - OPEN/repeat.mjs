// Runs `vitest run <args>` N times in a row from server/, keeps each failing run's output.
// usage: node "updates/2026-11-22 FLAKY TESTS - OPEN/repeat.mjs" <times> [vitest args…]
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, '..', '..', 'server');
const [times = '1', ...args] = process.argv.slice(2);
const logs = join(here, 'logs');
mkdirSync(logs, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const results = [];
for (let i = 1; i <= Number(times); i++) {
  const t = Date.now();
  const r = spawnSync('npx', ['vitest', 'run', '--reporter=dot', ...args], {
    cwd: server,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const out = `${r.stdout}\n${r.stderr}`;
  const ok = r.status === 0 && !/Unhandled (Errors|Rejection)/.test(out);
  const secs = Math.round((Date.now() - t) / 1000);
  results.push(ok);
  console.log(`run ${i}: ${ok ? 'pass' : 'FAIL'} (${secs}s)`);
  if (!ok) {
    const file = join(logs, `${stamp}-run${i}.log`);
    writeFileSync(file, out);
    const lines = out.split('\n').filter((l) => /FAIL |Error:|originated in|latest test/.test(l));
    console.log(lines.slice(0, 30).join('\n'));
  }
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
