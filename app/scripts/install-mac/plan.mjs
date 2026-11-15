// Pure decisions for the Mac installer and clean-up (steps.mjs and copies.mjs do the I/O). Kept apart so
// they are tested on their own.
import { basename, join, resolve, sep } from 'node:path';

export const APPLICATIONS = '/Applications';

/** Where the installed app lives: `/Applications/<productName>.app`. */
export const installPath = (productName) => join(APPLICATIONS, `${productName}.app`);

/** Cargo target dirs a Tauri build may write to, most likely first (the shared target is the convention). */
export function targetDirs({ env, home, appDir }) {
  const dirs = [env.CARGO_TARGET_DIR, join(home, '.cargo-shared-target'), join(appDir, 'src-tauri', 'target')];
  return [...new Set(dirs.filter(Boolean).map((d) => resolve(d)))];
}

/** The bundle this build produced: the newest candidate written at or after the build started. */
export function freshBundle(candidates, builtSinceMs) {
  const fresh = candidates.filter((c) => c.mtimeMs >= builtSinceMs).sort((a, b) => b.mtimeMs - a.mtimeMs);
  return fresh[0]?.path ?? null;
}

/** PATH for the build. An app opened from Spotlight hands its backend a bare PATH without rustup's
    ~/.cargo/bin, so `tauri build` couldn't find cargo; put the usual tool dirs first, keep the rest. */
export function buildPath(path, home) {
  const preferred = [join(home, '.cargo', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const all = [...preferred, ...(path ?? '').split(':'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  return [...new Set(all.filter(Boolean))].join(':');
}

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Is this file name a copy of the product: "AI Studio.app", "AI Studio 2.app", "AI Studio_0.1.0_aarch64.dmg"… */
export function namesProduct(name, productName) {
  return /\.(app|dmg)$/i.test(name) && squash(name).startsWith(squash(productName));
}

/** The app paths Launch Services has registered for `bundleId`, from `lsregister -dump` (records split by
    dashed lines; a path line reads `path:   /Applications/AI Studio.app (0x7610)`). */
export function parseLsDump(dump, bundleId) {
  const paths = [];
  for (const record of dump.split(/\n-{10,}\n/)) {
    if (!new RegExp(`^identifier:\\s+${bundleId.replace(/\./g, '\\.')}\\s*$`, 'm').test(record)) continue;
    const path = record.match(/^path:\s+(.+?)(?:\s+\(0x[0-9a-f]+\))?\s*$/m)?.[1];
    if (path) paths.push(path);
  }
  return paths;
}

/** What one found path is, and so what clean-up does with it:
    app (move to Trash) · dmg (move to Trash) · volume (eject the mounted disk image the app sits on) ·
    ghost (a registration or index entry whose file is gone: unregister). null = not a copy. */
export function classifyCopy(path, { exists, volumes = '/Volumes', trash }) {
  const p = resolve(path);
  if (trash && (p === trash || p.startsWith(trash + sep))) return null; // already in the Trash
  if (p.startsWith(volumes + sep)) {
    const volume = join(volumes, p.slice(volumes.length + 1).split(sep)[0]);
    return p === volume ? null : { kind: 'volume', path: volume };
  }
  if (p.endsWith('.dmg')) return exists(p) ? { kind: 'dmg', path: p } : null;
  if (p.endsWith('.app')) return { kind: exists(p) ? 'app' : 'ghost', path: p };
  return null;
}

/** Classify, drop repeats and anything nested inside another found app (a bundle's own helpers). */
export function uniqueCopies(found, ctx) {
  const byPath = new Map();
  for (const f of found) {
    const c = classifyCopy(f, ctx);
    if (c && !byPath.has(c.path)) byPath.set(c.path, c);
  }
  const apps = [...byPath.keys()].filter((p) => p.endsWith('.app'));
  return [...byPath.values()].filter((c) => !apps.some((a) => c.path.startsWith(a + sep)));
}

/** A Trash path that doesn't clash with something already there: "AI Studio.app" → "AI Studio 12.34.56.app". */
export function trashName(path, taken, stamp) {
  const name = basename(path);
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)} ${stamp}${name.slice(dot)}`;
}

/** Did the build come from latest master? Compared on the full hash; short ones print. */
export const commitVerdict = (built, master) => (built && built === master ? 'MATCH' : 'MISMATCH');

/** Where the installer records the commit it installed; the backend reads it to catch up on start. */
export const markerPath = (studioHome) => join(studioHome, 'installed-build.json');

/** npm install is needed when dependencies were never installed or the lockfile changed since. */
export const needsDeps = (lockMtimeMs, installedMtimeMs) =>
  installedMtimeMs === undefined || lockMtimeMs > installedMtimeMs;
