/* Bring back Cast agents that were deleted (by accident) and get the work that waited for them moving again.
   An agent comes back under its original id, so its chats, runs and work items (which keep the id, no FK)
   connect again by themselves. Setup comes from the trash snapshot first (the Undo path: seats, specialist
   links and orchestrator handovers come back with it), else from its cast-pack archetype. An agent that is
   already in the Cast is never touched, so running a restore twice is safe. */
import { CAST_PACKS } from '../cast-packs/index.ts';
import { type CastPack, ensureRole, installed, type PackAgent } from '../cast-packs/pack.ts';
import { requeuePatch } from '../crew/requeue.ts';
import { runsRepo } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { type AgentSnap, TRASH_TTL_MS } from '../db/trash.ts';
import { row, rows } from '../db/util.ts';
import { type ChecklistItem, workRepo } from '../db/work.ts';
import { createBus } from '../events/bus.ts';
import { eventLog } from '../events/log.ts';
import { staffIds } from './former.ts';
import { createStaffing, type Staffing } from './staffing.ts';

export type MissingAgent = {
  id: string;
  name: string;
  source: 'trash' | 'pack' | 'git' | 'none';
  chatsFound: boolean;
  blockedRuns: string[];
};
export type RestoreResult = {
  id: string;
  name: string;
  restored: boolean;
  setupFrom: 'trash' | 'pack' | 'none';
  toolsRestored: boolean;
  chatsRelinked: number;
  runsResumed: string[];
  lost: string[];
};
export type RestoreDeps = {
  packs?: readonly CastPack[];
  /** Work that waits for the agent (item or run ids); default: what blockedWork finds. */
  blockedRuns?: string[];
  /** bringBack puts the agent back on a project it has work on; default: a staffing service on this store. */
  staffing?: Staffing;
  /** Start queued work now (the live dispatch's pump); without it, the next pump or restart picks it up. */
  wake?: (projectId: string) => void;
};

