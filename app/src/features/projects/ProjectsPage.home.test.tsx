// @vitest-environment happy-dom
/* HOME (updates/2026-11-24 HOME SCREEN/design.md): the three shelves from data, the pin (moves the
   card, keeps focus, rolls back with a toast), the no-pins hint, and empty shelves hiding. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, type Project, studio } from '../../api';
import { Toaster } from '../../ui';
import { ProjectsPage } from './ProjectsPage';

vi.mock('../setup/api', async (orig) => ({
  ...(await orig<typeof import('../setup/api')>()),
  sandboxFolders: () => Promise.resolve([]),
}));

const today = (h: number) => {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};
const project = (id: string, p: Partial<Project> = {}): Project => ({
  id,
  name: id,
  note: '',
  status: 'idle',
  progress: 0,
  folder: id,
  orchestratorId: 'o1',
  github: { connected: false, private: false },
  tile: { g1: '#000', g2: '#fff', glyph: 'bag' },
  teamIds: [],
  agentIds: [],
  pinRank: null,
  lastUserAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...p,
});

let server: Project[] = [];
const mount = (ps: Project[]) => {
  server = ps;
  vi.spyOn(studio.projects, 'list').mockImplementation(() => Promise.resolve(server.map((p) => ({ ...p }))));
  vi.spyOn(studio.drafts, 'list').mockResolvedValue([]);
  vi.spyOn(studio.agents, 'list').mockResolvedValue([]);
  vi.spyOn(studio.teams, 'list').mockResolvedValue([]);
  return render(
    <>
      <ProjectsPage />
      <Toaster />
    </>,
  );
};
const shelf = (name: string) => screen.getByRole('region', { name });
const names = (name: string) =>
  within(shelf(name))
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent);
/* what the server does with PUT /projects/pins */
const savePins = (ids: string[]) => {
  server = server.map((p) => ({ ...p, pinRank: ids.includes(p.id) ? ids.indexOf(p.id) : null }));
  return Promise.resolve(server.map((p) => ({ ...p })));
};

beforeEach(() => clearQueryCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('home shelves', () => {
  it('My Workplace (pin order), Today (newest first), All other — each project once', async () => {
    mount([
      project('Ledger', { pinRank: 1, lastUserAt: today(9) }),
      project('Sea GPS', { pinRank: 0 }),
      project('Recipe box', { lastUserAt: today(8) }),
      project('Sketchpad', { lastUserAt: today(10) }),
      project('Garden', { status: 'live', updatedAt: new Date().toISOString() }),
    ]);
    await screen.findByRole('region', { name: 'My Workplace' });
    expect(names('My Workplace')).toEqual(['Sea GPS', 'Ledger']);
    expect(names('Today')).toEqual(['Sketchpad', 'Recipe box']);
    expect(names('All other projects')).toEqual(['Garden']);
    expect(screen.queryByText(/Pin the projects you keep coming back to/)).toBeNull();
  });

  it('no pins: the hint instead of My Workplace; an empty Today and All other hide', async () => {
    mount([project('Recipe box', { lastUserAt: today(8) })]);
    await screen.findByText(/Pin the projects you keep coming back to/);
    expect(screen.queryByRole('region', { name: 'My Workplace' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'All other projects' })).toBeNull();
    expect(names('Today')).toEqual(['Recipe box']);
  });

  it('search hides the hint and the shelves without matches', async () => {
    mount([project('Sea GPS'), project('Ledger', { lastUserAt: today(8) })]);
    await screen.findByRole('region', { name: 'Today' });
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'sea' } });
    expect(screen.queryByText(/Pin the projects/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull();
    expect(names('All other projects')).toEqual(['Sea GPS']);
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: '' } });
  });
});

describe('the pin', () => {
  it('pin moves the card up, keeps focus on its pin, says so; unpin sends it back to Today', async () => {
    const put = vi.spyOn(studio.projects, 'setPins').mockImplementation(savePins);
    mount([project('Sea GPS', { pinRank: 0 }), project('Recipe box', { lastUserAt: today(8) })]);
    const pin = await screen.findByRole('button', { name: 'Pin Recipe box' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    pin.focus();
    fireEvent.click(pin);
    expect(names('My Workplace')).toEqual(['Sea GPS', 'Recipe box']); // on the spot
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull();
    expect(put).toHaveBeenCalledWith(['Sea GPS', 'Recipe box']);
    const unpin = screen.getByRole('button', { name: 'Unpin Recipe box' });
    expect(unpin.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(unpin);
    expect(screen.getByText('Recipe box pinned to My Workplace')).toBeTruthy();

    await act(async () => {
      fireEvent.click(unpin);
    });
    expect(put).toHaveBeenLastCalledWith(['Sea GPS']);
    expect(names('Today')).toEqual(['Recipe box']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Pin Recipe box' }));
  });

  it('the pin is a sibling of the card button, so the card still opens the project', async () => {
    mount([project('Sea GPS')]);
    const pin = await screen.findByRole('button', { name: 'Pin Sea GPS' });
    expect(pin.closest('.pcard-db')).toBeNull();
    expect(pin.parentElement?.querySelector('.pcard-db')).toBeTruthy();
  });

  it('a failed save puts the card back and shows a toast', async () => {
    vi.spyOn(studio.projects, 'setPins').mockRejectedValue(new Error('down'));
    mount([project('Sea GPS')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Pin Sea GPS' }));
    expect(names('My Workplace')).toEqual(['Sea GPS']);
    await screen.findByText('Couldn’t pin Sea GPS. Try again.');
    expect(screen.queryByRole('region', { name: 'My Workplace' })).toBeNull();
    expect(names('All other projects')).toEqual(['Sea GPS']);
  });

  it('the hint goes once the first pin lands', async () => {
    vi.spyOn(studio.projects, 'setPins').mockImplementation(savePins);
    mount([project('Sea GPS')]);
    await screen.findByText(/Pin the projects/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pin Sea GPS' }));
    });
    await waitFor(() => expect(screen.queryByText(/Pin the projects/)).toBeNull());
  });
});
