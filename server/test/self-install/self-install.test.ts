/* Self-install: merges into AI Studio's own project (and only those) run the installer, one at a time,
   with merges that land meanwhile folded into a single extra run. */
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Store } from '../../src/db/store.ts';
import { createBus, type StoredEvent } from '../../src/events/bus.ts';
import { createSelfInstall, installedBehind, markerFile, studioProject } from '../../src/self-install/self-install.ts';

const merged = (scopeId: string, type = 'item.merged'): StoredEvent => ({
  id: 1,
  scope: 'project',
  scopeId,
  type,
  payload: {},
  at: '',
});

function harness(exitCode: number | Error = 0, isBehind: () => boolean = () => false) {
  const bus = createBus();
  const logs: string[] = [];
  let runs = 0;
  let finish: () => void = () => {};
  const install = () => {
    runs++;
    return new Promise<number | null>((resolve, reject) => {
      finish = () => (exitCode instanceof Error ? reject(exitCode) : resolve(exitCode));
    });
  };
  const log = { info: (_: object, m: string) => logs.push(m), error: (_: object, m: string) => logs.push(m) };
  const si = createSelfInstall({ bus, isStudio: (id) => id === 'p-studio', isBehind, install, log });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { bus, si, logs, runs: () => runs, finish: () => finish(), tick };
}

describe('self-install', () => {
  it('runs on a merge into AI Studio only, never for other projects or other events', async () => {
    const h = harness();
    h.bus.publish(merged('p-other'));
    h.bus.publish(merged('p-studio', 'item.done'));
    expect(h.runs()).toBe(0);
    h.bus.publish(merged('p-studio'));
    expect(h.runs()).toBe(1);
    h.finish();
    await h.tick();
    expect(h.logs).toEqual(['Installed the newest AI Studio build']);
  });

  it('folds merges during an install into one more run', async () => {
    const h = harness();
    h.bus.publish(merged('p-studio'));
    h.bus.publish(merged('p-studio'));
    h.bus.publish(merged('p-studio'));
    expect(h.runs()).toBe(1);
    h.finish();
    await h.tick();
    expect(h.runs()).toBe(2);
    h.finish();
    await h.tick();
    expect(h.runs()).toBe(2);
  });

  it('a failed or unstartable install is logged and the next merge still installs', async () => {
    const failed = harness(1);
    failed.bus.publish(merged('p-studio'));
    failed.finish();
    await failed.tick();
    expect(failed.logs[0]).toMatch(/failed/);

    const broken = harness(new Error('spawn ENOENT'));
    broken.bus.publish(merged('p-studio'));
    broken.finish();
    await broken.tick();
    expect(broken.logs[0]).toMatch(/Could not start/);
    broken.bus.publish(merged('p-studio'));
    expect(broken.runs()).toBe(2);
  });

  /* the bug: merges landed before any backend had the trigger, and a restart alone never installed */
  it('catches up on start when the installed app is behind, and only then', async () => {
    expect(harness(0, () => false).runs()).toBe(0);
    const h = harness(0, () => true);
    expect(h.runs()).toBe(1);
    h.bus.publish(merged('p-studio')); // a merge during the catch-up folds into one more run
    h.finish();
    await h.tick();
    expect(h.runs()).toBe(2);
  });

  it('a failing staleness check is logged and never stops the backend', () => {
    const h = harness(0, () => {
      throw new Error('git: not a repository');
    });
    expect(h.runs()).toBe(0);
    expect(h.logs[0]).toMatch(/Could not tell/);
  });

  it('the installed app is behind without a marker, with a torn one, or on another commit', () => {
    const dir = join(tmpdir(), `ais-marker-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const file = markerFile(dir);
    const behind = installedBehind(file, () => 'abc');
    rmSync(file, { force: true });
    expect(behind()).toBe(true);
    writeFileSync(file, '{"comm');
    expect(behind()).toBe(true);
    writeFileSync(file, JSON.stringify({ commit: 'old' }));
    expect(behind()).toBe(true);
    writeFileSync(file, JSON.stringify({ commit: 'abc' }));
    expect(behind()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('stop() unsubscribes', () => {
    const h = harness();
    h.si.stop();
    h.bus.publish(merged('p-studio'));
    expect(h.runs()).toBe(0);
  });

  it('recognizes the project whose folder is this checkout, through symlinks too', () => {
    const root = join(tmpdir(), `ais-self-${process.pid}`);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, 'sandbox', 'AI-Control-V2'), { recursive: true });
    mkdirSync(join(root, 'sandbox', 'other'));
    symlinkSync(join(root, 'sandbox', 'AI-Control-V2'), join(root, 'link'));
    const folders: Record<string, string> = { a: 'AI-Control-V2', b: 'other', c: '/etc' };
    const store = { projects: { get: (id: string) => ({ folder: folders[id] }) } } as unknown as Store;
    const isStudio = studioProject(store, join(root, 'sandbox'), join(root, 'link'));
    expect([isStudio('a'), isStudio('b'), isStudio('c'), isStudio('none')]).toEqual([true, false, false, false]);
    rmSync(root, { recursive: true, force: true });
  });
});
