// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';
import { clearQueryCache, useQuery } from '../../api/query';
import { reportsKey } from '../reports/api';
import { refreshOfficeReads } from './api';

/* The tray reads through the same key the office's unread count does. */
function Tray({ pid, list }: { pid: string; list: () => Promise<string[]> }) {
  const q = useQuery(reportsKey(pid), list);
  return <p>{q.data ? `tray:${q.data.join(',') || 'empty'}` : 'loading'}</p>;
}

describe('entering an office', () => {
  afterEach(() => clearQueryCache());

  /* Bug: a report filed while the user was in another office never showed in the tray — the stream
     resumes from now, and the reports list (under `reports:`, not `office:<pid>:`) stayed cached. */
  it('re-reads the reports tray, so a report filed while away shows', async () => {
    const server: string[] = [];
    const list = async () => [...server];
    const first = render(<Tray pid="hq" list={list} />);
    await screen.findByText('tray:empty');
    first.unmount(); /* the user leaves the office */

    server.push('How AI Studio works'); /* filed while away: no event reaches this office */
    await act(() => refreshOfficeReads('hq')); /* the user comes back */
    render(<Tray pid="hq" list={list} />);
    await screen.findByText('tray:How AI Studio works');
  });
});
