// @vitest-environment happy-dom
/* The "built for you" card (design/team-built-card.md): it shows the team, its people, the captain and the
   user's yes; Edit opens the Cast; Remove takes one new thing back with Undo; Remove all takes the build back. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type A = { id: string; name: string; role: string };
type T = { id: string; name: string; captainId: string | null; members: { agentId: string }[] };
let agents: A[] = [];
let teams: T[] = [];
let requests: Record<string, unknown>[] = [];
const removeAgent = vi.fn();
const restore = vi.fn();
const undo = vi.fn();
const restoreAll = vi.fn();

vi.mock('../../cast/api', async (orig) => {
  const real = await orig<typeof import('../../cast/api')>();
  return {
    ...real,
    castApi: {
      ...real.castApi,
      agents: {
        ...real.castApi.agents,
        list: () => Promise.resolve(structuredClone(agents)),
        remove: (id: string) => {
          removeAgent(id);
          agents = agents.filter((a) => a.id !== id);
          return Promise.resolve({ restoreToken: `tok-${id}` });
        },
      },
      teams: { ...real.castApi.teams, list: () => Promise.resolve(structuredClone(teams)) },
      roles: { ...real.castApi.roles, list: () => Promise.resolve([]) },
      restore: (t: string) => {
        restore(t);
        agents = [...agents, { id: 'teller', name: 'Tidewright', role: 'Storyteller' }];
        return Promise.resolve({});
      },
    },
  };
});
/* the studio's team-request routes (server/src/routes: GET list, POST undo, POST restore) */
vi.mock('../../../api', async (orig) => {
  const real = await orig<typeof import('../../../api')>();
  const set = (id: string, undoneAt: string | null) => {
    requests = requests.map((r) => (r.id === id ? { ...r, undoneAt } : r));
    return Promise.resolve(requests.find((r) => r.id === id));
  };
  return {
    ...real,
    http: {
      ...real.http,
      get: () => Promise.resolve({ requests: structuredClone(requests) }),
      post: (path: string) => {
        const [, pid, id, verb] = /^\/projects\/([^/]+)\/team-requests\/([^/]+)\/(\w+)$/.exec(path) ?? [];
        if (verb === 'undo') {
          undo(pid, id);
          return set(id, '2026-11-24T10:00:00Z');
        }
        restoreAll(pid, id);
        return set(id, null);
      },
    },
  };
});
vi.mock('../../../characters', () => ({ Hero: () => null, Emblem: () => null }));

import { clearQueryCache } from '../../../api/query';
import { resetBuiltTokens } from './api';
import { BuiltCard, builderOf, whenSaid } from './BuiltCard';

const flush = () => act(async () => {});
const LINE = 'Tinker built The Tide Tellers for you: Tidewright (Storyteller), Slidesmith.';

beforeEach(() => {
  clearQueryCache();
  resetBuiltTokens();
  vi.clearAllMocks();
  location.hash = '';
  agents = [
    { id: 'teller', name: 'Tidewright', role: 'Storyteller' },
    { id: 'slides', name: 'Slidesmith', role: 'Presentation Creator' },
    { id: 'jony', name: 'Jony', role: 'UI Design' },
  ];
  teams = [
    {
      id: 'tide',
      name: 'The Tide Tellers',
      captainId: 'teller',
      members: [{ agentId: 'teller' }, { agentId: 'slides' }, { agentId: 'jony' }],
    },
  ];
  requests = [
    {
      id: 'r1',
      projectId: 'sea',
      directorId: 'pixel',
      work: 'a one-page presentation',
      yes: { words: 'yes, build it', at: '2026-11-24T09:30:00Z', messageId: 'm1' },
      createdAt: '2026-11-24T09:30:00Z',
      built: { teamId: 'tide', agentIds: ['teller', 'slides'], roleIds: [], restoreTokens: ['a', 'b', 'c'] },
      builtAt: '2026-11-24T09:31:00Z',
      undoneAt: null,
    },
  ];
});
afterEach(cleanup);

const show = async () => {
  render(<BuiltCard pid="sea" requestId="r1" text={LINE} />);
  await flush();
  await flush();
};

describe('built-for-you card', () => {
  it('shows the team, the new agents, the captain and the yes', async () => {
    await show();
    expect(screen.getByRole('heading', { name: 'Tinker built The Tide Tellers for you' })).toBeTruthy();
    expect(screen.getByText('Tidewright')).toBeTruthy();
    expect(screen.getByText('Storyteller · captain')).toBeTruthy();
    expect(screen.getByText('Slidesmith')).toBeTruthy();
    expect(screen.getByText('UI Design · already in the Cast')).toBeTruthy();
    expect(screen.getByText('yes, build it')).toBeTruthy();
  });

  it('offers Remove only on what this build made', async () => {
    await show();
    expect(screen.getByRole('button', { name: 'Remove Tidewright' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove The Tide Tellers' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Jony' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Jony' })).toBeTruthy();
  });

  it('Edit opens the agent or the team in the Cast', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Slidesmith' }));
    expect(location.hash).toBe('#cast/agent/slides');
    fireEvent.click(screen.getByRole('button', { name: 'Edit The Tide Tellers' }));
    expect(location.hash).toContain('tide');
  });

  it('Remove takes one agent back, and Undo brings it back', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tidewright' }));
    await flush();
    await flush();
    expect(removeAgent).toHaveBeenCalledWith('teller');
    fireEvent.click(screen.getByRole('button', { name: 'Bring back Tidewright' }));
    await flush();
    await flush();
    expect(restore).toHaveBeenCalledWith('tok-teller');
    expect(screen.getByRole('button', { name: 'Remove Tidewright' })).toBeTruthy();
  });

  it('Remove all takes the whole build back, with Undo', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    await flush();
    await flush();
    expect(undo).toHaveBeenCalledWith('sea', 'r1');
    expect(screen.getByText(/Removed The Tide Tellers and its 2 new agents/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await flush();
    await flush();
    expect(restoreAll).toHaveBeenCalledWith('sea', 'r1');
    expect(screen.getByRole('button', { name: 'Remove all' })).toBeTruthy();
  });

  it('falls back to the plain chat line when the build can’t be read', async () => {
    requests = [];
    await show();
    await flush();
    expect(screen.getByText(LINE)).toBeTruthy();
  });

  it('reads who built it and when the yes was said', () => {
    expect(builderOf(LINE)).toBe('Tinker');
    expect(builderOf('something else')).toBe('The Agent Creator');
    const now = new Date('2026-11-24T12:00:00');
    expect(whenSaid('2026-11-24T09:05:00', now)).not.toContain('Nov');
    expect(whenSaid('2026-11-20T09:05:00', now)).toContain('Nov');
  });
});
