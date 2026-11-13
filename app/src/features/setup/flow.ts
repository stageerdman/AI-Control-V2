/* The project-setup space, pure: steps + what each one needs, the "In setup" card, the plan on
   stage, and the Project Setter's checklist folded from live `setup.step` events.
   The user's order (v5): the Setter sets the project up first (POST /drafts/:id/setup), then the
   orchestrator enters and picks the team; Accept → finish creates the project. */
import type { Agent, Draft, Plan, SetupStep, Team } from '../../api';
import { nickOf } from '../projects/model';

export const STEPS = ['Start', 'Name', 'Orchestrator', 'Setup', 'Team'] as const;
export const STEP = { start: 0, name: 1, orchestrator: 2, setup: 3, team: 4 } as const;
export const stepOf = (d: Pick<Draft, 'step'>): number => Math.max(0, Math.min(STEPS.length - 1, d.step));

/* ---------------- what each step needs before Continue ---------------- */
export type StepDraft = Pick<Draft, 'mode' | 'name' | 'folder' | 'orchestratorId' | 'plan' | 'setupAt'>;
export function canContinue(step: number, d: StepDraft, orchestrators: Pick<Agent, 'id'>[]): boolean {
  switch (step) {
    case STEP.name:
      return !!d.name.trim() && (d.mode !== 'adopt' || !!d.folder);
    case STEP.orchestrator:
      return !!d.orchestratorId && orchestrators.some((o) => o.id === d.orchestratorId);
    case STEP.setup:
      return !!d.setupAt;
    case STEP.team:
      return !!d.plan && staffed(d.plan) > 0;
    default:
      return false;
  }
}
/** Changing the orchestrator after a chat starts the team talk over (a new orchestrator, a new plan). */
export const resetsTeamTalk = (before: Pick<Draft, 'orchestratorId' | 'chat' | 'plan'>, nextOrch: string) =>
  before.orchestratorId !== nextOrch && (before.chat.length > 0 || before.plan !== null);

/** The orchestrator a draft uses (its own, else the first). */
export const orchOf = (d: Pick<Draft, 'orchestratorId'>, orchestrators: Agent[]): Agent | undefined =>
  orchestrators.find((o) => o.id === d.orchestratorId) ?? orchestrators[0];

/** First line of an orchestrator's prompt as a quote (skips "You are …"). */
export function orchLine(o: Pick<Agent, 'prompt'> | undefined): string {
  const parts = (o?.prompt ?? '').split(/(?<=\.)\s/);
  const first = /^You are\b/.test(parts[0] ?? '') && parts[1] ? parts[1] : parts[0];
  return first ? `“${first}”` : '';
}

