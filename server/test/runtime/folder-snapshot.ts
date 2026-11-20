/* A cheap "did anything write here?" probe for folders we may not touch, a few levels deep. It compares
   content, not folder timestamps: a file by size + mtime, a symlink by its target, a folder by its entries —
   so a tool re-creating an identical symlink (SwiftPM re-links ~/.swiftpm/security on every run) isn't a
   write, while any new, changed or removed file or folder within reach is. */
import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

export type Snapshot = Map<string, string>;

export function snapshot(folders: readonly string[], depth = 4): Snapshot {
  const seen: Snapshot = new Map();
  for (const folder of folders) if (existsSync(folder)) walk(folder, depth, seen);
  return seen;
}

function walk(path: string, depth: number, seen: Snapshot) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) return void seen.set(path, `link → ${readlinkSync(path)}`);
  if (!stat.isDirectory()) return void seen.set(path, `file ${stat.size}b @${stat.mtimeMs}`);
  const names = readdirSync(path).sort();
  seen.set(path, `folder [${names.join(', ')}]`);
  if (depth > 0) for (const name of names) walk(join(path, name), depth - 1, seen);
}

/** What changed between two snapshots, sorted: each path with how (created, modified, removed). */
export function changedSince(before: Snapshot, after: Snapshot): string[] {
  const created = [...after.keys()].filter((p) => !before.has(p)).map((p) => `${p} (created)`);
  const touched = [...after]
    .filter(([p, sig]) => before.has(p) && before.get(p) !== sig)
    .map(([p]) => `${p} (modified)`);
  const removed = [...before.keys()].filter((p) => !after.has(p)).map((p) => `${p} (removed)`);
  return [...created, ...touched, ...removed].sort();
}
