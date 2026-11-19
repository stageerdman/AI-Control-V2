/* The features folder's logic (pure): search, stage chips, dates, what Enter does.
   Design: updates/2026-11-19 FEATURE LIST - OPEN/design.md §2–3. No React, no I/O. */
import type { Feature, FeatureStatus } from './api';

/** Every stage, in list order. */
export const STAGES: readonly FeatureStatus[] = ['now', 'planned', 'shipped', 'shelved', 'denied'];
export type StageFilter = FeatureStatus | 'all';

export const STAGE_LABEL: Record<FeatureStatus, string> = {
  now: 'In progress',
  planned: 'Planned',
  shipped: 'Shipped',
  shelved: 'Shelved',
  denied: 'Denied',
};
/** The short word on chips and group headings. */
export const STAGE_TITLE: Record<FeatureStatus, string> = { ...STAGE_LABEL, now: 'Now' };

/** Closed = finished one way or another: dated by `closedAt`, out of progress. Mirrors the server. */
export const isClosed = (s: FeatureStatus) => s === 'shipped' || s === 'shelved' || s === 'denied';

const words = (q: string) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Name and description contain every word of the query, any case, any order. */
export function matches(f: Feature, query: string): boolean {
  const ws = words(query);
  if (!ws.length) return true;
  const hay = `${f.name}\n${f.description}`.toLowerCase();
  return ws.every((w) => hay.includes(w));
}

/** The rows to show, in the server's order. */
export const filterFeatures = (list: Feature[], query: string, stage: StageFilter): Feature[] =>
  list.filter((f) => (stage === 'all' || f.status === stage) && matches(f, query));

/** Counts per chip; they follow the search. */
export function stageCounts(list: Feature[], query: string): Record<StageFilter, number> {
  const out = { all: 0, now: 0, planned: 0, shipped: 0, shelved: 0, denied: 0 };
  for (const f of list) {
    if (!matches(f, query)) continue;
    out.all++;
    out[f.status]++;
  }
  return out;
}

/** Which chips to show: none for an empty office; else All plus every stage that has a feature at all
   (search aside), and the selected one always. */
export function visibleChips(list: Feature[], stage: StageFilter): StageFilter[] {
  if (!list.length) return [];
  const used = new Set(list.map((f) => f.status));
  return ['all', ...STAGES.filter((s) => used.has(s) || s === stage)];
}

/** A feature already named exactly this (case and extra spaces aside), anywhere in the list. */
export const exactMatch = (list: Feature[], query: string): Feature | undefined => {
  const q = norm(query);
  return q ? list.find((f) => norm(f.name) === q) : undefined;
};

/** The stage a new feature lands in: the selected Now / Planned chip, else Planned. */
export const newStage = (stage: StageFilter): 'now' | 'planned' => (stage === 'now' ? 'now' : 'planned');

export type EnterAction =
  | { kind: 'none' }
  | { kind: 'open'; feature: Feature }
  | { kind: 'add'; name: string };

/** What Enter in the field does: exact name → open it; any match → open the first; nothing → add. */
export function enterAction(list: Feature[], query: string, stage: StageFilter): EnterAction {
  const name = query.trim().replace(/\s+/g, ' ');
  if (!name) return { kind: 'none' };
  const exact = exactMatch(list, name);
  if (exact) return { kind: 'open', feature: exact };
  const first = filterFeatures(list, name, stage)[0];
  return first ? { kind: 'open', feature: first } : { kind: 'add', name };
}

/* ---------- dates */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "19 Nov" this year, "19 Nov 2025" another year. Local time. */
export function shortDate(iso: string, today: Date): string {
  const d = new Date(iso);
  const day = `${d.getDate()} ${MON[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}
/** "19 November 2026": for tooltips and screen readers. */
export const longDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
};

const VERB: Record<FeatureStatus, string> = {
  now: 'Added',
  planned: 'Added',
  shipped: 'Shipped',
  shelved: 'Shelved',
  denied: 'Denied',
};

/** A row's date: open → when it was added; closed → when it was finished. */
export function featureDate(f: Feature, today: Date): { text: string; spoken: string } {
  const at = isClosed(f.status) ? (f.closedAt ?? f.updatedAt) : f.createdAt;
  return { text: shortDate(at, today), spoken: `${VERB[f.status]} ${longDate(at)}` };
}

/** The feature page's line: "Added 3 Nov", plus " · Shipped 19 Nov" when closed. */
export function dateLine(f: Feature, today: Date): string {
  const added = `Added ${shortDate(f.createdAt, today)}`;
  if (!isClosed(f.status)) return added;
  return `${added} · ${VERB[f.status]} ${shortDate(f.closedAt ?? f.updatedAt, today)}`;
}
