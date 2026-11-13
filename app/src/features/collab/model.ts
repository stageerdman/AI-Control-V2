/* How a project's people work together (F1b collaboration) — pure view model, shared by the setup
   team step and the office's "How we work" card. Calm wording: who the orchestrator talks to, the
   review chain as "after → reviewer · kind" chips (why on hover), and the send-back rule. */
import type { Collaboration, Look } from '../../api';

const KIND_WORD: Record<string, string> = {
  quality: 'quality',
  'user-test': 'user test',
  'crash-test': 'crash test',
  security: 'security',
  review: 'review',
};
export const kindWord = (k: string): string => KIND_WORD[k] ?? k;

export type Who = { name: string; look?: Look; ghost?: boolean };
export type Resolve = {
  /** An agent id (or `new-agent:N` before accept) → a name; null = unknown. */
  agent: (id: string) => Who | null;
  /** A team id (or `new-team:N`) → its name; null = not a team. */
  team: (id: string) => TeamRef | null;
};

export type TeamRef = { id: string; name: string; emblem?: string; color?: string };

export type GateChip = {
  key: string;
  /** "Every change" or the team / agent whose work is reviewed. */
  after: { label: string; team: TeamRef | null };
  reviewer: Who;
  kind: string;
  why: string;
};
export type DesignView = {
  talk: string;
  chips: GateChip[];
  /** Chips beyond the first three. */
  more: number;
  hint: string;
};

export const MAX_CHIPS = 3;

export function designView(c: Collaboration | null | undefined, orch: string, r: Resolve): DesignView {
  const talk = `${orch} talks to ${c?.orchestratorTalksTo === 'everyone' ? 'everyone' : 'captains only'}`;
  const gates = c?.gates ?? [];
  const chips: GateChip[] = gates.map((g, i) => {
    const team = g.after === '*' ? null : r.team(g.after);
    const afterLabel = g.after === '*' ? 'Every change' : (team?.name ?? r.agent(g.after)?.name ?? 'Someone');
    return {
      key: `${i}:${g.after}:${g.reviewer}:${g.kind}`,
      after: { label: afterLabel, team },
      reviewer: r.agent(g.reviewer) ?? { name: 'Someone' },
      kind: kindWord(g.kind),
      why: g.why,
    };
  });
  const n = c?.maxSendBacks ?? 2;
  const hint = !gates.length
    ? 'No reviews — work merges once it’s built.'
    : n === 0
      ? 'No second tries — a “no” comes straight to you.'
      : `Sent back up to ${n}× — then it comes to you.`;
  return { talk, chips: chips.slice(0, MAX_CHIPS), more: Math.max(0, chips.length - MAX_CHIPS), hint };
}

/** A brief → a short ghost name ("A QA specialist for…" → "QA specialist"). */
export function briefName(brief: string): string {
  const w = brief
    .replace(/^(an?|the)\s+/i, '')
    .split(/[\s,.—–-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
  return w || 'New';
}

/** Chips that differ from the previous design (for one calm flash on change). */
export function changedKeys(prev: DesignView | null, next: DesignView): Set<string> {
  if (!prev) return new Set();
  const before = new Set(prev.chips.map((c) => c.key));
  return new Set(next.chips.filter((c) => !before.has(c.key)).map((c) => c.key));
}
