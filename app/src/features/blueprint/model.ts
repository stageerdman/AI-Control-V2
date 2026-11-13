/* Blueprint mapping logic — pure, tested: the kit tree, principles from module text, freshness. */
import type { Project } from '../../api/types';
import type { BlueprintModule, Scaffold, TreeEntry } from './api';

/* ---------- the starter-kit tree ---------- */
export type KitNode = { path: string; glyph: string; desc: string; children?: KitNode[] };

export const glyphFor = (path: string, kind: 'file' | 'dir') =>
  kind === 'dir' ? '📁' : path === '.env' ? '🔑' : path.endsWith('.md') ? '📘' : '📄';

/** The server's flat scaffold list under a `my-project/` root; `updates/` shows the first update the Setter opens. */
export function kitTree(tree: TreeEntry[], today: string): KitNode[] {
  const children = tree.map((t): KitNode => {
    const node: KitNode = { path: t.path, glyph: glyphFor(t.path, t.kind), desc: t.desc };
    if (t.path === 'updates/')
      node.children = [
        {
          path: `${today} INIT - OPEN/`,
          glyph: '📁',
          desc: 'The first update — flips to CLOSED when done',
          children: [
            {
              path: 'update v1.md',
              glyph: '📘',
              desc: 'The version plan — goal, phased roadmap, live status',
            },
            { path: 'wiki.md', glyph: '📘', desc: 'Durable decisions & lessons this update taught' },
          ],
        },
      ];
    return node;
  });
  return [
    {
      path: 'my-project/',
      glyph: '📁',
      desc: 'The production itself — born from this starter kit',
      children,
    },
  ];
}

/* ---------- principles ---------- */
export type Principle = { module: string; title: string; text: string };

const MODULE_HUES: Record<string, string> = {
  STRUCTURE: 'teal',
  CODING: 'sky',
  UX: 'rose',
  WORKFLOW: 'grape',
};
export const moduleHue = (name: string) => MODULE_HUES[name.toUpperCase()] ?? 'sun';
/** "WORKFLOW" → "Workflow", "UX" stays. */
export const moduleLabel = (name: string) =>
  name.length <= 3 ? name : name[0] + name.slice(1).toLowerCase();

/** Strip inline markdown: **b**, *i*, `c`, [t](u). */
export const plain = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();

/** First sentence, at most ~`max` chars (cut at a word). */
export function firstSentence(s: string, max = 110): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  const one = m ? (m[1] as string) : s;
  if (one.length <= max) return one;
  return `${one.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** Each `## Section` of a module is a principle; its first bullet/paragraph is the one-liner. */
export function principlesOf(m: Pick<BlueprintModule, 'name' | 'body'>): Principle[] {
  const out: Principle[] = [];
  let cur: Principle | null = null;
  let fenced = false;
  for (const raw of m.body.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const h = /^##\s+(.+)$/.exec(raw);
    if (h) {
      cur = { module: m.name, title: plain(h[1] as string), text: '' };
      out.push(cur);
      continue;
    }
    const line = raw.replace(/^\s*[-*]\s+/, '').trim();
    if (cur && !cur.text && line && !line.startsWith('#') && !line.startsWith('|'))
      cur.text = firstSentence(plain(line));
  }
  /* a lead-in ("Each update is a folder named:") says nothing on its own card */
  for (const p of out) if (p.text.endsWith(':')) p.text = '';
  return out;
}

/* ---------- freshness ---------- */
export type Freshness = {
  state: 'ok' | 'stale' | 'broken';
  /** One honest line (icon + text, never colour alone). */
  label: string;
  /** Scaffold paths missing on disk. */
  missing: string[];
  /** Modules changed after the project's CLAUDE.md was compiled. */
  changed: string[];
  generated: string | null;
};

/** ISO timestamp → local YYYY-MM-DD. */
export const localDay = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/** "2026-11-13" → "Nov 13, 2026". */
export function prettyDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y as number, (m as number) - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function freshness(rep: Scaffold, modules: Pick<BlueprintModule, 'name' | 'updatedAt'>[]): Freshness {
  const generated = rep.claudeMdGenerated ?? null;
  if (!rep.exists)
    return { state: 'broken', label: '⚠ Folder not found on disk', missing: [], changed: [], generated };
  const missing = rep.items.filter((i) => !i.present).map((i) => i.path);
  const changed = generated
    ? modules.filter((m) => m.updatedAt && localDay(m.updatedAt) > generated).map((m) => m.name)
    : [];
  const compiled = generated
    ? `CLAUDE.md compiled on ${prettyDay(generated)}`
    : 'no compile date in .project';
  if (missing.length)
    return { state: 'broken', label: `⚠ Missing ${missing.join(', ')}`, missing, changed, generated };
  if (!generated)
    return { state: 'stale', label: `⚠ Needs rebuild — ${compiled}`, missing, changed, generated };
  if (changed.length)
    return {
      state: 'stale',
      label: `⚠ Needs rebuild — ${changed.map(moduleLabel).join(', ')} changed since ${prettyDay(generated)}`,
      missing,
      changed,
      generated,
    };
  return { state: 'ok', label: `✓ Up to date · ${compiled}`, missing, changed, generated };
}

/** Projects that should be checked: on a folder, not archived. */
export const freshnessProjects = (ps: Project[]) => ps.filter((p) => p.folder && p.status !== 'archived');
