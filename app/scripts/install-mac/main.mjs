// Build AI Studio and make it the one copy on this Mac: /Applications/AI Studio.app, registered with
// Launch Services and Spotlight, every other copy removed. Run: `npm --prefix app run install:mac`
// (the studio's backend runs it on its own after every merge into the AI Studio project).
// Prints one JSON line per step (with a trace id) so the log tells the whole story.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPath, freshBundle, installPath, markerPath, needsDeps, staleCopies, targetDirs } from './plan.mjs';

const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repo = dirname(appDir);
const trace = randomBytes(3).toString('hex');

const log = (step, msg, ctx = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), module: 'install-mac', trace, step, msg, ...ctx }));

class InstallError extends Error {
  constructor(step, message, cause) {
    super(`${step}: ${message}`, { cause });
    this.name = 'InstallError';
  }
}

/** Run a command; output streams to our log unless captured. Fails with the step and exit code. */
function run(step, cmd, args, { cwd, capture = false } = {}) {
  log(step, `${cmd} ${args.join(' ')}`, cwd ? { cwd } : {});
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    });
  } catch (e) {
    throw new InstallError(step, `${cmd} failed (exit ${e.status ?? e.code})`, e);
  }
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : undefined);

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

/** Record what is installed, so the backend can tell on its next start whether the app is behind. */
function writeMarker(commit, target) {
  const home = process.env.AI_STUDIO_HOME?.replace(/^~(?=$|\/)/, homedir()) ?? join(homedir(), '.ai-studio');
  const file = markerPath(home);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ commit, target, at: new Date().toISOString() })}\n`);
  log('done', 'marker written', { file });
}

function ensureDeps() {
  for (const dir of [appDir, join(repo, 'server')]) {
    const lock = mtime(join(dir, 'package-lock.json')) ?? 0;
    if (needsDeps(lock, mtime(join(dir, 'node_modules', '.package-lock.json'))))
      run('deps', 'npm', ['install', '--no-audit', '--no-fund'], { cwd: dir });
  }
}

function build(productName) {
  const startedMs = Date.now() - 1000; // file times can round down
  run('build', 'npm', ['run', 'build'], { cwd: appDir });
  const candidates = targetDirs({ env: process.env, home: homedir(), appDir })
    .map((d) => join(d, 'release', 'bundle', 'macos', `${productName}.app`))
    .map((path) => ({ path, mtimeMs: mtime(join(path, 'Contents', 'Info.plist')) ?? 0 }));
  const bundle = freshBundle(candidates, startedMs);
  if (!bundle)
    throw new InstallError('build', `no fresh bundle in ${candidates.map((c) => c.path).join(', ')}`);
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

function removeStale(bundleId, productName, target) {
  const indexed = run('cleanup', 'mdfind', [`kMDItemCFBundleIdentifier == "${bundleId}"`], { capture: true });
  const found = [...indexed.split('\n'), join(homedir(), 'Applications', `${productName}.app`)];
  for (const copy of staleCopies(found, [target])) {
    if (!existsSync(copy)) continue;
    try {
      run('cleanup', LSREGISTER, ['-u', copy]);
      rmSync(copy, { recursive: true, force: true });
      log('cleanup', 'removed an old copy', { copy });
    } catch (e) {
      log('cleanup', 'could not remove an old copy (left in place)', { copy, error: e.message });
    }
  }
}

function register(target) {
  run('register', LSREGISTER, ['-f', target]);
  try {
    run('register', 'mdimport', [target]);
  } catch (e) {
    log('register', 'Spotlight re-index failed; it indexes /Applications on its own', { error: e.message });
  }
}

function isOpen(target) {
  try {
    run('status', 'pgrep', ['-f', `${target}/Contents/MacOS/`], { capture: true });
    return true;
  } catch {
    return false; // pgrep exits 1 when nothing matches
  }
}

function main() {
  const conf = JSON.parse(readFileSync(join(appDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  const target = installPath(conf.productName);
  log('start', 'installing AI Studio', { repo, target });
  checkCheckout();
  checkToolchain();
  /* the commit being built, read before the build: a merge landing mid-build is the next run's job */
  const commit = run('start', 'git', ['rev-parse', 'HEAD'], { cwd: repo, capture: true }).trim();
  ensureDeps();
  const bundle = build(conf.productName);
  const open = isOpen(target);
  install(bundle, target);
  removeStale(conf.identifier, conf.productName, target);
  register(target);
  writeMarker(commit, target);
  log('done', open ? 'installed; the open app switches to it when quit and reopened' : 'installed', {
    target,
    commit: commit.slice(0, 7),
  });
}

try {
  main();
} catch (e) {
  log('failed', e.message, { cause: e.cause?.message });
  process.exit(1);
}
