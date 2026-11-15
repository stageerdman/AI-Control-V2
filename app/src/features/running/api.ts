/* RUNNING: what is running in a project (server/src/running) and stopping it. */
import { useEffect } from 'react';
import { http, isApiError, useQuery } from '../../api';

export type RunningItem = {
  id: string;
  kind: 'session' | 'app' | 'code';
  projectId: string | null;
  /** null = nobody's (the project's app, or studio work). */
  agentId: string | null;
  label: string;
  startedAt: string;
  runId?: string;
  pid?: number;
  sessionId?: string;
};

const e = encodeURIComponent;
export const runningKey = (pid: string) => `running:${pid}`;

export const runningApi = {
  list: (pid: string) => http.get<RunningItem[]>(`/projects/${e(pid)}/running`),
  cancel: (pid: string, itemId: string) =>
    http.post<RunningItem>(`/projects/${e(pid)}/running/${e(itemId)}/cancel`, {}),
};

/** Stop these items at once. An item that has already ended (404) counts as stopped. */
export async function stopItems(pid: string, ids: string[]): Promise<void> {
  const res = await Promise.allSettled(ids.map((id) => runningApi.cancel(pid, id)));
  const failed = res.find(
    (r): r is PromiseRejectedResult =>
      r.status === 'rejected' && !(isApiError(r.reason) && r.reason.status === 404),
  );
  if (failed) throw failed.reason;
}

/** The project's running list, read again every `everyMs`. */
export function useRunning(pid: string, everyMs: number) {
  const q = useQuery<RunningItem[]>(runningKey(pid), () => runningApi.list(pid));
  const { refetch } = q;
  useEffect(() => {
    const t = setInterval(() => void refetch().catch(() => undefined), everyMs);
    return () => clearInterval(t);
  }, [everyMs, refetch]);
  return q;
}
