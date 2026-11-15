// @vitest-environment happy-dom
/* An agent in a running session can't be deleted: the busy check, the blocked Delete with its
   reason (panel + zoom), and the race where the server says 409 'agent_busy' anyway. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setQueryData } from '../../api';
import type { Agent, AgentBusy, BusySession, Look } from '../../api/types';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import { HeroZoom } from './HeroZoom';
import { busyReason, deleteAgent, fetchBusy } from './store';

const agentsApi = vi.hoisted(() => ({
  list: vi.fn(),
  busy: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
const ui = vi.hoisted(() => ({ toast: vi.fn() }));
const fx = vi.hoisted(() => ({ announce: vi.fn() }));
vi.mock('./api', () => ({
  castApi: { agents: agentsApi, roles: { list: vi.fn() }, teams: { list: vi.fn() }, restore: vi.fn() },
  KEYS: { agents: 'agents', roles: 'roles', teams: 'teams', tinker: 'tk' },
}));
vi.mock('../../ui', async (orig) => ({ ...(await orig<typeof import('../../ui')>()), toast: ui.toast }));
vi.mock('./fx', async (orig) => ({
  ...(await orig<typeof import('./fx')>()),
  announce: fx.announce,
  reducedMotion: () => true,
}));
afterEach(cleanup);
beforeEach(() => {
  for (const f of [...Object.values(agentsApi), ui.toast, fx.announce]) f.mockReset();
  location.hash = '#cast/agent/a-c';
});

const RUN: BusySession = {
  runId: 'run-1',
  projectId: 'p1',
  projectName: 'Garden',
  task: 'Review the login flow',
  startedAt: '2026-11-15T10:00:00Z',
};
const RUN2: BusySession = { ...RUN, runId: 'run-2', projectId: 'p2', projectName: 'Orchard', task: 'Ship' };
const BUSY: AgentBusy = { busy: true, sessions: [RUN] };
const FREE: AgentBusy = { busy: false, sessions: [] };
const REASON =
  'Health Analyst is working in Garden — “Review the login flow”. You can delete them when it ends.';
const busy409 = (sessions: BusySession[] = [RUN]) =>
  new ApiError(
    409,
    'agent_busy',
    'Health Analyst is working in a running session right now. You can delete them when it ends.',
    { sessions },
  );

const look: Look = { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'mint' };
const HA = {
  id: 'a-c',
  kind: 'agent',
  name: 'Health Analyst',
  roleId: null,
  role: 'Code Reviewer',
  prompt: '',
  teamIds: [],
  projectIds: [],
  canDelete: { ok: true },
  canMail: true,
  look,
} as unknown as Agent;

describe('busyReason — one calm line', () => {
  it('names the project and task', () => {
    expect(busyReason('Health Analyst', [RUN])).toBe(REASON);
  });
  it('several sessions: the first, then +N more', () => {
    expect(busyReason('Health Analyst', [RUN, RUN2, RUN2])).toBe(
      'Health Analyst is working in Garden — “Review the login flow” +2 more. You can delete them when it ends.',
    );
  });
});

describe('fetchBusy', () => {
  it('returns what the server says', async () => {
    agentsApi.busy.mockResolvedValue(BUSY);
    expect(await fetchBusy('a-c')).toEqual(BUSY);
    expect(agentsApi.busy).toHaveBeenCalledWith('a-c');
  });
  it('a failed check counts as free (the server still refuses a busy delete)', async () => {
    agentsApi.busy.mockRejectedValue(new ApiError(0, 'network', 'down'));
    expect(await fetchBusy('a-c')).toEqual(FREE);
  });
});

describe('deleteAgent', () => {
  it('free: deletes, drops them from the list and offers Undo (as today)', async () => {
    setQueryData<Agent[]>('agents', [HA]);
    agentsApi.remove.mockResolvedValue({ deleted: { kind: 'agent', id: 'a-c' }, restoreToken: 't1' });
    const then = vi.fn();
    expect(await deleteAgent(HA, then)).toBe(true);
    expect(then).toHaveBeenCalled();
    expect(ui.toast).toHaveBeenCalledWith('Health Analyst deleted', { undo: expect.any(Function) });
  });
  it('race — 409 agent_busy: the busy reason as a toast, nothing removed, returns false', async () => {
    setQueryData<Agent[]>('agents', [HA]);
    agentsApi.remove.mockRejectedValue(busy409());
    const then = vi.fn();
    expect(await deleteAgent(HA, then)).toBe(false);
    expect(then).not.toHaveBeenCalled();
    expect(ui.toast).toHaveBeenCalledTimes(1);
    expect(ui.toast).toHaveBeenCalledWith(REASON);
  });
  it('any other error keeps the generic message', async () => {
    agentsApi.remove.mockRejectedValue(new ApiError(500, 'internal', 'Boom.'));
    agentsApi.list.mockResolvedValue([HA]);
    expect(await deleteAgent(HA)).toBe(false);
    expect(ui.toast.mock.calls[0]?.[0]).toMatch(/^Boom\. Nothing was lost/);
  });
});

describe('AgentPanel — Delete while busy', () => {
  const panel = (busy?: BusySession[]) => {
    const onDelete = vi.fn();
    render(
      <AgentPanel
        agent={HA as PanelAgent}
        isNew={false}
        roles={[]}
        teams={[]}
        onName={() => {}}
        onRole={() => {}}
        onPrompt={() => {}}
        onDelete={onDelete}
        busy={busy}
        onSaved={() => {}}
      />,
    );
    return { onDelete, del: screen.getByRole('button', { name: 'Delete agent' }) };
  };
  it('busy: visible, aria-disabled, still focusable, described by the reason with a link to the session', () => {
    const { del } = panel([RUN]);
    expect(del.getAttribute('aria-disabled')).toBe('true');
    expect(del.hasAttribute('disabled')).toBe(false);
    del.focus();
    expect(document.activeElement).toBe(del);
    const why = document.getElementById(del.getAttribute('aria-describedby') as string);
    expect(why?.textContent).toBe(REASON);
    expect(screen.getByRole('link', { name: 'Garden' }).getAttribute('href')).toBe('#office/p1');
  });
  it('busy with several sessions: +N more', () => {
    panel([RUN, RUN2]);
    expect(screen.getByText(/\+1 more\./)).toBeTruthy();
  });
  it('free: a plain Delete, no reason', () => {
    const { del } = panel();
    expect(del.hasAttribute('aria-disabled')).toBe(false);
    expect(del.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByText(/is working in/)).toBeNull();
  });
});

describe('HeroZoom — busy check on open and on Delete', () => {
  const zoom = () =>
    render(
      <HeroZoom
        id="a-c"
        animate={false}
        closing={false}
        onClosed={() => {}}
        onCreated={() => {}}
        prefill={null}
        agents={[HA]}
        roles={[]}
        teams={[]}
      />,
    );
  const del = () => screen.getByRole('button', { name: 'Delete agent' });

  it('busy on open: Delete is blocked with the reason; pressing it checks again and deletes nothing', async () => {
    agentsApi.busy.mockResolvedValue(BUSY);
    zoom();
    await waitFor(() => expect(del().getAttribute('aria-disabled')).toBe('true'));
    expect(screen.getByText(/You can delete them when it ends\./).textContent).toBe(REASON);
    await act(async () => fireEvent.click(del()));
    expect(agentsApi.busy).toHaveBeenCalledTimes(2);
    expect(agentsApi.remove).not.toHaveBeenCalled();
  });
  it('the session ends: the next check frees Delete, and Delete works as today (with Undo)', async () => {
    agentsApi.busy.mockResolvedValueOnce(BUSY).mockResolvedValue(FREE);
    agentsApi.remove.mockResolvedValue({ deleted: { kind: 'agent', id: 'a-c' }, restoreToken: 't1' });
    zoom();
    await waitFor(() => expect(del().getAttribute('aria-disabled')).toBe('true'));
    await act(async () => fireEvent.click(del())); // re-check → free, button lights up
    expect(del().hasAttribute('aria-disabled')).toBe(false);
    expect(agentsApi.remove).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(del()));
    expect(agentsApi.remove).toHaveBeenCalledWith('a-c');
    expect(ui.toast).toHaveBeenCalledWith('Health Analyst deleted', { undo: expect.any(Function) });
  });
  it('free on open but busy by the time Delete is pressed: blocked, nothing sent', async () => {
    agentsApi.busy.mockResolvedValueOnce(FREE).mockResolvedValue(BUSY);
    zoom();
    await waitFor(() => expect(agentsApi.busy).toHaveBeenCalledTimes(1));
    expect(del().hasAttribute('aria-disabled')).toBe(false);
    await act(async () => fireEvent.click(del()));
    expect(agentsApi.remove).not.toHaveBeenCalled();
    expect(del().getAttribute('aria-disabled')).toBe('true');
    expect(fx.announce).toHaveBeenCalledWith(REASON);
  });
  it('race past the check — server 409: reason toast, the button turns blocked', async () => {
    agentsApi.busy.mockResolvedValueOnce(FREE).mockResolvedValueOnce(FREE).mockResolvedValue(BUSY);
    agentsApi.remove.mockRejectedValue(busy409());
    zoom();
    await waitFor(() => expect(agentsApi.busy).toHaveBeenCalledTimes(1));
    await act(async () => fireEvent.click(del()));
    expect(agentsApi.remove).toHaveBeenCalledTimes(1);
    expect(ui.toast).toHaveBeenCalledWith(REASON);
    await waitFor(() => expect(del().getAttribute('aria-disabled')).toBe('true'));
  });
});
