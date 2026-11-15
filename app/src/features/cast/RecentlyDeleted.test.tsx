// @vitest-environment happy-dom
/* Recently deleted: every state on its own (hidden while loading / empty, the list, restore busy,
   restore failed + retry, seat taken), then the whole loop against a fake server:
   delete → listed → restore → back in the lineup in their old spot, focused, toast said. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearQueryCache } from '../../api';
import type { Agent } from '../../api/types';
import { dismissToast, Toaster } from '../../ui';
import type { AgentRestored, DeletedAgent } from './api';

/* ---------- a fake server behind the Cast api ---------- */
const srv = vi.hoisted(() => {
  const s = {
    agents: [] as Agent[],
    trash: [] as { token: string; agent: Agent; at: number; deletedAt: string }[],
    seq: 0,
    listGate: null as Promise<void> | null,
    restoreGate: null as Promise<void> | null,
    restoreFail: null as Error | null,
    seatsLost: undefined as string[] | undefined,
  };
  return s;
});
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>();
  const DAY = 24 * 3600 * 1000;
  const deleted = (): DeletedAgent[] =>
    [...srv.trash].reverse().map((t) => ({
      token: t.token,
      id: t.agent.id,
      name: t.agent.name,
      role: t.agent.role,
      look: t.agent.look,
      deletedAt: t.deletedAt,
      expiresAt: new Date(Date.parse(t.deletedAt) + 30 * DAY).toISOString(),
      chats: 6,
    }));
  return {
    ...real,
    castApi: {
      ...real.castApi,
      agents: {
        ...real.castApi.agents,
        list: async () => srv.agents.map((a) => ({ ...a })),
        remove: async (id: string) => {
          const at = srv.agents.findIndex((a) => a.id === id);
          const [agent] = srv.agents.splice(at, 1);
          const token = `tok-${++srv.seq}`;
          srv.trash.push({ token, agent: agent as Agent, at, deletedAt: new Date().toISOString() });
          return { deleted: { kind: 'agent', id }, restoreToken: token };
        },
      },
      roles: { ...real.castApi.roles, list: async () => [] },
      teams: { ...real.castApi.teams, list: async () => [] },
    },
    listDeletedAgents: async () => {
      if (srv.listGate) await srv.listGate;
      return deleted();
    },
    restoreAgent: async (token: string): Promise<AgentRestored> => {
      if (srv.restoreGate) await srv.restoreGate;
      if (srv.restoreFail) throw srv.restoreFail;
      const i = srv.trash.findIndex((t) => t.token === token);
      if (i < 0) throw new ApiError(404, 'not_found', 'Restore token not found');
      const [t] = srv.trash.splice(i, 1);
      if (!t) throw new Error('unreachable');
      srv.agents.splice(t.at, 0, t.agent);
      return { restored: { kind: 'agent', id: t.agent.id }, seatsLost: srv.seatsLost };
    },
  };
});
vi.mock('./fx', async (orig) => ({ ...(await orig<typeof import('./fx')>()), reducedMotion: () => true }));

const { RecentlyDeleted, ago, shortDate } = await import('./RecentlyDeleted');
const { Lineup } = await import('./Lineup');
const { deleteAgent, useCast } = await import('./store');

const agent = (id: string, name: string, role: string): Agent => ({
  id,
  kind: 'agent',
  system: false,
  name,
  nick: null,
  roleId: `r-${id}`,
  role,
  look: { hat: 'none', tool: 'none', body: 'hero', antenna: 'none', face: 'none', hue: 'sky' } as Agent['look'],
  prompt: '',
  teamIds: [],
  projectIds: [],
  canDelete: { ok: true, why: '' },
  createdAt: '',
  updatedAt: '',
});
const PIP = agent('a-a', 'Pip', 'Frontend');
const HA = agent('a-c', 'Health Analyst', 'Code Reviewer');
const MOE = agent('a-d', 'Moe', 'Research');

