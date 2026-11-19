/* The director's hands on the whiteboard: add goals and tasks, edit them, take them off, clean up.
   Rules: text/brief/order changes to running work apply with a warning; changing who owns it, its status, or
   removing it is refused unless `force` — then the running work is stopped first and the reply says whose.
   A goal that gains open tasks runs again. Every change is announced (dispatch's board port), so the office
   redraws at once, and logged with who made it (`by`); removals can be undone for a day (history.ts). */
import { randomUUID } from 'node:crypto';
import type { createDispatch } from '../crew/dispatch.ts';
import { resolveWorkflow } from '../crew/workflows.ts';
import type { Db } from '../db/connection.ts';
import { featuresRepo } from '../db/features.ts';
import type { Store } from '../db/store.ts';
import { type ChecklistItem, type Goal, type NewItem, workRepo } from '../db/work.ts';
import type { Quest } from '../domain/quests.ts';
import { pickWorkflow, type Workflow, type WorkflowAsk } from '../domain/workflows.ts';
import { conflict, invalid } from '../errors.ts';
import { seatForWork } from '../office/people.ts';
import { projectMembers } from '../room/members.ts';
import { type BoardReader, boardText, goalBlock } from './board-text.ts';
import { createHistory } from './history.ts';
import { type Owner, type Roster, resolveOwner } from './owner.ts';

export type BoardPort = ReturnType<typeof createDispatch>['board'];
/** `branches`: the workflow's branch labels (a gate's `when`) that hold for this task; left out = all hold. */
export type TaskInput = {
  text: string;
  owner: string;
  team?: string;
  brief?: string;
  parallel?: boolean;
  branches?: string[];
};
export type TaskEdit = {
  text?: string;
  brief?: string;
  owner?: string;
  team?: string;
  /** 1 = first. */
  position?: number;
  parallel?: boolean;
  status?: 'todo' | 'done' | 'cancelled';
  force?: boolean;
};
export type GoalEdit = {
  text?: string;
  summary?: string;
  status?: 'running' | 'done' | 'cancelled';
  /** Switch the workflow it runs under (a stable id, or a temporary lead + crew). */
  workflow?: WorkflowAsk;
  force?: boolean;
};
export type CleanWhich = 'finished' | 'stopped' | 'all';
/** The feature a new goal serves; `ships: false` = the goal is only one step of it. */
export type FeatureLink = { id: string; ships?: boolean };
/** `quest`: the main storyline (default) or a side quest — a quick fix or short research job, never a feature's. */
export type NewGoal = {
  text: string;
  summary?: string;
  tasks: TaskInput[];
  feature?: FeatureLink;
  quest?: Quest;
  /** The stable workflow (id) it runs under, or a temporary one; left out = the project's first. */
  workflow?: WorkflowAsk;
};

const MAX_TASKS = 8;
const DAY_MS = 86_400_000;
const isOpen = (i: ChecklistItem) => i.status === 'todo' || i.status === 'running';

/** Where a lead's next crew task goes (0-based): after the lead's last task and the crew tasks right after it;
    a lead without a task of their own → at the end. */
export function crewSlot(
  items: readonly Pick<ChecklistItem, 'agentId'>[],
  leadId: string,
  crew: readonly string[],
): number {
  const lead = items.findLastIndex((i) => i.agentId === leadId);
  if (lead < 0) return items.length;
  let at = lead + 1;
  while (at < items.length && crew.includes(items[at]?.agentId ?? '')) at++;
  return at;
}

