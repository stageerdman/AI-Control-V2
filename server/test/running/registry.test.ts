import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { type Proc, signal } from '../../src/running/processes.ts';
import { createRunning, type Tracked } from '../../src/running/registry.ts';

const session = (o: Partial<Tracked> = {}): Tracked => ({
  kind: 'session',
  projectId: 'aurora',
  agentId: 'a-pete',
  label: 'Build the cart\nand more lines',
  cancel: () => {},
  ...o,
});
const proc = (pid: number, ppid: number, pgid: number, command: string): Proc => ({
  pid,
  ppid,
  pgid,
  elapsedSec: 10,
  command,
});

describe('the running list', () => {
  it('lists what was added until it ends, filtered by project and agent', () => {
    const r = createRunning({ procs: () => [] });
    const a = r.add(session());
    const b = r.add(session({ projectId: 'atlas' }));
    r.add(session({ agentId: 'a-scar' }));
    expect(r.list()).toHaveLength(3);
    expect(r.list({ projectId: 'aurora' }).map((i) => i.agentId)).toEqual(['a-pete', 'a-scar']);
    expect(r.list({ agentId: 'a-pete' }).map((i) => i.projectId)).toEqual(['aurora', 'atlas']);
    expect(r.list()[0]?.label).toBe('Build the cart');
    a.end();
    a.end(); // idempotent
    b.end();
    expect(r.list({ agentId: 'a-pete' })).toEqual([]);
  });

  it('watch ends the entry however the run ends — done, crashed', async () => {
    const r = createRunning({ procs: () => [] });
    let ok = () => {};
    let crash = (_: Error) => {};
    r.watch(session(), new Promise<void>((res) => (ok = res)));
    r.watch(session(), new Promise<void>((_, rej) => (crash = rej)));
    expect(r.size()).toBe(2);
    ok();
    crash(new Error('boom'));
    await new Promise((x) => setImmediate(x));
    expect(r.size()).toBe(0);
  });

  it("a session's code runs come live from the process table, masked, and vanish when the process does", () => {
    let table = [
      proc(100, 1, 100, 'claude -p'),
      proc(101, 100, 100, 'node server.js --token sk_live_supersecret'),
      proc(300, 1, 300, 'someone else'),
    ];
    const r = createRunning({ procs: () => table, secretValues: () => ['sk_live_supersecret'] });
    const s = r.add(session({ pid: () => 100 }));
    const list = r.list({ agentId: 'a-pete' });
    expect(list.map((i) => [i.kind, i.pid])).toEqual([
      ['session', 100],
      ['code', 101],
    ]);
    expect(list[1]).toMatchObject({ projectId: 'aurora', agentId: 'a-pete', sessionId: s.id });
    expect(list[1]?.label).not.toContain('sk_live_supersecret');
    table = [proc(100, 1, 100, 'claude -p')];
    expect(r.list().map((i) => i.kind)).toEqual(['session']);
  });

  it('cancel uses the source (session/app) or signals the code run; out-of-scope ids are not found', () => {
    const kill = vi.fn(() => true);
    const table = [proc(100, 1, 100, 'claude -p'), proc(101, 100, 100, 'npm test')];
    const r = createRunning({ procs: () => table, kill });
    const cancel = vi.fn();
    const s = r.add(session({ pid: () => 100, cancel }));
    expect(() => r.cancel(s.id, { agentId: 'a-scar' })).toThrow(/not found/);
    expect(() => r.cancel(s.id, { projectId: 'atlas' })).toThrow(/not found/);
    expect(cancel).not.toHaveBeenCalled();
    expect(r.cancel(s.id, { agentId: 'a-pete' }).kind).toBe('session');
    expect(cancel).toHaveBeenCalledOnce();

    const code = r.list().find((i) => i.kind === 'code');
    expect(() => r.cancel(code?.id as string, { agentId: 'a-scar' })).toThrow(/not found/);
    expect(r.cancel(code?.id as string, { agentId: 'a-pete' })).toMatchObject({ kind: 'code', pid: 101 });
    expect(kill).toHaveBeenCalledWith(101, 'SIGTERM');
    expect(kill).not.toHaveBeenCalledWith(100, 'SIGTERM'); // the session itself is left alone
    expect(() => r.cancel('nope')).toThrow(/not found/);
  });

  it('stop hits every matching session and code run, never apps or other projects; one refusal stops nothing else', () => {
    const kill = vi.fn(() => true);
    const table = [proc(100, 1, 100, 'claude -p'), proc(101, 100, 100, 'npm test')];
    const r = createRunning({ procs: () => table, kill });
    const a = vi.fn();
    const other = vi.fn();
    const app = vi.fn();
    r.add(
      session({
        pid: () => 100,
        cancel: () => {
          throw new Error('stuck');
        },
      }),
    );
    r.add(session({ agentId: 'a-scar', cancel: a }));
    r.add(session({ projectId: 'atlas', cancel: other }));
    r.add({ ...session({ agentId: null, cancel: app }), kind: 'app' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const stopped = r.stop({ projectId: 'aurora' });
      expect(stopped.map((i) => [i.kind, i.agentId])).toEqual([
        ['code', 'a-pete'],
        ['session', 'a-scar'],
      ]);
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/could not stop session .* agent a-pete\): stuck/),
      );
    } finally {
      error.mockRestore();
    }
    expect(a).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledWith(101, 'SIGTERM');
    expect(other).not.toHaveBeenCalled();
    expect(app).not.toHaveBeenCalled();
  });

  it('on the real OS: stopping a project leaves nothing of it running, and another project untouched', async () => {
    const spawnSession = () =>
      spawn('/bin/sh', ['-c', 'sleep 30 & wait'], { detached: true, stdio: 'ignore' });
    const here = spawnSession();
    const there = spawnSession();
    const hereExited = new Promise((x) => here.once('exit', x));
    try {
      const r = createRunning();
      r.add(session({ pid: () => here.pid, cancel: () => signal(-(here.pid as number), 'SIGTERM') }));
      r.add(session({ projectId: 'atlas', pid: () => there.pid, cancel: () => {} }));
      const codeIn = (projectId: string) => r.list({ projectId }).filter((i) => i.kind === 'code');
      for (let i = 0; i < 50 && (!codeIn('aurora').length || !codeIn('atlas').length); i++)
        await new Promise((x) => setTimeout(x, 20));
      expect(codeIn('aurora')).toHaveLength(1);

      r.stop({ projectId: 'aurora' });
      for (let i = 0; i < 50 && codeIn('aurora').length; i++) await new Promise((x) => setTimeout(x, 20));
      expect(codeIn('aurora')).toEqual([]);
      await hereExited; // the session's process is gone too
      expect(codeIn('atlas')).toHaveLength(1);
    } finally {
      for (const p of [here, there]) if (p.pid) signal(-p.pid, 'SIGKILL');
    }
  });

  it('on the real OS: a command under a session is listed, and cancelling it stops it', async () => {
    const sh = spawn('/bin/sh', ['-c', 'sleep 30 & wait'], { detached: true, stdio: 'ignore' });
    try {
      const r = createRunning();
      r.add(session({ pid: () => sh.pid }));
      let code = r.list().find((i) => i.kind === 'code');
      for (let i = 0; i < 50 && !code; i++) {
        await new Promise((x) => setTimeout(x, 20));
        code = r.list().find((x) => x.kind === 'code');
      }
      expect(code?.label).toMatch(/sleep 30/);
      r.cancel(code?.id as string);
      let left = r.list().filter((i) => i.kind === 'code');
      for (let i = 0; i < 50 && left.length; i++) {
        await new Promise((x) => setTimeout(x, 20));
        left = r.list().filter((x) => x.kind === 'code');
      }
      expect(left).toEqual([]);
    } finally {
      if (sh.pid) signal(-sh.pid, 'SIGKILL'); // already gone is fine
    }
  });
});
