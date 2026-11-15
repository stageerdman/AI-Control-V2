/* The clean-up against a planted Mac: real folders with old copies in a temp dir, the real discovery and
   Trash moves; only the build, Spotlight, Launch Services and git are stand-ins. */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findCopies } from '../install-mac/copies.mjs';
import { runClean } from './flow.mjs';
import { moveToTrash } from './trash.mjs';

const BUNDLE_ID = 'xyz.erdman.aistudio';
const plant = (path, body = 'old') => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
};
const app = (dir, name = 'AI Studio.app', body = 'old') => plant(join(dir, name, 'Contents', 'Info.plist'), body);

let root;
afterEach(() => rmSync(root, { recursive: true, force: true }));

function plantedMac({ latest = 'c0ffee1234567' } = {}) {
  root = mkdtempSync(join(tmpdir(), 'clean-mac-'));
  const r = (...p) => join(root, ...p);
  const target = r('Applications', 'AI Studio.app');
  app(r('Applications'));
  app(r('Applications'), 'Visual Studio Code.app', 'keep');
  app(r('home', 'Applications'), 'AI Studio 2.app');
  plant(r('home', 'Downloads', 'AI Studio_0.1.0_aarch64.dmg'));
  plant(r('home', 'Downloads', 'notes.txt'), 'keep');
  plant(r('target', 'release', 'bundle', 'dmg', 'AI Studio_0.1.0_aarch64.dmg'));
  app(r('Volumes', 'AI Studio'));
  app(r('home', '.Trash'), 'AI Studio.app', 'already trashed');
  app(r('elsewhere'), 'Renamed.app'); // only Spotlight knows it, by bundle id

  const registered = new Set([target, r('old', 'AI Studio.app')]); // the second is a ghost: no file
  const lookups = {
    spotlight: (q) => (q.includes(BUNDLE_ID) ? [r('elsewhere', 'Renamed.app'), target].filter(existsSync) : []),
    launchServices: () =>
      [...registered].map((p) => `path:   ${p} (0x1)\nidentifier:   ${BUNDLE_ID}`).join('\n----------------\n'),
  };
  const places = {
    folders: [r('Applications'), r('home', 'Applications'), r('home', 'Downloads')],
    buildDirs: [r('target', 'release', 'bundle', 'macos'), r('target', 'release', 'bundle', 'dmg')],
    volumes: r('Volumes'),
    trash: r('home', '.Trash'),
  };
  const did = [];
  const steps = {
    checkCheckout: () => {},
    isOpen: () => false,
    checkToolchain: () => {},
    ensureDeps: () => {},
    build: () => {
      const out = r('target', 'release', 'bundle', 'macos');
      app(out, 'AI Studio.app', 'new');
      return join(out, 'AI Studio.app');
    },
    install: (bundle, to) => renameSync(bundle, to),
    register: (p) => registered.add(p),
    writeMarker: (commit) => did.push(`marker ${commit}`),
  };
  const out = [];
  const deps = (answer, extra = {}) => ({
    app: { productName: 'AI Studio', bundleId: BUNDLE_ID, target },
    repo: r('repo'),
    source: {
      state: () => ({ branch: 'master', master: latest, latest, fastForward: false, notes: [] }),
      fastForward: () => {},
      head: () => 'c0ffee1234567',
    },
    steps,
    discover: () => findCopies({ places, productName: 'AI Studio', bundleId: BUNDLE_ID, ...lookups }),
    actions: {
      trash: (p) => moveToTrash(p, places.trash),
      eject: (v) => rmSync(v, { recursive: true }),
      unregister: (p) => registered.delete(p),
    },
    io: { say: (...l) => out.push(...l), ask: async () => answer },
    show: (p) => p.replace(root, ''),
    ...extra,
  });
  return { r, target, deps, out, did };
}

describe('clean-mac', () => {
  it('lists every planted copy, asks, clears them to the Trash and installs the new build: MATCH', async () => {
    const m = plantedMac();
    expect(await runClean(m.deps('yes'))).toBe(0);
    const text = m.out.join('\n');
    expect(text).toMatch(/Found 7 copies/);
    expect(text).toMatch(/\/Applications\/AI Studio\.app\s+app → Trash \(replaced by the new build\)/);
    expect(text).toMatch(/\/Volumes\/AI Studio\s+mounted disk image → eject/);
    expect(text).toMatch(/\/old\/AI Studio\.app\s+Spotlight \/ Launch Services entry/);

    expect(readFileSync(join(m.target, 'Contents', 'Info.plist'), 'utf8')).toBe('new');
    const trash = readdirSync(m.r('home', '.Trash'));
    expect(trash).toHaveLength(6); // 5 moved + the one already there, nothing overwritten
    for (const name of ['AI Studio.app', 'AI Studio 2.app', 'AI Studio_0.1.0_aarch64.dmg', 'Renamed.app'])
      expect(trash).toContain(name);
    expect(trash.filter((n) => /^AI Studio \d.*\.app$/.test(n) && n !== 'AI Studio 2.app')).toHaveLength(1); // old /Applications copy
    expect(trash.filter((n) => /^AI Studio_0\.1\.0_aarch64 .+\.dmg$/.test(n))).toHaveLength(1); // the build's dmg
    expect(readFileSync(m.r('home', '.Trash', 'AI Studio.app', 'Contents', 'Info.plist'), 'utf8')).toBe('already trashed');
    expect(existsSync(m.r('Volumes', 'AI Studio'))).toBe(false);
    expect(existsSync(m.r('home', 'Downloads', 'notes.txt'))).toBe(true);
    expect(existsSync(m.r('Applications', 'Visual Studio Code.app'))).toBe(true);
    expect(m.did).toEqual(['marker c0ffee1234567']);

    expect(text).toMatch(/Built from:\s+c0ffee1/);
    expect(text).toMatch(/Latest master:\s+c0ffee1/);
    expect(text).toMatch(/Result:\s+MATCH/);
    expect(text).toMatch(/Spotlight:\s+lists only .*\/Applications\/AI Studio\.app/);
  });

  it('changes nothing unless the answer is yes, or on a dry run', async () => {
    for (const [answer, extra, code] of [
      ['no', {}, 2],
      ['', {}, 2],
      ['yes', { dryRun: true }, 0],
    ]) {
      const m = plantedMac();
      expect(await runClean(m.deps(answer, extra))).toBe(code);
      expect(m.out.join('\n')).toMatch(/[Nn]othing changed/);
      expect(readFileSync(join(m.target, 'Contents', 'Info.plist'), 'utf8')).toBe('old');
      expect(readdirSync(m.r('home', '.Trash'))).toEqual(['AI Studio.app']);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('says MISMATCH (and exits 1) when the build is not latest master', async () => {
    const m = plantedMac({ latest: 'beef000000000' });
    expect(await runClean(m.deps('yes'))).toBe(1);
    expect(m.out.join('\n')).toMatch(/Result:\s+MISMATCH/);
  });

  it('stops before anything when the app is open or the checkout is off master', async () => {
    const open = plantedMac();
    const d = open.deps('yes');
    await expect(runClean({ ...d, steps: { ...d.steps, isOpen: () => true } })).rejects.toThrow(/Quit it/);
    rmSync(root, { recursive: true, force: true });
    const branch = plantedMac();
    const b = branch.deps('yes');
    const source = { ...b.source, state: () => ({ ...b.source.state(), branch: 'feature' }) };
    await expect(runClean({ ...b, source })).rejects.toThrow(/checkout master/);
    expect(readdirSync(branch.r('home', '.Trash'))).toEqual(['AI Studio.app']);
  });
});
