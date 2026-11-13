/* Pure helpers for the Reports space: times, unread, live-event updates, row labels. */
import type { ReportKind, ReportRow } from './api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const dayMonth = (d: Date, now: Date) =>
  `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`}`;

/** List "when": Just now · 5 min ago · 2 h ago · Yesterday · 12 Nov. `long` spells units out (screen readers). */
export function relWhen(iso: string, now: Date = new Date(), long = false): string {
  const d = new Date(iso);
  const ms = now.getTime() - d.getTime();
  if (!Number.isFinite(ms)) return '';
  const days = Math.round((dayStart(now) - dayStart(d)) / DAY);
  if (days <= 0) {
    if (ms < 60_000) return 'Just now';
    const min = Math.floor(ms / 60_000);
    if (min < 60) return long ? `${min} minute${min === 1 ? '' : 's'} ago` : `${min} min ago`;
    const h = Math.floor(min / 60);
    return long ? `${h} hour${h === 1 ? '' : 's'} ago` : `${h} h ago`;
  }
  if (days === 1) return 'Yesterday';
  return dayMonth(d, now);
}

/** Report page meta: Today 14:05 · Yesterday 09:12 · 12 Nov 14:05. */
export function fullWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((dayStart(now) - dayStart(d)) / DAY);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : dayMonth(d, now);
  return `${day} ${hm(d)}`;
}

export const KIND_LABEL: Record<ReportKind, string> = {
  research: 'Research',
  review: 'Review',
  status: 'Status',
  other: 'Report',
};

export const isUnread = (r: Pick<ReportRow, 'readAt'>) => r.readAt === null;
export const unreadCount = (rows: readonly Pick<ReportRow, 'readAt' | 'archivedAt'>[]) =>
  rows.filter((r) => r.readAt === null && r.archivedAt === null).length;

type ReportEvent =
  | { type: 'report.read'; payload: { reportId: string; read: boolean }; at?: string }
  | { type: 'report.archived'; payload: { reportId: string; archived: boolean }; at?: string };

/** Apply report.read / report.archived to a list on screen (`view` = which list it is). New
    reports (report.filed) carry no row — refetch for those. Returns the same array when nothing changed. */
export function applyReportEvent<T extends ReportRow>(
  rows: T[],
  ev: ReportEvent,
  view: 'active' | 'archived' = 'active',
): T[] {
  const i = rows.findIndex((r) => r.id === ev.payload.reportId);
  if (i < 0) return rows;
  const at = ev.at ?? new Date().toISOString();
  if (ev.type === 'report.read') {
    const cur = rows[i];
    if (ev.payload.read === (cur.readAt !== null)) return rows;
    const next = rows.slice();
    next[i] = { ...cur, readAt: ev.payload.read ? at : null };
    return next;
  }
  /* archiving leaves the active list; unarchiving leaves the archive */
  if (ev.payload.archived === (view === 'archived')) return rows;
  return rows.filter((_, j) => j !== i);
}

/** Screen-reader label for a row (spec §5): never colour-only. */
export function rowLabel(r: ReportRow & { projectName?: string }, now: Date = new Date()): string {
  const who = [r.author.name, r.author.teamName, r.projectName].filter(Boolean).join(', ');
  return `${isUnread(r) ? 'Unread. ' : ''}${r.title}, by ${who}, ${relWhen(r.createdAt, now, true).toLowerCase()}. ${r.summary}`;
}

/** "Scout" from an agent: its nick, else the first word of the name. */
export const shortName = (a: { name: string; nick?: string | null }) => a.nick || a.name.split(/\s+/)[0];
