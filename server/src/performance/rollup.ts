/* Time estimates (pure): an office's spans + its whiteboard → how long each task, goal and feature really took.
   A task is a top-level checklist item; its members' sub-tasks count in it. A goal sums its tasks, a feature
   its goals. Spans with no task (chats, calls, planning) are left out. Active = agent time (summed spans);
   wall = first start to the end, or to now while open. */
import { type Span, spanMs, spanTokens } from './spans.ts';

export type AgentTime = { agentId: string; ms: number; tokens: number; runs: number };

export type WorkTimes = {
  /** The first span's start; null before any work. */
  startedAt: string | null;
  /** The last span's end once the work is finished; null while open (or never worked on). */
  endedAt: string | null;
  activeMs: number;
  wallMs: number;
  /** Runs and crew calls. */
  runs: number;
  turns: number;
  /** All tokens (new + re-read), as agent performance counts them. */
  tokens: number;
  /** Spans going on right now. */
  live: number;
  /** Most time first. */
  byAgent: AgentTime[];
};

export type BoardItem = {
  id: string;
  goalId: string;
  parentId: string | null;
  agentId: string;
  text: string;
  status: string;
};
export type BoardGoal = { id: string; featureId: string | null; text: string; status: string };
export type BoardFeature = { id: string; name: string; status: string };
export type Board = { items: BoardItem[]; goals: BoardGoal[]; features: BoardFeature[] };

export type TaskTime = {
  itemId: string;
  goalId: string;
  agentId: string;
  text: string;
  status: string;
  time: WorkTimes;
};
export type GoalTime = {
  goalId: string;
  featureId: string | null;
  text: string;
  status: string;
  tasks: number;
  time: WorkTimes;
};
export type FeatureTime = { featureId: string; name: string; status: string; goals: number; time: WorkTimes };
export type Timesheet = { tasks: TaskTime[]; goals: GoalTime[]; features: FeatureTime[] };

const OPEN_WORK = new Set(['todo', 'running']);
export const itemFinished = (status: string) => !OPEN_WORK.has(status);
export const goalFinished = (status: string) => status !== 'running';
export const featureFinished = (status: string) => status === 'shipped';

/** The times of one piece of work from its spans. */
export function timesOf(spans: readonly Span[], finished: boolean, nowMs: number): WorkTimes {
  const agents = new Map<string, AgentTime>();
  let startedAt: string | null = null;
  let lastEnd: string | null = null;
  let activeMs = 0;
  let turns = 0;
  let tokens = 0;
  let live = 0;
  for (const s of spans) {
    const ms = spanMs(s, nowMs);
    const t = spanTokens(s);
    activeMs += ms;
    turns += s.turns;
    tokens += t;
    if (s.outcome === 'live') live++;
    if (!startedAt || s.start < startedAt) startedAt = s.start;
    const end = s.end ?? s.start;
    if (!lastEnd || end > lastEnd) lastEnd = end;
    const a = agents.get(s.agentId) ?? { agentId: s.agentId, ms: 0, tokens: 0, runs: 0 };
    a.ms += ms;
    a.tokens += t;
    a.runs++;
    agents.set(s.agentId, a);
  }
  const endedAt = finished && live === 0 ? lastEnd : null;
  const wallMs = startedAt ? Math.max(0, (endedAt ? Date.parse(endedAt) : nowMs) - Date.parse(startedAt)) : 0;
  return {
    startedAt,
    endedAt,
    activeMs,
    wallMs,
    runs: spans.length,
    turns,
    tokens,
    live,
    byAgent: [...agents.values()].sort((x, y) => y.ms - x.ms || x.agentId.localeCompare(y.agentId)),
  };
}

/** Each item's top-level task (a sub-task → its parent's, however deep). */
function topOf(items: readonly BoardItem[]): Map<string, string> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const top = new Map<string, string>();
  for (const i of items) {
    let cur = i;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId) as BoardItem;
    }
    top.set(i.id, cur.id);
  }
  return top;
}

function group<K>(spans: readonly Span[], keyOf: (s: Span) => K | undefined): Map<K, Span[]> {
  const out = new Map<K, Span[]>();
  for (const s of spans) {
    const k = keyOf(s);
    if (k === undefined) continue;
    const list = out.get(k) ?? [];
    list.push(s);
    out.set(k, list);
  }
  return out;
}

/** Every task, goal and feature on the board with its times. */
export function rollUp(spans: readonly Span[], board: Board, nowMs: number): Timesheet {
  const top = topOf(board.items);
  const goalOfItem = new Map(board.items.map((i) => [i.id, i.goalId]));
  const featureOfGoal = new Map(board.goals.map((g) => [g.id, g.featureId]));
  const taskSpans = group(spans, (s) => (s.itemId ? top.get(s.itemId) : undefined));
  const goalSpans = group(spans, (s) => (s.itemId ? goalOfItem.get(s.itemId) : undefined));
  const featureSpans = group(spans, (s) => {
    const goalId = s.itemId ? goalOfItem.get(s.itemId) : undefined;
    return (goalId && featureOfGoal.get(goalId)) || undefined;
  });
  const tasksIn = (goalId: string) => board.items.filter((i) => i.goalId === goalId && !i.parentId).length;

  return {
    tasks: board.items
      .filter((i) => !i.parentId)
      .map((i) => ({
        itemId: i.id,
        goalId: i.goalId,
        agentId: i.agentId,
        text: i.text,
        status: i.status,
        time: timesOf(taskSpans.get(i.id) ?? [], itemFinished(i.status), nowMs),
      })),
    goals: board.goals.map((g) => ({
      goalId: g.id,
      featureId: g.featureId,
      text: g.text,
      status: g.status,
      tasks: tasksIn(g.id),
      time: timesOf(goalSpans.get(g.id) ?? [], goalFinished(g.status), nowMs),
    })),
    features: board.features.map((f) => ({
      featureId: f.id,
      name: f.name,
      status: f.status,
      goals: board.goals.filter((g) => g.featureId === f.id).length,
      time: timesOf(featureSpans.get(f.id) ?? [], featureFinished(f.status), nowMs),
    })),
  };
}
