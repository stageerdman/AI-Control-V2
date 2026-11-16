/* The work clock above the door (OFFICE): its label and the all-time read behind it. Tapping the clock opens
   How the team works (performance/TeamSheet.tsx). Agent time adds parallel runs up; no money anywhere (runs use
   the user's subscription). Running work counts up: the server counts it to "now", and we read again while
   anything is live. */
import { useEffect } from 'react';
import { useQuery } from '../../api';
import { keys, officeApi, type WorkTime } from './api';
import { worked } from './time';

/** The project's work clock; re-read every `everyMs` while agents are working. */
export function useWorkTime(pid: string, everyMs: number) {
  const q = useQuery<WorkTime>(keys.time(pid), () => officeApi.time(pid));
  const live = (q.data?.live ?? 0) > 0;
  const { refetch } = q;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refetch().catch(() => undefined), everyMs);
    return () => clearInterval(t);
  }, [live, everyMs, refetch]);
  return q;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The wall clock's label (it is the button that opens How the team works). */
export function clockLabel(t: WorkTime | undefined): string {
  if (!t || (!t.totalMs && !t.live)) return 'Agent time: none yet';
  const now = t.live ? `, ${plural(t.live, 'agent')} working now` : '';
  return `Agent time: ${worked(t.totalMs)}${now}`;
}
