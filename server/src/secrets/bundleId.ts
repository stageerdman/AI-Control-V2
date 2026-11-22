/* A Mac app's bundle id, read from its own project files — so its data folder
   (`~/Library/Application Support/<id>`) is found, never guessed. In order: a Tauri config's `identifier`,
   then the Xcode project's PRODUCT_BUNDLE_IDENTIFIER (test targets left out). The first file that names
   exactly one id wins; none, or several, is a 409 that names every file it checked. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { conflict } from '../errors.ts';

const TAURI_CONFIGS = ['src-tauri/tauri.conf.json', 'tauri.conf.json'];

/** Tauri v2 keeps it at the top, v1 under tauri.bundle. */
function tauriId(text: string): string[] {
  const c = JSON.parse(text) as { identifier?: unknown; tauri?: { bundle?: { identifier?: unknown } } };
  const id = c.identifier ?? c.tauri?.bundle?.identifier;
  return typeof id === 'string' && id.trim() ? [id.trim()] : [];
}

function xcodeIds(text: string): string[] {
  const ids = [...text.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";\s]+)"?;/g)].map((m) => m[1] as string);
  return [...new Set(ids.filter((id) => !id.includes('$(') && !/tests$/i.test(id)))];
}

const xcodeProjects = (dir: string) =>
  readdirSync(dir)
    .filter((n) => n.endsWith('.xcodeproj'))
    .map((n) => `${n}/project.pbxproj`);

type Reader = (text: string) => string[];

export function bundleIdOf(projectDir: string): string {
  const xcode = xcodeProjects(projectDir);
  const candidates: [string, Reader][] = [
    ...TAURI_CONFIGS.map((f): [string, Reader] => [f, tauriId]),
    ...xcode.map((f): [string, Reader] => [f, xcodeIds]),
  ];
  for (const [file, read] of candidates) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    let ids: string[];
    try {
      ids = read(readFileSync(path, 'utf8'));
    } catch (e) {
      throw conflict(`Couldn't read the bundle id in ${file}: ${(e as Error).message}`, { file });
    }
    if (ids.length > 1)
      throw conflict(`${file} names several bundle ids (${ids.join(', ')}) — can't tell which is the app`, {
        file,
        ids,
      });
    if (ids.length === 1) return ids[0] as string;
  }
  const checked = [...TAURI_CONFIGS, ...(xcode.length ? xcode : ['*.xcodeproj/project.pbxproj'])];
  throw conflict(`No bundle id found — checked ${checked.join(', ')}`, { checked });
}
