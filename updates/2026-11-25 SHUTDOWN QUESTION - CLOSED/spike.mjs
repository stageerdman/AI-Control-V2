/* Shutdown spike: what really happens to the studio's backend on a normal quit vs a hard kill.
   Runs a throwaway backend (fake runner, temp data dir) started the way the Mac app starts it (own process group).
   Usage: node spike.mjs <server dir> <port> */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [serverDir, port] = process.argv.slice(2);
const home = mkdtempSync(join(tmpdir(), 'shutdown-spike-'));
const lock = join(home, 'server.lock');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function start() {
  const child = spawn('npm', ['--prefix', serverDir, 'start'], {
    env: { ...process.env, PORT: port, AI_STUDIO_HOME: home, AI_STUDIO_RUNNER: 'fake', AI_STUDIO_SELF_INSTALL: '0' },
    detached: true,
    stdio: 'ignore',
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 30_000) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { child, bootMs: Date.now() - t0 };
    } catch {}
    await wait(200);
  }
  throw new Error('backend did not answer');
}
const groupAlive = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

/* A: normal quit — SIGTERM to the group (what the app does first) */
let s = await start();
console.log(`A boot: ${s.bootMs} ms, lock present: ${existsSync(lock)}`);
process.kill(-s.child.pid, 'SIGTERM');
const t0 = Date.now();
while (groupAlive(s.child.pid) && Date.now() - t0 < 20_000) await wait(25);
console.log(`A normal quit: whole group gone after ${Date.now() - t0} ms (app allows 3000), lock left behind: ${existsSync(lock)}`);

/* B: hard kill — SIGKILL (no clean-up runs), then start again */
s = await start();
process.kill(-s.child.pid, 'SIGKILL');
await wait(500);
console.log(`B hard kill: lock left behind (stale): ${existsSync(lock)}`);
s = await start();
console.log(`B next launch over a stale lock: answered after ${s.bootMs} ms`);
process.kill(-s.child.pid, 'SIGTERM');
while (groupAlive(s.child.pid)) await wait(25);

/* C: an agent-like child in its own process group (how agent CLIs are started) when its parent is hard-killed */
const parent = spawn(
  process.execPath,
  [
    '-e',
    "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)",
  ],
  { stdio: ['ignore', 'pipe', 'ignore'] },
);
const agentPid = await new Promise((r) => parent.stdout.once('data', (d) => r(Number(String(d).trim()))));
process.kill(parent.pid, 'SIGKILL');
await wait(1000);
console.log(`C parent hard-killed: agent-like child still running: ${alive(agentPid)}`);
if (alive(agentPid)) process.kill(-agentPid, 'SIGKILL');

rmSync(home, { recursive: true, force: true });
