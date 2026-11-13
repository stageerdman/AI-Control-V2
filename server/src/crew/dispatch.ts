/* Dispatch (minimal but real): the user gives the project a goal; its orchestrator breaks
   it into a short checklist, each item assigned to a team CAPTAIN (briefs go through
   captains, never around them) or a project specialist. Items are worked off as ordinary
   agent runs (B5 runtime) — at most `maxConcurrent` per project, one per agent, the rest
   queue — and tick off when their run succeeds.

   Collaboration (B8): the project's design (src/domain/collaboration.ts) decides who the orchestrator may
   brief (captains only, or everyone on a team) and which review gates a build item passes: build → review by
   each gate's reviewer (approve, or send back with notes → the builder reworks, resuming its session) → done.
   Send-backs are bounded (maxSendBacks); past the limit the item fails and waits for the user.

   Contract `dispatch`: {"summary": string, "items": [{"text", "assignee", "teamId"?, "brief"}]}. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/connection.ts';
import type { Run } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { type ChecklistItem, type Goal, type GoalStatus, type ItemPatch, workRepo } from '../db/work.ts';
import {
  type Collaboration,
  DEFAULT_MAX_SEND_BACKS,
  GATE_FOCUS,
  gatesFor,
  type ItemGate,
  parseVerdict,
} from '../domain/collaboration.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import type { Worktrees } from '../git/worktrees.ts';
import type { Caps } from '../runtime/runner.ts';
import type { Runtime } from '../runtime/service.ts';
import { crewSystemPrompt, json, ORCHESTRATOR_ALTITUDE } from './prompts.ts';
import { type Crew, validateWith } from './structured.ts';

export const DISPATCH = 'dispatch';
export const DEFAULT_MAX_CONCURRENT = 2;
export const MAX_ITEMS = 8;
/** Merge conflicts the builder is asked to resolve before the item stops for the user. */
export const MAX_MERGE_TRIES = 2;

export const DispatchSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1000),
  items: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(300),
        assignee: z.string().trim().min(1).max(80),
        teamId: z.string().trim().min(1).max(80).optional(),
        brief: z.string().trim().min(1).max(4000),
        /** May run at the same time as the item before it (they touch different files). Default: wait. */
        parallel: z.boolean().optional(),
        /** Asks for knowledge, not change (research, compare, review, write-up): the assignee answers with file_report. */
        report: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
});
export type DispatchPlan = z.output<typeof DispatchSchema>;

/** Who the orchestrator may brief on this project: captains of its teams, and its specialists. */
export type Crewing = {
  captains: Map<string, { teamId: string; teamName: string }[]>;
  /** collaboration.orchestratorTalksTo = 'everyone': any team member may be briefed (agent → their teams). */
  members?: Map<string, string[]>;
  specialists: Set<string>;
  name: (id: string) => string;
  /** May this assignee (for this team) file reports? */
  canReport: (agentId: string, teamId?: string) => boolean;
};

/** Pure: every item goes to a captain (with their team) or a specialist (without one). */
export function dispatchIssues(plan: DispatchPlan, c: Crewing): string[] {
  const out: string[] = [];
  plan.items.forEach((it, i) => {
    const led = c.captains.get(it.assignee) ?? [];
    const seats = c.members?.get(it.assignee) ?? [];
    if (it.teamId && c.members) {
      if (!led.some((t) => t.teamId === it.teamId) && !seats.includes(it.teamId))
        out.push(`items.${i}: ${c.name(it.assignee)} is not on team '${it.teamId}' on this project`);
    } else if (it.teamId) {
      if (!led.some((t) => t.teamId === it.teamId))
        out.push(
          `items.${i}: ${c.name(it.assignee)} is not the captain of team '${it.teamId}' on this project — brief a team through its captain`,
        );
    } else if (!c.specialists.has(it.assignee)) {
      out.push(
        led.length || seats.length
          ? `items.${i}: ${c.name(it.assignee)} ${led.length ? `captains ${led.map((t) => t.teamId).join(', ')}` : `is on ${seats.join(', ')}`} — set "teamId"`
          : `items.${i}: '${it.assignee}' is not a captain or specialist on this project — brief teams through their captains`,
      );
    }
    if (it.report && !c.canReport(it.assignee, it.teamId))
      out.push(
        `items.${i}: ${c.name(it.assignee)} doesn't file reports — give a report item to a reporter (marked "reporter" in "Who works on it"), or drop "report"`,
      );
  });
  return out;
}