function Stage() {
  const { agents } = useCast();
  return (
    <>
      {agents && <Lineup agents={agents} q="" onRecruit={() => {}} />}
      <RecentlyDeleted />
      <Toaster />
    </>
  );
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const lineupNames = () =>
  [...document.querySelectorAll('.lineup .slot-name')].map((n) => n.textContent).filter((n) => n !== 'New agent');
const row = () => screen.queryByRole('button', { name: /^Recently deleted/ });
const open = () => fireEvent.click(row() as HTMLElement);

beforeEach(() => {
  clearQueryCache();
  dismissToast();
  srv.agents = [PIP, HA, MOE].map((a) => ({ ...a }));
  srv.trash = [];
  srv.listGate = srv.restoreGate = null;
  srv.restoreFail = null;
  srv.seatsLost = undefined;
});
afterEach(cleanup);

describe('Recently deleted — the row', () => {
  it('is not there while the list loads, nor when nothing is deleted (empty = hidden)', async () => {
    let release = () => {};
    srv.listGate = new Promise((r) => (release = r));
    render(<RecentlyDeleted />);
    expect(row()).toBeNull();
    release();
    await flush();
    expect(row()).toBeNull();
    expect(document.querySelector('.rd')).toBeNull();
  });

  it('shows "Recently deleted (n)" when n > 0; it is a closed disclosure until tapped', async () => {
    srv.trash.push({ token: 't1', agent: HA, at: 1, deletedAt: new Date().toISOString() });
    render(<RecentlyDeleted />);
    await flush();
    expect(row()?.textContent).toBe('Recently deleted (1)');
    expect(row()?.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list')).toBeNull();
    open();
    expect(row()?.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('Recently deleted — the list', () => {
  it('each row: name, role, "Deleted … · kept until …" and one named Restore (no bulk, no delete forever)', async () => {
    const two = new Date(Date.now() - 2 * 24 * 3600 * 1000 - 60_000).toISOString();
    srv.trash.push({ token: 't1', agent: MOE, at: 2, deletedAt: new Date().toISOString() });
    srv.trash.push({ token: 't2', agent: HA, at: 1, deletedAt: two });
    render(<RecentlyDeleted />);
    await flush();
    open();
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.rd-name')?.textContent)).toEqual(['Health Analyst', 'Moe']);
    const first = within(items[0] as HTMLElement);
    expect(first.getByText('Code Reviewer')).toBeTruthy();
    expect(first.getByText(/^Deleted 2 days ago · kept until /)).toBeTruthy();
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Recently deleted (2)',
      'Restore Health Analyst',
      'Restore Moe',
    ]);
  });

  it('restore in progress: the button says so and is busy; a second tap does nothing', async () => {
    let release = () => {};
    srv.restoreGate = new Promise((r) => (release = r));
    srv.trash.push({ token: 't1', agent: HA, at: 1, deletedAt: new Date().toISOString() });
    srv.agents = [PIP, MOE];
    render(<RecentlyDeleted />);
    await flush();
    open();
    const btn = screen.getByRole('button', { name: 'Restore Health Analyst' });
    fireEvent.click(btn);
    expect(btn.textContent).toBe('Restoring…');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    release();
    await flush();
    expect(srv.agents.map((a) => a.id)).toEqual(['a-a', 'a-c', 'a-d']);
  });

  it('restore failed: an inline message tied to the button, and Restore again works', async () => {
    srv.restoreFail = new ApiError(500, 'internal', 'The studio is busy.');
    srv.trash.push({ token: 't1', agent: HA, at: 1, deletedAt: new Date().toISOString() });
    srv.agents = [PIP, MOE];
    render(<RecentlyDeleted />);
    await flush();
    open();
    const btn = screen.getByRole('button', { name: 'Restore Health Analyst' });
    await act(async () => fireEvent.click(btn));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Couldn’t bring Health Analyst back: The studio is busy. Try again.');
    expect(btn.getAttribute('aria-describedby')).toBe(alert.id);
    expect(btn.textContent).toBe('Restore');
    srv.restoreFail = null;
    await act(async () => fireEvent.click(btn));
    await flush();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(row()).toBeNull(); // last one out → the row hides
  });

  it('a token past its 30 days says so plainly', async () => {
    srv.restoreFail = new ApiError(404, 'not_found', 'Restore token not found');
    srv.trash.push({ token: 't1', agent: HA, at: 1, deletedAt: new Date().toISOString() });
    render(<RecentlyDeleted />);
    await flush();
    open();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore Health Analyst' })));
    expect(screen.getByRole('alert').textContent).toBe('Their 30 days ran out, so they can’t come back.');
  });

  it('seat taken meanwhile: they are back, and the toast says which seat', async () => {
    srv.seatsLost = ['The Founders'];
    srv.trash.push({ token: 't1', agent: HA, at: 1, deletedAt: new Date().toISOString() });
    srv.agents = [PIP, MOE];
    render(<Stage />);
    await flush();
    open();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore Health Analyst' })));
    await flush();
    expect(screen.getByRole('status').textContent).toBe(
      'Health Analyst is back, but their seat on The Founders was taken',
    );
    expect(lineupNames()).toContain('Health Analyst');
  });
});

describe('delete → listed → restore → back in the lineup', () => {
  it('runs the whole loop, with the agent in their old spot, focused, and the toast announced', async () => {
    render(<Stage />);
    await flush();
    expect(lineupNames()).toEqual(['Pip', 'Health Analyst', 'Moe']);
    expect(row()).toBeNull();

    await act(async () => {
      await deleteAgent(HA);
    });
    await flush();
    expect(lineupNames()).toEqual(['Pip', 'Moe']);
    expect(screen.getByRole('status').textContent).toMatch(/^Health Analyst deleted/);
    expect(row()?.textContent).toBe('Recently deleted (1)');

    open();
    const kept = shortDate(new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());
    expect(screen.getByText(`Deleted just now · kept until ${kept}`)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore Health Analyst' })));
    await flush();
    await waitFor(() => expect(lineupNames()).toEqual(['Pip', 'Health Analyst', 'Moe']));
    expect(row()).toBeNull();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Health Analyst is back');
    await waitFor(() =>
      expect((document.activeElement as HTMLElement | null)?.dataset.id).toBe('a-c'),
    );
  });

  it('the delete toast’s Undo uses the same token and the same way back', async () => {
    render(<Stage />);
    await flush();
    await act(async () => {
      await deleteAgent(HA);
    });
    await flush();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })));
    await flush();
    expect(srv.trash).toHaveLength(0);
    expect(lineupNames()).toEqual(['Pip', 'Health Analyst', 'Moe']);
    expect(screen.getByRole('status').textContent).toBe('Health Analyst is back');
    expect(row()).toBeNull();
  });
});

describe('time words', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const at = (ms: number) => new Date(now - ms).toISOString();
  it('just now · hours · yesterday · days', () => {
    expect(ago(at(5 * 60_000), now)).toBe('just now');
    expect(ago(at(3600_000), now)).toBe('1 hour ago');
    expect(ago(at(5 * 3600_000), now)).toBe('5 hours ago');
    expect(ago(at(30 * 3600_000), now)).toBe('yesterday');
    expect(ago(at(2 * 24 * 3600_000), now)).toBe('2 days ago');
    expect(shortDate('2026-12-14T12:00:00Z')).toBe('Dec 14');
  });
});
