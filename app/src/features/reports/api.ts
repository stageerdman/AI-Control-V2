/* Reports — wire types + endpoints (server/src/reports/reports.ts, spec-reports.md §4).
   List rows never carry the body; the report page GETs the full report. */
import { http, invalidate } from '../../api';

export type ReportKind = 'research' | 'review' | 'status' | 'other';
/** Snapshot at filing time: survives deletes / renames. */
export type ReportAuthor = { agentId: string; name: string; teamId: string | null; teamName: string | null };
export type ReportSource = { title: string; url?: string; path?: string };
export type Report = {
  id: string;
  projectId: string;
  kind: ReportKind;
  title: string;
  summary: string;
  /** Markdown. */
  body: string;
  question: string | null;
  sources: ReportSource[];
  author: ReportAuthor;
  runId: string | null;
  goalId: string | null;
  itemId: string | null;
  threadId: string | null;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
};
export type ReportRow = Omit<Report, 'body'>;
export type StudioReportRow = ReportRow & { projectName: string };
export type ReportList = { reports: ReportRow[]; unread: number };
export type StudioReportList = { reports: StudioReportRow[]; unread: number };

const e = encodeURIComponent;
export const reportsApi = {
  list: (projectId: string, archived = false) =>
    http.get<ReportList>(`/projects/${e(projectId)}/reports${archived ? '?archived=1' : ''}`),
  get: (projectId: string, rid: string) => http.get<Report>(`/projects/${e(projectId)}/reports/${e(rid)}`),
  patch: (projectId: string, rid: string, body: { read?: boolean; archived?: boolean }) =>
    http.patch<Report>(`/projects/${e(projectId)}/reports/${e(rid)}`, body),
  studio: (limit?: number) => http.get<StudioReportList>(`/reports${limit ? `?limit=${limit}` : ''}`),
};

export const STUDIO_REPORTS_KEY = 'reports:studio';
export const reportsKey = (projectId: string, archived = false) =>
  `reports:${projectId}${archived ? ':archived' : ''}`;
export const reportKey = (projectId: string, rid: string) => `reports:${projectId}:one:${rid}`;
/** Refetch every reports list/page on screen (studio + projects). The projectId narrows it. */
export const invalidateReports = (projectId?: string): Promise<void> =>
  projectId
    ? Promise.all([invalidate(`reports:${projectId}`), invalidate(STUDIO_REPORTS_KEY)]).then(() => undefined)
    : invalidate('reports:');
