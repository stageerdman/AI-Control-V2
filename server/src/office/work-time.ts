/* The office's work clock (OFFICE): how long agents have worked on a project, by kind of work and by agent.

   Two sources, both started/ended timestamps, read as spans by performance/spans.ts:
   - `runs` — every runtime run (checklist builds, reviews, reports, chat turns), its `kind` set when it starts
     (older rows without one are read from who ran it and what the task says);
   - `crew_time` — the crew calls that never become runs: the orchestrator planning a goal or designing how the
     team works, a captain's split, a health check, the setup chat, the Agent Creator and Rivet's setup. A draft's
     rows move to its project when it's finished. This clock writes them, with their tokens and outcome.

   Time is agent time: two agents working for an hour is 2h. A run still going counts up to now. No money here —
   runs use the user's subscription; we count runs and turns. */
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/connection.ts';
import { now } from '../db/util.ts';
import {
  type Asked,
  firstStart,
  readSpans,
  spanMs,
  type Tokens,
  WORK_KINDS,
  type WorkKind,
} from '../performance/spans.ts';

export const KIND_LABELS: Record<WorkKind, string> = {
  thinking: 'Thinking & planning',
  building: 'Coding & building',
  reviewing: 'Reviewing',
  research: 'Research & reports',
  setup: 'Setup',
};

/** What a crew call (or Rivet's setup) is, whose time it is, and why they were asked (absent = a task). */
export type Track = {
  scope: 'project' | 'draft';
  ownerId: string;
  agentId: string;
  kind: WorkKind;
  asked?: Asked;
};
/** How a crew call ended; no usage = not measured (Rivet's scaffold uses no model). */
export type CrewEnd = { turns?: number; status: 'succeeded' | 'failed' | 'cancelled'; usage?: Tokens };

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

export function createWorkClock(db: Db) {
  return {
    /** A crew call starts: a row with no end yet (it counts up). */
    start(t: Track): string {
      const id = randomUUID();
      db.prepare(
        'INSERT INTO crew_time (id, scope, owner_id, agent_id, kind, asked, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, t.scope, t.ownerId, t.agentId, t.kind, t.asked ?? null, now());
      return id;
    },
    end(id: string, e: CrewEnd) {
      const u = e.usage;
      db.prepare(
        `UPDATE crew_time SET ended_at = ?, turns = ?, status = ?, input_tokens = ?, output_tokens = ?,
           cache_read_tokens = ?, cache_write_tokens = ? WHERE id = ? AND ended_at IS NULL`,
      ).run(
        now(),
        e.turns ?? 0,
        e.status,
        u?.input ?? null,
        u?.output ?? null,
        u?.cacheRead ?? null,
        u?.cacheWrite ?? null,
        id,
      );
    },
    /** Time with a start and a promise: recorded whatever the promise does. */
    async track<T>(t: Track | undefined, fn: () => Promise<T>, turns?: (v: T) => number): Promise<T> {
      if (!t) return fn();
      const id = this.start(t);
      let end: CrewEnd = { status: 'failed' };
      try {
        const v = await fn();
        end = { status: 'succeeded', turns: turns?.(v) ?? 0 };
        return v;
      } finally {
        this.end(id, end);
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
      db.prepare(
        "UPDATE crew_time SET ended_at = started_at, status = 'cancelled' WHERE ended_at IS NULL",
      ).run();
    },

    /** The clock's sheet for one project. */
    summary(projectId: string, at: Date = new Date()): WorkTime {
      const nowMs = at.getTime();
      const spans = readSpans(db, projectId);
      const kinds = new Map<WorkKind, number>(WORK_KINDS.map((k) => [k, 0]));
      const agents = new Map<string, { ms: number; runs: number }>();
      let totalMs = 0;
      let turns = 0;
      let live = 0;
      for (const s of spans) {
        const ms = spanMs(s, nowMs);
        totalMs += ms;
        turns += s.turns;
        if (s.outcome === 'live') live++;
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
        since: firstStart(spans),
        live,
      };
    },
  };
}
export type WorkClock = ReturnType<typeof createWorkClock>;
