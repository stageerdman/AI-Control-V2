/* Dispatch (minimal but real): the user gives the project a goal; its orchestrator breaks
   it into a short checklist, each item assigned to a team CAPTAIN (briefs go through
   captains, never around them) or a project specialist. Items are worked off as ordinary
   agent runs (B5 runtime) — at most `maxConcurrent` per project, one per agent, the rest
   queue — and tick off when their run succeeds.

   Collaboration (B8): the project's design (src/domain/collaboration.ts) decides who the orchestrator may
   brief (captains only, or everyone on a team) and which review gates a build item passes: build → review by
   each gate's reviewer (approve, or send back with notes → the builder reworks, resuming its session) → done.
   Send-backs are bounded (maxSendBacks); past the limit the item fails and waits for the user.

   Teams (F1c, src/crew/team.ts): an item for a team's captain is a small team task — the captain splits it into
   member sub-tasks (or does it alone), members build in their own checkouts off the item's branch, the captain
   integrates, then the item goes through the gates and merges into main. Goals link to a feature; the feature
   ships when its goal's items have all landed.

   Contract `dispatch`: {"summary": string, "items": [{"text", "assignee", "teamId"?, "brief"}], "feature"?}. */
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { projectState } from '../apps/run-command.ts';
import type { Db } from '../db/connection.ts';
import type { Feature } from '../db/features.ts';
import type { Run } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { type ChecklistItem, type Goal, type GoalStatus, type ItemPatch, workRepo } from '../db/work.ts';
import { GATE_FOCUS, parseVerdict } from '../domain/collaboration.ts';
import { isClosed } from '../domain/feature-stages.ts';
import { BranchLabel } from '../domain/gates.ts';
import { heldForMain, mainFirst } from '../domain/quests.ts';
import { planOnlyBrief, type WorkEvidence, workVerdict } from '../domain/real-work.ts';
import { drawingInWords } from '../domain/workflow-drawing.ts';
import {
  branchLabels,
  type GateOwner,
  gatesFor,
  type ItemGate,
  MAX_GATES,
  pickWorkflow,
  sameLabel,
  TempAskSchema,
  type Workflow,
  workflowTag,
} from '../domain/workflows.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { resolveInSandbox } from '../fs/sandbox.ts';
import type { Worktrees } from '../git/worktrees.ts';
import type { Features } from '../office/features.ts';
import { seatForWork } from '../office/people.ts';
import { projectMembers } from '../room/members.ts';
import type { Caps } from '../runtime/runner.ts';
import type { Runtime } from '../runtime/service.ts';
import { taskFeatures } from '../whiteboard/feature-route.ts';
import { holder } from '../whiteboard/people.ts';
import {
  dropSessions,
  freshBuild,
  type HandoverMode,
  handoverLine,
  handoverMode,
  handoverNote,
  outlivedOwner,
} from './handover.ts';
import { crewSystemPrompt, json, ORCHESTRATOR_ALTITUDE } from './prompts.ts';
import { requeuePatch } from './requeue.ts';
import { repeatedNote, repeatedNoteText } from './review-loop.ts';
import { type Crew, validateWith } from './structured.ts';
import {
  integrateTask,
  MAX_TEAM_ROUNDS,
  memberGates,
  memberTask,
  orderedSubtasks,
  parseRework,
  SPLIT_CAPS,
  splitCall,
  splitIssues,
  TEAM_SPLIT,
  TeamSplitSchema,
} from './team.ts';
import { shownTeamWay } from './team-workflow.ts';
import { resolveWorkflow } from './workflows.ts';

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
        /** The workflow's branch labels (a gate's `when`) that hold for this item; left out = every gate holds. */
        branches: z.array(BranchLabel).max(MAX_GATES).optional(),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
  /** F1c: the feature this goal builds — an existing one (id) or a new one (name + description, goes to Now).
      ships = false: the goal is only a step, the feature isn't finished by it. Research goals leave it out. */
  feature: z
    .strictObject({
      id: z.string().trim().min(1).max(80).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      description: z.string().trim().max(2000).optional(),
      ships: z.boolean().optional(),
    })
    .optional(),
  /** WORKFLOWS: the stable workflow (id) the goal runs under, or a temporary one (a lead and their crew);
      left out = the project's first. */
  workflow: z.union([z.string().trim().min(1).max(40), TempAskSchema]).optional(),
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
  /** The project's feature ids (a goal may link to one). */
  features?: Set<string>;
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
  const f = plan.feature;
  if (f?.id && c.features && !c.features.has(f.id))
    out.push(
      `feature.id: '${f.id}' is not a feature of this project — use an id from "Features", or give "name" for a new one`,
    );
  if (f && !f.id && !f.name)
    out.push('feature: give the "id" of an existing feature, or a "name" for a new one');
  return out;
}

/** Pure: an item's "branches" name only labels its workflow's gates hang on (a typo would silently drop a gate). */
export function branchIssues(plan: DispatchPlan, w: Workflow): string[] {
  const known = branchLabels(w);
  return plan.items.flatMap((it, i) =>
    (it.branches ?? [])
      .filter((b) => !known.some((k) => sameLabel(k, b)))
      .map(
        (b) =>
          `items.${i}.branches: '${b}' is not a branch of workflow '${w.id}' — known: ${known.length ? known.map((k) => `'${k}'`).join(', ') : 'none (leave "branches" out)'}`,
      ),
  );
}

/** The orchestrator's reply to a goal, as it reads in its thread: the plan in one sentence + who does what. */
export function planReply(goal: Goal, name: (id: string) => string): string {
  const lines = goal.items.map((i) => {
    const checks = i.gates.length ? ` (checked by ${i.gates.map((g) => name(g.reviewer)).join(', ')})` : '';
    return `• ${i.text} — ${name(i.agentId)}${i.report ? ' (a report)' : ''}${checks}`;
  });
  return [goal.summary, `On the whiteboard:\n${lines.join('\n')}`].join('\n\n');
}

