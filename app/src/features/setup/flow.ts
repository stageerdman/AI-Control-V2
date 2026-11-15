/* The project-setup space, pure: steps + what each one needs, the "In setup" card, the plan on
   stage, and the Project Setter's checklist folded from live `setup.step` events.
   The user's order (v5): the Setter sets the project up first (POST /drafts/:id/setup), then the
   orchestrator enters and picks the team; Accept → finish creates the project. */
import type { Agent, Draft, EventPayloads, Plan, SetupStep, Team } from '../../api';
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
  { step: 'commit', label: 'First commit', detail: () => 'commit what was added' },
  { step: 'github', label: 'GitHub', detail: () => 'a private repo' },
];

/* ---------------- GitHub at setup (G1: a private repo by default) ---------------- */
/** The Name step's switch: the draft's own choice, else the studio default. */
export const githubOn = (d: Pick<Draft, 'github'>, studioDefault: boolean): boolean =>
  d.github ?? studioDefault;

/** "https://x@gitlab.com/me/app.git" → "gitlab.com/me/app" (the Name step's "keeps origin (…)"). */
export function remoteLabel(r: { url: string; github: string | null }): string {
  if (r.github) return r.github;
  return r.url
    .replace(/^[a-z][a-z0-9+.-]*:\/\/([^@/]*@)?/i, '')
    .replace(/^[^@]+@([^:]+):/, '$1/')
    .replace(/\.git$/, '');
}

const LATER = 'publish later from Health';
/** The server's GitHub step line → the checklist's words (spec-ux-G2 §2a). GitHub never fails a setup. */
export function githubDetail(ev: Pick<SetupStep, 'status' | 'detail'>, slug: string): string {
  const d = ev.detail;
  if (ev.status === 'running') return `creating ${slug} · pushing main`;
  if (ev.status === 'done') {
    const repo = /github\.com\/([^\s)]+)/.exec(d)?.[1] ?? slug;
    return /push failed/.test(d) ? `${repo} · private · first push didn’t go through` : `${repo} · private`;
  }
  if (ev.status === 'kept') {
    const m = /Kept its GitHub repo (\S+)/.exec(d) ?? /Kept its remote \(([^)]+)\)/.exec(d);
    return `kept origin (${m ? remoteLabel({ url: m[1] as string, github: null }) : 'its remote'})`;
  }
  if (/off for this project/.test(d)) return `skipped — ${LATER}`;
  if (/isn’t installed|isn't installed|isn’t logged in|isn't logged in|not logged/.test(d))
    return `skipped — GitHub CLI not signed in · ${LATER}`;
  if (/already exists/i.test(d)) return `skipped — ${slug} already exists · ${LATER}`;
  return `skipped — couldn’t reach GitHub · ${LATER}`;
}

export type RowState = '' | 'doing' | 'done' | 'kept' | 'skipped';
export type SetterRow = { step: string; label: string; detail: string; state: RowState };
export type SetterState = { rows: SetterRow[]; failed: string | null; done: boolean };

/** `github`: what the GitHub row says while it waits (on = "a private repo"; off; or "keeps origin (…)"). */
export const setterStart = (mode: Draft['mode'], github: boolean | string = true): SetterState => ({
  rows: SETTER_STEPS.map((s) => ({
    step: s.step,
    label: s.label,
    detail:
      s.step !== 'github'
        ? s.detail(mode)
        : typeof github === 'string'
          ? `keeps origin (${github})`
          : github
            ? 'a private repo'
            : `off — ${LATER}`,
    state: '',
  })),
  failed: null,
  done: false,
});

/** Fold one `setup.step` (running → done / kept / skipped). A new 'folder running' = a new run. */
export function setterStep(
  st: SetterState,
  ev: SetupStep,
  _mode: Draft['mode'],
  slug = 'the repo',
): SetterState {
  const base =
    ev.step === 'folder' && ev.status === 'running'
      ? { ...st, failed: null, done: false, rows: st.rows.map((r) => ({ ...r, state: '' as RowState })) }
      : st;
  if (ev.step === 'github') ev = { ...ev, detail: githubDetail(ev, slug) };
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
export function setterDone(
  steps: SetupStep[],
  mode: Draft['mode'],
  slug?: string,
  github: boolean | string = true,
): SetterState {
  let s = setterStart(mode, github);
  for (const ev of steps) s = setterStep(s, ev, mode, slug);
  /* a server without the GitHub step (or one that never reported it) leaves no row hanging */
  return { ...s, rows: s.rows.filter((r) => r.step !== 'github' || r.state), done: true };
}
/** A draft set up earlier (this session didn't see the steps): every row done (GitHub: see health). */
export const setterAlreadyDone = (mode: Draft['mode']): SetterState => {
  const s = setterStart(mode);
  return {
    ...s,
    rows: s.rows.filter((r) => r.step !== 'github').map((r) => ({ ...r, state: 'done' })),
    done: true,
  };
};
/** 0–100: finished rows over all rows. */
export const setterPct = (st: SetterState): number =>
  st.done
    ? 100
    : Math.round(
        (st.rows.filter((r) => r.state && r.state !== 'doing').length / Math.max(1, st.rows.length)) * 100,
      );

/* ---------------- the room (AGENT MCP): who is here, and what they're doing ---------------- */
export type RoomCall = EventPayloads['room.call'];
export type RoomGuest = { agentId: string; by?: string; why?: string };
export type RoomState = { guests: RoomGuest[]; calls: Record<string, RoomCall> };
export const ROOM0: RoomState = { guests: [], calls: {} };

/** Fold a draft's `room.joined` / `room.call` events (replayed or live) into the room. */
export function roomFold(s: RoomState, e: { type: string; payload: unknown }): RoomState {
  if (e.type === 'room.joined') {
    const g = e.payload as RoomGuest;
    return s.guests.some((x) => x.agentId === g.agentId) ? s : { ...s, guests: [...s.guests, g] };
  }
  if (e.type === 'room.call') {
    const c = e.payload as RoomCall;
    return { ...s, calls: { ...s.calls, [c.callId]: c } };
  }
  return s;
}

export type Doing = { pose: 'pressing' | 'talking' | 'thinking' | 'writing' | 'idle'; label?: string };

/** What each person in the room is doing now. `live` = an accept is running; otherwise everyone is idle
    (a call left mid-way after a reload is stale). The creator designs while live unless a call says more. */
export function roomDoing(
  s: RoomState,
  live: boolean,
  creatorId: string | undefined,
  nick: (id: string) => string,
): Record<string, Doing> {
  const out: Record<string, Doing> = {};
  if (!live) return out;
  if (creatorId && s.guests.some((g) => g.agentId === creatorId))
    out[creatorId] = { pose: 'pressing', label: 'designing' };
  for (const c of Object.values(s.calls)) {
    if (c.status === 'asking') {
      out[c.from] = { pose: 'talking', label: `asking ${c.approver ? nick(c.approver) : ''}`.trim() };
      if (c.approver) out[c.approver] = { pose: 'thinking' };
    } else if (c.status === 'working') out[c.to] = { pose: 'writing', label: `for ${nick(c.from)}` };
  }
  return out;
}

/** The room's label for screen readers: everyone present, in order. */
export const roomLabel = (names: string[]) => `In the room: ${names.join(', ')}`;

/** The polite announcement for a join. */
export const joinLine = (who: string, forWhom?: string) =>
  forWhom ? `${who} joined the room, for ${forWhom}.` : `${who} joined the room.`;
