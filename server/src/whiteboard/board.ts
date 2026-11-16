/* The director's hands on the whiteboard: add goals and tasks, edit them, take them off, clean up.
   Rules: text/brief/order changes to running work apply with a warning; changing who owns it, its status, or
   removing it is refused unless `force` — then the running work is stopped first and the reply says whose.
   A goal that gains open tasks runs again. Every change is announced (dispatch's board port), so the office
   redraws at once, and logged with who made it (`by`); removals can be undone for a day (history.ts). */
import { randomUUID } from 'node:crypto';
import type { createDispatch } from '../crew/dispatch.ts';
import type { Db } from '../db/connection.ts';
import { featuresRepo } from '../db/features.ts';
import type { Store } from '../db/store.ts';
import { type ChecklistItem, type Goal, type NewItem, workRepo } from '../db/work.ts';
import type { Quest } from '../domain/quests.ts';
import { conflict, invalid } from '../errors.ts';
import { boardText, goalBlock } from './board-text.ts';
import { createHistory } from './history.ts';
import { type Roster, resolveOwner } from './owner.ts';

export type BoardPort = ReturnType<typeof createDispatch>['board'];
export type TaskInput = { text: string; owner: string; team?: string; brief?: string; parallel?: boolean };
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
};

const MAX_TASKS = 8;
const DAY_MS = 86_400_000;
const isOpen = (i: ChecklistItem) => i.status === 'todo' || i.status === 'running';

export function createBoard(deps: { db: Db; store: Store; port: BoardPort }) {
  const { store, port } = deps;
  const work = workRepo(deps.db);
  const features = featuresRepo(deps.db);
  const name = (id: string) => store.agents.get(id)?.name ?? id;
  const history = createHistory({ db: deps.db, store, name });

  /** `direct`: the user picked the person themselves, so any team member may own the task. */
  function roster(projectId: string, direct = false): Roster {
    const p = store.projects.require(projectId);
    const c = port.crewing(projectId);
    const teams = p.teamIds.flatMap((tid) => {
      const t = store.teams.get(tid);
      return t
        ? [{ id: t.id, name: t.name, captainId: t.captainId, memberIds: t.members.map((m) => m.agentId) }]
        : [];
    });
    const ids = new Set([
      ...c.specialists,
      ...teams.flatMap((t) => [...(t.captainId ? [t.captainId] : []), ...t.memberIds]),
    ]);
    const people = [...ids].flatMap((id) => {
      const a = store.agents.get(id);
      return a ? [{ id, name: a.name, nick: a.nick }] : [];
    });
    return {
      people,
      teams,
      specialists: c.specialists,
      everyone: direct || p.collaboration?.orchestratorTalksTo === 'everyone',
    };
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

  function newItem(projectId: string, t: TaskInput, direct = false): NewItem {
    if (!t.text?.trim()) throw invalid('Every task needs "text".');
    const owner = resolveOwner(roster(projectId, direct), t.owner ?? '', t.team);
    return {
      id: randomUUID(),
      text: t.text.trim(),
      brief: t.brief?.trim() || t.text.trim(),
      ...owner,
      parallel: t.parallel === true,
      gates: port.gatesOf(projectId, owner),
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
    return [lead.trim(), ...shown.map((g) => goalBlock(g, name))].join('\n\n');
  };
  /** The parts of an edit that were asked for, for the log line. */
  const changed = (e: object) =>
    Object.entries(e)
      .filter(([k, v]) => k !== 'force' && v !== undefined)
      .map(([k]) => k)
      .join(', ');

  /** A new goal on the board, announced (so dispatch starts it) → the goal and the line that says so. */
  function putGoal(projectId: string, by: string, a: NewGoal, direct = false): { goal: Goal; text: string } {
    const p = store.projects.require(projectId);
    if (!p.folder) throw conflict('This project has no folder yet — set it up first.');
    if (!a.text?.trim()) throw invalid('A goal needs "text".');
    if (!a.tasks?.length || a.tasks.length > MAX_TASKS) throw invalid(`A goal has 1–${MAX_TASKS} tasks.`);
    const quest = a.quest ?? 'main';
    if (a.feature && quest === 'side')
      throw invalid('A side quest never serves a feature — leave "feature" out, or make it a main quest.');
    if (a.feature && !features.get(projectId, a.feature.id))
      throw invalid(`No feature '${a.feature.id}' — look with features first.`);
    const items = a.tasks.map((t) => newItem(projectId, t, direct));
    const goal = store.tx(() =>
      work.insertGoal(
        {
          id: randomUUID(),
          projectId,
          text: a.text.trim(),
          summary: a.summary?.trim() || a.text.trim(),
          quest,
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
    view: (projectId: string) => boardText(work.goals(projectId), name),
    history: (projectId: string) => history.text(projectId),

    addGoal: (projectId: string, by: string, a: NewGoal): string => putGoal(projectId, by, a).text,
    /** The user's own goal for one person they picked (from that person's chat): any seat on the project. */
    addDirectGoal: (projectId: string, by: string, a: NewGoal): Goal => putGoal(projectId, by, a, true).goal,

    addTask(projectId: string, by: string, a: TaskInput & { goal: string; position?: number }): string {
      const g = goalOf(projectId, a.goal);
      const item = newItem(projectId, a);
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

    async editGoal(projectId: string, by: string, id: string, e: GoalEdit): Promise<string> {
      const g = goalOf(projectId, id);
      work.editGoal(id, {
        ...(e.text?.trim() ? { text: e.text.trim() } : {}),
        ...(e.summary?.trim() ? { summary: e.summary.trim() } : {}),
      });
      let lead = 'Goal updated.';
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
      return reply(projectId, [id], lead);
    },

    async editTask(projectId: string, by: string, id: string, e: TaskEdit): Promise<string> {
      const it = taskOf(projectId, id);
      const owner = e.owner ? resolveOwner(roster(projectId), e.owner, e.team) : null;
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
        ...(newOwner && owner ? { ...owner, gates: port.gatesOf(projectId, owner) } : {}),
      });
      if (e.position !== undefined) work.moveItem(id, e.position - 1);
      const cur = work.item(id) as ChecklistItem;
      const status =
        e.status ?? (newOwner && cur.status !== 'done' && cur.status !== 'todo' ? 'todo' : undefined);
      if (status === 'todo' && cur.status !== 'todo') port.reopen(id, newOwner || cur.status === 'done');
      else if (status === 'done' && cur.status !== 'done')
        work.setItem(id, { status: 'done', runId: cur.runId });
      else if (status === 'cancelled' && cur.status === 'todo') await port.stopItems(projectId, [id]);
      if (newOwner && owner) notes.push(`Now ${name(owner.agentId)}'s.`);
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
