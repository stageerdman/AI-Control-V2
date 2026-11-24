// @vitest-environment happy-dom
/* Agents propose drafts from their projects (propose_agent) while the app is open: the Cast must show them
   the next time it opens, not the list it read earlier in the session — and at once when the office hears it. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, invalidate } from '../../api';
import type { CreatorSession } from '../../api/types';
import { CastPage } from './CastPage';

const tinker = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('./api', () => ({ castApi: { tinker }, KEYS: { tinker: 'creator-sessions' } }));
vi.mock('./store', () => ({
  useCast: () => ({ agents: [], roles: [], teams: [], loading: false, error: undefined, retry: () => {} }),
}));
vi.mock('./Lineup', () => ({
  Lineup: ({ drafts }: { drafts: CreatorSession[] }) => (
    <ul aria-label="Drafts">
      {drafts.map((d) => (
        <li key={d.id}>{d.draft?.name}</li>
      ))}
    </ul>
  ),
}));
vi.mock('./RecentlyDeleted', () => ({ RecentlyDeleted: () => null }));
vi.mock('./RollCall', () => ({ RollCall: () => null }));
vi.mock('./HeroZoom', () => ({ HeroZoom: () => null }));
vi.mock('./SquadZoom', () => ({ SquadZoom: () => null }));
vi.mock('./TinkerZoom', () => ({ TinkerZoom: () => null }));

const session = (id: string, name: string): CreatorSession => ({
  id,
  chat: [],
  draft: { name },
  activity: null,
  createdAt: '',
  updatedAt: '',
});
const cast = () => render(<CastPage route={{ name: 'cast', tab: 'agents' } as never} />);

afterEach(cleanup);
beforeEach(() => {
  clearQueryCache();
  tinker.list.mockReset();
});

describe('Cast drafts stay fresh', () => {
  it('a draft proposed while the Cast was closed shows the next time it opens', async () => {
    tinker.list.mockResolvedValueOnce({ sessions: [] });
    cast();
    await vi.waitFor(() => expect(tinker.list).toHaveBeenCalledTimes(1));
    cleanup(); // the user goes to an office; Pixel proposes Unveil there

    tinker.list.mockResolvedValue({ sessions: [session('s1', 'Unveil')] });
    cast();
    expect(await screen.findByText('Unveil')).toBeTruthy();
    expect(tinker.list).toHaveBeenCalledTimes(2);
  });

  it('the office’s cast.drafted refresh reaches an open Cast', async () => {
    tinker.list.mockResolvedValueOnce({ sessions: [] });
    cast();
    await vi.waitFor(() => expect(tinker.list).toHaveBeenCalledTimes(1));
    tinker.list.mockResolvedValue({ sessions: [session('s2', 'Slidesmith')] });
    await invalidate('creator-sessions'); // what OfficePage does on cast.drafted
    expect(await screen.findByText('Slidesmith')).toBeTruthy();
  });
});
