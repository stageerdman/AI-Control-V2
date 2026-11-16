/* The object-use log (STUDIO LIFE): which studio tools — the office's objects — each agent really uses.
   Every studio tool call of an agent run lands in the event log as 'tool.used'; `toolUse` counts them. */
import type { Db } from '../db/connection.ts';
import { rows } from '../db/util.ts';
import type { EventInput } from '../domain/events.ts';
import type { BridgeTool } from '../room/bridge.ts';

/** Whose tools; `runId` is absent for the director's chat turns (their tools are made before the run). */
export type Who = { projectId: string; agentId: string; runId?: string };
export type ToolUse = { tool: string; agentId: string; uses: number; errors: number; lastAt: string };

/** The same tools, each call recorded (refused calls too: an error is use that went wrong). */
export function tracked<T extends BridgeTool>(
  tools: readonly T[],
  who: Who,
  record: (projectId: string, e: EventInput) => void,
): T[] {
  const note = (tool: string, ok: boolean) =>
    record(who.projectId, {
      type: 'tool.used',
      payload: { agentId: who.agentId, ...(who.runId ? { runId: who.runId } : {}), tool, ok },
    });
  return tools.map((t) => ({
    ...t,
    run: async (args: Record<string, unknown>) => {
      try {
        const out = await t.run(args);
        note(t.name, true);
        return out;
      } catch (e) {
        note(t.name, false);
        throw e;
      }
    },
  }));
}

/** Per tool and agent: how often, how often it failed, and when last — most used first. */
export function toolUse(db: Db, projectId: string): ToolUse[] {
  return rows<ToolUse>(
    db
      .prepare(
        `SELECT json_extract(payload, '$.tool') AS tool, json_extract(payload, '$.agentId') AS agentId,
                COUNT(*) AS uses, SUM(json_extract(payload, '$.ok') = 0) AS errors, MAX(at) AS lastAt
         FROM events WHERE scope = 'project' AND scope_id = ? AND type = 'tool.used'
         GROUP BY tool, agentId ORDER BY uses DESC, tool`,
      )
      .all(projectId),
  );
}
