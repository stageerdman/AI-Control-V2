// The Mac install steps (build, move into /Applications, register, record the marker), shared by the
// automatic installer (main.mjs) and the one-command clean-up (../clean-mac). Each caller passes its own
// `log(step, msg, ctx)` and where child output goes, so one prints JSON lines and the other plain words.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPath, freshBundle, installPath, markerPath, needsDeps, targetDirs } from './plan.mjs';

export const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
export const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const repo = dirname(appDir);

export class InstallError extends Error {
  constructor(step, message, cause) {
    super(`${step}: ${message}`, { cause });
    this.name = 'InstallError';
  }
}

/** productName, identifier and the install target, from tauri.conf.json. */
export function appIdentity() {
  const conf = JSON.parse(readFileSync(join(appDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  return { productName: conf.productName, bundleId: conf.identifier, target: installPath(conf.productName) };
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : undefined);

/** @param log (step, msg, ctx) => void   @param output where child commands write: 'inherit' or a file descriptor */
export function createSteps({ log, output = 'inherit' }) {
  /** Run a command; its output goes to `output` unless captured. Fails with the step and exit code. */
  function run(step, cmd, args, { cwd, capture = false } = {}) {
    log(step, `${cmd} ${args.join(' ')}`, cwd ? { cwd } : {});
    try {
      return execFileSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 1 << 30, // lsregister -dump is large
        stdio: ['ignore', capture ? 'pipe' : output, output],
      });
    } catch (e) {
      throw new InstallError(step, `${cmd} failed (exit ${e.status ?? e.code})`, e);
    }
  }

  function checkCheckout() {
    if (process.platform !== 'darwin') throw new InstallError('check', 'only runs on macOS');
    /* the app bakes in the path of this checkout's server/ — a worktree is deleted after its merge */
    if (!statSync(join(repo, '.git')).isDirectory())
      throw new InstallError('check', `${repo} is a git worktree; run this from the main checkout`);
  }

  /** Fail before a long build when the Rust toolchain isn't reachable (tauri build needs cargo). */
  function checkToolchain() {
    process.env.PATH = buildPath(process.env.PATH, homedir());
    try {
      run('check', 'cargo', ['--version'], { capture: true });
    } catch (e) {
      throw new InstallError('check', `cargo not found on PATH (${process.env.PATH}); install Rust with rustup`, e);
    }
  }

  const git = (step, args) => run(step, 'git', args, { cwd: repo, capture: true }).trim();

  function ensureDeps() {
    for (const dir of [appDir, join(repo, 'server')]) {
      const lock = mtime(join(dir, 'package-lock.json')) ?? 0;
      if (needsDeps(lock, mtime(join(dir, 'node_modules', '.package-lock.json'))))
        run('deps', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: dir });
    }
  }

  /** Build the app; returns the fresh bundle's path. */
  function build(productName) {
    const startedMs = Date.now() - 1000; // file times can round down
    run('build', 'npm', ['run', 'build'], { cwd: appDir });
    const candidates = targetDirs({ env: process.env, home: homedir(), appDir })
      .map((d) => join(d, 'release', 'bundle', 'macos', `${productName}.app`))
      .map((path) => ({ path, mtimeMs: mtime(join(path, 'Contents', 'Info.plist')) ?? 0 }));
    const bundle = freshBundle(candidates, startedMs);
    if (!bundle) throw new InstallError('build', `no fresh bundle in ${candidates.map((c) => c.path).join(', ')}`);
    log('build', 'bundle ready', { bundle });
    return bundle;
  }

  /** Swap the bundle in. Removing (not overwriting) the old one keeps an open app running on its old files. */
  function install(bundle, target) {
    rmSync(target, { recursive: true, force: true });
    try {
      renameSync(bundle, target); // a move, so the build output isn't a second copy for Spotlight to find
    } catch (e) {
      if (e.code !== 'EXDEV') throw new InstallError('install', `can't move ${bundle} to ${target}`, e);
      run('install', 'ditto', [bundle, target]);
      rmSync(bundle, { recursive: true, force: true });
    }
    log('install', 'installed', { target });
  }

  /** Tell Launch Services and Spotlight about the new copy. */
  function register(target) {
    run('register', LSREGISTER, ['-f', target]);
    try {
      run('register', 'mdimport', [target]);
    } catch (e) {
      log('register', 'Spotlight re-index failed; it indexes /Applications on its own', { error: e.message });
    }
  }

  /** Record what is installed, so the backend can tell on its next start whether the app is behind. */
  function writeMarker(commit, target) {
    const home = process.env.AI_STUDIO_HOME?.replace(/^~(?=$|\/)/, homedir()) ?? join(homedir(), '.ai-studio');
    const file = markerPath(home);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ commit, target, at: new Date().toISOString() })}\n`);
    log('done', 'marker written', { file });
  }

  function isOpen(target) {
    try {
      run('status', 'pgrep', ['-f', `${target}/Contents/MacOS/`], { capture: true });
      return true;
    } catch {
      return false; // pgrep exits 1 when nothing matches
    }
  }

  return { run, git, checkCheckout, checkToolchain, ensureDeps, build, install, register, writeMarker, isOpen };
}