/** The orchestrator's reply to a goal, as it reads in its thread: the plan in one sentence + who does what. */
export function planReply(goal: Goal, name: (id: string) => string): string {
  const lines = goal.items.map((i) => {
    const checks = i.gates.length ? ` (checked by ${i.gates.map((g) => name(g.reviewer)).join(', ')})` : '';
    return `• ${i.text} — ${name(i.agentId)}${i.report ? ' (a report)' : ''}${checks}`;
  });
  return [goal.summary, `On the whiteboard:\n${lines.join('\n')}`].join('\n\n');
}

/** The design as the orchestrator reads it when it plans (names next to ids). */
function describeCollaboration(c: Collaboration, name: (id: string) => string) {
  return {
    orchestratorTalksTo: c.orchestratorTalksTo,
    gates: c.gates.map((g) => ({
      after: g.after === '*' ? 'any build item' : g.after,
      reviewer: `${name(g.reviewer)} (${g.reviewer})`,
      kind: g.kind,
    })),
    summary: c.summary,
  };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createDispatch(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  crew: Crew;
  runtime: Runtime;
  maxConcurrent?: number;
  /** Who may file reports (src/reports). Absent → nobody: report items are refused. */
  canFile?: (agent: { kind: string; roleId: string | null }, teamId?: string | null) => boolean;
  /** Did this run file a report? (a report item is done only then) */
  filedBy?: (runId: string) => boolean;
  /** Caps for review runs (default: the runtime's agent caps). A goal's own caps win. */
  reviewCaps?: Partial<Caps>;
  /** Item checkouts (git worktrees); absent → every item works in the project folder. */
  worktrees?: Worktrees;
  /** The sandbox root (project folders resolve inside it) — needed with `worktrees`. */
  sandbox?: string;
  /** The orchestrator planned a goal (or failed to): the office thread records it (src/office/threads.ts). */
  onPlanned?: (e: { projectId: string; goalText: string; goal: Goal | null; error?: string }) => void;
}) {
  const { store, events, crew, runtime } = deps;
  const cap = deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const work = workRepo(deps.db);
  const planning = new Set<string>();

  const emit = (projectId: string, e: Parameters<EventLog['append']>[2]) => {
    try {
      events.append('project', projectId, e);
    } catch {
      /* a bad progress line never breaks the whiteboard */
    }
  };
  /** Who holds the item right now: the reviewer during a review, else the builder. */
  const holder = (it: ChecklistItem) =>
    it.stage === 'review' ? (it.gates[it.gateIndex]?.reviewer ?? it.agentId) : it.agentId;
  const announce = (it: ChecklistItem) =>
    emit(it.projectId, {
      type: 'checklist.item',
      payload: {
        itemId: it.id,
        text: clip(it.text, 300),
        done: it.status === 'done',
        owner: it.agentId,
        goalId: it.goalId,
        status: it.status,
        ...(it.runId ? { runId: it.runId } : {}),
        ...(it.gates.length ? { stage: it.stage, holder: holder(it) } : {}),
      },
    });
  const name = (id: string) => store.agents.get(id)?.name ?? id;

  function crewing(projectId: string): Crewing {
    const p = store.projects.require(projectId);
    const captains = new Map<string, { teamId: string; teamName: string }[]>();
    const members = new Map<string, string[]>();
    for (const tid of p.teamIds) {
      const t = store.teams.get(tid);
      if (!t) continue;
      for (const m of t.members) members.set(m.agentId, [...(members.get(m.agentId) ?? []), t.id]);
      if (!t.captainId) continue;
      captains.set(t.captainId, [...(captains.get(t.captainId) ?? []), { teamId: t.id, teamName: t.name }]);
    }
    return {
      captains,
      ...(p.collaboration?.orchestratorTalksTo === 'everyone' ? { members } : {}),
      specialists: new Set(p.agentIds),
      name,
      canReport: (id, teamId) => {
        const a = store.agents.get(id);
        return !!a && !!deps.canFile?.(a, teamId ?? null);
      },
    };
  }

  /** Settle a goal once nothing is left to run; progress follows every change. */
  function refreshGoal(goalId: string) {
    const g = work.goal(goalId);
    if (!g) return;
    emit(g.projectId, { type: 'progress', payload: { pct: g.pct, label: clip(g.summary, 120) } });
    if (g.status !== 'running') return;
    const open = g.items.some((i) => i.status === 'todo' || i.status === 'running');
    if (open) return;
    const status: GoalStatus = g.items.every((i) => i.status === 'done')
      ? 'done'
      : g.items.some((i) => i.status === 'failed')
        ? 'failed'
        : 'cancelled';
    work.setGoalStatus(g.id, status);
    emit(g.projectId, { type: 'goal.changed', payload: { goalId: g.id, status } });
  }

  const orchName = (projectId: string) =>
    store.agents.get(store.projects.require(projectId).orchestratorId)?.name ?? 'The orchestrator';

  function taskFor(it: ChecklistItem, goal: Goal): string {
    const team = it.teamId ? store.teams.get(it.teamId) : null;
    const captain = team?.captainId === it.agentId;
    const reviewers = it.gates.map((g) => `${name(g.reviewer)} (${g.kind})`);
    return [
      `Goal from ${orchName(it.projectId)} (your orchestrator): ${goal.text}`,
      `Your checklist item: ${it.text}`,
      `Brief: ${it.brief}`,
      team
        ? captain
          ? `You are the captain of ${team.name}: you own this item for the team. Do the work yourself in this run; note anything a teammate should pick up in issues.txt.`
          : `You do this item for ${team.name}. Do the work yourself in this run; note anything for your teammates in issues.txt.`
        : '',
      it.workspace
        ? `You work in your own checkout on branch ${it.workspace.branch}: commit your work there (plain \`git add\` / \`git commit\`) — it merges into ${it.workspace.main} once accepted. Other items may be running in parallel in their own checkouts.`
        : '',
      reviewers.length
        ? `When you are done, your work goes to ${reviewers.join(', then ')} for review — keep it focused on the brief and commit it.`
        : '',
      it.report
        ? `This item asks for knowledge, not change: answer it with the file_report tool (question: ${JSON.stringify(clip(goal.text, 200))}). It is done when the report is filed — then reply with one line.`
        : 'When you are done, reply with a short plain-words summary of what you did.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  const reworkTask = (it: ChecklistItem, from: string) =>
    [
      `${name(from)} reviewed your work on "${it.text}" and sent it back (round ${it.sendBacks}). Their notes:`,
      it.notes ?? '',
      'Fix what they asked for in this run, commit it, then reply with a short summary of what you changed.',
    ].join('\n\n');

  const mergeFixTask = (it: ChecklistItem) =>
    [
      `Your work on "${it.text}" was accepted, but it can't merge back yet: ${it.notes ?? 'a merge conflict'}.`,
      `Someone else's work landed on ${it.workspace?.main ?? 'main'} first. In this checkout, run \`git merge ${it.workspace?.main ?? 'main'}\`, resolve the conflicts so both pieces of work keep doing what they should, and commit the merge.`,
      'Then reply with a short summary of how you resolved it.',
    ].join('\n\n');

  function reviewTask(it: ChecklistItem, goal: Goal, gate: ItemGate): string {
    const builder = name(it.agentId);
    const previous = it.reviews.filter((r) => r.reviewer === gate.reviewer).at(-1);
    return [
      `You are reviewing ${builder}'s work as the ${gate.kind} gate for ${orchName(it.projectId)} (your orchestrator).`,
      `Goal: ${goal.text}`,
      `Checklist item: ${it.text}`,
      `Brief ${builder} worked from: ${it.brief}`,
      it.note ? `${builder}'s summary: ${clip(it.note, 1500)}` : '',
      previous
        ? `You sent it back before with these notes — check they are addressed: ${clip(previous.notes, 1500)}`
        : '',
      GATE_FOCUS[gate.kind],
      `Why this gate exists here: ${gate.why}`,
      it.workspace
        ? `Their work is on branch ${it.workspace.branch} in this checkout: see it with \`git log ${it.workspace.base.slice(0, 12)}..HEAD\` and \`git diff ${it.workspace.base.slice(0, 12)}..HEAD\`, and read the files. Do not redo their work and do not change product code — at most add small checks of your own and commit them.`
        : 'Look at what changed (`git log`, `git diff` against the commit before their work, read the files). Do not redo their work and do not change product code — at most add small checks of your own and commit them.',
      'Approve when it meets the brief and the project rules; send it back only for concrete problems, with notes the builder can act on.',
      'End your reply with exactly one line of JSON: {"verdict": "approve" | "changes", "notes": "what you found / what to fix"}',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /** Checklist order: an item waits for every item before its parallel group; if one of those didn't succeed, it's skipped. */
  function orderGate(goal: Goal, it: ChecklistItem): 'go' | 'wait' | 'skip' {
    let start = it.position;
    while (start > 0 && goal.items[start]?.parallel) start--;
    const before = goal.items.slice(0, start);
    if (before.some((b) => b.status === 'failed' || b.status === 'cancelled')) return 'skip';
    return before.every((b) => b.status === 'done') ? 'go' : 'wait';
  }
  /** Never run yet (order rules apply); reviews and rework already passed them. */
  const fresh = (it: ChecklistItem) => it.stage === 'build' && !it.buildRunId;

  /** The team an agent sits on in this project (for its team context), if any. */
  const teamOf = (projectId: string, agentId: string): string | null =>
    store.projects
      .require(projectId)
      .teamIds.find((t) => store.teams.get(t)?.members.some((m) => m.agentId === agentId)) ?? null;

  /** What to run for the item's current stage. */
  function runFor(it: ChecklistItem, goal: Goal) {
    const caps = goal.caps ?? undefined;
    if (it.stage === 'review') {
      const gate = it.gates[it.gateIndex] as ItemGate;
      const teamId = teamOf(it.projectId, gate.reviewer);
      return {
        agentId: gate.reviewer,
        ...(teamId ? { teamId } : {}),
        task: reviewTask(it, goal, gate),
        caps: caps ?? deps.reviewCaps,
      };
    }
    const rework = it.stage === 'build' && it.sendBacks > 0 && it.notes;
    const lastReviewer = it.reviews.at(-1)?.reviewer ?? '';
    return {
      agentId: it.agentId,
      ...(it.teamId ? { teamId: it.teamId } : {}),
      task:
        it.stage === 'merge' ? mergeFixTask(it) : rework ? reworkTask(it, lastReviewer) : taskFor(it, goal),
      caps,
      ...(it.buildRunId ? { resumeRunId: it.buildRunId } : {}),
    };
  }

  /** Start queued items while the project has room: ≤ cap live, one per agent. An item is claimed
      (running) right away; its checkout and run follow (launch). */
  function pump(projectId: string) {
    const running = work.projectItems(projectId, 'running');
    let free = cap - running.length;
    const busy = new Set(running.map(holder));
    for (const it of work.projectItems(projectId, 'todo')) {
      if (free <= 0) break;
      const who = holder(it);
      if (busy.has(who)) continue;
      /* the agent is busy with a run started by hand (or a chat turn): leave the item queued */
      if (runtime.busy(projectId, who)) {
        busy.add(who);
        continue;
      }
      const goal = work.goal(it.goalId) as Goal;
      if (fresh(it)) {
        const gate = orderGate(goal, it);
        if (gate === 'wait') continue;
        if (gate === 'skip') {
          settle(it, { status: 'cancelled', note: 'Skipped: an earlier item did not succeed' });
          continue;
        }
      }
      work.setItem(it.id, { status: 'running', runId: null });
      busy.add(who);
      free--;
      void launch(it.id);
    }
  }

  /** The item's checkout (its own worktree on first start; null = the project folder), then its run. */
  async function launch(itemId: string) {
    let it = work.item(itemId) as ChecklistItem;
    try {
      if (!it.workspace && deps.worktrees && it.stage === 'build') {
        const ws = await deps.worktrees.open(repoOf(it.projectId), it.projectId, it.id, it.text);
        if (ws) work.setItem(it.id, { status: it.status, workspace: ws });
      }
    } catch (e) {
      settle(it, { status: 'failed', note: clip(`Couldn't make a checkout: ${(e as Error).message}`, 2000) });
      pump(it.projectId);
      return;
    }
    it = work.item(itemId) as ChecklistItem;
    if (it.status !== 'running') {
      /* cancelled while its checkout was being made */
      await shelve(it);
      return;
    }
    const goal = work.goal(it.goalId) as Goal;
    const { caps, ...spec } = runFor(it, goal);
    let run: { id: string };
    try {
      run = runtime.start(it.projectId, {
        ...spec,
        ...(caps ? { caps } : {}),
        ...(it.workspace ? { workdir: it.workspace.cwd } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof AppError && e.code === 'conflict' && /already running/.test(msg)) {
        work.setItem(it.id, { status: 'todo' }); // raced a hand-started run: queue again
        return;
      }
      settle(it, { status: 'failed', note: clip(msg, 2000) });
      await shelve(work.item(it.id) as ChecklistItem);
      pump(it.projectId);
      return;
    }
    work.setItem(it.id, { status: 'running', runId: run.id });
    announce(work.item(it.id) as ChecklistItem);
  }

  const repoOf = (projectId: string) =>
    resolveInSandbox(deps.sandbox ?? '', store.projects.require(projectId).folder ?? '');

  /** Merges back one at a time per project (one main working tree). */
  const merging = new Map<string, Promise<void>>();
  const serial = (projectId: string, fn: () => Promise<void>) => {
    const next = (merging.get(projectId) ?? Promise.resolve()).then(fn, fn).catch(() => {});
    merging.set(projectId, next);
    return next;
  };

  /** Put a stopped item's checkout away: its work is committed on its branch (kept unless empty/merged). */
  async function shelve(it: ChecklistItem): Promise<void> {
    const ws = it.workspace;
    if (!ws || !deps.worktrees) return;
    const { kept } = await deps.worktrees.close(repoOf(it.projectId), ws, { deleteBranch: true });
    if (kept) {
      const cur = work.item(it.id) as ChecklistItem;
      work.setItem(it.id, {
        status: cur.status,
        note: clip(`${cur.note ? `${cur.note} — ` : ''}work kept on branch ${ws.branch}`, 2000),
      });
      announce(work.item(it.id) as ChecklistItem);
    }
  }

  /** Write an item change, tell the office, settle the goal. */
  function settle(it: ChecklistItem, patch: ItemPatch) {
    work.setItem(it.id, patch);
    announce(work.item(it.id) as ChecklistItem);
    refreshGoal(it.goalId);
  }
  const handoff = (
    it: ChecklistItem,
    from: string,
    to: string,
    kind: 'review' | 'rework' | 'merge-fix',
    note?: string,
    gate?: ItemGate,
  ) =>
    emit(it.projectId, {
      type: 'handoff',
      payload: {
        itemId: it.id,
        goalId: it.goalId,
        from,
        to,
        kind,
        ...(gate ? { gate: gate.kind } : {}),
        ...(note ? { note: clip(note, 2000) } : {}),
      },
    });

  /** Accepted (built, every gate approved): merge its branch back, then done. A conflict goes back to the
      builder to resolve in its checkout (≤ MAX_MERGE_TRIES), anything else fails with the work kept on its branch. */
  function accept(it: ChecklistItem, patch: Omit<ItemPatch, 'status'> = {}) {
    const ws = it.workspace;
    if (!ws || !deps.worktrees) {
      settle(it, { ...patch, status: 'done' });
      return;
    }
    const wt = deps.worktrees;
    work.setItem(it.id, { ...patch, status: 'running' }); // stays on the board while it merges
    void serial(it.projectId, async () => {
      const repo = repoOf(it.projectId);
      const r = await wt.merge(repo, ws, clip(`AI Studio: ${it.text} (${name(it.agentId)})`, 200));
      const cur = work.item(it.id) as ChecklistItem;
      if (r.ok) {
        await wt.close(repo, ws, { deleteBranch: true });
        settle(cur, { status: 'done' });
        emit(it.projectId, {
          type: 'item.merged',
          payload: {
            itemId: it.id,
            goalId: it.goalId,
            branch: ws.branch,
            ...(r.commit ? { commit: r.commit } : {}),
          },
        });
      } else if (r.conflict && cur.mergeTries < MAX_MERGE_TRIES) {
        settle(cur, { status: 'todo', stage: 'merge', mergeTries: cur.mergeTries + 1, notes: r.reason });
        handoff(cur, cur.agentId, cur.agentId, 'merge-fix', r.reason);
      } else {
        /* put the checkout away first, so the goal settles with the branch named */
        const { kept } = await wt.close(repo, ws, { deleteBranch: true });
        settle(cur, {
          status: 'failed',
          note: clip(`${r.reason}${kept ? ` — work kept on branch ${ws.branch}` : ''}`, 2000),
        });
      }
      pump(it.projectId);
    });
  }

  /** A build (or rework) run ended. */
  function afterBuild(it: ChecklistItem, run: Run) {
    if (run.status !== 'succeeded') {
      settle(it, {
        status: run.status === 'cancelled' ? 'cancelled' : 'failed',
        note: clip(run.error ?? run.result ?? '', 2000) || null,
      });
      void shelve(work.item(it.id) as ChecklistItem);
      return;
    }
    const note = clip(run.result ?? '', 2000) || null;
    if (it.report) {
      const filed = !!deps.filedBy?.(run.id);
      settle(
        it,
        filed ? { status: 'done', note } : { status: 'failed', note: 'Finished without filing the report' },
      );
      return;
    }
    const gate = it.gates[it.gateIndex];
    if (gate) {
      settle(it, { status: 'todo', stage: 'review', note, buildRunId: run.id });
      handoff(it, it.agentId, gate.reviewer, 'review', undefined, gate);
      return;
    }
    accept(it, { note, buildRunId: run.id });
  }

  /** A review run ended: approve → next gate or done; changes → back to the builder (bounded). */
  function afterReview(it: ChecklistItem, run: Run) {
    const gate = it.gates[it.gateIndex] as ItemGate;
    if (run.status !== 'succeeded') {
      settle(it, {
        status: run.status === 'cancelled' ? 'cancelled' : 'failed',
        note: `${name(gate.reviewer)}'s review didn't finish: ${clip(run.error ?? run.status, 1500)}`,
      });
      void shelve(work.item(it.id) as ChecklistItem);
      return;
    }
    const v = parseVerdict(run.result ?? '');
    const reviews = [
      ...it.reviews,
      {
        reviewer: gate.reviewer,
        gate: gate.kind,
        verdict: v.verdict,
        notes: clip(v.notes, 4000),
        runId: run.id,
        at: new Date().toISOString(),
      },
    ];
    if (v.verdict === 'approve') {
      emit(it.projectId, {
        type: 'review.approved',
        payload: {
          itemId: it.id,
          goalId: it.goalId,
          reviewerId: gate.reviewer,
          gate: gate.kind,
          ...(v.notes ? { notes: clip(v.notes, 2000) } : {}),
        },
      });
      const next = it.gates[it.gateIndex + 1];
      if (next) {
        settle(it, { status: 'todo', stage: 'review', gateIndex: it.gateIndex + 1, reviews });
        handoff(it, gate.reviewer, next.reviewer, 'review', undefined, next);
        return;
      }
      accept(it, { gateIndex: it.gateIndex + 1, reviews });
      return;
    }
    const max = store.projects.get(it.projectId)?.collaboration?.maxSendBacks ?? DEFAULT_MAX_SEND_BACKS;
    const sendBacks = it.sendBacks + 1;
    const final = sendBacks > max;
    emit(it.projectId, {
      type: 'review.changes',
      payload: {
        itemId: it.id,
        goalId: it.goalId,
        reviewerId: gate.reviewer,
        gate: gate.kind,
        notes: clip(v.notes, 2000),
        sendBacks,
        ...(final ? { final: true } : {}),
      },
    });
    if (final) {
      settle(it, {
        status: 'failed',
        sendBacks,
        reviews,
        notes: v.notes,
        note: clip(
          `${name(gate.reviewer)} sent it back ${sendBacks} times — it needs you. Last notes: ${v.notes}`,
          2000,
        ),
      });
      return;
    }
    settle(it, { status: 'todo', stage: 'build', sendBacks, reviews, notes: v.notes });
    handoff(it, gate.reviewer, it.agentId, 'rework', v.notes, gate);
  }

  runtime.onFinished((run) => {
    const it = work.itemByRun(run.id);
    if (it?.status === 'running') {
      if (it.stage === 'review') afterReview(it, run);
      else afterBuild(it, run);
    }
    /* any run ending frees its agent: an item waiting for it may start now */
    pump(run.projectId);
  });

  return {
    list: (projectId: string) => {
      store.projects.require(projectId);
      return work.goals(projectId);
    },
    get(projectId: string, goalId: string): Goal {
      const g = work.goal(goalId);
      if (!g || g.projectId !== projectId) throw notFound('Goal', goalId);
      return g;
    },

    /** Orchestrator turn → whiteboard → queued runs. Resolves once the checklist is up. */
    async start(projectId: string, text: string, caps?: Goal['caps']): Promise<Goal> {
      const p = store.projects.require(projectId);
      if (!p.folder) throw conflict(`Project '${projectId}' has no folder yet — set it up first`);
      const c = crewing(projectId);
      if (c.captains.size + c.specialists.size === 0)
        throw conflict('Nobody staffs this project yet — add a team or a specialist first');
      if (planning.has(projectId)) throw conflict('The orchestrator is still planning the last goal');
      const orch = store.agents.require(p.orchestratorId);
      planning.add(projectId);
      try {
        emit(projectId, {
          type: 'agent.status',
          payload: {
            agentId: orch.id,
            status: 'working',
            activity: { kind: 'thinking', label: 'Planning the work' },
          },
        });
        const staff = {
          teams: p.teamIds.flatMap((tid) => {
            const t = store.teams.get(tid);
            return t
              ? [
                  {
                    teamId: t.id,
                    name: t.name,
                    does: clip(t.instr, 400),
                    captain: t.captainId ? { id: t.captainId, name: c.name(t.captainId) } : null,
                    members: t.members.map((m) => c.name(m.agentId)),
                    ...(t.captainId && c.canReport(t.captainId, t.id) ? { reporter: true } : {}),
                  },
                ]
              : [];
          }),
          specialists: p.agentIds.map((id) => ({
            id,
            name: c.name(id),
            role: store.agents.get(id)?.role ?? '',
            ...(c.canReport(id) ? { reporter: true } : {}),
          })),
        };
        const open = work
          .goals(projectId)
          .filter((g) => g.status === 'running')
          .flatMap((g) => g.items.filter((i) => i.status !== 'done').map((i) => i.text));
        const collab = p.collaboration;
        /* a git project: every item gets its own worktree, so independent items may run side by side */
        const isolated = !!deps.worktrees && (await deps.worktrees.usable(repoOf(projectId)));
        /* a reviewer who left the project since the design: that gate is skipped */
        const onProject = (id: string) =>
          p.agentIds.includes(id) ||
          p.teamIds.some((t) => store.teams.get(t)?.members.some((m) => m.agentId === id));
        const everyone = collab?.orchestratorTalksTo === 'everyone';
        const task = [
          `Project: ${json({ name: p.name, about: p.note })}`,
          `Who works on it: ${json(staff)}`,
          `How they work together: ${json(collab ? describeCollaboration(collab, name) : { orchestratorTalksTo: 'captains', gates: [] })}`,
          `Already on the whiteboard, not done yet: ${json(open)}`,
          `The user's goal: ${json(text)}`,
          [
            'Break the goal into a short checklist (1–8 items, in the order they should happen).',
            everyone
              ? 'Assign every item to someone on a team (set "assignee" to their id and "teamId" to their team — captains or members) or to a specialist (only "assignee").'
              : 'Assign every item to a team CAPTAIN (set "assignee" to the captain id and "teamId" to their team) or to a specialist (only "assignee").',
            everyone ? '' : 'Never assign to other team members — the captain owns the item for the team.',
            '"text" is the whiteboard line (short); "brief" tells the assignee what done looks like.',
            collab?.gates.length
              ? 'The review gates above run automatically after each build item — do not add separate review or QA items for them.'
              : '',
            isolated
              ? `Every item runs in its own checkout (its own git branch) and merges back when it is accepted, so independent items can run at the same time (up to ${cap} at once). Set "parallel": true on an item that does NOT need the result of the item before it; leave it false when it builds on earlier work. Keep it small: a one-page task is 1–2 items.`
              : 'Items run one after another in the same project folder. Set "parallel": true only when an item can safely run at the same time as the one before it (it touches different files). Keep it small: a one-page task is 1–2 items.',
            'When the goal asks for KNOWLEDGE, not change — research, compare, investigate, audit/review, "find out", "write up", "what is the status of…" — make it a report item: set "report": true and give it to a reporter (marked "reporter": true above); it ends in a report in the Reports tray. Mixed goals ("research X, then build it"): the report item first, the build items after. If nobody here is a reporter, plan the work without "report" and say in the summary that nobody on the project files reports yet.',
          ]
            .filter(Boolean)
            .join('\n'),
          `Answer with one JSON object shaped like this: ${json({
            summary: 'The plan in one sentence.',
            items: [
              {
                text: 'Short whiteboard line',
                assignee: '<captain or specialist id>',
                teamId: '<team id when the assignee is a captain>',
                brief: 'What to do and what done looks like.',
                parallel: false,
                report: false,
              },
            ],
          })}`,
        ].join('\n\n');
        let value: DispatchPlan;
        try {
          ({ value } = await crew.call({
            who: orch.name,
            contract: DISPATCH,
            systemPrompt: crewSystemPrompt(orch, ORCHESTRATOR_ALTITUDE),
            task,
            validate: validateWith(DispatchSchema, (d) => dispatchIssues(d, crewing(projectId))),
            onEvent: (e) => {
              if (e.kind === 'tokens')
                emit(projectId, {
                  type: 'tokens',
                  payload: { agentId: orch.id, input: e.input, output: e.output },
                });
            },
          }));
        } catch (e) {
          deps.onPlanned?.({ projectId, goalText: text, goal: null, error: (e as Error).message });
          throw e;
        }
        const goal = store.tx(() =>
          work.insertGoal(
            { id: randomUUID(), projectId, text, summary: value.summary, ...(caps ? { caps } : {}) },
            value.items.map((i) => {
              const item = { agentId: i.assignee, teamId: i.teamId ?? null };
              return {
                id: randomUUID(),
                text: i.text,
                brief: i.brief,
                ...item,
                parallel: i.parallel === true,
                report: i.report === true,
                /* report items ask for knowledge, not change: no review gates */
                gates: i.report ? [] : gatesFor(collab, item).filter((g) => onProject(g.reviewer)),
              };
            }),
          ),
        );
        emit(projectId, {
          type: 'goal.changed',
          payload: {
            goalId: goal.id,
            status: 'running',
            text: clip(text, 2000),
            summary: clip(goal.summary, 1000),
          },
        });
        for (const it of goal.items) announce(it);
        refreshGoal(goal.id);
        pump(projectId);
        const planned = work.goal(goal.id) as Goal;
        deps.onPlanned?.({ projectId, goalText: text, goal: planned });
        return planned;
      } finally {
        planning.delete(projectId);
        emit(projectId, { type: 'agent.status', payload: { agentId: orch.id, status: 'idle' } });
      }
    },

    /** Stop a goal: queued items are cancelled, live runs stopped (their items follow when they end). */
    cancel(projectId: string, goalId: string): Goal {
      const g = this.get(projectId, goalId);
      if (g.status !== 'running') throw conflict(`This goal is already ${g.status}`);
      for (const it of g.items) {
        if (it.status === 'todo' || (it.status === 'running' && !it.runId)) {
          /* queued, or its checkout is still being made (launch notices and puts it away) */
          work.setItem(it.id, { status: 'cancelled' });
          announce(work.item(it.id) as ChecklistItem);
          if (it.status === 'todo') void shelve(it);
        } else if (it.status === 'running' && it.runId) {
          try {
            runtime.cancel(projectId, it.runId);
          } catch {
            /* already ended */
          }
        }
      }
      refreshGoal(goalId);
      return work.goal(goalId) as Goal;
    },

    /** After a restart: nothing is running any more; queued work is not restarted on its own (it would use plan usage unasked). */
    recover() {
      for (const projectId of work.activeProjects()) {
        for (const it of [
          ...work.projectItems(projectId, 'running'),
          ...work.projectItems(projectId, 'todo'),
        ]) {
          work.setItem(it.id, {
            status: it.status === 'running' ? 'failed' : 'cancelled',
            note: 'Interrupted: the studio restarted',
          });
          /* its checkout: commit what's there on its branch, remove the checkout */
          void shelve(it);
        }
        for (const g of work.goals(projectId)) if (g.status === 'running') refreshGoal(g.id);
      }
    },
    /** Tests: let queued work drain. */
    idle: (projectId: string) =>
      work.projectItems(projectId, 'running').length + work.projectItems(projectId, 'todo').length === 0,
  };
}
export type Dispatch = ReturnType<typeof createDispatch>;