/* ------------------------------------------------------------ sources */
type Trashed = { token: string; snap: AgentSnap };
function trashedAgent(store: Store, id: string): Trashed | null {
  const cutoff = new Date(Date.now() - TRASH_TTL_MS).toISOString(); // older tokens no longer restore
  const t = row<{ token: string; payload: string }>(
    store.db
      .prepare(
        "SELECT token, payload FROM trash WHERE kind = 'agent' AND item_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(id, cutoff),
  );
  return t ? { token: t.token, snap: JSON.parse(t.payload) as AgentSnap } : null;
}

function packAgent(packs: readonly CastPack[], id: string): { pack: CastPack; agent: PackAgent } | null {
  for (const pack of packs) {
    const agent = pack.agents.find((a) => a.id === id);
    if (agent) return { pack, agent };
  }
  return null;
}

/** Every agent id the studio still remembers: trash snapshots, installed packs, runs and work items. */
function rememberedIds(store: Store, packs: readonly CastPack[]): string[] {
  const ids = rows<{ id: string }>(
    store.db
      .prepare(
        `SELECT item_id AS id FROM trash WHERE kind = 'agent'
         UNION SELECT agent_id FROM runs UNION SELECT agent_id FROM checklist_items`,
      )
      .all(),
  ).map((r) => r.id);
  const fromPacks = packs.filter((p) => installed(store, p)).flatMap((p) => p.agents.map((a) => a.id));
  return [...new Set([...ids, ...fromPacks])];
}

const runCount = (store: Store, agentId: string) =>
  (store.db.prepare('SELECT COUNT(*) AS n FROM runs WHERE agent_id = ?').get(agentId) as { n: number }).n;

/** Work waiting for the agent: its queued, running or failed items on goals that are not over. */
export function blockedWork(store: Store, agentId: string): string[] {
  return rows<{ id: string }>(
    store.db
      .prepare(
        `SELECT i.id FROM checklist_items i JOIN goals g ON g.id = i.goal_id
         WHERE i.agent_id = ? AND i.status IN ('todo', 'running', 'failed') AND g.status NOT IN ('done', 'cancelled')
         ORDER BY g.created_at, i.position`,
      )
      .all(agentId),
  ).map((r) => r.id);
}

/* ------------------------------------------------------------ find */
export function findMissingAgents(store: Store, packs: readonly CastPack[] = CAST_PACKS): MissingAgent[] {
  return rememberedIds(store, packs)
    .filter((id) => !store.agents.record(id))
    .map((id) => {
      const trashed = trashedAgent(store, id);
      const fromPack = packAgent(packs, id);
      return {
        id,
        name: trashed?.snap.agent.name ?? fromPack?.agent.name ?? id,
        source: trashed ? 'trash' : fromPack ? 'pack' : 'none',
        chatsFound: runCount(store, id) > 0,
        blockedRuns: blockedWork(store, id),
      };
    });
}

/* ------------------------------------------------------------ restore */
type PutBack = { from: 'trash' | 'pack'; tools: string | null; lost: string[] };

/** What the snapshot had that the studio's rules didn't let back in. */
function notBack(store: Store, { agent, seats, specialistOn }: AgentSnap): string[] {
  const lost: string[] = [];
  const now = store.agents.record(agent.id);
  if (agent.role_id && now?.role_id !== agent.role_id) lost.push(`Role '${agent.role_id}': it was deleted`);
  for (const s of seats) {
    const team = store.teams.get(s.teamId);
    if (!team) lost.push(`Seat on team '${s.teamId}': the team is gone`);
    else if (!team.members.some((m) => m.agentId === agent.id)) lost.push(`Seat on ${team.name}: the team is full`);
    else if (s.wasCaptain && team.captainId !== agent.id) lost.push(`Captain of ${team.name}`);
  }
  for (const p of specialistOn)
    if (!store.projects.get(p.projectId)) lost.push(`Specialist on project '${p.projectId}': the project is gone`);
  return lost;
}

function fromTrash(store: Store, t: Trashed): PutBack {
  store.trash.restore(t.token);
  return { from: 'trash', tools: t.snap.agent.tools ?? null, lost: notBack(store, t.snap) };
}

function fromPack(store: Store, { pack, agent }: { pack: CastPack; agent: PackAgent }): PutBack {
  const { id, roleId, ...setup } = agent;
  store.tx(() => {
    const role = pack.roles.find((r) => r.id === roleId);
    store.agents.create({ ...setup, roleId: role ? ensureRole(store, role) : null }, id);
  });
  return {
    from: 'pack',
    tools: JSON.stringify(agent.tools),
    lost: ['Edits, team seats and project links from before: no trash snapshot, so it came back as its cast pack made it'],
  };
}

function putBack(store: Store, id: string, packs: readonly CastPack[]): PutBack | null {
  const trashed = trashedAgent(store, id);
  if (trashed) return fromTrash(store, trashed);
  const archetype = packAgent(packs, id);
  return archetype ? fromPack(store, archetype) : null;
}

/* ------------------------------------------------------------ carry on */
const runIsLive = (store: Store, runId: string | null) => !!runId && runsRepo(store.db).get(runId)?.status === 'running';

function itemFor(store: Store, workOrRunId: string): ChecklistItem | null {
  const work = workRepo(store.db);
  return work.item(workOrRunId) ?? work.itemByRun(workOrRunId);
}

/** The blocked items queue again for the agent, and it is on their project (bringBack) so dispatch hands them over. */
function carryOn(store: Store, agentId: string, blocked: string[], deps: RestoreDeps) {
  const work = workRepo(store.db);
  const staffing = deps.staffing ?? createStaffing({ store, events: eventLog(store.db, createBus()) });
  const resumed: string[] = [];
  const lost: string[] = [];
  const projects = new Set<string>();
  for (const ref of blocked) {
    const it = itemFor(store, ref);
    const goal = it && work.goal(it.goalId);
    if (!it || !goal || it.agentId !== agentId) {
      lost.push(`Work '${ref}': no work item of this agent`);
      continue;
    }
    if (goal.status === 'done' || goal.status === 'cancelled') continue; // nothing waits any more
    const p = store.projects.require(it.projectId);
    if (agentId !== p.orchestratorId && !staffIds(store, p.id).has(agentId)) {
      const back = staffing.bringBack(p.id, agentId);
      if (!back.ok) lost.push(`Work '${it.id}': ${back.error}`);
    }
    if (it.status !== 'todo' && !runIsLive(store, it.runId)) {
      const hasSession = !!(it.runId && runsRepo(store.db).get(it.runId)?.sessionId);
      work.setItem(it.id, requeuePatch(it, hasSession));
    }
    if (goal.status !== 'running') work.setGoalStatus(goal.id, 'running');
    resumed.push(it.id);
    projects.add(p.id);
  }
  for (const projectId of projects) deps.wake?.(projectId);
  return { resumed, lost };
}

export function restoreAgent(store: Store, id: string, deps: RestoreDeps = {}): RestoreResult {
  const packs = deps.packs ?? CAST_PACKS;
  const here = store.agents.get(id);
  const base = { id, chatsRelinked: runCount(store, id) };
  if (here) {
    /* already in the Cast: never overwrite it */
    return { ...base, name: here.name, restored: false, setupFrom: 'none', toolsRestored: false, runsResumed: [], lost: [] };
  }
  const blocked = deps.blockedRuns ?? blockedWork(store, id);
  const back = putBack(store, id, packs);
  if (!back) {
    return {
      ...base,
      name: id,
      restored: false,
      setupFrom: 'none',
      toolsRestored: false,
      runsResumed: [],
      lost: ['Setup and tools: no trash snapshot and no cast-pack archetype for this id', ...blocked.map((b) => `Work '${b}': still waiting, nobody to give it to`)],
    };
  }
  const record = store.agents.record(id);
  const { resumed, lost } = carryOn(store, id, blocked, deps);
  return {
    ...base,
    name: record?.name ?? id,
    restored: true,
    setupFrom: back.from,
    toolsRestored: (record?.tools ?? null) === back.tools,
    runsResumed: resumed,
    lost: [...back.lost, ...lost],
  };
}
