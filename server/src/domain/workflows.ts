/* Workflows (updates/2026-11-17 WORKFLOWS): how work flows through a project — who the orchestrator briefs,
   who signs off whose work and, for one goal only, who leads whom. Pure — shape (zod) + integrity rules +
   gate matching. Not an engine: goals already have ordered items, items already have review gates.

   - Stable workflow: lives on the project (`projects.workflows`, 1–6, the first is the default). Named for a
     scenario (`when`). Never has `lead` / `crew`.
   - Temporary workflow: lives on one goal (`goals.workflow`). Always has `lead` + `crew`; its gates include the
     lead's sign-off of each crew member's work (`effectiveGates`). Its powers are derived from running goals.

   The fields shared with B8's collaboration design:
   - `orchestratorTalksTo`: who the orchestrator briefs — `captains` (teams through their captains, plus
     specialists; the default) or `everyone` (any member of a project team, plus specialists).
   - `gates`: review/handoff gates. After a build item by `after` (a team id, an agent id, or "*" = any
     build item) is done, `reviewer` checks it (`kind`: quality, user-test, crash-test, security, review)
     and approves it or sends it back with notes. Gates run in the order listed.
   - `maxSendBacks`: how often a reviewer may send one item back before it stops for the user (bounded loops).

   During setup the plan may point at agents/teams the Agent Creator hasn't minted yet: `new-agent:N` /
   `new-team:N` (N = index in plan.newAgents / plan.newTeams); accepting the plan rewrites them to real ids. */
import { z } from 'zod';
import { type Gate, type GateKind, GateSchema, MAX_GATES } from './gates.ts';
import { drawingIssues, drawingShape, type Who } from './workflow-drawing.ts';

export { GATE_KINDS, type Gate, type GateKind, GateSchema, MAX_GATES } from './gates.ts';
export { keepDrawing, tidyLayout } from './workflow-drawing.ts';
export const DEFAULT_MAX_SEND_BACKS = 2;
export const MAX_WORKFLOWS = 6;
export const MAX_CREW = 4;

const ref = z.string().trim().min(1).max(80);

const collaborationShape = {
  orchestratorTalksTo: z.enum(['captains', 'everyone']).default('captains'),
  gates: z.array(GateSchema).max(MAX_GATES).default([]),
  maxSendBacks: z.number().int().min(0).max(3).default(DEFAULT_MAX_SEND_BACKS),
  summary: z.string().trim().min(1).max(500),
};

/** B8's design, as the setup chat still sends it: a workflow without name, scenario or command. */
export const CollaborationSchema = z.strictObject(collaborationShape);
export type Collaboration = z.output<typeof CollaborationSchema>;

export const WorkflowSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/, 'a slug: lowercase letters, digits and dashes (1–40)'),
  name: z.string().trim().min(1).max(60),
  when: z.string().trim().min(1).max(200).default('everything'),
  ...collaborationShape,
  lead: ref.optional(),
  crew: z
    .array(ref)
    .min(1)
    .max(MAX_CREW)
    .refine((c) => new Set(c).size === c.length, 'crew has duplicates')
    .optional(),
  /** The editor's first / final / steps / layout (src/domain/workflow-drawing.ts). */
  ...drawingShape,
});
export type Workflow = z.output<typeof WorkflowSchema>;

/** Where a workflow lives — added on reads only (a PUT ignores it): the project's list, a team, or one goal. */
export type WorkflowScope = 'office' | 'team' | 'temporary';
export type ScopedWorkflow = Workflow & { scope: WorkflowScope; teamId?: string };
export const scoped = (w: Workflow, scope: WorkflowScope, teamId?: string): ScopedWorkflow => ({
  ...w,
  scope,
  ...(teamId ? { teamId } : {}),
});

/** Pure: a workflow as a screen sends it back — the read-only fields dropped before the shape is checked. */
export function withoutReadFields(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { scope: _scope, teamId: _teamId, ...rest } = raw as Record<string, unknown>;
  return rest;
}

/** A team's own way of working (edited in the Cast): a workflow whose id may be left out. */
export const TeamWorkflowSchema = WorkflowSchema.extend({
  id: WorkflowSchema.shape.id.default('team'),
});

export const WorkflowsSchema = z
  .array(WorkflowSchema)
  .min(1)
  .max(MAX_WORKFLOWS)
  .refine((l) => new Set(l.map((w) => w.id)).size === l.length, 'workflow ids must be unique');

