// @vitest-environment happy-dom
/* RUNNING (design/running/running.md): grouping on its own, the pill, then the sheet against a fake server —
   one row per agent with its commands, Stop (one click), Stop all (confirm, app left alone), empty, errors. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Agent, clearQueryCache } from '../../api';
import type { RunningItem } from './api';
import { groupRunning, runningCount } from './model';
import { RunningPill, RunningSheet } from './RunningSheet';

const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const session = (id: string, agentId: string | null, label: string, minAgo: number): RunningItem => ({
  id,
  kind: 'session',
  projectId: 'p1',
  agentId,
  label,
  startedAt: at(minAgo),
  pid: 100,
});
const code = (id: string, s: RunningItem, label: string): RunningItem => ({
  id,
  kind: 'code',
  projectId: 'p1',
  agentId: s.agentId,
  label,
  startedAt: s.startedAt,
  pid: 200,
  sessionId: s.id,
});
const app: RunningItem = {
  id: 'app1',
  kind: 'app',
  projectId: 'p1',
  agentId: null,
  label: 'npm run dev',
  startedAt: at(20),
};
const agents = {
  a1: { id: 'a1', name: 'Captain Semicolon', role: 'Backend', look: { hue: 'mint' } },
  a2: { id: 'a2', name: 'Pixel', role: 'Orchestrator', look: { hue: 'sun' } },
} as unknown as Record<string, Agent>;

describe('groupRunning', () => {
  it('one row per agent: newest task, oldest start, its commands; the app apart', () => {
    const s1 = session('s1', 'a1', 'Old task', 10);
    const s2 = session('s2', 'a1', 'Build the login form', 3);
    const v = groupRunning([app, s2, code('c1', s2, 'npm test'), s1, session('s3', 'a2', 'Pixel: plan', 1)]);
    expect(v.agents.map((r) => r.agentId)).toEqual(['a1', 'a2']);
    expect(v.agents[0]).toMatchObject({
      doing: 'Build the login form',
      since: s1.startedAt,
      commands: ['npm test'],
    });
    expect(v.agents[0].ids.sort()).toEqual(['c1', 's1', 's2']);
    expect(v.app?.id).toBe('app1');
    expect(runningCount(v)).toBe(3);
  });
  it('nothing running → nothing to count', () => {
    expect(runningCount(groupRunning([]))).toBe(0);
  });
});

/* ---------- a fake server behind fetch */
let items: RunningItem[] = [];
let failCancel = false;
const cancelled: string[] = [];
beforeEach(() => {
  clearQueryCache();
  failCancel = false;
  cancelled.length = 0;
  const s1 = session('s1', 'a1', 'Build the login form', 4);
  items = [s1, code('c1', s1, 'vite --port 3570'), session('s2', 'a2', 'Pixel: plan', 1), app];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
      if (!init?.method || init.method === 'GET') return json(200, items);
      const id = decodeURIComponent(url.split('/running/')[1].split('/')[0]);
      if (failCancel) return json(500, { error: { code: 'boom', message: 'It broke.' } });
      const it = items.find((i) => i.id === id);
      if (!it) return json(404, { error: { code: 'not_found', message: 'gone' } });
      cancelled.push(id);
      items = items.filter((i) => i.id !== id && i.sessionId !== id);
      return json(202, it);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sheet = () => render(<RunningSheet pid="p1" open onClose={() => {}} agents={agents} />);

describe('RunningPill', () => {
  it('shows the count while anything runs, nothing otherwise', () => {
    const { rerender } = render(<RunningPill items={items} pressed={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: '3 running now — see and stop' })).toBeTruthy();
    rerender(<RunningPill items={[]} pressed={false} onClick={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('RunningSheet', () => {
  it('lists each agent (what, since, commands) and the app', async () => {
    sheet();
    const list = await screen.findByRole('list', { name: 'Running now' });
    await within(list).findByText('Captain Semicolon');
    expect(within(list).getByText(/Build the login form · started 4 min ago/)).toBeTruthy();
    expect(within(list).getByText('vite --port 3570')).toBeTruthy();
    expect(within(list).getByText('Pixel')).toBeTruthy();
    expect(within(list).getByText('The app')).toBeTruthy();
  });

  it('Stop stops that agent and its commands in one click', async () => {
    sheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop Captain Semicolon' }));
    await waitFor(() => expect(screen.queryByText('Captain Semicolon')).toBeNull());
    expect(cancelled.sort()).toEqual(['s1']);
    expect(screen.getByText('Pixel')).toBeTruthy();
  });

  it('Stop all asks once, stops every agent and leaves the app', async () => {
    sheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop all agents' }));
    const confirm = screen.getByRole('alert');
    expect(confirm.textContent).toContain('Stop all 2 agents now? Their chats are kept.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Stop all' }));
    await waitFor(() => expect(screen.queryByText('Pixel')).toBeNull());
    expect(screen.queryByText('Captain Semicolon')).toBeNull();
    expect(screen.getByText('The app')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).toBeNull();
  });

  it('Keep working backs out without stopping anything', async () => {
    sheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop all agents' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }));
    expect(cancelled).toEqual([]);
    expect(screen.getByRole('button', { name: 'Stop all agents' })).toBeTruthy();
  });

  it('nothing running: says so, no Stop all', async () => {
    items = [];
    sheet();
    await screen.findByText('Nothing is running.');
    expect(screen.queryByRole('button', { name: 'Stop all agents' })).toBeNull();
  });

  it('a failed stop says so and keeps the row', async () => {
    failCancel = true;
    sheet();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop Pixel' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t stop Pixel. It broke.');
    expect(screen.getByText('Pixel')).toBeTruthy();
  });
});
