/* The small time word on task cards and feature rows ("1h 20m" · "40m of ~2h" · "~2h"), and the one read
   behind it. Design: design/time-estimates.md; the words come from estimates.ts. */
import { useEffect } from 'react';
import { useQuery } from '../../api';
import { keys, officeApi, type Timesheet } from './api';
import { anyLive, type TimeTag as Tag } from './estimates';

const LIVE_EVERY = 30_000;

/** The office's timesheet; read again every 30 s while anything runs, so "so far" keeps moving. */
export function useTimesheet(pid: string) {
  const q = useQuery<Timesheet>(keys.timesheet(pid), () => officeApi.timesheet(pid));
  const live = anyLive(q.data);
  const { refetch } = q;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refetch().catch(() => undefined), LIVE_EVERY);
    return () => clearInterval(t);
  }, [live, refetch]);
  return q;
}

export function TimeTag({ tag }: { tag: Tag | null | undefined }) {
  if (!tag) return null;
  return (
    <span className={`ob-time${tag.over ? ' over' : ''}`} title={tag.title}>
      <span aria-hidden="true">{tag.text}</span>
      <span className="sr-only">{tag.spoken}</span>
    </span>
  );
}
