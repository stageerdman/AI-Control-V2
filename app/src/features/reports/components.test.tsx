// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import { Toaster } from '../../ui';
import type { Report } from './api';
import { ReportsList } from './ReportsList';
import { ReportView } from './ReportView';

const look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'bob', face: 'none', hue: 'rose' };
const author = { agentId: 'a-scout', name: 'Scout', teamId: 't-r', teamName: 'Research Crew' };
const rep = (id: string, p: Partial<Report> = {}): Report => ({
  id,
  projectId: 'aurora',
  kind: 'research',
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  body: '## What we compared\n\nFees.',
  question: 'Which provider?',
  sources: [
    { title: 'Stripe pricing', url: 'https://stripe.com/pricing' },
    { title: 'Code', path: 'src/pay.ts' },
  ],
  author,
  runId: null,
  goalId: null,
  itemId: null,
  threadId: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  readAt: null,
  archivedAt: null,
  ...p,
});

type Db = { active: Report[]; archived: Report[]; teamReporter: boolean; one?: Report | null };
let db: Db;
let calls: { method: string; url: string; body?: unknown }[];
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const strip = ({ body: _, ...r }: Report) => r;

beforeEach(() => {
  clearQueryCache();
  calls = [];
  db = { active: [], archived: [], teamReporter: true };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url === '/agents')
        return json([
          { id: 'a-scout', name: 'Scout Ranger', nick: null, look, roleId: 'r1', role: 'Research' },
          { id: 'a-pixel', name: 'Pixel', nick: null, look, roleId: null, role: 'Orchestrator' },
        ]);
      if (url === '/teams')
        return json([
          {
            id: 't-r',
            name: 'Research Crew',
            color: 'rose',
            emblem: 'rocket',
            reporter: db.teamReporter,
            members: [{ agentId: 'a-scout', instr: '' }],
          },
        ]);
      if (url === '/roles') return json([{ id: 'r1', name: 'Research', agentCount: 1, reporter: false }]);
      if (url === '/projects/aurora')
        return json({ id: 'aurora', teamIds: ['t-r'], agentIds: [], orchestratorId: 'a-pixel' });
      if (url === '/projects/aurora/reports')
        return json({ reports: db.active.map(strip), unread: db.active.filter((r) => !r.readAt).length });
      if (url === '/projects/aurora/reports?archived=1')
        return json({ reports: db.archived.map(strip), unread: 0 });
      const m = /^\/projects\/aurora\/reports\/(.+)$/.exec(url);
      if (m) {
        const r = db.one === undefined ? [...db.active, ...db.archived].find((x) => x.id === m[1]) : db.one;
        if (!r) return json({ error: { code: 'not_found', message: 'nope' } }, 404);
        if (method === 'PATCH') {
          if (body.read) r.readAt = new Date().toISOString();
          if (body.archived !== undefined) r.archivedAt = body.archived ? new Date().toISOString() : null;
        }
        return json(r);
      }
      return json({ error: { code: 'not_found', message: url } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReportsList', () => {
  it('rows: unread bold + dot + "Unread." label, newest order kept, archived footer swaps lists', async () => {
    db.active = [rep('1'), rep('2', { readAt: new Date().toISOString() })];
    db.archived = [rep('9', { archivedAt: new Date().toISOString() })];
    const onOpen = vi.fn();
    render(<ReportsList projectId="aurora" onOpen={onOpen} back={{ label: 'Office', onClick: () => {} }} />);
    const first = await screen.findByRole('button', {
      name: /^Unread\. Title 1, by Scout Ranger|^Unread\. Title 1, by Scout/,
    });
    expect(first.className).toContain('unread');
    expect(first.querySelector('.rp-dot')).not.toBeNull();
    const second = screen.getByRole('button', { name: /^Title 2/ });
    expect(second.querySelector('.rp-dot')).toBeNull();
    expect(screen.getAllByText('5 min ago')).toHaveLength(2);
    fireEvent.click(first);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archived (1)' }));
    expect(await screen.findByRole('button', { name: /Title 9/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Archived reports' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Reports' }));
    expect(await screen.findByRole('button', { name: /Title 1/ })).toBeTruthy();
  });

  it('empty: reporter staffed → research hint; nobody files → Cast link', async () => {
    render(<ReportsList projectId="aurora" onOpen={() => {}} />);
    expect(await screen.findByText(/No reports yet\. Ask for research/)).toBeTruthy();
    expect(screen.queryByText('Archived (0)')).toBeNull();
    cleanup();
    clearQueryCache();
    db.teamReporter = false;
    render(<ReportsList projectId="aurora" onOpen={() => {}} />);
    expect(await screen.findByText(/Nobody on this project files reports yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cast' }).getAttribute('href')).toBe('#cast');
  });

  it('loading shows 3 placeholder rows; an error offers Try again', async () => {
    const { container } = render(<ReportsList projectId="nope" onOpen={() => {}} />);
    expect(container.querySelectorAll('.rp-ph')).toHaveLength(3);
    expect(await screen.findByText("Couldn't load reports.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('ReportView', () => {
  it('renders the letter, marks read exactly once, and asks the author', async () => {
    db.active = [rep('1')];
    const onFollowUp = vi.fn();
    render(<ReportView projectId="aurora" reportId="1" onBack={() => {}} onFollowUp={onFollowUp} />);
    const h = await screen.findByRole('heading', { level: 2, name: 'Title 1' });
    await waitFor(() => expect(document.activeElement).toBe(h));
    expect(screen.getByText('“Which provider?”').closest('blockquote')).not.toBeNull();
    expect(screen.getByText('Summary 1').className).toBe('rp-lead');
    expect(screen.getByRole('heading', { level: 3, name: 'What we compared' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Stripe pricing ↗' }).getAttribute('href')).toBe(
      'https://stripe.com/pricing',
    );
    expect(screen.getByText('src/pay.ts').tagName).toBe('CODE');
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ read: true });
    await act(async () => new Promise((r) => setTimeout(r, 30))); /* refetch after invalidate */
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Scout a follow-up' }));
    expect(onFollowUp).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), 'a-scout');
  });

  it('archive → back + toast with Undo (PATCH archived false)', async () => {
    db.active = [rep('1', { readAt: new Date().toISOString() })];
    const onBack = vi.fn();
    render(
      <>
        <ReportView projectId="aurora" reportId="1" onBack={onBack} onFollowUp={() => {}} />
        <Toaster />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ archived: true }]);
    fireEvent.click(await screen.findByText('Undo'));
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([
        { archived: true },
        { archived: false },
      ]),
    );
  });

  it('author gone → asks the orchestrator; 404 → gone state', async () => {
    db.active = [rep('1', { readAt: 'x', author: { ...author, agentId: 'a-ghost', name: 'Ghost' } })];
    const onFollowUp = vi.fn();
    render(<ReportView projectId="aurora" reportId="1" onBack={() => {}} onFollowUp={onFollowUp} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Pixel' }));
    expect(onFollowUp).toHaveBeenCalledWith(expect.anything(), 'a-pixel');
    cleanup();
    render(<ReportView projectId="aurora" reportId="zzz" onBack={() => {}} onFollowUp={() => {}} />);
    expect(await screen.findByText("This report isn't here any more.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to reports' })).toBeTruthy();
  });
});
