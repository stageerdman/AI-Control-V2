/* RUNNING: the flat list from the server → one row per agent (its sessions + commands), and the app. */
import type { RunningItem } from './api';

export type AgentRow = {
  /** null = studio work outside any agent. */
  agentId: string | null;
  /** What it's doing: its newest session's task. */
  doing: string;
  /** When its oldest session started. */
  since: string;
  /** The commands running under it (servers, tests, builds). */
  commands: string[];
  /** Every item to cancel to stop it completely. */
  ids: string[];
};
export type RunningView = { agents: AgentRow[]; app: RunningItem | null };

export function groupRunning(items: readonly RunningItem[]): RunningView {
  const rows = new Map<string, AgentRow & { newest: string }>();
  let app: RunningItem | null = null;
  const sorted = [...items].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const i of sorted) {
    if (i.kind === 'app') {
      app ??= i;
      continue;
    }
    const k = i.agentId ?? '';
    let r = rows.get(k);
    if (!r) {
      r = { agentId: i.agentId, doing: '', since: i.startedAt, newest: '', commands: [], ids: [] };
      rows.set(k, r);
    }
    r.ids.push(i.id);
    if (i.kind === 'code') r.commands.push(i.label);
    else if (i.startedAt >= r.newest) {
      r.newest = i.startedAt;
      r.doing = i.label;
    }
  }
  const agents = [...rows.values()]
    /* a command whose session has already gone isn't an agent at work */
    .filter((r) => r.newest)
    .map(({ newest: _, ...r }) => r);
  return { agents, app };
}

/** How many things the stage pill counts: agents at work + the app. */
export const runningCount = (v: RunningView) => v.agents.length + (v.app ? 1 : 0);

/** Take stopped items off the list straight away (the next read confirms it). */
export const without = (items: readonly RunningItem[] | undefined, ids: readonly string[]) => {
  const gone = new Set(ids);
  return (items ?? []).filter((i) => !gone.has(i.id) && !(i.sessionId && gone.has(i.sessionId)));
};
