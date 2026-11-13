/* Dispatch (minimal but real): the user gives the project a goal; its orchestrator breaks
   it into a short checklist, each item assigned to a team CAPTAIN (briefs go through
   captains, never around them) or a project specialist. Items are worked off as ordinary
   agent runs (B5 runtime) — at most `maxConcurrent` per project, one per agent, the rest
   queue — and tick off when their run succeeds.

   Contract `dispatch`: {"summary": string, "items": [{"text", "assignee", "teamId"?, "brief"}]}. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { type ChecklistItem, type Goal, type GoalStatus, workRepo } from '../db/work.ts';
import { AppError, conflict, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { Runtime } from '../runtime/service.ts';
import { crewSystemPrompt, json, ORCHESTRATOR_ALTITUDE } from './prompts.ts';
import { type Crew, validateWith } from './structured.ts';

export const DISPATCH = 'dispatch';
export const DEFAULT_MAX_CONCURRENT = 2;
export const MAX_ITEMS = 8;

export const DispatchSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1000),
  items: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(300),
        assignee: z.string().trim().min(1).max(80),
        teamId: z.string().trim().min(1).max(80).optional(),
        brief: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(MAX_ITEMS),
});
export type DispatchPlan = z.output<typeof DispatchSchema>;

/** Who the orchestrator may brief on this project: captains of its teams, and its specialists. */
export type Crewing = {
  captains: Map<string, { teamId: string; teamName: string }[]>;
  specialists: Set<string>;
  name: (id: string) => string;
};

