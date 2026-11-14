/* The office's work clock (OFFICE): how long agents have worked on a project, by kind of work and by agent.

   Two sources, both started/ended timestamps:
   - `runs` — every runtime run (checklist builds, reviews, reports, chat turns), its `kind` set when it starts
     (older rows without one are read from who ran it and what the task says);
   - `crew_time` — the crew calls that never become runs: the orchestrator planning a goal or designing how the
     team works, a captain's split, a health check, the setup chat, the Agent Creator and Rivet's setup. A draft's
     rows move to its project when it's finished.

   Time is agent time: two agents working for an hour is 2h. A run still going counts up to now. No money here —
   runs use the user's subscription; we count runs and turns. */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection.ts';
import { now, type Row, rows } from '../db/util.ts';

export const WORK_KINDS = ['thinking', 'building', 'reviewing', 'research', 'setup'] as const;
export type WorkKind = (typeof WORK_KINDS)[number];
export const KIND_LABELS: Record<WorkKind, string> = {
  thinking: 'Thinking & planning',
  building: 'Coding & building',
  reviewing: 'Reviewing',
  research: 'Research & reports',
  setup: 'Setup',
};

/** What a crew call (or Rivet's setup) is, and whose time it is. */
export type Track = { scope: 'project' | 'draft'; ownerId: string; agentId: string; kind: WorkKind };

export type WorkTime = {
  totalMs: number;
  byKind: { kind: WorkKind; label: string; ms: number }[];
  byAgent: { agentId: string; ms: number; runs: number }[];
  runs: number;
  turns: number;
  /** The first start, null before any work. */
  since: string | null;
  /** Runs (and crew calls) going on right now — the clock counts up while > 0. */
  live: number;
};

/** A run row without a stored kind (before OFFICE): the orchestrator thinks, a reviewer reviews, a report is
    research, everything else builds. */
export function kindOfRun(r: { kind: string | null; task: string; agentKind: string | null }): WorkKind {
  if (r.kind && (WORK_KINDS as readonly string[]).includes(r.kind)) return r.kind as WorkKind;
  if (r.agentKind === 'orchestrator') return 'thinking';
  if (/^You are reviewing /.test(r.task)) return 'reviewing';
  if (/file_report/.test(r.task)) return 'research';
  return 'building';
}

export function createWorkClock(db: Db) {
  return {
    /** A crew call starts: a row with no end yet (it counts up). */
    start(t: Track): string {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO crew_time (id, scope, owner_id, agent_id, kind, started_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, t.scope, t.ownerId, t.agentId, t.kind, now());
      return id;
    },
    end(id: string, turns = 0) {
      db.prepare('UPDATE crew_time SET ended_at = ?, turns = ? WHERE id = ? AND ended_at IS NULL').run(
        now(),
        turns,
        id,
      );
    },
    /** Time with a start and a promise: recorded whatever the promise does. */
    async track<T>(t: Track | undefined, fn: () => Promise<T>, turns?: (v: T) => number): Promise<T> {
      if (!t) return fn();
      const id = this.start(t);
      let n = 0;
      try {
        const v = await fn();
        n = turns?.(v) ?? 0;
        return v;
      } finally {
        this.end(id, n);
      }
    },
    /** Draft → project: the setup chat, the Agent Creator and Rivet's time go with it. */
    moveDraft(draftId: string, projectId: string) {
      db.prepare(
        "UPDATE crew_time SET scope = 'project', owner_id = ? WHERE scope = 'draft' AND owner_id = ?",
      ).run(projectId, draftId);
    },
    /** On startup: a crew call cut off by a restart has no known end — it counts as nothing. */
    recover() {
      db.prepare('UPDATE crew_time SET ended_at = started_at WHERE ended_at IS NULL').run();
    },

    /** The clock's sheet for one project. */
    summary(projectId: string, at: Date = new Date()): WorkTime {
      const nowMs = at.getTime();
      const spans = [
        ...rows<Row>(
          db
            .prepare(
              `SELECT r.agent_id, r.kind, r.task, r.status, r.turns, r.started_at, r.ended_at, a.kind AS agent_kind
               FROM runs r LEFT JOIN agents a ON a.id = r.agent_id WHERE r.project_id = ?`,
            )
            .all(projectId),
        ).map((r) => ({
          agentId: r.agent_id as string,
          kind: kindOfRun({
            kind: (r.kind as string | null) ?? null,
            task: r.task as string,
            agentKind: (r.agent_kind as string | null) ?? null,
          }),
          live: r.status === 'running',
          turns: (r.turns as number) ?? 0,
          start: r.started_at as string,
          end: (r.ended_at as string | null) ?? null,
        })),
        ...rows<Row>(
          db
            .prepare(
              "SELECT agent_id, kind, turns, started_at, ended_at FROM crew_time WHERE scope = 'project' AND owner_id = ?",
            )
            .all(projectId),
        ).map((r) => ({
          agentId: r.agent_id as string,
          kind: r.kind as WorkKind,
          live: r.ended_at == null,
          turns: (r.turns as number) ?? 0,
          start: r.started_at as string,
          end: (r.ended_at as string | null) ?? null,
        })),
      ];
      const kinds = new Map<WorkKind, number>(WORK_KINDS.map((k) => [k, 0]));
      const agents = new Map<string, { ms: number; runs: number }>();
      let totalMs = 0;
      let turns = 0;
      let live = 0;
      let since: string | null = null;
      for (const s of spans) {
        const from = Date.parse(s.start);
        /* still going → up to now; ended without a time (shouldn't happen) → nothing */
        const to = s.end ? Date.parse(s.end) : s.live ? nowMs : from;
        const ms = Math.max(0, (Number.isFinite(to) ? to : from) - from) || 0;
        totalMs += ms;
        turns += s.turns;
        if (s.live) live++;
        if (!since || s.start < since) since = s.start;
        kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + ms);
        const a = agents.get(s.agentId) ?? { ms: 0, runs: 0 };
        a.ms += ms;
        a.runs++;
        agents.set(s.agentId, a);
      }
      return {
        totalMs,
        byKind: WORK_KINDS.map((kind) => ({ kind, label: KIND_LABELS[kind], ms: kinds.get(kind) ?? 0 })),
        byAgent: [...agents]
          .map(([agentId, a]) => ({ agentId, ms: a.ms, runs: a.runs }))
          .sort((x, y) => y.ms - x.ms || y.runs - x.runs),
        runs: spans.length,
        turns,
        since,
        live,
      };
    },
  };
}
export type WorkClock = ReturnType<typeof createWorkClock>;