export const TEMP_WORKFLOW_ID = 'temp';
export const isTemporary = (w: Pick<Workflow, 'lead'> | null | undefined): boolean => !!w?.lead;

/** Who is on the project (or the plan) as the rules see it. */
export type Staffing = {
  /** team id → name + member ids (captain included). */
  teams: Map<string, { name: string; members: readonly string[] }>;
  /** Specialist ids (outside the teams), Cast guests included. */
  specialists: ReadonlySet<string>;
  name: (id: string) => string;
  /** Where the workflow lives, for messages (default "on this project"; a team's own: "on this team"). */
  where?: string;
  /** Placeholder counts for briefs not minted yet (setup only). */
  newAgents?: number;
  newTeams?: number;
};

const placeholder = /^new-(agent|team):(\d+)$/;

function onProject(s: Staffing): Who {
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
  return { isAgent, isTeam, name: s.name, where: s.where ?? 'on this project' };
}

/** A team's own workflow sees only the team: its members, and the team itself as "after" / "first". */
export const teamStaffing = (
  team: { id: string; name: string; members: readonly string[] },
  name: (id: string) => string,
): Staffing => ({
  teams: new Map([[team.id, { name: team.name, members: team.members }]]),
  specialists: new Set(),
  name,
  where: 'on this team',
});

/** Pure: every gate points at people on the project; no self-review, no duplicates. `at` prefixes each issue. */
export function collaborationIssues(c: Collaboration, s: Staffing, at = 'collaboration'): string[] {
  const out: string[] = [];
  const { isAgent, isTeam, where } = onProject(s);
  const seen = new Set<string>();
  c.gates.forEach((g, i) => {
    if (g.after !== '*' && !isTeam(g.after) && !isAgent(g.after))
      out.push(
        `${at}.gates.${i}.after: '${g.after}' is not a team or agent ${where} (use a team id, an agent id or "*")`,
      );
    if (!isAgent(g.reviewer))
      out.push(
        `${at}.gates.${i}.reviewer: '${g.reviewer}' is not ${where} — a reviewer must be someone who works here`,
      );
    else if (g.reviewer === g.after)
      out.push(`${at}.gates.${i}: ${s.name(g.reviewer)} can't review their own work`);
    const k = gateKey(g);
    if (seen.has(k)) out.push(`${at}.gates.${i}: the same gate is listed twice`);
    seen.add(k);
  });
  return out;
}

/** Pure: a workflow's gates, plus its command: stable ones have none, temporary ones a lead and crew on the project. */
export function workflowIssues(
  w: Workflow,
  s: Staffing,
  opts: { temporary: boolean },
  at = 'workflow',
): string[] {
  const out = [...collaborationIssues(w, s, at), ...drawingIssues(w, onProject(s), at)];
  if (!opts.temporary) {
    if (w.lead !== undefined || w.crew !== undefined)
      out.push(`${at}: a stable workflow names checks, not command — drop lead and crew`);
    return out;
  }
  if (w.lead === undefined) out.push(`${at}.lead: a temporary workflow needs a lead`);
  if (!w.crew?.length) out.push(`${at}.crew: a temporary workflow needs a crew (1–${MAX_CREW})`);
  const { isAgent } = onProject(s);
  if (w.lead !== undefined && !isAgent(w.lead)) out.push(`${at}.lead: '${w.lead}' is not on this project`);
  for (const [i, m] of (w.crew ?? []).entries()) {
    if (m === w.lead) out.push(`${at}.crew.${i}: ${s.name(m)} leads — the lead is not in their own crew`);
    else if (!isAgent(m)) out.push(`${at}.crew.${i}: '${m}' is not on this project`);
  }
  return out;
}

/** Pure: each stable workflow valid, ids unique. */
export function workflowsIssues(list: readonly Workflow[], s: Staffing): string[] {
  const out = list.flatMap((w, i) => workflowIssues(w, s, { temporary: false }, `workflows.${i}`));
  const ids = list.map((w) => w.id);
  ids.forEach((id, i) => {
    if (ids.indexOf(id) !== i) out.push(`workflows.${i}.id: '${id}' is used twice`);
  });
  return out;
}

export const fromCollaboration = (c: Collaboration): Workflow => ({
  ...c,
  id: 'usual',
  name: 'Our usual way',
  when: 'everything',
});

