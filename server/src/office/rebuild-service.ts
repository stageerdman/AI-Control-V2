/* Team rebuilds, applying and undoing (spec-ux-team-rebuild §2, §3): a plan (rebuild.ts) is kept here until it is
   confirmed, applied all-or-nothing in one store.tx with a snapshot, and can be undone from that snapshot for 10
   minutes while nobody has started new work under the new lineup. Plans and snapshots live in memory: after a
   restart a card is simply stale ("ask again"). */
import { randomUUID } from 'node:crypto';
import type { Store } from '../db/store.ts';
import { now } from '../db/util.ts';
import { workRepo } from '../db/work.ts';
import type { Member } from '../domain/teams.ts';
import { invalid, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { type Overrides, planRebuild, type RebuildCard, type RebuildInput, summaryOf } from './rebuild.ts';

export const UNDO_MS = 10 * 60_000;
const PLAN_MS = 60 * 60_000;

type Plan = { projectId: string; input: RebuildInput; stamp: string; stale: boolean; at: number };
type Snapshot = {
  projectId: string;
  at: number;
  iso: string;
  teamIds: string[];
  agentIds: string[];
  rosters: { id: string; name: string; captainId: string | null; members: Member[] }[];
  created: string[];
  items: {
    id: string;
    agentId: string;
    teamId: string | null;
    note: string | null;
    status: string;
    runId: string | null;
  }[];
  before: string[];
  after: string[];
};

export type Offer = {
  planId: string;
  needsConfirm: boolean;
  card: RebuildCard;
  undoToken?: string;
  summary?: string;
};

export function createRebuilds(deps: {
  store: Store;
  events: EventLog;
  /** Stop a live run ("stop now and hand over"). */
  stopRun?: (projectId: string, runId: string) => void;
  clock?: () => number;
}) {
  const { store, events } = deps;
  const clock = deps.clock ?? Date.now;
  const work = workRepo(store.db);
  const plans = new Map<string, Plan>();
  const undos = new Map<string, Snapshot>();

  /** The lineup as it is: a plan made against another lineup is stale. */
  const stampOf = (projectId: string) => {
    const p = store.projects.require(projectId);
    const teams = p.teamIds.map((id) => {
      const t = store.teams.get(id);
      return [id, t?.name, t?.captainId, t?.members.map((m) => m.agentId)];
    });
    return JSON.stringify([teams, p.agentIds]);
  };
  const sweep = () => {
    const t = clock();
    for (const [k, v] of plans) if (t - v.at > PLAN_MS) plans.delete(k);
    for (const [k, v] of undos) if (t - v.at > UNDO_MS) undos.delete(k);
  };

  /** A plan for the confirm card (nothing written). */
  function plan(projectId: string, input: RebuildInput): Offer {
    sweep();
    const r = planRebuild(store, projectId, input);
    if (!r.ok) throw invalid(r.error);
    plans.set(r.planId, { projectId, input, stamp: stampOf(projectId), stale: false, at: clock() });
    return { planId: r.planId, needsConfirm: r.needsConfirm, card: r.card };
  }

  /** A newer message to the director: every open card of the project goes stale. */
  function staleAll(projectId: string) {
    for (const p of plans.values()) if (p.projectId === projectId) p.stale = true;
  }

  /** The card's picks fold in after the plan's own (later picks win in the planner). */
  const withPicks = (input: RebuildInput, o: Overrides): RebuildInput => ({
    ...input,
    handover: [...(input.handover ?? []), ...(o.handover ?? [])],
    captain: [...(input.captain ?? []), ...(o.captain ?? [])],
    lone: [...(input.lone ?? []), ...(o.lone ?? [])],
  });

  /** Apply it all or nothing → the Undo token and the one-line summary. */
  function apply(
    planId: string,
    picks: Overrides = {},
    by?: string,
  ): { undoToken: string; summary: string; card: RebuildCard } {
    const saved = plans.get(planId);
    if (!saved) throw notFound('Plan', planId);
    if (saved.stale || saved.stamp !== stampOf(saved.projectId))
      throw invalid('This plan is stale — the lineup changed since. Ask again.');
    const { projectId } = saved;
    const r = planRebuild(store, projectId, withPicks(saved.input, picks), planId);
    if (!r.ok) throw invalid(r.error);
    const p = store.projects.require(projectId);
    const stops: string[] = [];
    const snap = store.tx((): Snapshot => {
      const snap: Snapshot = {
        projectId,
        at: clock(),
        iso: now(), // the same clock runs.started_at uses
        teamIds: [...p.teamIds],
        agentIds: [...p.agentIds],
        rosters: [],
        created: [],
        items: [],
        before: r.before,
        after: r.after,
      };
      const keys = new Map<string, string>();
      const real = (k: string | null) => (k === null ? null : (keys.get(k) ?? k));
      for (const s of r.steps) {
        if (s.kind === 'team.create') {
          const from = store.teams.get(s.from);
          const t = store.teams.create({
            name: s.name,
            emblem: s.emblem,
            color: s.color,
            blurb: from?.blurb ?? '',
            instr: from?.instr ?? '',
            code: from?.code ?? '',
            reporter: from?.reporter ?? false,
            members: s.members.map((m) => ({ agentId: m.agentId, instr: m.instr })),
            captainId: s.captainId,
          });
          keys.set(s.key, t.id);
          snap.created.push(t.id);
        } else if (s.kind === 'team.update') {
          const t = store.teams.require(s.key);
          snap.rosters.push({ id: t.id, name: t.name, captainId: t.captainId, members: t.members });
          store.teams.saveRoster(t.id, { captainId: s.captainId, members: s.members });
          if (s.name !== t.name) store.teams.update(t.id, { name: s.name });
        } else if (s.kind === 'project.lineup') {
          store.projects.update(projectId, {
            teamIds: s.teamKeys.map((k) => real(k) as string),
            agentIds: s.agentIds,
          });
        } else {
          const it = work.item(s.itemId);
          if (!it) continue;
          snap.items.push({
            id: it.id,
            agentId: it.agentId,
            teamId: it.teamId,
            note: it.note,
            status: it.status,
            runId: it.runId,
          });
          work.reassign(it.id, { agentId: s.agentId, teamId: real(s.teamKey), note: s.note ?? it.note });
          if (s.stopRunId && it.status === 'running') {
            work.setItem(it.id, { status: 'todo', runId: null }); // the run's end then finds no item: it waits for its new owner
            stops.push(s.stopRunId);
          }
        }
      }
      return snap;
    });
    plans.delete(planId);
    for (const run of stops) deps.stopRun?.(projectId, run);
    announce(snap.before, snap.after, projectId, by);
    const undoToken = randomUUID();
    undos.set(undoToken, snap);
    return { undoToken, summary: summaryOf(r.card), card: r.card };
  }

  function announce(before: string[], after: string[], projectId: string, by?: string) {
    const left = before.filter((id) => !after.includes(id));
    const joined = after.filter((id) => !before.includes(id));
    for (const agentId of left)
      events.append('project', projectId, { type: 'room.left', payload: { agentId, ...(by ? { by } : {}) } });
    for (const agentId of joined)
      events.append('project', projectId, {
        type: 'room.joined',
        payload: { agentId, ...(by ? { by } : {}) },
      });
    const p = store.projects.require(projectId);
    events.append('project', projectId, {
      type: 'staff.changed',
      payload: {
        teamIds: p.teamIds,
        agentIds: p.agentIds,
        added: joined,
        removed: left,
        moved: after.filter((id) => before.includes(id)),
      },
    });
  }

  /** Has anyone started work under the new lineup? (Any checklist run that began after the rebuild.) */
  const newWorkSince = (projectId: string, iso: string) =>
    !!store.db
      .prepare(
        `SELECT 1 FROM runs r JOIN checklist_items i ON i.run_id = r.id OR i.build_run_id = r.id
         WHERE r.project_id = ? AND r.started_at > ? LIMIT 1`,
      )
      .get(projectId, iso);

  /** Put the lineup, captains and item owners back as they were. */
  function undo(token: string): { summary: string } {
    sweep();
    const s = undos.get(token);
    if (!s) throw invalid('Too late to undo — rebuild again instead.');
    if (newWorkSince(s.projectId, s.iso)) {
      undos.delete(token);
      throw invalid('Too late to undo — new work started under the new lineup. Rebuild again instead.');
    }
    store.tx(() => {
      store.projects.update(s.projectId, { teamIds: s.teamIds, agentIds: s.agentIds });
      for (const t of s.rosters) {
        store.teams.saveRoster(t.id, { captainId: t.captainId, members: t.members });
        store.teams.update(t.id, { name: t.name });
      }
      for (const id of s.created) if (!store.teams.get(id)?.projectIds.length) store.teams.deleteRecord(id);
      for (const it of s.items) {
        work.reassign(it.id, { agentId: it.agentId, teamId: it.teamId, note: it.note });
        const cur = work.item(it.id);
        /* a run stopped by the rebuild can't come back: the item waits for its old owner instead */
        if (it.status === 'running' && cur?.status === 'todo')
          work.setItem(it.id, { status: 'todo', runId: null });
      }
    });
    undos.delete(token);
    announce(s.after, s.before, s.projectId);
    return { summary: 'Undone — the team is back as it was.' };
  }

  return { plan, apply, undo, staleAll };
}
export type Rebuilds = ReturnType<typeof createRebuilds>;
