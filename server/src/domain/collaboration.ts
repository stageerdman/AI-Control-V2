/* The collaboration design (B8, the user's idea): how a project's people work together, designed by
   its orchestrator. Pure — shape (zod) + integrity rules + gate matching.

   - `orchestratorTalksTo`: who the orchestrator briefs — `captains` (teams through their captains, plus
     specialists; the default) or `everyone` (any member of a project team, plus specialists).
   - `gates`: review/handoff gates. After a build item by `after` (a team id, an agent id, or "*" = any
     build item) is done, `reviewer` checks it (`kind`: quality, user-test, crash-test, security, review)
     and approves it or sends it back with notes. Gates run in the order listed.
   - `maxSendBacks`: how often a reviewer may send one item back before it stops for the user (bounded loops).

   During setup the plan may point at agents/teams the Agent Creator hasn't minted yet: `new-agent:N` /
   `new-team:N` (N = index in plan.newAgents / plan.newTeams); accepting the plan rewrites them to real ids. */
import { z } from 'zod';

export const GATE_KINDS = ['quality', 'user-test', 'crash-test', 'security', 'review'] as const;
export type GateKind = (typeof GATE_KINDS)[number];
export const MAX_GATES = 8;
export const DEFAULT_MAX_SEND_BACKS = 2;

const ref = z.string().trim().min(1).max(80);

export const GateSchema = z.strictObject({
  after: ref,
  reviewer: ref,
  kind: z.enum(GATE_KINDS),
  why: z.string().trim().min(1).max(300),
});
export type Gate = z.output<typeof GateSchema>;

export const CollaborationSchema = z.strictObject({
  orchestratorTalksTo: z.enum(['captains', 'everyone']).default('captains'),
  gates: z.array(GateSchema).max(MAX_GATES).default([]),
  maxSendBacks: z.number().int().min(0).max(3).default(DEFAULT_MAX_SEND_BACKS),
  summary: z.string().trim().min(1).max(500),
});
export type Collaboration = z.output<typeof CollaborationSchema>;

/** Who is on the project (or the plan) as the rules see it. */
export type Staffing = {
  /** team id → name + member ids (captain included). */
  teams: Map<string, { name: string; members: readonly string[] }>;
  /** Specialist ids (outside the teams). */
  specialists: ReadonlySet<string>;
  name: (id: string) => string;
  /** Placeholder counts for briefs not minted yet (setup only). */
  newAgents?: number;
  newTeams?: number;
};

const placeholder = /^new-(agent|team):(\d+)$/;

/** Pure: every gate points at people on the project; no self-review, no duplicates. */
export function collaborationIssues(c: Collaboration, s: Staffing): string[] {
  const out: string[] = [];
  const members = new Set([...s.teams.values()].flatMap((t) => t.members));
  const isAgent = (id: string) => {
    const m = placeholder.exec(id);
    if (m) return m[1] === 'agent' && Number(m[2]) < (s.newAgents ?? 0);
    return members.has(id) || s.specialists.has(id);
  };
  const isTeam = (id: string) => {
    const m = placeholder.exec(id);
    if (m) return m[1] === 'team' && Number(m[2]) < (s.newTeams ?? 0);
    return s.teams.has(id);
  };
  const seen = new Set<string>();
  c.gates.forEach((g, i) => {
    if (g.after !== '*' && !isTeam(g.after) && !isAgent(g.after))
      out.push(
        `collaboration.gates.${i}.after: '${g.after}' is not a team or agent on this project (use a team id, an agent id or "*")`,
      );
    if (!isAgent(g.reviewer))
      out.push(
        `collaboration.gates.${i}.reviewer: '${g.reviewer}' is not on this project — a reviewer must be a team member or a specialist here`,
      );
    else if (g.reviewer === g.after)
      out.push(`collaboration.gates.${i}: ${s.name(g.reviewer)} can't review their own work`);
    const k = `${g.after}\u0000${g.reviewer}\u0000${g.kind}`;
    if (seen.has(k)) out.push(`collaboration.gates.${i}: the same gate is listed twice`);
    seen.add(k);
  });
  return out;
}

