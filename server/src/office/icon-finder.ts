/* Finds the app's own icon files in a project folder, so the office icon can be one click away (OFFICE icon).
   A bounded walk: skips dependency, build and hidden folders, stops after a few thousand entries. Read-only.
   Ranked: Mac/iOS app icons first, then favicons and icons, then logos; bigger files before smaller ones. */
import { type Dirent, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const EXTS = new Set(['.png', '.svg', '.icns', '.webp', '.jpg', '.jpeg', '.gif']);
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  'coverage',
  'vendor',
  'Pods',
  'DerivedData',
  'bower_components',
  '__pycache__',
  'venv',
]);
const MAX_DEPTH = 6;
const MAX_ENTRIES = 4000;
export const MAX_CANDIDATES = 8;

/** How likely a file is the app's icon (higher first); 0 = not an icon. */
function rank(rel: string, ext: string): number {
  const name = rel.split('/').pop()?.toLowerCase() ?? '';
  const inSet = /\.appiconset\//i.test(rel);
  if (ext === '.icns') return 50;
  if (inSet) return 40;
  if (/^(app[-_]?icon|icon)(\W|$)/.test(name) || /^apple-touch-icon/.test(name)) return 30;
  if (/^favicon/.test(name)) return 25;
  if (/icon/.test(name)) return 20;
  if (/^logo/.test(name)) return 15;
  if (/logo/.test(name)) return 10;
  return 0;
}

/** Likely icon files, as paths relative to `root`, best first. */
export function findIconFiles(root: string): string[] {
  type Hit = { path: string; score: number; size: number; set: string | null };
  const hits: Hit[] = [];
  let seen = 0;
  const walk = (dir: string, depth: number) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of entries) {
      if (++seen > MAX_ENTRIES) return;
      if (d.name.startsWith('.')) continue;
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP.has(d.name)) walk(full, depth + 1);
        continue;
      }
      if (!d.isFile()) continue; // symlinks are left out: the link route checks where they point
      const ext = extname(d.name).toLowerCase();
      if (!EXTS.has(ext)) continue;
      const rel = relative(root, full).split('\\').join('/');
      const score = rank(rel, ext);
      if (!score) continue;
      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (!size) continue;
      const set = rel.match(/^(.*\.appiconset)\//i)?.[1] ?? null;
      hits.push({ path: rel, score, size, set });
    }
  };
  walk(root, 0);
  /* one per .appiconset: its largest picture */
  const bestOfSet = new Map<string, Hit>();
  for (const h of hits)
    if (h.set && (!bestOfSet.has(h.set) || (bestOfSet.get(h.set)?.size ?? 0) < h.size))
      bestOfSet.set(h.set, h);
  return hits
    .filter((h) => !h.set || bestOfSet.get(h.set) === h)
    .sort((a, b) => b.score - a.score || b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, MAX_CANDIDATES)
    .map((h) => h.path);
}