/** The stable workflows as the orchestrator reads them when it plans (names next to ids). */
export function describeWorkflows(list: readonly Workflow[], name: (id: string) => string) {
  return list.map((w) => {
    const flow = drawingInWords(w, (id) => `${name(id)} (${id})`, { signOffs: false }); // gates listed below
    const branches = branchLabels(w);
    return {
      id: w.id,
      name: w.name,
      when: w.when,
      orchestratorTalksTo: w.orchestratorTalksTo,
      gates: w.gates.map((g) => ({
        after: g.after === '*' ? 'any build item' : g.after,
        reviewer: `${name(g.reviewer)} (${g.reviewer})`,
        kind: g.kind,
        ...(g.when ? { when: g.when } : {}),
      })),
      summary: w.summary,
      ...(flow ? { flow: `Order items this way: ${flow}` } : {}),
      ...(branches.length ? { branches } : {}),
    };
  });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** How much of an earlier report item's body a later item's task carries. */
const REPORT_EXCERPT = 4000;

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
  /** A goal settled (done, failed or cancelled): the office thread may say so (src/crew/settled.ts). */
  onSettled?: (goal: Goal) => void;
  /** The features folder (F1c): goals link to a feature, which ships when the goal lands. Absent → no linking. */
  features?: Features;
  /** A filed report (F3): later items of the goal get what an earlier report item found. Absent → title only. */
  reportFor?: (
    projectId: string,
    reportId: string,
  ) => { title: string; summary: string; body: string } | null;
}) {
  const { store, events, crew, runtime } = deps;
  const cap = deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const work = workRepo(deps.db);
  const planning = new Set<string>();
  /** Split team items whose goal was cancelled: they stop once their members' sub-tasks have. */
  const stopping = new Set<string>();

  const emit = (projectId: string, e: Parameters<EventLog['append']>[2]) => {
    try {
      events.append('project', projectId, e);
    } catch {
      /* a bad progress line never breaks the whiteboard */
    }
  };
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
        ...(it.parentId ? { parentId: it.parentId } : {}),
        ...(it.teamPhase ? { teamPhase: it.teamPhase } : {}),
      },
    });
  const name = (id: string) => store.agents.get(id)?.name ?? id;
  const projectWorkflows = (projectId: string) => store.projects.require(projectId).workflows ?? [];
  /** The workflow a goal runs under: its snapshot; goals from before workflows run under the project's default. */
  const workflowOf = (g: Pick<Goal, 'projectId' | 'workflow'>): Workflow =>
    g.workflow ?? pickWorkflow(projectWorkflows(g.projectId));
  const goalWorkflow = (goalId: string, projectId: string): Workflow =>
    workflowOf(work.goal(goalId) ?? { projectId, workflow: null });
  /** The goal.changed payload's full form: what the screen needs to (re)draw the goal. */
  const goalPayload = (g: Goal) => ({
    goalId: g.id,
    status: g.status,
    text: clip(g.text, 2000),
    summary: clip(g.summary, 1000),
    quest: g.quest,
    workflow: workflowTag(workflowOf(g)),
  });

  const commandOf = (w: Workflow) => (w.lead ? [w.lead, ...(w.crew ?? [])] : []);
  /** `w`: the workflow the work runs under (who the orchestrator may brief); default: the project's first. */
  function crewing(projectId: string, w: Workflow = pickWorkflow(projectWorkflows(projectId))): Crewing {
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
      ...(w.orchestratorTalksTo === 'everyone' ? { members } : {}),
      /* STUDIO LIFE: guests the user lets the director use count as specialists; so do a temporary lead + crew */
      specialists: new Set([...p.agentIds, ...store.guests.ids(projectId, true), ...commandOf(w)]),
      name,
      canReport: (id, teamId) => {
        const a = store.agents.get(id);
        return !!a && !!deps.canFile?.(a, teamId ?? null);
      },
      ...(deps.features ? { features: new Set(deps.features.repo.list(projectId).map((f) => f.id)) } : {}),
    };
  }

  /** Settle a goal once nothing is left to run; progress follows every change. */
  function refreshGoal(goalId: string) {
    const g = work.goal(goalId);
    if (!g) return;
    emit(g.projectId, { type: 'progress', payload: { pct: g.pct, label: clip(g.summary, 120) } });
    if (g.status !== 'running') return;
    const open = g.items.some((i) => i.status === 'todo' || i.status === 'running');
    if (open) {
      featureFollows(g, null);
      return;
    }
    const status: GoalStatus = g.items.every((i) => i.status === 'done')
      ? 'done'
      : g.items.some((i) => i.status === 'failed')
        ? 'failed'
        : 'cancelled';
    work.setGoalStatus(g.id, status);
    emit(g.projectId, { type: 'goal.changed', payload: { goalId: g.id, status } });
    featureFollows(g, status);
    const { lead, crew = [] } = g.workflow ?? {};
    /* no cleanup: a lead's powers come from running goals, so they end here by themselves */
    if (lead) emit(g.projectId, { type: 'workflow.ended', payload: { goalId: g.id, lead, crew, status } });
    deps.onSettled?.({ ...g, status });
  }

  /** The goal's feature follows it (F1c): its % while the goal runs; shipped once the goal landed whole and no
      other goal still works on it. A failed or cancelled goal leaves the feature where it is. An agent's own
      update (the `feature` tool) wins: the goal never lowers its pct, and a feature it shipped stays as it is. */
  function featureFollows(g: Goal, ended: GoalStatus | null) {
    const fs = deps.features;
    if (!fs || !g.featureId || !g.ships) return;
    try {
      const f = fs.repo.get(g.projectId, g.featureId);
      if (!f || isClosed(f.status)) return; // shipped, or shelved / denied by the user meanwhile: leave it
      if (!ended) {
        if (g.pct > (f.pct ?? 0)) fs.update(g.projectId, f.id, { pct: g.pct });
        return;
      }
      if (ended !== 'done') return;
      if (work.featureGoals(f.id).some((x) => x.id !== g.id && x.status === 'running')) return;
      const shipped = fs.update(g.projectId, f.id, { status: 'shipped', pct: 100 });
      emit(g.projectId, {
        type: 'feature.shipped',
        payload: { featureId: shipped.id, goalId: g.id, name: clip(shipped.name, 120) },
      });
    } catch {
      /* the feature was deleted meanwhile: nothing to move */
    }
  }

  /** Link a new goal to its feature: an existing one (planned, shelved or denied → now: the director links only
      when the user asked for that work), or a new one in Now. → the feature linked. */
  function linkFeature(goal: Goal, f: DispatchPlan['feature']): Feature | null {
    const fs = deps.features;
    if (!fs || !f) return null;
    try {
      let feature = f.id ? fs.repo.get(goal.projectId, f.id) : null;
      if (feature && feature.status !== 'now' && feature.status !== 'shipped')
        feature = fs.update(goal.projectId, feature.id, { status: 'now' });
      if (!feature && f.name)
        feature = fs.create(goal.projectId, {
          name: f.name,
          status: 'now',
          pct: 0,
          description: f.description ?? goal.summary,
        });
      if (feature) work.setGoalFeature(goal.id, feature.id, f.ships !== false);
      return feature;
    } catch {
      /* a feature that can't be linked never blocks the work */
      return null;
    }
  }

  /** The brief's line about the feature its goal serves, so the agent can keep it up to date. */
  function featureNote(goal: Goal): string {
    const f = goal.featureId ? deps.features?.repo.get(goal.projectId, goal.featureId) : null;
    if (!f) return '';
    const ends = goal.ships
      ? 'it moves to Shipped by itself when this goal finishes'
      : 'this goal is one step of it';
    return `This goal serves the feature “${f.name}” (${f.id}; ${ends}). Use the \`feature\` tool to read it, set its pct as your part lands, and add one line on what shipped; set status shipped only when the whole feature is done.`;
  }

  /** A temporary workflow's command, as the lead and each crew member read it in their task. */
  function commandNote(it: ChecklistItem, goal: Goal): string {
    const { lead, crew = [] } = goal.workflow ?? {};
    if (!lead) return '';
    if (it.agentId === lead)
      return `You lead ${crew.map(name).join(', ')} on this goal. Hand them work with \`call_agent\` \`work: true\` (it stays on this goal); you sign off each of their tasks; \`tell_agent\` / \`stop_work\` reach them.`;
    if (crew.includes(it.agentId))
      return `${name(lead)} leads this goal: report to them; they sign off your work.`;
    return '';
  }

  /** The goal's drawn workflow in words, so each builder knows whom they hand to (soft; the gates still rule).
      Without sign-offs: each task already names its own reviewers. */
  function flowNote(goal: Goal): string {
    const flow = drawingInWords(workflowOf(goal), name, { signOffs: false });
    return flow ? `How work flows on this goal: ${flow}` : '';
  }

  /** The way a team runs by: its own (drawn in the Cast), else its default — the same one its screens show. */
  const teamWay = (teamId: string): Workflow | null => shownTeamWay(store, teamId);

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
      handoverLine(it.note),
      featureNote(goal),
      commandNote(it, goal),
      flowNote(goal),
      earlierWork(it, goal),
      team
        ? captain
          ? `You are the captain of ${team.name}: you own this item for the team. Do the work yourself in this run; note anything a teammate should pick up in issues.txt.`
          : `You do this item for ${team.name}. Do the work yourself in this run; note anything for your teammates in issues.txt.`
        : '',
      it.workspace
        ? `You work in your own checkout on branch ${it.workspace.branch}: commit your work there (plain \`git add\` / \`git commit\`) — it merges into ${it.workspace.main} once accepted. Do not push. Other items may be running in parallel in their own checkouts.`
        : '',
      it.report
        ? ''
        : 'If your work sets up or changes how the app starts, record it in `.project` as one line `run: <command>` (e.g. `run: npm run dev`) so the studio can start it. A server reads its port from the PORT environment variable (default 3000) — the studio gives each project its own.',
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
  /** The next message of a stopped session: pick up where it was (the original task is already in its context). */
  function carryOnTask(it: ChecklistItem): string {
    const was = runOf(it.resumeRunId)?.status;
    /* its run finished, yet the item is open: it only replied with a plan (afterBuild) */
    if (was === 'succeeded') return planOnlyBrief(it.text);
    const why =
      was === 'cancelled'
        ? 'the user stopped you, and has now asked you to continue'
        : 'the studio restarted';
    return [
      `You were stopped partway through your checklist item "${it.text}" (${why}). Your session and your files are as you left them.`,
      it.workspace
        ? `Check where you are (\`git status\`, \`git log --oneline ${it.workspace.main}..HEAD\`), commit what's done, then carry on and finish it. Work in small steps and commit as you go.`
        : 'Check where you are, then carry on and finish it. Work in small steps.',
      'When you are done, reply with a short plain-words summary of what you did.',
    ].join('\n\n');
  }
  /** A run's status and session (null: no such run). */
  const runOf = (runId: string | null) =>
    runId
      ? ((deps.db.prepare('SELECT status, session_id, agent_id FROM runs WHERE id = ?').get(runId) as
          | { status: string; session_id: string | null; agent_id: string }
          | undefined) ?? null)
      : null;
  /** The run's session, if it has one to resume. */
  const sessionOf = (runId: string | null): string | null => runOf(runId)?.session_id ?? null;

  /** What the goal's earlier items finished — F3 live: "build on what the report recommends" while the build run
      never saw the report (it lives in the Reports tray, not the folder). Done items only; a report's summary + excerpt. */
  function earlierWork(it: ChecklistItem, goal: Goal): string {
    if (it.parentId) return '';
    const before = goal.items.filter((x) => x.position < it.position && x.status === 'done');
    if (!before.length) return '';
    const lines = before.map((x) => {
      const r = x.reportId ? deps.reportFor?.(x.projectId, x.reportId) : null;
      if (r)
        return `• ${x.text} — ${name(x.agentId)} filed the report "${r.title}": ${r.summary}\n  Report (excerpt): ${clip(r.body, REPORT_EXCERPT)}`;
      return `• ${x.text} — ${name(x.agentId)}: ${clip(x.note ?? 'done', 600)}`;
    });
    return `Done before you on this goal (build on it):\n${lines.join('\n')}`;
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
    const list = it.parentId ? work.children(it.parentId) : goal.items;
    let start = it.position;
    while (start > 0 && list[start]?.parallel) start--;
    const before = list.slice(0, start);
    /* a member's sub-task never skips: whatever a teammate didn't finish, the captain picks up when integrating */
    if (it.parentId) return before.some((b) => b.status === 'todo' || b.status === 'running') ? 'wait' : 'go';
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
    const team = it.teamId ? store.teams.get(it.teamId) : null;
    if (it.resumeRunId && it.stage !== 'review')
      return {
        agentId: it.agentId,
        ...(it.teamId ? { teamId: it.teamId } : {}),
        task: carryOnTask(it),
        caps,
        resumeRunId: it.resumeRunId,
      };
    if (team && it.teamPhase === 'integrate') {
      const parts = latestParts(it);
      return {
        agentId: it.agentId,
        teamId: team.id,
        task: integrateTask({
          parent: it,
          goal,
          team,
          name,
          parts,
          canSendBack: it.teamRounds < MAX_TEAM_ROUNDS,
          reviewers: it.gates.map((g) => `${name(g.reviewer)} (${g.kind})`),
        }),
        caps,
      };
    }
    if (team && it.parentId && it.stage === 'build') {
      const parent = work.item(it.parentId) as ChecklistItem;
      return {
        agentId: it.agentId,
        teamId: team.id,
        task: memberTask({
          sub: it,
          parent,
          goal,
          team,
          name,
          siblings: parent.subtasks.filter((s) => s.status === 'todo' || s.status === 'running'),
          rework: it.notes,
          earlier: earlierWork(parent, goal),
          flow: flowNote(goal),
        }),
        caps,
      };
    }
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
      (running) right away; its checkout and run follow (launch). Main quests go first (src/domain/quests.ts). */
  function pump(projectId: string) {
    /* a split team item waits on its members: it holds no seat */
    const running = work.projectItems(projectId, 'running').filter((i) => i.teamPhase !== 'members');
    let free = cap - running.length;
    const busy = new Set(running.map(holder));
    /* a team rebuild hands orphaned work back to the director: it waits there for a new owner */
    const director = store.projects.require(projectId).orchestratorId;
    /* read fresh each time: a task skipped in this loop changes what the next one sees */
    const goalOf = (it: ChecklistItem) => work.goal(it.goalId) as Goal;
    const queue = work.projectItems(projectId, 'todo').map((it) => ({ it, goal: goalOf(it) }));
    const held = heldForMain(
      queue.map(({ it, goal }) => ({
        holder: holder(it),
        quest: goal.quest,
        ready: !fresh(it) || orderGate(goal, it) === 'go',
      })),
    );
    for (const { it, goal: queued } of mainFirst(queue, (q) => q.goal.quest)) {
      const quest = queued.quest;
      if (free <= 0) break;
      const who = holder(it);
      if (busy.has(who) || it.agentId === director) continue;
      if (quest === 'side' && held.has(who)) continue;
      /* the agent is busy with a run started by hand (or a chat turn): leave the item queued */
      if (runtime.busy(projectId, who)) {
        busy.add(who);
        continue;
      }
      const goal = goalOf(it);
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
      startItem(it.id);
    }
  }

  /** The item's checkout (its own worktree on first start; null = the project folder), then its run. */
  async function launch(itemId: string) {
    let it = work.item(itemId) as ChecklistItem;
    try {
      /* carrying on (after a restart, or a stopped goal continued): its checkout again, where it was */
      if (it.workspace && deps.worktrees && !existsSync(it.workspace.cwd)) {
        const ws = await deps.worktrees.ensure(repoOf(it.projectId), it.workspace);
        work.setItem(it.id, { status: it.status, workspace: ws });
      }
      if (!it.workspace && deps.worktrees && it.stage === 'build') {
        /* a member's sub-task branches off its team item's branch (and merges back into it) */
        const parentWs = it.parentId ? work.item(it.parentId)?.workspace : null;
        const ws = await deps.worktrees.open(
          repoOf(it.projectId),
          it.projectId,
          it.id,
          it.text,
          parentWs ? { branch: parentWs.branch } : undefined,
        );
        if (ws) work.setItem(it.id, { status: it.status, workspace: ws });
      }
    } catch (e) {
      settle(it, { status: 'failed', note: clip(`Couldn't make a checkout: ${(e as Error).message}`, 2000) });
      pump(it.projectId);
      return;
    }
    it = work.item(itemId) as ChecklistItem;
    if (it.status === 'running' && delegable(it)) {
      const mode = await split(it);
      it = work.item(itemId) as ChecklistItem;
      if (mode === 'team' && it.status === 'running') {
        pump(it.projectId);
        return;
      }
    }
    if (it.status !== 'running') {
      /* cancelled while its checkout was being made (or while its captain split it) */
      await shelve(it);
      return;
    }
    const goal = work.goal(it.goalId) as Goal;
    const { caps, ...spec } = runFor(it, goal);
    let run: { id: string };
    try {
      run = runtime.start(it.projectId, {
        ...spec,
        /* the office's work clock: a gate's review, a report item's research, everything else is building */
        kind: it.stage === 'review' ? 'reviewing' : it.report ? 'research' : 'building',
        itemId: it.id,
        ...(caps ? { caps } : {}),
        ...(it.workspace ? { workdir: it.workspace.cwd } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof AppError && e.code === 'conflict' && /already running/.test(msg)) {
        work.setItem(it.id, { status: 'todo' }); // raced a hand-started run: queue again
        return;
      }
      if (it.resumeRunId) {
        /* its session can't be resumed: start the item over (its checkout keeps what was done) — and the
           question it left open closes, since the fresh run never reads its answer */
        work.setItem(it.id, { status: 'running', resumeRunId: null });
        runtime.withdrawAsks(it.resumeRunId);
        startItem(it.id);
        return;
      }
      await stop(it, { status: 'failed', note: clip(msg, 2000) });
      pump(it.projectId);
      return;
    }
    work.setItem(it.id, { status: 'running', runId: run.id, resumeRunId: null });
    announce(work.item(it.id) as ChecklistItem);
  }

  const repoOf = (projectId: string) =>
    resolveInSandbox(deps.sandbox ?? '', store.projects.require(projectId).folder ?? '');

  /** A step after a run (merge, checkout put away, launch) threw: its item ends failed with the reason, so
      finished work never stays 'running' on the board. Items already settled are only logged. */
  const failOnError = (itemId: string, doing: string) => (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    const it = work.item(itemId);
    console.error(`[dispatch] couldn't ${doing}`, {
      projectId: it?.projectId,
      itemId,
      runId: it?.runId,
      error: e instanceof Error ? (e.stack ?? msg) : msg,
    });
    if (it?.status !== 'running') return;
    try {
      settle(it, { status: 'failed', note: clip(`Couldn't ${doing}: ${msg}`, 2000) });
      pump(it.projectId);
    } catch (again) {
      console.error('[dispatch] failing the item failed too', {
        projectId: it.projectId,
        itemId,
        error: again,
      });
    }
  };
  /** stop() in the background, failing its item if putting the checkout away throws. */
  const stopLater = (it: ChecklistItem, patch: Parameters<typeof stop>[1]) =>
    void stop(it, patch).catch(failOnError(it.id, 'put its checkout away'));
  const startItem = (itemId: string) => void launch(itemId).catch(failOnError(itemId, 'start it'));

  /** Merges back one at a time per project (one main working tree). `fn` never rejects (it fails its item). */
  const merging = new Map<string, Promise<void>>();
  const serial = (projectId: string, fn: () => Promise<void>) => {
    const next = (merging.get(projectId) ?? Promise.resolve()).then(fn);
    merging.set(projectId, next);
    return next;
  };

  /** End an item as failed/cancelled. With a checkout: put it away first (work committed on its branch), so
      the item — and its goal — settle with the branch named. Without one this settles right away. */
  async function stop(it: ChecklistItem, patch: ItemPatch & { status: 'failed' | 'cancelled' }) {
    const ws = it.workspace;
    let note = patch.note === undefined ? it.note : patch.note;
    if (ws && deps.worktrees) {
      work.setItem(it.id, { ...patch, status: 'running' }); // still on the board while it's put away
      const { kept } = await deps.worktrees.close(repoOf(it.projectId), ws, { deleteBranch: true });
      if (kept) note = clip(`${note ? `${note} — ` : ''}work kept on branch ${ws.branch}`, 2000);
      settle(work.item(it.id) as ChecklistItem, { ...patch, note });
      pump(it.projectId);
      return;
    }
    settle(it, patch);
  }

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
    if (it.parentId && patch.status !== 'todo' && patch.status !== 'running') teamCheck(it.parentId);
    refreshGoal(it.goalId);
  }
  const handoff = (
    it: ChecklistItem,
    from: string,
    to: string,
    kind: 'review' | 'rework' | 'merge-fix' | 'delegate' | 'deliver' | 'handover',
    note?: string,
    gate?: ItemGate,
  ) =>
    emit(it.projectId, {
      type: 'handoff',
      payload: {
        itemId: it.id,
        goalId: it.goalId,
        ...(it.parentId ? { parentId: it.parentId } : {}),
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
    const failed = failOnError(it.id, `merge it back (its work is on branch ${ws.branch})`);
    void serial(it.projectId, () => mergeBack(it, ws, wt).catch(failed));
  }

  /** Merge an accepted item's branch: done, back to its builder on a conflict, or failed with the work kept. */
  async function mergeBack(it: ChecklistItem, ws: NonNullable<ChecklistItem['workspace']>, wt: Worktrees) {
    /* a member's part merges into its team item's checkout; everything else into the project folder (main) */
    const parent = it.parentId ? work.item(it.parentId) : null;
    const repo = parent?.workspace?.cwd ?? repoOf(it.projectId);
    const r = await wt.merge(repo, ws, clip(`AI Studio: ${it.text} (${name(it.agentId)})`, 200));
    const cur = work.item(it.id) as ChecklistItem;
    if (r.ok && parent) {
      await wt.close(repo, ws, { deleteBranch: true });
      handoff(cur, cur.agentId, parent.agentId, 'deliver', clip(cur.note ?? '', 600) || undefined);
      settle(cur, { status: 'done' });
    } else if (r.ok) {
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
  }

  /** A build (or rework) run ended. Every task's build ends here: it counts as done only with real work
      (domain/real-work.ts) — a plan-only reply carries on in the same session, then fails. */
  function afterBuild(it: ChecklistItem, run: Run, did: WorkEvidence) {
    if (run.status !== 'succeeded') {
      stopLater(it, {
        status: run.status === 'cancelled' ? 'cancelled' : 'failed',
        note: clip(run.error ?? run.result ?? '', 2000) || null,
      });
      return;
    }
    const note = clip(run.result ?? '', 2000) || null;
    const evidence = { ...did, reportFiled: did.reportFiled || !!deps.filedBy?.(run.id) };
    const verdict = workVerdict(evidence, !!it.report, it.continues);
    if (verdict.kind === 'carry-on') {
      const resumeRunId = sessionOf(run.id) ? run.id : null;
      settle(it, { status: 'todo', runId: null, resumeRunId, continues: verdict.round }); // onFinished pumps it
      return;
    }
    if (verdict.kind === 'failed') {
      stopLater(it, {
        status: 'failed',
        note: clip(note && !it.report ? `${verdict.note} Last reply: ${note}` : verdict.note, 2000),
      });
      return;
    }
    const built = { note, buildRunId: run.id, continues: 0 };
    const gate = it.report ? undefined : it.gates[it.gateIndex];
    if (gate) {
      settle(it, { status: 'todo', stage: 'review', ...built });
      handoff(it, it.agentId, gate.reviewer, 'review', undefined, gate);
      return;
    }
    accept(it, built);
  }

  /** A review run ended: approve → next gate or done; changes → back to the builder (bounded). */
  function afterReview(it: ChecklistItem, run: Run) {
    const gate = it.gates[it.gateIndex] as ItemGate;
    if (run.status !== 'succeeded') {
      stopLater(it, {
        status: run.status === 'cancelled' ? 'cancelled' : 'failed',
        note: `${name(gate.reviewer)}'s review didn't finish: ${clip(run.error ?? run.status, 1500)}`,
      });
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
    const max = goalWorkflow(it.goalId, it.projectId).maxSendBacks;
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
    if (stuckOnSameNote(it, gate, v.notes, { sendBacks, reviews })) return;
    if (final) {
      stopLater(it, {
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

  /** The reviewer repeats its last send-back to this builder: a third round would too, so the item goes back to
      the director with both notes, waiting for a new owner on the same branch (src/crew/review-loop.ts).
      → true when it did. A member's part or a captain's team phase stays with its team. */
  function stuckOnSameNote(
    it: ChecklistItem,
    gate: ItemGate,
    notes: string,
    patch: Pick<ItemPatch, 'sendBacks' | 'reviews'>,
  ): boolean {
    if (it.parentId || it.teamPhase) return false;
    const earlier = repeatedNote(it, gate, notes);
    if (earlier === null) return false;
    settle(it, { status: 'todo', stage: 'build', notes, ...patch });
    const why = repeatedNoteText(name(gate.reviewer), name(it.agentId), earlier, notes);
    const director = store.projects.require(it.projectId).orchestratorId;
    handOver(it.id, { agentId: director, teamId: null }, clip(why, 2000));
    return true;
  }

  /* ---------------------------------------------------------------- teams (F1c) */

  /** A fresh item for a team's captain, in its own checkout, on a team with someone to delegate to. */
  function delegable(it: ChecklistItem): boolean {
    if (it.parentId || it.report || !it.teamId || !it.workspace || it.teamPlan) return false;
    if (it.stage !== 'build' || it.buildRunId || it.sendBacks > 0 || it.resumeRunId || it.continues > 0)
      return false;
    const team = store.teams.get(it.teamId);
    return !!team && team.captainId === it.agentId && team.members.length > 1;
  }

  /** The captain's split (one short read-only call). Never fails the item: a broken answer → the captain does it. */
  async function split(it: ChecklistItem): Promise<'team' | 'self'> {
    const team = store.teams.get(it.teamId as string);
    const captain = store.agents.get(it.agentId);
    const goal = work.goal(it.goalId) as Goal;
    if (!team || !captain) return 'self';
    emit(it.projectId, {
      type: 'agent.status',
      payload: {
        agentId: captain.id,
        status: 'working',
        activity: { kind: 'thinking', label: 'Splitting the work with the team' },
      },
    });
    const call = splitCall({
      captain,
      team,
      item: it,
      goal,
      orchestrator: orchName(it.projectId),
      name,
      role: (id) => store.agents.get(id)?.role ?? '',
      earlier: earlierWork(it, goal),
      way: teamWay(team.id),
      flow: flowNote(goal),
    });
    let value: z.output<typeof TeamSplitSchema> | null = null;
    try {
      ({ value } = await crew.call({
        who: captain.name,
        contract: TEAM_SPLIT,
        track: {
          scope: 'project',
          ownerId: it.projectId,
          agentId: captain.id,
          kind: 'thinking',
          itemId: it.id,
        },
        systemPrompt: call.systemPrompt,
        task: call.task,
        caps: SPLIT_CAPS,
        workspace: call.workspace,
        validate: validateWith(TeamSplitSchema, (v) =>
          splitIssues(v, { captainId: team.captainId, members: team.members.map((m) => m.agentId) }),
        ),
        onEvent: (e) => {
          if (e.kind === 'tokens')
            emit(it.projectId, {
              type: 'tokens',
              payload: { agentId: captain.id, input: e.input, output: e.output },
            });
          else if (e.kind === 'activity')
            emit(it.projectId, {
              type: 'agent.status',
              payload: { agentId: captain.id, status: e.status, activity: e.activity },
            });
        },
      }));
    } catch {
      value = null; // the captain couldn't split it: it does the item itself, as before F1c
    } finally {
      emit(it.projectId, { type: 'agent.status', payload: { agentId: captain.id, status: 'idle' } });
    }
    const cur = work.item(it.id) as ChecklistItem;
    if (cur.status !== 'running') return 'self'; // cancelled meanwhile: the caller puts it away
    const splitEvent = (mode: 'team' | 'self', summary: string, subs: ChecklistItem[]) =>
      emit(it.projectId, {
        type: 'team.split',
        payload: {
          itemId: it.id,
          goalId: it.goalId,
          captainId: captain.id,
          teamId: team.id,
          mode,
          summary: clip(summary, 1000),
          subtasks: subs.map((s) => ({ itemId: s.id, agentId: s.agentId, text: clip(s.text, 300) })),
          round: cur.teamRounds,
        },
      });
    if (!value || value.mode === 'self') {
      const summary = value?.summary ?? `${captain.name} takes this on alone.`;
      work.setItem(it.id, { status: 'running', teamPlan: clip(summary, 1000) });
      if (value) splitEvent('self', summary, []);
      return 'self';
    }
    const way = teamWay(team.id);
    const subs = store.tx(() =>
      work.insertSubtasks(
        cur,
        orderedSubtasks(way, value.subtasks).map((t) => ({
          id: randomUUID(),
          text: t.text,
          brief: t.brief,
          agentId: t.assignee,
          parallel: t.parallel !== false,
          gates: memberGates(way, team, { agentId: t.assignee, branches: t.branches }),
        })),
      ),
    );
    work.setItem(it.id, {
      status: 'running',
      runId: null,
      teamPhase: 'members',
      teamPlan: clip(value.summary, 1000),
    });
    announce(work.item(it.id) as ChecklistItem);
    splitEvent('team', value.summary, subs);
    for (const sub of subs) {
      announce(sub);
      handoff(sub, captain.id, sub.agentId, 'delegate', sub.text);
    }
    return 'team';
  }

  /** Each member's latest part (rework rounds replace earlier ones), in the captain's order. */
  function latestParts(parent: ChecklistItem): ChecklistItem[] {
    const byMember = new Map<string, ChecklistItem>();
    for (const s of work.children(parent.id)) byMember.set(s.agentId, s);
    return [...byMember.values()].sort((a, b) => a.position - b.position);
  }

  /** A member's part ended: once every part has, the captain integrates (or, the goal being cancelled, it stops). */
  function teamCheck(parentId: string) {
    const p = work.item(parentId);
    if (p?.status !== 'running' || p.teamPhase !== 'members') return;
    if (p.subtasks.some((s) => s.status === 'todo' || s.status === 'running')) return;
    if (stopping.delete(p.id)) {
      stopLater(p, { status: 'cancelled', teamPhase: null });
      return;
    }
    work.setItem(p.id, { status: 'todo', teamPhase: 'integrate', runId: null });
    announce(work.item(p.id) as ChecklistItem);
    queueMicrotask(() => pump(p.projectId));
  }

  /** The captain's integration run ended: one bounded rework round, or on through the gates like any build. */
  function afterIntegrate(it: ChecklistItem, run: Run, did: WorkEvidence) {
    if (run.status !== 'succeeded') {
      stopLater(it, {
        status: run.status === 'cancelled' ? 'cancelled' : 'failed',
        note: clip(run.error ?? run.result ?? '', 2000) || null,
      });
      return;
    }
    const team = it.teamId ? store.teams.get(it.teamId) : null;
    const seats = new Set(team?.members.map((m) => m.agentId) ?? []);
    const rework =
      it.teamRounds < MAX_TEAM_ROUNDS
        ? parseRework(run.result ?? '').filter((r) => seats.has(r.assignee) && r.assignee !== it.agentId)
        : [];
    if (rework.length) {
      const parts = new Map(latestParts(it).map((s) => [s.agentId, s]));
      const subs = store.tx(() => {
        const made = work.insertSubtasks(
          it,
          rework.map((r) => {
            const was = parts.get(r.assignee);
            return {
              id: randomUUID(),
              text: clip(`Rework: ${was?.text ?? it.text}`, 300),
              brief: was?.brief ?? it.brief,
              agentId: r.assignee,
              parallel: true,
              /* the reworked part passes the same team sign-offs as the part it redoes */
              gates: was?.gates ?? [],
            };
          }),
        );
        made.forEach((m, i) => {
          work.setItem(m.id, { status: 'todo', notes: rework[i]?.notes ?? null });
        });
        return made;
      });
      work.setItem(it.id, {
        status: 'running',
        runId: null,
        teamPhase: 'members',
        teamRounds: it.teamRounds + 1,
        note: clip(run.result ?? '', 2000) || null,
      });
      announce(work.item(it.id) as ChecklistItem);
      emit(it.projectId, {
        type: 'team.split',
        payload: {
          itemId: it.id,
          goalId: it.goalId,
          captainId: it.agentId,
          teamId: it.teamId as string,
          mode: 'team',
          summary: clip(`Back to ${subs.map((s) => name(s.agentId)).join(' and ')} for rework.`, 1000),
          subtasks: subs.map((s) => ({ itemId: s.id, agentId: s.agentId, text: clip(s.text, 300) })),
          round: it.teamRounds + 1,
        },
      });
      for (const sub of subs) {
        const cur = work.item(sub.id) as ChecklistItem;
        announce(cur);
        handoff(cur, it.agentId, cur.agentId, 'rework', cur.notes ?? undefined);
      }
      return;
    }
    /* integrated: from here on it is the captain's build (reviewer rework resumes this session) */
    work.setItem(it.id, { status: 'running', teamPhase: null });
    /* the members' delivered parts are the team item's work, even when integrating needed no new step */
    const delivered = latestParts(it).some((s) => s.status === 'done');
    afterBuild(work.item(it.id) as ChecklistItem, run, { ...did, changed: did.changed || delivered });
  }

  runtime.onFinished((run, did) => {
    const it = work.itemByRun(run.id);
    if (it?.status === 'running') {
      try {
        if (outlivedOwner(it, run.agentId)) restartForOwner(it);
        else if (it.stage === 'review') afterReview(it, run);
        else if (it.teamPhase === 'integrate') afterIntegrate(it, run, did);
        else afterBuild(it, run, did);
      } catch (e) {
        failOnError(it.id, 'wrap up its run')(e);
      }
    }
    /* any run ending frees its agent: an item waiting for it may start now */
    pump(run.projectId);
  });

  /** Stop these items (and their sub-tasks): queued ones are cancelled now, live runs are stopped (their
      items follow when the runs end), a split team item waits for its members' parts (teamCheck). */
  function halt(projectId: string, list: ChecklistItem[]) {
    const split: string[] = [];
    for (const it of list.flatMap((i) => [...i.subtasks, i])) {
      if (it.status === 'running' && it.teamPhase === 'members') {
        stopping.add(it.id);
        split.push(it.id);
      } else if (it.status === 'todo' || (it.status === 'running' && !it.runId)) {
        /* queued, or its checkout is still being made (launch notices and puts it away) */
        work.setItem(it.id, { status: 'cancelled' });
        announce(work.item(it.id) as ChecklistItem);
        if (it.status === 'todo') void shelve(it).catch(failOnError(it.id, 'put its checkout away'));
      } else if (it.status === 'running' && it.runId) {
        try {
          runtime.cancel(projectId, it.runId);
        } catch {
          /* already ended */
        }
      }
    }
    for (const id of split) teamCheck(id);
  }

  /** The review gates a new item gets for its owner under workflow `w` (reviewers who left the project are skipped). */
  function gatesOf(projectId: string, owner: GateOwner, w: Workflow): ItemGate[] {
    const members = projectMembers(store, projectId);
    return gatesFor(w, owner).filter((g) => members.includes(g.reviewer));
  }

  /* ---------------------------------------------------------------- handovers (src/crew/handover.ts) */

  /** A run outlived its item's owner (the item changed hands while it ran): the new owner builds it fresh in
      the same checkout — the run's result never goes to review as the new owner's work. */
  function restartForOwner(it: ChecklistItem) {
    settle(it, freshBuild());
  }

  /** Hand an item to a new owner: done work changes hands as it is; open work gets the new owner's fresh build on
      the same branch (a live run first ends as the old owner's). Its review history stays with the item; every
      review from here on is of the new owner's work. `note`: why, on the whiteboard and in the handoff. */
  function handOver(
    itemId: string,
    to: { agentId: string; teamId: string | null },
    note?: string,
  ): HandoverMode {
    const it = work.item(itemId);
    if (!it) throw notFound('Checklist item', itemId);
    const mode = handoverMode(it);
    const gates = it.report ? [] : gatesOf(it.projectId, to, goalWorkflow(it.goalId, it.projectId));
    store.tx(() => {
      work.editItem(it.id, mode === 'keep' ? to : { ...to, gates });
      /* the old owner's summary goes too: reviewers read the note as the current owner's */
      if (mode === 'now') work.setItem(it.id, { ...freshBuild(), note: note ?? null });
      if (mode === 'later') work.setItem(it.id, { status: 'running', ...dropSessions, note: note ?? null });
    });
    const cur = work.item(it.id) as ChecklistItem;
    handoff(cur, it.agentId, to.agentId, 'handover', note);
    announce(cur);
    if (mode === 'now') pump(it.projectId);
    return mode;
  }

  /** The caller's run builds this item of theirs right now (not a reviewer, a captain's split or a member's part):
      it may hand that item on. → the item, or null. */
  function ownBuild(runId: string, byId: string): ChecklistItem | null {
    const it = work.itemByRun(runId);
    if (!it || it.agentId !== byId || it.status !== 'running') return null;
    return it.parentId || it.teamPhase || it.stage !== 'build' ? null : it;
  }

  /** Hand the item `runId` builds over to `toId` with this note → the item, or null when it isn't the caller's own
      build. Stays the team's only when the new owner sits on that team. */
  function handOverRun(runId: string, byId: string, toId: string, note: string): ChecklistItem | null {
    const it = toId === byId ? null : ownBuild(runId, byId);
    if (!it) return null;
    const onTeam = !!it.teamId && !!store.teams.get(it.teamId)?.members.some((m) => m.agentId === toId);
    handOver(it.id, { agentId: toId, teamId: onTeam ? it.teamId : null }, clip(note, 2000));
    return work.item(it.id);
  }

  const STOP_WAIT_MS = 60_000;
  /** The director's whiteboard tools (src/whiteboard) change the board through this port. */
  const board = {
    crewing,
    gatesOf,
    workflowOf,
    linkFeature,
    /** A goal switched workflow; `regated` of its tasks took the new checks. */
    workflowChanged(projectId: string, goalId: string, regated: number) {
      const g = work.goal(goalId);
      if (g)
        emit(projectId, {
          type: 'workflow.changed',
          payload: { goalId, regated, ...workflowTag(workflowOf(g)) },
        });
    },
    /** Stops these items and resolves once none of them is running any more. */
    async stopItems(projectId: string, ids: string[]): Promise<void> {
      const list = ids.map((id) => work.item(id)).filter((i): i is ChecklistItem => !!i);
      halt(projectId, list);
      const live = () => ids.some((id) => work.item(id)?.status === 'running');
      const until = Date.now() + STOP_WAIT_MS;
      while (live()) {
        if (Date.now() > until) throw conflict('The stopped work did not end within a minute — try again');
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    handOver,
    /** Queue a finished or stopped item again: it carries on in its own session when it had one, or
        (`fresh`: done work redone) starts its build over. */
    reopen(itemId: string, fresh: boolean) {
      const it = work.item(itemId);
      if (!it) return;
      work.setItem(it.id, fresh ? { ...freshBuild(), note: null } : requeuePatch(it, !!sessionOf(it.runId)));
    },
    /** The board changed under these goals: tell the screen, settle them and start what may start. */
    changed(projectId: string, goalIds: string[]) {
      for (const goalId of goalIds) {
        const g = work.goal(goalId);
        if (!g) {
          /* removed: the screen reads the board again */
          emit(projectId, { type: 'goal.changed', payload: { goalId, status: 'cancelled' } });
          continue;
        }
        emit(projectId, { type: 'goal.changed', payload: goalPayload(g) });
        for (const it of g.items) announce(it);
        refreshGoal(goalId);
      }
      pump(projectId);
    },
  };

  return {
    board,
    /** `call_agent` with work: true from inside the caller's own build run of an item hands that item over to the
        callee (it follows them: owner, branch, reviews). → the item, or null when this isn't that case (a
        reviewer, a captain's split, a member's part, any other run: the work goes on as a task of its own). */
    handOverFromRun: (runId: string, byId: string, toId: string, request: string): ChecklistItem | null =>
      handOverRun(runId, byId, toId, handoverNote(name(byId), request)),
    /** `cant_do`: the builder lacks what its item needs — the item goes straight back to the director with `note`
        (why), waiting for a new owner; the run's result never goes to review. → the item, or null when the run
        isn't the caller's own build. */
    declineFromRun(runId: string, byId: string, note: string): ChecklistItem | null {
      const it = work.itemByRun(runId);
      return it ? handOverRun(runId, byId, store.projects.require(it.projectId).orchestratorId, note) : null;
    },
    list: (projectId: string) => {
      store.projects.require(projectId);
      return work.goals(projectId);
    },
    get(projectId: string, goalId: string): Goal {
      const g = work.goal(goalId);
      if (!g || g.projectId !== projectId) throw notFound('Goal', goalId);
      return g;
    },

    /** Orchestrator turn → whiteboard → queued runs. Resolves once the checklist is up. `fromChat`: the
        director's chat turn asked for it — the thread writes its own lines (no `onPlanned`). */
    async start(
      projectId: string,
      text: string,
      caps?: Goal['caps'],
      opts: { fromChat?: boolean } = {},
    ): Promise<Goal> {
      const planned = opts.fromChat ? undefined : deps.onPlanned;
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
          specialists: [...p.agentIds, ...store.guests.ids(projectId, true)].map((id) => ({
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
        const workflows = projectWorkflows(projectId);
        const usual = pickWorkflow(workflows);
        /* a git project: every item gets its own worktree, so independent items may run side by side */
        const isolated = !!deps.worktrees && (await deps.worktrees.usable(repoOf(projectId)));
        const everyone = usual.orchestratorTalksTo === 'everyone';
        const state = projectState(repoOf(projectId));
        const features = deps.features
          ? deps.features.repo
              .list(projectId)
              .map((f) => ({ id: f.id, name: f.name, status: f.status, about: clip(f.description, 200) }))
          : null;
        const task = [
          `Project: ${json({ name: p.name, about: p.note })}`,
          `Who works on it: ${json(staff)}`,
          `How they work together (workflows, the first is the usual one): ${json(describeWorkflows(workflows.length ? workflows : [usual], name))}`,
          `Already on the whiteboard, not done yet: ${json(open)}`,
          `The project right now: ${json(state)}`,
          features ? `Features: ${json(features)}` : '',
          `The user's goal: ${json(text)}`,
          [
            'Break the goal into a short checklist (1–8 items, in the order they should happen).',
            everyone
              ? 'Assign every item to someone on a team (set "assignee" to their id and "teamId" to their team — captains or members) or to a specialist (only "assignee").'
              : 'Assign every item to a team CAPTAIN (set "assignee" to the captain id and "teamId" to their team) or to a specialist (only "assignee").',
            everyone
              ? ''
              : 'Never assign to other team members — the captain owns the item for the team and splits it among its members by their jobs.',
            state.hasCode
              ? ''
              : 'The project has no code yet: the FIRST item sets up the stack it needs (simple and standard for what it is; CLAUDE.md’s rules apply), records how to start it in `.project` as one line `run: <command>`, and writes the stack, how to run and how to test into CLAUDE.md’s "Project-specific rules". Later items build on it (not parallel).',
            state.hasCode && !state.run
              ? 'Nobody has recorded how to start the app yet: the item that touches it adds `run: <command>` to `.project`.'
              : '',
            features
              ? 'Link the goal to the feature it builds in "feature": {"id": "<an id from Features>"} or a new one {"name": "Short name", "description": "What it is, in a sentence or two"} (it goes to Now). It moves to Shipped once every item has landed; set "ships": false when this goal is only a step and the feature isn’t finished by it. A Shipped feature is done: a goal that ADDS something new to it (a new view, a new ability) gets a NEW feature; link a shipped one only for a fix to it. Research or report goals: leave "feature" out.'
              : '',
            '"text" is the whiteboard line (short); "brief" tells the assignee what done looks like.',
            workflows.length > 1
              ? 'Pick the workflow whose "when" fits this goal and set "workflow" to its id; leave it out for the first one. These are suggestions: if none fits, pick the closest and say why in "summary". Its "orchestratorTalksTo" decides whom you may brief.'
              : '',
            'When the user puts someone in command for this goal ("Elon, take command and use Bob"), set "workflow" to {"lead": "<their id>", "crew": ["<ids>"], "why": "one line"}: the lead hands their crew work and signs it off, for this goal only.',
            workflows.some((w) => w.gates.length)
              ? 'The review gates of the workflow run automatically after each build item — do not add separate review or QA items for them.'
              : '',
            workflows.some((w) => branchLabels(w).length)
              ? 'Some gates only hold on a branch (their "when", listed in the workflow\'s "branches"). On every item set "branches" to the labels of its workflow that hold for that item, copied word for word — [] when none does (e.g. setting up the stack does not "touch payments"). A gate with a "when" runs only on items that name it.'
              : '',
            !everyone && workflows.some((w) => w.first || w.steps?.length)
              ? "When a flow names a team member who is not its captain (who starts, or a hand-off), still give that team's item to its captain: the captain splits it and puts that member first. Say so in the brief."
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
                ...(workflows.some((w) => branchLabels(w).length) ? { branches: [] } : {}),
              },
            ],
            ...(features
              ? { feature: { name: 'Feature name', description: 'What it is.', ships: true } }
              : {}),
            ...(workflows.length > 1 ? { workflow: workflows[1]?.id } : {}),
          })}`,
        ]
          .filter(Boolean)
          .join('\n\n');
        let value: DispatchPlan;
        try {
          ({ value } = await crew.call({
            who: orch.name,
            contract: DISPATCH,
            track: { scope: 'project', ownerId: projectId, agentId: orch.id, kind: 'thinking' },
            systemPrompt: crewSystemPrompt(orch, ORCHESTRATOR_ALTITUDE),
            task,
            validate: validateWith(DispatchSchema, (d) => {
              const r = resolveWorkflow(store, projectId, d.workflow);
              return r.issues.length
                ? r.issues
                : [...dispatchIssues(d, crewing(projectId, r.workflow)), ...branchIssues(d, r.workflow)];
            }),
            onEvent: (e) => {
              if (e.kind === 'tokens')
                emit(projectId, {
                  type: 'tokens',
                  payload: { agentId: orch.id, input: e.input, output: e.output },
                });
            },
          }));
        } catch (e) {
          planned?.({ projectId, goalText: text, goal: null, error: (e as Error).message });
          throw e;
        }
        const { workflow, toSeat } = resolveWorkflow(store, projectId, value.workflow);
        for (const id of toSeat) seatForWork(store, projectId, id, text);
        const known = deps.features?.repo.list(projectId) ?? [];
        const goal = store.tx(() =>
          work.insertGoal(
            {
              id: randomUUID(),
              projectId,
              text,
              summary: value.summary,
              workflow,
              ...(caps ? { caps } : {}),
            },
            value.items.map((i) => {
              const item = { agentId: i.assignee, teamId: i.teamId ?? null };
              return {
                id: randomUUID(),
                text: i.text,
                brief: i.brief,
                ...item,
                parallel: i.parallel === true,
                report: i.report === true,
                featureIds: taskFeatures(i, known).map((f) => f.id),
                /* report items ask for knowledge, not change: no review gates */
                gates: i.report ? [] : gatesOf(projectId, { ...item, branches: i.branches }, workflow),
              };
            }),
          ),
        );
        linkFeature(goal, value.feature);
        emit(projectId, { type: 'goal.changed', payload: goalPayload(goal) });
        for (const it of goal.items) announce(it);
        refreshGoal(goal.id);
        pump(projectId);
        const made = work.goal(goal.id) as Goal;
        planned?.({ projectId, goalText: text, goal: made });
        return made;
      } finally {
        planning.delete(projectId);
        emit(projectId, { type: 'agent.status', payload: { agentId: orch.id, status: 'idle' } });
      }
    },

    /** Stop a goal: queued items are cancelled, live runs stopped (their items follow when they end). */
    cancel(projectId: string, goalId: string): Goal {
      const g = this.get(projectId, goalId);
      if (g.status === 'failed') {
        /* a stopped goal is dropped off the board (its kept branches stay) */
        work.setGoalStatus(goalId, 'cancelled');
        emit(projectId, { type: 'goal.changed', payload: { goalId, status: 'cancelled' } });
        return work.goal(goalId) as Goal;
      }
      if (g.status !== 'running') throw conflict(`This goal is already ${g.status}`);
      halt(projectId, g.items);
      refreshGoal(goalId);
      return work.goal(goalId) as Goal;
    },

    /** Stop every running goal of the project (the "stop everything" path): nothing queued starts after. */
    cancelAll(projectId: string): Goal[] {
      store.projects.require(projectId);
      return work
        .goals(projectId)
        .filter((g) => g.status === 'running')
        .map((g) => this.cancel(projectId, g.id));
    },

    /** Continue a stopped goal (failed, or cancelled by the user): its unfinished items queue again in order.
        An item that had started carries on in its own session and checkout (re-made from its branch). */
    resume(projectId: string, goalId: string): Goal {
      const g = this.get(projectId, goalId);
      if (g.status === 'running' || g.status === 'done') throw conflict(`This goal is already ${g.status}`);
      for (const it of g.items) {
        if (it.status !== 'failed' && it.status !== 'cancelled') continue;
        work.setItem(it.id, requeuePatch(it, !!sessionOf(it.runId)));
        announce(work.item(it.id) as ChecklistItem);
      }
      work.setGoalStatus(goalId, 'running');
      emit(projectId, { type: 'goal.changed', payload: { goalId, status: 'running' } });
      refreshGoal(goalId);
      pump(projectId);
      return work.goal(goalId) as Goal;
    },

    /** After a restart: the whiteboard stays as it was and its work carries on — a run that was cut off
        resumes its session in its checkout; queued items stay queued. Nothing is marked failed. */
    recover() {
      const projects = work.activeProjects();
      for (const projectId of projects) {
        for (const it of work.projectItems(projectId, 'running')) {
          if (it.teamPhase === 'members') continue; // waits on its members' parts (queued again below)
          const run = runOf(it.runId);
          if (run && outlivedOwner(it, run.agent_id)) {
            /* handed over while it ran: the new owner starts it, never the old owner's session */
            restartForOwner(it);
            continue;
          }
          if (run?.status === 'succeeded') {
            /* its run had finished: it was merging back — merge again */
            accept(it);
            continue;
          }
          const again = it.stage !== 'review' && !!run?.session_id;
          work.setItem(it.id, {
            status: 'todo',
            runId: null,
            resumeRunId: again ? it.runId : it.resumeRunId,
          });
          announce(work.item(it.id) as ChecklistItem);
        }
      }
      /* after the app has finished starting */
      setImmediate(() => {
        for (const projectId of projects)
          try {
            pump(projectId);
          } catch {
            /* the studio is closing again */
          }
      });
    },
    /** Tests: let queued work drain. */
    idle: (projectId: string) =>
      work.projectItems(projectId, 'running').length + work.projectItems(projectId, 'todo').length === 0,
  };
}
export type Dispatch = ReturnType<typeof createDispatch>;