/** Rewrite `new-agent:N` / `new-team:N` to the minted ids (accept). */
export function resolvePlaceholders(
  c: Collaboration,
  minted: { agents: readonly string[]; teams: readonly string[] },
): Collaboration {
  const fix = (id: string) => {
    const m = placeholder.exec(id);
    if (!m) return id;
    return (m[1] === 'agent' ? minted.agents : minted.teams)[Number(m[2])] ?? id;
  };
  return { ...c, gates: c.gates.map((g) => ({ ...g, after: fix(g.after), reviewer: fix(g.reviewer) })) };
}

/** The review steps one build item goes through, in order. Self-review is skipped. */
export type ItemGate = { reviewer: string; kind: GateKind; why: string };
export function gatesFor(
  c: Collaboration | null,
  item: { agentId: string; teamId: string | null },
): ItemGate[] {
  if (!c) return [];
  const out: ItemGate[] = [];
  for (const g of c.gates) {
    const hit =
      g.after === '*' || g.after === item.agentId || (item.teamId !== null && g.after === item.teamId);
    if (!hit || g.reviewer === item.agentId) continue;
    if (out.some((o) => o.reviewer === g.reviewer && o.kind === g.kind)) continue;
    out.push({ reviewer: g.reviewer, kind: g.kind, why: g.why });
  }
  return out;
}

/** What each kind of reviewer looks for (their review task). */
export const GATE_FOCUS: Record<GateKind, string> = {
  quality:
    'Quality gate: is the code correct, modular, clean and simple — no duplication, no dead code, nothing beyond the brief? Do the project’s own checks/tests pass?',
  'user-test':
    'User-tester gate: use the result the way a real user would. Is it understandable, does it do what the brief promised, is anything confusing or broken from a user’s point of view?',
  'crash-test':
    'Crash-tester gate: try hard to break it — odd inputs, empty states, edge cases, rapid repeats. Report what crashes or misbehaves.',
  security:
    'Security gate: look for leaked secrets, unsafe input handling, injection, over-broad access. Report concrete risks only.',
  review: 'Review gate: does the work meet the brief and the project’s rules (CLAUDE.md)?',
};

export type Verdict = { verdict: 'approve' | 'changes'; notes: string };

/** A reviewer's verdict from their final reply: the last `{"verdict": …, "notes": …}` object in it; failing
    that, a plain APPROVE / CHANGES word. Anything unclear counts as changes, with their reply as the notes
    (a review that doesn't say "approve" never lets work through; send-backs are bounded anyway). */
export function parseVerdict(reply: string): Verdict {
  const text = reply.trim();
  /* whole JSON lines first: notes may quote code with braces ({ok:false}) — F1c live: a brace-free match missed
     a clear approve and cost a send-back round */
  const lines = text
    .split('\n')
    .map((l) => l.trim().replace(/^`+|`+$/g, ''))
    .filter((l) => l.startsWith('{') && l.endsWith('}') && l.includes('"verdict"'));
  const objects = [...(text.match(/\{[^{}]*"verdict"[^{}]*\}/g) ?? []), ...lines];
  for (const raw of objects.reverse()) {
    try {
      const v = JSON.parse(raw) as { verdict?: unknown; notes?: unknown };
      const verdict = String(v.verdict ?? '').toLowerCase();
      const notes = typeof v.notes === 'string' ? v.notes.trim() : '';
      if (/^approve/.test(verdict)) return { verdict: 'approve', notes };
      if (/^(changes|send.?back|reject)/.test(verdict))
        return { verdict: 'changes', notes: notes || 'Changes requested (no notes given).' };
    } catch {
      /* next */
    }
  }
  const prose = text.replace(/\{[^{}]*"verdict"[^{}]*\}/g, '').trim();
  if (/\bAPPROVED?\b/.test(text) && !/\bCHANGES\b/.test(text)) return { verdict: 'approve', notes: prose };
  return { verdict: 'changes', notes: prose || 'The review ended without a clear verdict.' };
}
