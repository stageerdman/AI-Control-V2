/* Reports (U1, spec-reports.md): finished, human-readable write-ups that reporter roles/teams file
   during a run with the `file_report` tool — "if I ask for some research, it arrives there".

   - Who may file: a run whose agent's ROLE is a reporter, or that runs for a reporter TEAM.
     Orchestrators and the studio crew never file (the runtime never offers them the tool).
   - The server stamps everything the agent shouldn't choose: project, author snapshot, run, the
     whiteboard item / chat thread it answers, time. At most MAX_PER_RUN per run.
   - Secrets are masked in every text field before it is stored (the event log's scrubber).
   - Events stay small: `report.filed` carries the title, never the body. */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/connection.ts';
import type { Run } from '../db/runs.ts';
import type { Store } from '../db/store.ts';
import { now, type Row, row, rows } from '../db/util.ts';
import { conflict, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import { redactSecrets } from '../events/redact.ts';

export const REPORT_KINDS = ['research', 'review', 'status', 'other'] as const;
export const MAX_PER_RUN = 2;

const projectPath = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine((p) => !p.startsWith('/') && !p.startsWith('~') && !p.split(/[\\/]/).includes('..'), {
    message: 'path must be relative to the project folder',
  });
const Source = z
  .strictObject({
    title: z.string().trim().min(1).max(200),
    url: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .optional(),
    path: projectPath.optional(),
  })
  .refine((s) => !(s.url && s.path), { message: 'a source is a url OR a path, not both' });

/** What an agent hands `file_report` (strict: anything else is refused). */
export const ReportInputSchema = z.strictObject({
  title: z.string().trim().min(4).max(80),
  summary: z.string().trim().min(1).max(280),
  body: z.string().trim().min(1).max(40_000),
  kind: z.enum(REPORT_KINDS),
  question: z.string().trim().min(1).max(200).optional(),
  sources: z.array(Source).max(20).optional(),
});
export type ReportInput = z.output<typeof ReportInputSchema>;

export type ReportAuthor = { agentId: string; name: string; teamId: string | null; teamName: string | null };
export type Report = {
  id: string;
  projectId: string;
  kind: (typeof REPORT_KINDS)[number];
  title: string;
  summary: string;
  body: string;
  question: string | null;
  sources: { title: string; url?: string; path?: string }[];
  author: ReportAuthor;
  runId: string | null;
  goalId: string | null;
  itemId: string | null;
  /** The chat thread (its agent id) whose turn filed it — the thread gets the one-line reply. */
  threadId: string | null;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
};
/** List rows leave the body out (the page loads it). */
export type ReportRow = Omit<Report, 'body'>;

const toReport = (r: Row): Report => ({
  id: r.id as string,
  projectId: r.project_id as string,
  kind: r.kind as Report['kind'],
  title: r.title as string,
  summary: r.summary as string,
  body: r.body as string,
  question: (r.question as string | null) ?? null,
  sources: JSON.parse(r.sources as string),
  author: JSON.parse(r.author as string),
  runId: (r.run_id as string | null) ?? null,
  goalId: (r.goal_id as string | null) ?? null,
  itemId: (r.item_id as string | null) ?? null,
  threadId: (r.thread_id as string | null) ?? null,
  createdAt: r.created_at as string,
  readAt: (r.read_at as string | null) ?? null,
  archivedAt: (r.archived_at as string | null) ?? null,
});
const withoutBody = ({ body: _, ...rest }: Report): ReportRow => rest;

export function createReports(deps: {
  db: Db;
  store: Store;
  events: EventLog;
  /** Every known secret value (the global cabinet). */
  secretValues: () => string[];
}) {
  const { db, store, events } = deps;
  const emit = (projectId: string, e: Parameters<EventLog['append']>[2]) => {
    try {
      events.append('project', projectId, e);
    } catch {
      /* the report is stored; a bad event line never loses it */
    }
  };
  const one = (id: string) => {
    const r = row<Row>(db.prepare('SELECT * FROM reports WHERE id = ?').get(id));
    return r ? toReport(r) : null;
  };
  const requireIn = (projectId: string, id: string) => {
    store.projects.require(projectId);
    const r = one(id);
    if (!r || r.projectId !== projectId) throw notFound('Report', id);
    return r;
  };
  const unread = (projectId?: string) =>
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM reports WHERE read_at IS NULL AND archived_at IS NULL${projectId ? ' AND project_id = ?' : ''}`,
        )
        .get(...(projectId ? [projectId] : [])) as { n: number }
    ).n;

  return {
    /** May this agent, on this team, file reports? Its role is a reporter, or the team is. Studio crew never. */
    canFile(agent: { kind: string; roleId: string | null }, teamId?: string | null): boolean {
      if (agent.kind !== 'agent') return false;
      if (teamId && store.teams.get(teamId)?.reporter) return true;
      return !!agent.roleId && !!store.roles.get(agent.roleId)?.reporter;
    },

    /** The file_report tool, behind the per-run token. `extraSecrets` = the run's granted values. */
    file(run: Run, input: ReportInput, extraSecrets: readonly string[] = []): Report {
      const filed = (
        db.prepare('SELECT COUNT(*) AS n FROM reports WHERE run_id = ?').get(run.id) as { n: number }
      ).n;
      if (filed >= MAX_PER_RUN) throw conflict('One report per question — update the brief instead');
      const secrets = [...deps.secretValues(), ...extraSecrets];
      const clean = redactSecrets(input, secrets).value;
      const agent = store.agents.get(run.agentId);
      const team = run.teamId ? store.teams.get(run.teamId) : null;
      const author: ReportAuthor = {
        agentId: run.agentId,
        name: agent?.name ?? run.agentId,
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
      };
      const item = row<{ id: string; goal_id: string }>(
        db.prepare('SELECT id, goal_id FROM checklist_items WHERE run_id = ?').get(run.id),
      );
      const thread = row<{ agent_id: string }>(
        db.prepare("SELECT agent_id FROM thread_messages WHERE run_id = ? AND sender = 'user'").get(run.id),
      );
      const id = `rep_${randomBytes(9).toString('base64url')}`;
      db.prepare(
        `INSERT INTO reports (id, project_id, kind, title, summary, body, question, sources, author, run_id, goal_id, item_id, thread_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        run.projectId,
        clean.kind,
        clean.title,
        clean.summary,
        clean.body,
        clean.question ?? null,
        JSON.stringify(clean.sources ?? []),
        JSON.stringify(author),
        run.id,
        item?.goal_id ?? null,
        item?.id ?? null,
        thread?.agent_id ?? null,
        now(),
      );
      emit(run.projectId, {
        type: 'report.filed',
        payload: { reportId: id, projectId: run.projectId, authorAgentId: run.agentId, title: clean.title },
      });
      return one(id) as Report;
    },

    /** Newest first, no bodies; `archived` swaps to the archive. */
    list(projectId: string, archived = false): { reports: ReportRow[]; unread: number } {
      store.projects.require(projectId);
      const list = rows<Row>(
        db
          .prepare(
            `SELECT * FROM reports WHERE project_id = ? AND archived_at IS ${archived ? 'NOT ' : ''}NULL
             ORDER BY created_at DESC, rowid DESC`,
          )
          .all(projectId),
      ).map((r) => withoutBody(toReport(r)));
      return { reports: list, unread: unread(projectId) };
    },
    get: (projectId: string, id: string): Report => requireIn(projectId, id),

    /** Mark read / archive (or undo either). Announced so a second window stays in sync. */
    patch(projectId: string, id: string, p: { read?: boolean; archived?: boolean }): Report {
      const cur = requireIn(projectId, id);
      const t = now();
      if (p.read !== undefined && p.read !== (cur.readAt !== null)) {
        db.prepare('UPDATE reports SET read_at = ? WHERE id = ?').run(p.read ? t : null, id);
        emit(projectId, { type: 'report.read', payload: { reportId: id, read: p.read } });
      }
      if (p.archived !== undefined && p.archived !== (cur.archivedAt !== null)) {
        db.prepare('UPDATE reports SET archived_at = ? WHERE id = ?').run(p.archived ? t : null, id);
        emit(projectId, { type: 'report.archived', payload: { reportId: id, archived: p.archived } });
      }
      return one(id) as Report;
    },

    /** Studio-wide: the latest across projects (not archived), newest first, + the unread total. */
    studio(limit = 50): { reports: (ReportRow & { projectName: string })[]; unread: number } {
      const list = rows<Row>(
        db
          .prepare(
            `SELECT r.*, p.name AS project_name FROM reports r JOIN projects p ON p.id = r.project_id
             WHERE r.archived_at IS NULL ORDER BY r.created_at DESC, r.rowid DESC LIMIT ?`,
          )
          .all(limit),
      ).map((r) => ({ ...withoutBody(toReport(r)), projectName: r.project_name as string }));
      return { reports: list, unread: unread() };
    },

    /** Reports a run filed (dispatch checks report items; threads point their reply at one). */
    byRun: (runId: string): ReportRow[] =>
      rows<Row>(
        db.prepare('SELECT * FROM reports WHERE run_id = ? ORDER BY created_at, rowid').all(runId),
      ).map((r) => withoutBody(toReport(r))),
    /** Unread titles for the orchestrator's summary ("Any new reports?"). */
    unreadTitles: (projectId: string, limit = 5): string[] =>
      rows<{ title: string }>(
        db
          .prepare(
            'SELECT title FROM reports WHERE project_id = ? AND read_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC LIMIT ?',
          )
          .all(projectId, limit),
      ).map((r) => r.title),
  };
}
export type Reports = ReturnType<typeof createReports>;
