/* The director's pages (DIRECTOR POWERS): a report-in the director chose to page the user about (comms kind 'page').
   The pager shows them next to open asks, shaped like one (`news: true`) — until the user visits that office. */
import type { Db } from '../db/connection.ts';
import type { StudioAsk } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { rows } from '../db/util.ts';

export type Page = StudioAsk & { news: true };

export function createPages(deps: { db: Db; store: Store }) {
  const { db, store } = deps;
  return {
    /** Unseen pages, oldest first. */
    list(): Page[] {
      return rows<{ id: number; scope_id: string; from_id: string; text: string; at: string }>(
        db
          .prepare(
            `SELECT id, scope_id, from_id, text, at FROM comms
             WHERE kind = 'page' AND scope = 'project' AND json_extract(refs, '$.seen') IS NULL ORDER BY id`,
          )
          .all(),
      ).flatMap((r) => {
        const p = store.projects.get(r.scope_id);
        if (!p) return [];
        return [
          {
            id: `page:${r.id}`,
            projectId: p.id,
            projectName: p.name,
            agentId: r.from_id,
            agentName: store.agents.get(r.from_id)?.name ?? 'The director',
            runId: '',
            question: r.text,
            options: null,
            status: 'open' as const,
            since: r.at,
            seen: false,
            news: true as const,
          },
        ];
      });
    },
    /** The user visited the office: its pages are read. */
    seen(projectId: string): number {
      return Number(
        db
          .prepare(
            `UPDATE comms SET refs = json_set(refs, '$.seen', 1)
             WHERE kind = 'page' AND scope = 'project' AND scope_id = ? AND json_extract(refs, '$.seen') IS NULL`,
          )
          .run(projectId).changes,
      );
    },
  };
}
export type Pages = ReturnType<typeof createPages>;
