/* Ready to Test: is this project a desktop app, and where is its newest build? Read-only, never follows symlinks.
   - Tauri (src-tauri/tauri.conf.json): `<productName>.app` in the shared Cargo target (CLAUDE.md's convention —
     every Tauri project builds there, so the name is what tells them apart), or a local src-tauri/target.
   - Native Mac (Package.swift / .xcodeproj): any `.app` the build left under .build/, build/ or dist/ (the Mac
     build rules keep outputs inside the project: build/DerivedData/Build/Products/<Config>/X.app). */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isMacProject } from '../runtime/mac-project.ts';

const TAURI_CONF = join('src-tauri', 'tauri.conf.json');
const MAC_OUTPUTS = ['.build', 'build', 'dist'];
const MAX_DEPTH = 6;

const statOf = (abs: string) => {
  try {
    return lstatSync(abs);
  } catch {
    return null;
  }
};

/** The Cargo target every Tauri project shares (CARGO_TARGET_DIR when the server has one). */
export const sharedCargoTarget = (env: NodeJS.ProcessEnv = process.env): string =>
  env.CARGO_TARGET_DIR || join(homedir(), '.cargo-shared-target');

export const isDesktopProject = (dir: string): boolean =>
  !!statOf(join(dir, TAURI_CONF))?.isFile() || isMacProject(dir);

/** Tauri's app name, null when the config is missing or unreadable. */
export function tauriProductName(dir: string): string | null {
  try {
    const name = (JSON.parse(readFileSync(join(dir, TAURI_CONF), 'utf8')) as { productName?: unknown })
      .productName;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

function tauriBundles(dir: string, cargoTarget: string): string[] {
  const name = tauriProductName(dir);
  if (!name) return [];
  return [cargoTarget, join(dir, 'src-tauri', 'target')].flatMap((t) =>
    ['release', 'debug'].map((profile) => join(t, profile, 'bundle', 'macos', `${name}.app`)),
  );
}

/** Every `.app` folder under `root` (not inside another .app, no node_modules, no symlinks). */
function appsUnder(root: string, depth = 0): string[] {
  if (depth > MAX_DEPTH) return [];
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  return names.flatMap((n) => {
    const abs = join(root, n);
    if (n === 'node_modules' || !statOf(abs)?.isDirectory()) return [];
    return n.endsWith('.app') ? [abs] : appsUnder(abs, depth + 1);
  });
}

/** When it was built: its Info.plist is rewritten by every build (the folder itself may not be). */
const builtAt = (app: string): number =>
  (statOf(join(app, 'Contents', 'Info.plist')) ?? statOf(app))?.mtimeMs ?? -1;

/** The newest built app of a desktop project (absolute path), null when nothing is built yet. */
export function newestBuiltApp(dir: string, cargoTarget: string): string | null {
  const candidates = [
    ...tauriBundles(dir, cargoTarget),
    ...(isMacProject(dir) ? MAC_OUTPUTS.flatMap((o) => appsUnder(join(dir, o))) : []),
  ];
  let best: { app: string; at: number } | null = null;
  for (const app of candidates) {
    if (!statOf(app)?.isDirectory()) continue;
    const at = builtAt(app);
    if (!best || at > best.at) best = { app, at };
  }
  return best?.app ?? null;
}