/* ---------------- names + folders ---------------- */
/** The server's slugify (domain/ids.ts) — the folder a new project gets. */
export function slugify(s: string, fallback = 'project'): string {
  const slug = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
  return slug || fallback;
}
/** "pocket-recipes" → "Pocket Recipes" (a picked folder's suggested name). */
export const titleOf = (folder: string): string =>
  folder
    .split(/[-_\s.]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
/** /Users/me/dev/AI-Studio-Sandbox → ~/dev/AI-Studio-Sandbox */
export const tildePath = (abs: string): string => abs.replace(/^\/(Users|home)\/[^/]+/, '~');

/* ---------------- the "In setup" card on Projects ---------------- */
export type DraftCard = {
  id: string;
  title: string;
  line: string;
  label: string;
  dots: ('done' | 'now' | '')[];
};
export function draftCard(d: Draft, orchestrators: Agent[]): DraftCard {
  const s = stepOf(d);
  const title = d.name.trim() || 'Untitled project';
  const o = s >= STEP.orchestrator ? orchOf(d, orchestrators) : undefined;
  return {
    id: d.id,
    title,
    line: `${d.mode === 'adopt' ? 'Adopting' : 'New'} · ${STEPS[s]}${o ? ` · ${nickOf(o)}` : ''}`,
    label: `Resume ${d.name.trim() || 'untitled project'} — step ${s + 1} of ${STEPS.length}, ${STEPS[s]}`,
    dots: STEPS.map((_, i) => (i < s ? 'done' : i === s ? 'now' : '')),
  };
}

/* ---------------- the plan on stage ---------------- */
export const staffed = (p: Plan): number =>
  p.teams.length + p.specialists.length + p.newAgents.length + p.newTeams.length;
export const pendingBriefs = (p: Plan | null): number => (p ? p.newAgents.length + p.newTeams.length : 0);

export type PlanMember = { agent: Agent; captain: boolean; dup: boolean };
export type PlanView = {
  teams: { team: Team; why: string; members: PlanMember[]; fresh: boolean }[];
  specialists: { agent: Agent; why: string; fresh: boolean }[];
  newTeams: string[];
  newAgents: string[];
  /** Unique agents across teams + specialists (briefs not counted). */
  agentCount: number;
  captains: string[];
};
/** Resolve a plan against the Cast. `fresh` = ids the Agent Creator just minted (tagged "new"). */
export function planView(
  plan: Plan,
  teams: Team[],
  agents: Agent[],
  fresh: ReadonlySet<string> = new Set(),
): PlanView {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const placed = new Set<string>();
  const out: PlanView = {
    teams: [],
    specialists: [],
    newTeams: [],
    newAgents: [],
    agentCount: 0,
    captains: [],
  };
  for (const pt of plan.teams) {
    const team = teams.find((t) => t.id === pt.teamId);
    if (!team) continue;
    const members: PlanMember[] = [];
    for (const m of team.members) {
      const agent = byId.get(m.agentId);
      if (!agent) continue;
      members.push({ agent, captain: team.captainId === agent.id, dup: placed.has(agent.id) });
      placed.add(agent.id);
    }
    out.teams.push({ team, why: pt.why, members, fresh: fresh.has(team.id) });
    const cap = team.captainId ? byId.get(team.captainId) : undefined;
    if (cap) out.captains.push(nickOf(cap));
  }
  for (const s of plan.specialists) {
    const agent = byId.get(s.agentId);
    if (!agent) continue;
    out.specialists.push({ agent, why: s.why, fresh: fresh.has(agent.id) });
    placed.add(agent.id);
  }
  out.newTeams = plan.newTeams.map((b) => b.brief);
  out.newAgents = plan.newAgents.map((b) => b.brief);
  out.agentCount = placed.size;
  return out;
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
/** "3 teams · 1 specialist · 9 agents." */
export function planLine(v: PlanView): string {
  const bits = [v.teams.length ? n(v.teams.length, 'team') : 'No teams'];
  if (v.specialists.length) bits.push(n(v.specialists.length, 'specialist'));
  bits.push(n(v.agentCount, 'agent'));
  return `${bits.join(' · ')}.`;
}
/** "Tinker designs 1 new team and 1 specialist when you accept." ('' when nothing is pending) */
export function briefLine(v: PlanView, creatorNick: string): string {
  const parts = [];
  if (v.newTeams.length) parts.push(n(v.newTeams.length, 'new team'));
  if (v.newAgents.length) parts.push(n(v.newAgents.length, 'new specialist'));
  return parts.length ? `${creatorNick} designs ${parts.join(' and ')} when you accept.` : '';
}

/* ---------------- the Project Setter's checklist ---------------- */
/** The scaffold's steps in order (server/src/setter/scaffold.ts) with the prototype's labels. */
export const SETTER_STEPS: { step: string; label: string; detail: (mode: Draft['mode']) => string }[] = [
  {
    step: 'folder',
    label: 'Project folder',
    detail: (m) => (m === 'adopt' ? 'read the folder first' : 'a new folder in the sandbox'),
  },
  { step: '.project', label: '.project', detail: () => 'project marker · modules, secrets' },
  { step: 'CLAUDE.md', label: 'CLAUDE.md', detail: () => 'compiled from the global modules' },
  { step: '.gitignore', label: '.gitignore', detail: () => 'always covers .env' },
  { step: '.env', label: '.env', detail: () => 'this project’s secrets — never committed' },
  { step: 'updates/', label: 'updates/', detail: () => 'first update: INIT - OPEN' },
  { step: 'issues.txt', label: 'issues.txt', detail: () => 'running list of issues & TODOs' },
  { step: 'git', label: 'git', detail: () => 'a local repository' },
  { step: 'commit', label: 'First commit', detail: () => 'commit what was added (local only)' },
];

export type RowState = '' | 'doing' | 'done' | 'kept' | 'skipped';
export type SetterRow = { step: string; label: string; detail: string; state: RowState };
export type SetterState = { rows: SetterRow[]; failed: string | null; done: boolean };

export const setterStart = (mode: Draft['mode']): SetterState => ({
  rows: SETTER_STEPS.map((s) => ({ step: s.step, label: s.label, detail: s.detail(mode), state: '' })),
  failed: null,
  done: false,
});

/** Fold one `setup.step` (running → done / kept / skipped). A new 'folder running' = a new run. */
export function setterStep(st: SetterState, ev: SetupStep, mode: Draft['mode']): SetterState {
  const base = ev.step === 'folder' && ev.status === 'running' ? setterStart(mode) : st;
  const known = base.rows.some((r) => r.step === ev.step);
  const rows = known
    ? base.rows
    : [...base.rows, { step: ev.step, label: ev.step, detail: '', state: '' as RowState }];
  return {
    ...base,
    failed: null,
    rows: rows.map((r) =>
      r.step === ev.step
        ? { ...r, detail: ev.detail || r.detail, state: ev.status === 'running' ? 'doing' : ev.status }
        : r,
    ),
  };
}
export const setterFailed = (st: SetterState, message: string): SetterState => ({
  ...st,
  failed: message,
  rows: st.rows.map((r) => (r.state === 'doing' ? { ...r, state: '' } : r)),
});
/** The finish response is the truth: every step it reports, then done. */
export function setterDone(steps: SetupStep[], mode: Draft['mode']): SetterState {
  let s = setterStart(mode);
  for (const ev of steps) s = setterStep(s, ev, mode);
  return { ...s, done: true };
}
/** A draft set up earlier (this session didn't see the steps): every row done. */
export const setterAlreadyDone = (mode: Draft['mode']): SetterState => {
  const s = setterStart(mode);
  return { ...s, rows: s.rows.map((r) => ({ ...r, state: 'done' })), done: true };
};
/** 0–100: finished rows over all rows. */
export const setterPct = (st: SetterState): number =>
  st.done
    ? 100
    : Math.round(
        (st.rows.filter((r) => r.state && r.state !== 'doing').length / Math.max(1, st.rows.length)) * 100,
      );