/** Pure: every item goes to a captain (with their team) or a specialist (without one). */
export function dispatchIssues(plan: DispatchPlan, c: Crewing): string[] {
  const out: string[] = [];
  plan.items.forEach((it, i) => {
    const led = c.captains.get(it.assignee) ?? [];
    if (it.teamId) {
      if (!led.some((t) => t.teamId === it.teamId))
        out.push(
          `items.${i}: ${c.name(it.assignee)} is not the captain of team '${it.teamId}' on this project — brief a team through its captain`,
        );
    } else if (!c.specialists.has(it.assignee)) {
      out.push(
        led.length
          ? `items.${i}: ${c.name(it.assignee)} captains ${led.map((t) => t.teamId).join(', ')} — set "teamId"`
          : `items.${i}: '${it.assignee}' is not a captain or specialist on this project — brief teams through their captains`,
      );
    }
  });
  return out;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createDispatch(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  crew: Crew;
  runtime: Runtime;
  maxConcurrent?: number;
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
      },
    });

  function crewing(projectId: string): Crewing {
    const p = store.projects.require(projectId);
    const captains = new Map<string, { teamId: string; teamName: string }[]>();
    for (const tid of p.teamIds) {
      const t = store.teams.get(tid);
      if (!t?.captainId) continue;
      captains.set(t.captainId, [...(captains.get(t.captainId) ?? []), { teamId: t.id, teamName: t.name }]);
    }
    return {
      captains,
      specialists: new Set(p.agentIds),
      name: (id) => store.agents.get(id)?.name ?? id,
    };
  }

  /** Settle a goal once nothing is left to run; progress follows every change. */
  function refreshGoal(goalId: string) {
    const g = work.goal(goalId);
    if (!g) return;
    emit(g.projectId, { type: 'progress', payload: { pct: g.pct, label: clip(g.summary, 120) } });
    store.projects.update(g.projectId, { progress: g.pct });
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

  function taskFor(it: ChecklistItem, goal: Goal): string {
    const orch =
      store.agents.get(store.projects.require(it.projectId).orchestratorId)?.name ?? 'The orchestrator';
    const team = it.teamId ? store.teams.get(it.teamId) : null;
    return [
      `Goal from ${orch} (your orchestrator): ${goal.text}`,
      `Your checklist item: ${it.text}`,
      `Brief: ${it.brief}`,
      team
        ? `You are the captain of ${team.name}: you own this item for the team. Do the work yourself in this run; note anything a teammate should pick up in issues.txt.`
        : '',
      'When you are done, reply with a short plain-words summary of what you did.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /** Start queued items while the project has room: ≤ cap live, one per agent. */
  function pump(projectId: string) {
    const running = work.projectItems(projectId, 'running');
    let free = cap - running.length;
    const busy = new Set(running.map((i) => i.agentId));
    for (const it of work.projectItems(projectId, 'todo')) {
      if (free <= 0) break;
      if (busy.has(it.agentId)) continue;
      const goal = work.goal(it.goalId) as Goal;
      try {
        const run = runtime.start(projectId, {
          agentId: it.agentId,
          ...(it.teamId ? { teamId: it.teamId } : {}),
          task: taskFor(it, goal),
          ...(goal.caps ? { caps: goal.caps } : {}),
        });
        work.setItem(it.id, { status: 'running', runId: run.id });
        busy.add(it.agentId);
        free--;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        /* the agent is busy with a run started by hand: leave the item queued */
        if (e instanceof AppError && e.code === 'conflict' && /already running/.test(msg)) {
          busy.add(it.agentId);
          continue;
        }
        work.setItem(it.id, { status: 'failed', note: clip(msg, 2000) });
        announce(work.item(it.id) as ChecklistItem);
        refreshGoal(it.goalId);
        continue;
      }
      announce(work.item(it.id) as ChecklistItem);
    }
  }

  runtime.onFinished((run) => {
    const it = work.itemByRun(run.id);
    if (it?.status !== 'running') return;
    const status = run.status === 'succeeded' ? 'done' : run.status === 'cancelled' ? 'cancelled' : 'failed';
    work.setItem(it.id, { status, note: clip(run.result ?? run.error ?? '', 2000) || null });
    announce(work.item(it.id) as ChecklistItem);
    refreshGoal(it.goalId);
    pump(it.projectId);
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
                  },
                ]
              : [];
          }),
          specialists: p.agentIds.map((id) => ({
            id,
            name: c.name(id),
            role: store.agents.get(id)?.role ?? '',
          })),
        };
        const open = work
          .goals(projectId)
          .filter((g) => g.status === 'running')
          .flatMap((g) => g.items.filter((i) => i.status !== 'done').map((i) => i.text));
        const task = [
          `Project: ${json({ name: p.name, about: p.note })}`,
          `Who works on it: ${json(staff)}`,
          `Already on the whiteboard, not done yet: ${json(open)}`,
          `The user's goal: ${json(text)}`,
          [
            'Break the goal into a short checklist (1–8 items, in the order they should happen).',
            'Assign every item to a team CAPTAIN (set "assignee" to the captain id and "teamId" to their team) or to a specialist (only "assignee").',
            'Never assign to other team members — the captain owns the item for the team.',
            '"text" is the whiteboard line (short); "brief" tells the assignee what done looks like.',
          ].join('\n'),
          `Answer with one JSON object shaped like this: ${json({
            summary: 'The plan in one sentence.',
            items: [
              {
                text: 'Short whiteboard line',
                assignee: '<captain or specialist id>',
                teamId: '<team id when the assignee is a captain>',
                brief: 'What to do and what done looks like.',
              },
            ],
          })}`,
        ].join('\n\n');
        const { value } = await crew.call({
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
        });
        const goal = store.tx(() =>
          work.insertGoal(
            { id: randomUUID(), projectId, text, summary: value.summary, ...(caps ? { caps } : {}) },
            value.items.map((i) => ({
              id: randomUUID(),
              text: i.text,
              brief: i.brief,
              agentId: i.assignee,
              teamId: i.teamId ?? null,
            })),
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
        return work.goal(goal.id) as Goal;
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
        if (it.status === 'todo') {
          work.setItem(it.id, { status: 'cancelled' });
          announce(work.item(it.id) as ChecklistItem);
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