/** A workflow seen as B8's design (the old /collaboration API reads the first one this way). */
export const toCollaboration = (w: Workflow): Collaboration => ({
  orchestratorTalksTo: w.orchestratorTalksTo,
  gates: w.gates,
  maxSendBacks: w.maxSendBacks,
  summary: w.summary,
});

/** No design yet: the orchestrator briefs captains, no review gates. */
export const DEFAULT_COLLABORATION: Collaboration = {
  orchestratorTalksTo: 'captains',
  gates: [],
  maxSendBacks: DEFAULT_MAX_SEND_BACKS,
  summary: 'The orchestrator briefs team captains; no review gates yet.',
};
export const DEFAULT_WORKFLOW: Workflow = fromCollaboration(DEFAULT_COLLABORATION);

/** That id, else the project's first (the default), else the studio default. */
export const pickWorkflow = (list: readonly Workflow[], id?: string | null): Workflow =>
  (id ? list.find((w) => w.id === id) : undefined) ?? list[0] ?? DEFAULT_WORKFLOW;

/** The issue for a requested stable id that isn't on the project (null = fine: none asked, or it exists). */
export function unknownWorkflowIssue(list: readonly Workflow[], id: string | undefined): string | null {
  if (!id || list.some((w) => w.id === id)) return null;
  const known = list.length ? list.map((w) => `'${w.id}'`).join(', ') : `none yet (leave it out)`;
  return `workflow: '${id}' is not a workflow of this project — known: ${known}`;
}

/** A workflow as screens and board lines name it. */
/** `lead` / `crew`: temporary only (the office draws a ring around them while the goal runs). */
export type WorkflowTag = { id: string; name: string; temporary: boolean; lead?: string; crew?: string[] };
export const workflowTag = (w: Workflow): WorkflowTag => ({
  id: w.id,
  name: w.name,
  temporary: isTemporary(w),
  ...(w.lead ? { lead: w.lead } : {}),
  ...(w.lead && w.crew ? { crew: [...w.crew] } : {}),
});

/** A goal's workflow worth naming next to it: anything but the project's default (old goals: null = default). */
export const notDefault = (w: Workflow | null, defaultId: string): Workflow | null =>
  w && (isTemporary(w) || w.id !== defaultId) ? w : null;

const gateKey = (g: Pick<Gate, 'after' | 'reviewer' | 'kind'>) =>
  `${g.after}\u0000${g.reviewer}\u0000${g.kind}`;
export const LEAD_SIGNOFF_WHY = 'The lead signs off their crew’s work';

/** The gates a workflow really runs: its own, plus (temporary) the lead's sign-off of each crew member. */
export function effectiveGates(
  w: Pick<Workflow, 'gates'> & Partial<Pick<Workflow, 'lead' | 'crew'>>,
): Gate[] {
  const { lead } = w;
  if (!lead) return w.gates;
  const listed = new Set(w.gates.map(gateKey));
  const signoffs = (w.crew ?? [])
    .map((m): Gate => ({ after: m, reviewer: lead, kind: 'review', why: LEAD_SIGNOFF_WHY }))
    .filter((g) => !listed.has(gateKey(g)));
  return [...w.gates, ...signoffs];
}

/** Pure: a goal's workflow kept as a stable one — no lead or crew; a temporary lead's sign-offs written out as
    plain gates, so the same people keep checking the same work. */
export function stableCopy(w: Workflow, keep: { id: string; name: string; when: string }): Workflow {
  const { lead: _lead, crew: _crew, ...rest } = w;
  return { ...rest, ...keep, gates: effectiveGates(w) };
}

/** A temporary workflow as it is asked for (Phase 3): someone leads a small crew on this goal only. */
export const TempAskSchema = z.strictObject({
  lead: ref,
  crew: z
    .array(ref)
    .min(1)
    .max(MAX_CREW)
    .refine((c) => new Set(c).size === c.length, 'crew has duplicates'),
  gates: z.array(GateSchema).max(MAX_GATES).optional(),
  why: z.string().trim().min(1).max(500).optional(),
});
export type TempAsk = z.output<typeof TempAskSchema>;
/** What a goal asks to run under: a stable workflow's id, or a temporary one. */
export type WorkflowAsk = string | TempAsk;

/** Pure: the temporary workflow for one goal, built on the project's usual one (`base`: whom the orchestrator
    briefs, how often work may go back). `name` says who's who (agent id → name, `nick` the short form). */