export function createBoard(deps: { db: Db; store: Store; port: BoardPort }) {
  const { store, port } = deps;
  const work = workRepo(deps.db);
  const features = featuresRepo(deps.db);
  const name = (id: string) => store.agents.get(id)?.name ?? id;
  const history = createHistory({ db: deps.db, store, name });
  const usualId = (projectId: string) => pickWorkflow(store.projects.require(projectId).workflows ?? []).id;
  const reader = (projectId: string): BoardReader => ({
    name,
    usualId: usualId(projectId),
    directorId: store.projects.require(projectId).orchestratorId,
  });

  /** Who may own work under workflow `w`. `direct`: the user picked the person themselves, so any team
      member may own the task. */
  function roster(projectId: string, w: Workflow, direct = false): Roster {
    const p = store.projects.require(projectId);
    const c = port.crewing(projectId, w);
    const teams = p.teamIds.flatMap((tid) => {
      const t = store.teams.get(tid);
      return t
        ? [{ id: t.id, name: t.name, captainId: t.captainId, memberIds: t.members.map((m) => m.agentId) }]
        : [];
    });
    /* the room's members, plus a temporary lead's crew not seated yet */
    const ids = new Set([...projectMembers(store, projectId), ...c.specialists]);
    const people = [...ids].flatMap((id) => {
      const a = store.agents.get(id);
      return a ? [{ id, name: a.name, nick: a.nick }] : [];
    });
    return {
      people,
      teams,
      directorId: p.orchestratorId,
      specialists: c.specialists,
      everyone: direct || w.orchestratorTalksTo === 'everyone',
    };
  }

  /** The workflow a new goal asks for (none = the project's first; a stable id; or a temporary lead + crew).
      Refused with the field; a temporary crew's Cast agents are seated as guests. */
  function chooseWorkflow(projectId: string, ask: WorkflowAsk | undefined, goalText: string): Workflow {
    const r = resolveWorkflow(store, projectId, ask);
    if (r.issues.length)
      throw invalid(`${r.issues.join('; ')}.${typeof ask === 'string' ? ' See them with workflows.' : ''}`);
    for (const id of r.toSeat) seatForWork(store, projectId, id, goalText);
    return r.workflow;
  }

  function goalOf(projectId: string, id: string): Goal {
    const g = work.goal(id);
    if (!g || g.projectId !== projectId)
      throw invalid(`No goal '${id}' on this whiteboard — look with whiteboard first.`);
    return g;
  }
  function taskOf(projectId: string, id: string): ChecklistItem {
    const it = work.item(id);
    if (!it || it.projectId !== projectId)
      throw invalid(`No task '${id}' on this whiteboard — look with whiteboard first.`);
    if (it.parentId)
      throw invalid(
        `'${it.text}' is part of a team's split — its captain runs it; change the team's task instead.`,
      );
    return it;
  }

  /** Who a new task goes to under workflow `w`. */
  type PickOwner = (t: TaskInput, w: Workflow) => Owner;
  const named =
    (projectId: string, direct = false): PickOwner =>
    (t, w) =>
      resolveOwner(roster(projectId, w, direct), t.owner ?? '', t.team);

  function newItem(projectId: string, t: TaskInput, w: Workflow, pick: PickOwner): NewItem {
    if (!t.text?.trim()) throw invalid('Every task needs "text".');
    const owner = pick(t, w);
    return {
      id: randomUUID(),
      text: t.text.trim(),
      brief: t.brief?.trim() || t.text.trim(),
      ...owner,
      parallel: t.parallel === true,
      gates: port.gatesOf(projectId, { ...owner, branches: t.branches }, w),
    };
  }

  /** Running items block a change unless forced; forced, they are stopped first. → whom we stopped. */
  async function clearRunning(
    projectId: string,
    list: ChecklistItem[],
    force: boolean | undefined,
    what: string,
  ) {
    const running = list.filter((i) => i.status === 'running');
    if (!running.length) return '';
    const who = running.map((i) => `'${i.text}' (${name(i.agentId)})`).join(', ');
    if (!force)
      throw conflict(
        `Running now: ${who}. To ${what} anyway, call again with force: true — that stops them first.`,
      );
    await port.stopItems(
      projectId,
      running.map((i) => i.id),
    );
    return `Stopped ${who}. `;
  }

  /** Stopping work lets dispatch settle its goal early (as cancelled) — before our change lands. Goals that
      were running before go back to running; port.changed then settles them on what is really left. */
  const runningNow = (goalIds: string[]) => goalIds.filter((id) => work.goal(id)?.status === 'running');
  const keepRunning = (goalIds: string[]) => {
    for (const id of goalIds) if (work.goal(id)) work.setGoalStatus(id, 'running');
  };
  /** A goal with open tasks again runs again. */
  function wake(goalId: string) {
    const g = work.goal(goalId);
    if (g && g.status !== 'running' && g.items.some(isOpen)) work.setGoalStatus(goalId, 'running');
  }
  /** Not parallel, after an earlier task that did not succeed: dispatch would skip it. */
  function skipWarning(goalId: string, itemId: string): string {
    const g = work.goal(goalId) as Goal;
    const it = g.items.find((i) => i.id === itemId);
    if (!it || it.parallel) return '';
    const blocked = g.items
      .slice(0, it.position)
      .some((b) => b.status === 'failed' || b.status === 'cancelled');
    return blocked
      ? ' Note: an earlier task here did not finish, so this one will be skipped — reopen that one, or make this parallel.'
      : '';
  }
  const reply = (projectId: string, goalIds: string[], lead: string) => {
    port.changed(projectId, goalIds);
    const shown = goalIds.map((id) => work.goal(id)).filter((g): g is Goal => !!g);
    return [lead.trim(), ...shown.map((g) => goalBlock(g, reader(projectId)))].join('\n\n');
  };
  /** The parts of an edit that were asked for, for the log line. */
  const changed = (e: object) =>
    Object.entries(e)
      .filter(([k, v]) => k !== 'force' && v !== undefined)
      .map(([k]) => k)
      .join(', ');

  /** Not started yet: still in build, never built, not a team member's sub-task. */
  const untouched = (i: ChecklistItem) =>
    i.status === 'todo' && i.stage === 'build' && !i.buildRunId && !i.parentId;

  /** Switch a goal's workflow mid-way: its untouched tasks take the new checks; running or reviewed work keeps
      the ones it started with. → the line that says so. */
  function switchWorkflow(projectId: string, g: Goal, ask: WorkflowAsk): string {
    const w = chooseWorkflow(projectId, ask, g.text);
    const regated = g.items.filter(untouched);
    store.tx(() => {
      work.setGoalWorkflow(g.id, w);
      for (const it of regated)
        work.editItem(it.id, {
          gates: port.gatesOf(projectId, { agentId: it.agentId, teamId: it.teamId }, w),
        });
    });
    port.workflowChanged(projectId, g.id, regated.length);
    const kept = g.items.length - regated.length;
    return `Now runs under '${w.name}': ${regated.length} task(s) not started yet take its checks${kept ? `; ${kept} started or finished keep theirs` : ''}.`;
  }

  /** A new goal on the board, announced (so dispatch starts it) → the goal and the line that says so. */
  function putGoal(
    projectId: string,
    by: string,
    a: NewGoal,
    pick: PickOwner = named(projectId),
  ): { goal: Goal; text: string } {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict('This project has no folder yet — set it up first.');
    if (!a.text?.trim()) throw invalid('A goal needs "text".');
    if (!a.tasks?.length || a.tasks.length > MAX_TASKS) throw invalid(`A goal has 1–${MAX_TASKS} tasks.`);
    const quest = a.quest ?? 'main';
    if (a.feature && quest === 'side')
      throw invalid('A side quest never serves a feature — leave "feature" out, or make it a main quest.');
    if (a.feature && !features.get(projectId, a.feature.id))
      throw invalid(`No feature '${a.feature.id}' — look with features first.`);
    const workflow = chooseWorkflow(projectId, a.workflow, a.text);
    const items = a.tasks.map((t) => newItem(projectId, t, workflow, pick));
    const goal = store.tx(() =>
      work.insertGoal(
        {
          id: randomUUID(),
          projectId,
          text: a.text.trim(),
          summary: a.summary?.trim() || a.text.trim(),
          quest,
          workflow,
        },
        items,
      ),
    );
    const linked = a.feature ? port.linkFeature(goal, a.feature) : null;
    const kind = quest === 'side' ? 'side quest' : 'goal';
    history.record(projectId, by, 'add', `Added ${kind} '${goal.text}' with ${items.length} task(s)`);
    const serves = linked ? ` It serves the feature “${linked.name}”.` : '';
    const lead =
      quest === 'side'
        ? 'Added as a side quest; it runs when it holds up no main quest.'
        : `Added to the whiteboard; the work starts in order.${serves}`;
    return { goal, text: reply(projectId, [goal.id], lead) };
  }

  return {
    view: (projectId: string) => boardText(work.goals(projectId), reader(projectId)),
    history: (projectId: string) => history.text(projectId),
    /** A change to how the board's work runs (its workflows), in the board's history. */
    note: (projectId: string, by: string, summary: string) =>
      history.record(projectId, by, 'workflow', summary),

    /** The workflow this goal runs under (refused: not a goal of this project). */
    workflowOfGoal: (projectId: string, id: string): Workflow => port.workflowOf(goalOf(projectId, id)),

    addGoal: (projectId: string, by: string, a: NewGoal): string => putGoal(projectId, by, a).text,
    /** The user's own goal for one person they picked (from that person's chat): any seat on the project. */
    addDirectGoal: (projectId: string, by: string, a: NewGoal): Goal =>
      putGoal(projectId, by, a, named(projectId, true)).goal,
    /** Work handed to the director (`call_agent` work: true to them, outside a build): a side quest whose task
        waits with them for a new owner (dispatch never starts the director's tasks). */
    addForDirector(projectId: string, by: string, t: { text: string; brief: string }): Goal {
      const owner = store.projects.require(projectId).orchestratorId;
      return putGoal(projectId, by, { text: t.text, tasks: [{ ...t, owner }], quest: 'side' }).goal;
    },

    addTask(projectId: string, by: string, a: TaskInput & { goal: string; position?: number }): string {
      const g = goalOf(projectId, a.goal);
      const item = newItem(projectId, a, port.workflowOf(g), named(projectId));
      work.appendItems(g, [item]);
      if (a.position !== undefined) work.moveItem(item.id, a.position - 1);
      wake(g.id);
      history.record(projectId, by, 'add', `Added '${item.text}' to '${g.text}' for ${name(item.agentId)}`);
      return reply(
        projectId,
        [g.id],
        `Added '${item.text}' for ${name(item.agentId)}.${skipWarning(g.id, item.id)}`,
      );
    },

    /** A temporary lead hands a crew member work (Phase 3): it stays on the lead's goal as main work, right after
        the lead's own task and the crew work before it, waits its turn, and the lead signs it off. */
    addCrewTask(
      projectId: string,
      goalId: string,
      leadId: string,
      t: { text: string; owner: string; brief: string },
    ): string {
      const g = goalOf(projectId, goalId);
      const item = newItem(projectId, t, port.workflowOf(g), () => ({ agentId: t.owner, teamId: null }));
      const at = crewSlot(g.items, leadId, g.workflow?.crew ?? []);
      work.appendItems(g, [item]);
      work.moveItem(item.id, at);
      wake(g.id);
      history.record(projectId, leadId, 'add', `Added '${item.text}' to '${g.text}' for ${name(t.owner)}`);
      port.changed(projectId, [g.id]);
      return `Added to this goal as ${name(t.owner)}'s task #${at + 1}; you sign it off.`;
    },

    async editGoal(projectId: string, by: string, id: string, e: GoalEdit): Promise<string> {
      const g = goalOf(projectId, id);
      /* first: a workflow that can't be had refuses the whole edit */
      const switched = e.workflow !== undefined ? switchWorkflow(projectId, g, e.workflow) : '';
      work.editGoal(id, {
        ...(e.text?.trim() ? { text: e.text.trim() } : {}),
        ...(e.summary?.trim() ? { summary: e.summary.trim() } : {}),
      });
      let lead = switched ? '' : 'Goal updated.';
      if (e.status === 'running') {
        for (const it of g.items)
          if (it.status === 'failed' || it.status === 'cancelled') port.reopen(it.id, false);
        work.setGoalStatus(id, 'running');
        lead = 'Goal running again: its unfinished tasks are queued.';
      } else if (e.status) {
        const stopped = await clearRunning(projectId, g.items, e.force, `mark the goal ${e.status}`);
        await port.stopItems(
          projectId,
          g.items.filter(isOpen).map((i) => i.id),
        );
        work.setGoalStatus(id, e.status);
        lead = `${stopped}Goal marked ${e.status}.`;
      }
      history.record(projectId, by, 'edit', `Edited goal '${g.text}' (${changed(e)})`);
      return reply(projectId, [id], [switched, lead].filter(Boolean).join(' '));
    },

    async editTask(projectId: string, by: string, id: string, e: TaskEdit): Promise<string> {
      const it = taskOf(projectId, id);
      const w = port.workflowOf(goalOf(projectId, it.goalId));
      const owner = e.owner ? resolveOwner(roster(projectId, w), e.owner, e.team) : null;
      const newOwner = !!owner && (owner.agentId !== it.agentId || owner.teamId !== it.teamId);
      const notes: string[] = [];
      const wasRunning = runningNow([it.goalId]);
      if (newOwner || (e.status && e.status !== it.status))
        notes.push(
          await clearRunning(
            projectId,
            [it],
            e.force,
            newOwner ? 'hand it to someone else' : `mark it ${e.status}`,
          ),
        );
      else if (it.status === 'running' && (e.text || e.brief || e.position || e.parallel !== undefined))
        notes.push(
          `It is running: ${name(it.agentId)} keeps the brief they started with; the change counts from its next run.`,
        );
      work.editItem(id, {
        ...(e.text?.trim() ? { text: e.text.trim() } : {}),
        ...(e.brief?.trim() ? { brief: e.brief.trim() } : {}),
        ...(e.parallel !== undefined ? { parallel: e.parallel } : {}),
      });
      if (e.position !== undefined) work.moveItem(id, e.position - 1);
      /* its branch and reviews follow the new owner; done work changes hands as it is */
      const handed = newOwner && owner ? port.handOver(id, owner) : null;
      const cur = work.item(id) as ChecklistItem;
      if (e.status === 'todo' && cur.status !== 'todo') port.reopen(id, cur.status === 'done');
      else if (e.status === 'done' && cur.status !== 'done')
        work.setItem(id, { status: 'done', runId: cur.runId });
      else if (e.status === 'cancelled' && cur.status === 'todo') await port.stopItems(projectId, [id]);
      if (handed && owner)
        notes.push(
          handed === 'keep'
            ? `Now ${name(owner.agentId)}'s — it was done, so their finished work stays as it is.`
            : `Now ${name(owner.agentId)}'s: they build it on the same branch, and its reviews look at their work.`,
        );
      keepRunning(wasRunning);
      wake(it.goalId);
      history.record(projectId, by, 'edit', `Edited '${it.text}' (${changed(e)})`);
      return reply(
        projectId,
        [it.goalId],
        [...notes, 'Task updated.', skipWarning(it.goalId, id)].filter(Boolean).join(' '),
      );
    },

    async remove(
      projectId: string,
      by: string,
      a: { goals?: string[]; tasks?: string[]; force?: boolean },
    ): Promise<string> {
      const goals = (a.goals ?? []).map((id) => goalOf(projectId, id));
      const tasks = (a.tasks ?? []).map((id) => taskOf(projectId, id));
      if (!goals.length && !tasks.length) throw invalid('Say which "goals" or "tasks" to take off.');
      const taskIds = new Set(tasks.map((t) => t.id));
      const taskGoals = [...new Set(tasks.map((t) => t.goalId))];
      /* a goal left without tasks goes too: an empty goal would read as done */
      const emptied = taskGoals.filter((gid) => work.goal(gid)?.items.every((i) => taskIds.has(i.id)));
      const gone = [...new Set([...goals.map((g) => g.id), ...emptied])];
      const wasRunning = runningNow(taskGoals);
      const stopped = await clearRunning(
        projectId,
        [...goals.flatMap((g) => g.items), ...tasks],
        a.force,
        'take them off',
      );
      const snapshot = work.snapshot(gone, [...taskIds]);
      for (const t of tasks) work.removeItem(t.id);
      for (const gid of gone) work.removeGoal(gid);
      keepRunning(wasRunning);
      const counts = [
        tasks.length ? `${tasks.length} task(s)` : '',
        gone.length ? `${gone.length} goal(s)` : '',
      ]
        .filter(Boolean)
        .join(' and ');
      const what = [...goals.map((g) => g.text), ...tasks.map((t) => t.text)].map((t) => `'${t}'`).join(', ');
      history.record(projectId, by, 'remove', `Took off ${what}`, snapshot);
      const touched = [...new Set([...gone, ...taskGoals])];
      return reply(projectId, touched, `${stopped}Took off ${counts}. undo_board puts it back.`);
    },

    async clean(
      projectId: string,
      by: string,
      a: { which: CleanWhich; olderThanDays?: number; force?: boolean },
    ): Promise<string> {
      const statuses: Goal['status'][] =
        a.which === 'finished'
          ? ['done']
          : a.which === 'stopped'
            ? ['failed', 'cancelled']
            : ['done', 'failed', 'cancelled', 'running'];
      const before = a.olderThanDays ? Date.now() - a.olderThanDays * DAY_MS : Infinity;
      const goals = work
        .goals(projectId)
        .filter((g) => statuses.includes(g.status) && Date.parse(g.updatedAt) < before);
      if (!goals.length) return 'Nothing to clean up.';
      const stopped = await clearRunning(
        projectId,
        goals.flatMap((g) => g.items),
        a.force,
        'clean them off',
      );
      await port.stopItems(
        projectId,
        goals.flatMap((g) => g.items.filter(isOpen).map((i) => i.id)),
      );
      const ids = goals.map((g) => g.id);
      const snapshot = work.snapshot(ids, []);
      for (const id of ids) work.removeGoal(id);
      history.record(
        projectId,
        by,
        'clean',
        `Cleaned ${a.which} goals off: ${goals.map((g) => `'${g.text}'`).join(', ')}`,
        snapshot,
      );
      port.changed(projectId, ids);
      return `${stopped}Cleaned ${goals.length} goal(s) off the whiteboard. undo_board puts them back.`;
    },

    /** Puts back a removal or clean-up (the latest if no id). Stopped work comes back stopped. */
    undo(projectId: string, by: string, changeId?: string): string {
      const { change, snapshot } = history.putBack(projectId, changeId);
      const touched = [...new Set(snapshot.items.map((i) => i.goal_id as string))];
      for (const id of touched) wake(id);
      history.record(projectId, by, 'undo', `Undid: ${change.summary}`);
      const stopped = snapshot.items.some((i) => i.status === 'cancelled')
        ? ' Tasks that were stopped stay stopped — edit_task with status todo runs one again.'
        : '';
      return reply(projectId, touched, `Put back: ${change.summary}.${stopped}`);
    },
  };
}
export type Board = ReturnType<typeof createBoard>;
