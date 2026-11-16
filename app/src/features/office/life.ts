/* STUDIO LIFE in the office (spec-ux-office.md) — the pure bits behind the desk notes, the principles binder, the
   mailbox and the bell: which desks carry a note (and whether it's new to this viewer), words for rows and labels,
   and who can be brought in. No DOM, no fetching. */
import type { Agent, DeskNote, Mail, MailStatus } from '../../api';

export const clip = (s: string, n: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/* ---------- desk notes ---------- */
/** A desk's paper: 'new' glows until this viewer opens that robot's notes. */
export type Tray = 'note' | 'new';
/** agentId → the newest note time this viewer has opened (per viewer, this browser only). */
export type Seen = Record<string, string>;

/** Per agent: how many notes, how many this viewer hasn't seen, the newest note's time. */
export function noteCounts(notes: readonly DeskNote[], seen: Seen) {
  const out: Record<string, { n: number; fresh: number; latest: string }> = {};
  for (const x of notes) {
    out[x.agentId] ??= { n: 0, fresh: 0, latest: x.at };
    const c = out[x.agentId];
    c.n += 1;
    if (x.at > c.latest) c.latest = x.at;
    if (!seen[x.agentId] || x.at > seen[x.agentId]) c.fresh += 1;
  }
  return out;
}
export function trays(notes: readonly DeskNote[], seen: Seen): Record<string, Tray> {
  return Object.fromEntries(
    Object.entries(noteCounts(notes, seen)).map(([id, c]) => [id, c.fresh ? 'new' : 'note'] as const),
  );
}
export const noteLabel = (nick: string, c: { n: number; fresh: number }) =>
  `${nick}’s notes to self — ${c.n}${c.fresh ? `, ${c.fresh} new` : ''}`;

const seenKey = (pid: string) => `office:notes-seen:${pid}`;
export function readSeen(pid: string): Seen {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(pid)) ?? '{}');
    return v && typeof v === 'object' ? (v as Seen) : {};
  } catch {
    return {};
  }
}
export function writeSeen(pid: string, seen: Seen): void {
  try {
    localStorage.setItem(seenKey(pid), JSON.stringify(seen));
  } catch {
    /* private window / blocked storage: the glow just comes back next visit */
  }
}

/* ---------- principles ---------- */
export const principlesLabel = (team: string, files: number, keeper: string | null) =>
  files
    ? `${team} principles — ${files} file${files === 1 ? '' : 's'}${keeper ? `, kept by ${keeper}` : ''}`
    : `${team} principles — none yet`;

/** The first plain paragraph of a markdown file (no headings, lists' markers or emphasis), clipped. */
export function firstParagraph(md: string, n = 90): string {
  const paras = md.replace(/\r/g, '').split(/\n\s*\n/);
  for (const p of paras) {
    const t = p.trim();
    if (!t || /^#{1,6}\s/.test(t) || /^```/.test(t) || /^(-{3,}|\*{3,})$/.test(t)) continue;
    const plain = t
      .split('\n')
      .map((l) => l.replace(/^\s*([-*+]|\d+\.|>)\s+/, ''))
      .join(' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '');
    if (plain.trim()) return clip(plain, n);
  }
  return '';
}

/* ---------- mail ---------- */
export const MAIL_STATUS: Record<MailStatus, string> = {
  new: 'New',
  board: 'On the board',
  discussed: 'Discussed',
  filed: 'Filed',
};
export const MAIL_KIND: Partial<Record<Mail['kind'], string>> = { ticket: 'Ticket', idea: 'Idea' };

/** The inbox: new first, then newest. */
export const sortInbox = (mail: readonly Mail[]): Mail[] =>
  [...mail].sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new') || (a.at < b.at ? 1 : -1));

export type MailNames = {
  /** The project's display name ('HQ' for the studio's own). */
  project: (id: string | null) => string;
  agent: (id: string | null) => string | null;
};
/** `Aurora · Pixel` — where a letter came from. */
export const mailFrom = (m: Mail, names: MailNames): string =>
  [names.project(m.fromProjectId), names.agent(m.fromAgentId) ?? 'You'].join(' · ');
/** `To Aurora` / `To HQ` (sent letters). */
export const mailTo = (m: Mail, names: MailNames): string =>
  `To ${m.to === 'hq' ? 'HQ' : names.project(m.to)}`;

/** The reading view's status line (the goal name is a link when the letter went on the board). */
export function mailStatusLine(
  m: Mail,
  director: string,
  goal: string | null,
): { text: string; goal?: string } {
  switch (m.status) {
    case 'new':
      return { text: `New — ${director} reads it while you’re here.` };
    case 'board':
      return goal ? { text: 'On the board — ', goal } : { text: 'On the board' };
    case 'discussed':
      return { text: 'Discussed with you' };
    case 'filed':
      /* the director leaves a line when he files it; the user filing it leaves none */
      return { text: m.note ? `Filed by ${director}` : 'Filed' };
  }
}

/* ---------- bring someone in ---------- */
/** Cast agents (kind 'agent') not already in this office, by name. */
export const bringable = (roster: readonly Agent[], here: ReadonlySet<string>): Agent[] =>
  roster.filter((a) => a.kind === 'agent' && !here.has(a.id)).sort((a, b) => a.name.localeCompare(b.name));

/** The bell's "Who" grid: every Cast agent (not crew), by name — the ones already here stay, tagged, so you
    can still invite another like them (Invite another, design.md §1b). */
export const whoGrid = (
  roster: readonly Agent[],
  here: ReadonlySet<string>,
): { agent: Agent; here: boolean }[] =>
  roster
    .filter((a) => a.kind === 'agent')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((agent) => ({ agent, here: here.has(agent.id) }));