export function temporaryWorkflow(
  base: Workflow,
  ask: TempAsk,
  name: (id: string) => string,
  nick: (id: string) => string = name,
): Workflow {
  return {
    id: TEMP_WORKFLOW_ID,
    name: `${nick(ask.lead)} leads`,
    when: 'this goal',
    orchestratorTalksTo: base.orchestratorTalksTo,
    gates: ask.gates ?? [],
    maxSendBacks: base.maxSendBacks,
    summary: ask.why ?? `${name(ask.lead)} leads ${ask.crew.map(name).join(', ')}`,
    lead: ask.lead,
    crew: ask.crew,
  };
}

type Led = { status: string; workflow: Pick<Workflow, 'lead' | 'crew'> | null };

/** Pure: who leads this agent on this goal right now — the temporary lead while the goal runs, else null. */
export const leadOf = (agentId: string, goal: Led): string | null =>
  goal.status === 'running' && goal.workflow?.lead && goal.workflow.crew?.includes(agentId)
    ? goal.workflow.lead
    : null;

/** Pure: everyone this agent leads now — the crews of the running goals they lead. */
export const crewsLedBy = (leadId: string, goals: readonly Led[]): string[] => [
  ...new Set(
    goals
      .filter((g) => g.status === 'running' && g.workflow?.lead === leadId)
      .flatMap((g) => g.workflow?.crew ?? []),
  ),
];

/** Rewrite `new-agent:N` / `new-team:N` to the minted ids (accept), in gates and command. */
export function resolvePlaceholders<T extends Collaboration & Partial<Pick<Workflow, 'lead' | 'crew'>>>(
  c: T,
  minted: { agents: readonly string[]; teams: readonly string[] },
): T {
  const fix = (id: string) => {
    const m = placeholder.exec(id);
    if (!m) return id;
    return (m[1] === 'agent' ? minted.agents : minted.teams)[Number(m[2])] ?? id;
  };
  return {
    ...c,
    gates: c.gates.map((g) => ({ ...g, after: fix(g.after), reviewer: fix(g.reviewer) })),
    ...(c.lead !== undefined ? { lead: fix(c.lead) } : {}),
    ...(c.crew !== undefined ? { crew: c.crew.map(fix) } : {}),
  };
}

/** One reviewer's sign-off on one task, as the sign-off strip shows it. */
export type Signoff = { reviewer: string; kind: GateKind; state: 'pending' | 'signed' | 'sent-back' };
type Reviewed = {
  gates: readonly ItemGate[];
  gateIndex: number;
  reviews: readonly { reviewer: string; gate: GateKind; verdict: 'approve' | 'changes' }[];
};

/** Pure: each gate of a task — passed gates (before `gateIndex`) are signed; the current one was sent back if
    its reviewer's last verdict there asked for changes; the rest wait. No extra runs: it reads recorded reviews. */
export function signoffs(item: Reviewed): Signoff[] {
  return item.gates.map((g, i) => {
    const last = item.reviews.findLast((r) => r.reviewer === g.reviewer && r.gate === g.kind);
    const state =
      i < item.gateIndex
        ? 'signed'
        : i === item.gateIndex && last?.verdict === 'changes'
          ? 'sent-back'
          : 'pending';
    return { reviewer: g.reviewer, kind: g.kind, state };
  });
}

/** Pure: everyone who signed off some task of the goal, once each, in task order. */
export const signedBy = (goal: { items: readonly Reviewed[] }): string[] => [
  ...new Set(
    goal.items.flatMap((it) =>
      signoffs(it)
        .filter((s) => s.state === 'signed')
        .map((s) => s.reviewer),
    ),
  ),
];

/** The review steps one build item goes through, in order. Self-review is skipped. */
export type ItemGate = { reviewer: string; kind: GateKind; why: string };
export function gatesFor(
  w: (Collaboration & Partial<Pick<Workflow, 'lead' | 'crew'>>) | null,
  item: { agentId: string; teamId: string | null },
): ItemGate[] {
  if (!w) return [];
  const out: ItemGate[] = [];
  for (const g of effectiveGates(w)) {
    const hit =
      g.after === '*' || g.after === item.agentId || (item.teamId !== null && g.after === item.teamId);
    if (!hit || g.reviewer === item.agentId) continue;
    if (out.some((o) => o.reviewer === g.reviewer && o.kind === g.kind)) continue;
    out.push({ reviewer: g.reviewer, kind: g.kind, why: g.why });
  }
  return out;
}
