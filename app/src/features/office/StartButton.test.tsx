// @vitest-environment happy-dom
/* Ready to Test: the Start button — one tap opens a website at its localhost link or a desktop app's build;
   it says plainly while it is starting / still building, and why when it can't. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import { StartButton } from './StartButton';
import { failureOf, SLOW_MS, startLabel } from './start-button';

const opened: string[] = [];
vi.mock('../../shell/external', () => ({ openExternal: (u: string) => opened.push(u) }));

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const appView = (p: Record<string, unknown> = {}) => ({
  status: 'stopped',
  command: 'npm run dev',
  source: 'package.json',
  url: null,
  pid: null,
  startedAt: null,
  exitCode: null,
  log: [],
  port: null,
  ...p,
});
let app: Record<string, unknown>;
let start: () => Promise<Response>;
let calls: string[];

beforeEach(() => {
  opened.length = 0;
  calls = [];
  clearQueryCache();
  app = appView();
  start = async () => json({ kind: 'website', url: 'http://localhost:3980/' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/projects/hatch/app') return json(app);
      if (url === '/projects/hatch/start' && init?.method === 'POST') return start();
      return json({ error: { code: 'not_found', message: url } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the Start button', () => {
  it('a website: one tap starts it and opens its localhost link', async () => {
    render(<StartButton pid="hatch" />);
    const btn = await screen.findByRole('button', { name: /Start/ });
    app = appView({ status: 'running', url: 'http://localhost:3980/', port: 3980 });
    fireEvent.click(btn);
    await waitFor(() => expect(opened).toEqual(['http://localhost:3980/']));
    expect(calls).toContain('POST /projects/hatch/start');
    /* once it runs, the control is the Open app link */
    const link = await screen.findByRole('link', { name: /Open app/ });
    expect(link.getAttribute('href')).toBe('http://localhost:3980/');
  });

  it('a desktop app: opens it and says Opened, without opening a browser tab', async () => {
    start = async () => json({ kind: 'desktop', app: '/x/Hatch.app' });
    render(<StartButton pid="hatch" />);
    fireEvent.click(await screen.findByRole('button', { name: /Start/ }));
    expect(await screen.findByRole('button', { name: /Opened/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Opened');
    expect(opened).toEqual([]);
  });

  it('while it starts: busy, then “Still building…” after a while', async () => {
    let finish: (r: Response) => void = () => {};
    start = () => new Promise((r) => (finish = r));
    render(<StartButton pid="hatch" />);
    const btn = await screen.findByRole('button', { name: /Start/ });
    vi.useFakeTimers();
    fireEvent.click(btn);
    await act(async () => {});
    expect(btn.textContent).toContain('Starting…');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(SLOW_MS + 10);
    });
    expect(btn.textContent).toContain('Still building…');
    vi.useRealTimers();
    await act(async () => finish(json({ kind: 'desktop', app: '/x/Hatch.app' })));
    await waitFor(() => expect(btn.textContent).toContain('Opened'));
  });

  it('when it can’t: the server’s reason and the last lines, then Try again; × dismisses', async () => {
    start = async () =>
      json(
        {
          error: {
            code: 'conflict',
            message: 'The app stopped before it was ready (exit code 1)',
            details: { log: ['> vite', 'Error: Cannot find module x'] },
          },
        },
        409,
      );
    render(<StartButton pid="hatch" />);
    fireEvent.click(await screen.findByRole('button', { name: /Start/ }));
    const note = await screen.findByRole('alert');
    expect(note.textContent).toContain('The app stopped before it was ready (exit code 1)');
    expect(note.querySelector('pre')?.textContent).toBe('> vite\nError: Cannot find module x');
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Start/ })).toBeTruthy();
  });

  it('a website already running: shows Open app straight away', async () => {
    app = appView({ status: 'running', url: 'http://localhost:3980/', port: 3980 });
    render(<StartButton pid="hatch" />);
    expect((await screen.findByRole('link', { name: /Open app/ })).getAttribute('title')).toBe(
      'Open the app (port 3980)',
    );
  });
});

describe('start-button words', () => {
  it('labels every phase', () => {
    expect(startLabel({ k: 'idle' })).toBe('Start');
    expect(startLabel({ k: 'starting', slow: false })).toBe('Starting…');
    expect(startLabel({ k: 'starting', slow: true })).toBe('Still building…');
    expect(startLabel({ k: 'opened' })).toBe('Opened');
    expect(startLabel({ k: 'failed', message: 'x', log: [] })).toBe('Try again');
  });
  it('a non-server error still reads plainly', () => {
    expect(failureOf(new Error('boom'))).toEqual({ message: 'Couldn’t start it — try again.', log: [] });
  });
});
