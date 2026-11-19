// @vitest-environment happy-dom
/* The features card closes on a click on the dimmed background, and only there. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import type { Feature } from './api';

vi.mock('../../characters', async (orig) => ({
  ...(await orig<typeof import('../../characters')>()),
  Hero: () => null,
}));

const feat: Feature = {
  id: 'a',
  projectId: 'p',
  name: 'Notifications',
  status: 'planned',
  order: 1,
  pct: null,
  owner: null,
  description: '',
  createdAt: '2026-11-03T10:00:00',
  updatedAt: '2026-11-10T10:00:00',
  closedAt: null,
};
const api = {
  features: vi.fn(async () => [feat]),
  progress: vi.fn(async () => null),
  workflows: vi.fn(async () => ({ workflows: [], designed: true })),
  timesheet: vi.fn(async () => ({
    tasks: [],
    goals: [],
    features: [],
    estimates: { task: null, goal: null, feature: null },
  })),
};
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
  officeApi: new Proxy({}, { get: (_t, k: string) => (api as Record<string, unknown>)[k] }),
}));
vi.mock('../../api/studio', () => ({ studio: { projects: { work: async () => [] } } }));

const { Board } = await import('./Board');

const go = vi.fn();
const show = async (sub: 'features' | 'board' = 'features') => {
  render(
    <Board
      pid="p"
      sub={sub}
      dir="Pixel"
      go={go}
      escapeRef={{ current: null }}
      onFollowUp={() => {}}
      nameOf={(id) => id}
      resolve={{ agent: () => null } as never}
      people={[]}
    />,
  );
  if (sub === 'features') await screen.findByText('Notifications');
};
const backdrop = () => document.querySelector('.ob-dismiss') as HTMLElement;

beforeEach(() => {
  clearQueryCache();
  go.mockReset();
});
afterEach(cleanup);

describe('features card: close on background click', () => {
  it('a click on the background goes back to the office', async () => {
    await show();
    fireEvent.click(backdrop());
    expect(go).toHaveBeenCalledWith('room');
  });

  it('clicks inside the card do not close it', async () => {
    await show();
    fireEvent.click(screen.getByRole('dialog', { name: 'Features' }));
    fireEvent.click(screen.getByRole('heading', { name: 'Features' }));
    fireEvent.click(screen.getByRole('searchbox'));
    fireEvent.mouseDown(screen.getByRole('searchbox'));
    fireEvent.click(screen.getByRole('radio', { name: /All/ }));
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Notifications'));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('feature', 'a');
  });

  it('the background is hidden from screen readers and sits behind the card', async () => {
    await show();
    const b = backdrop();
    expect(b.getAttribute('aria-hidden')).toBe('true');
    expect(b.nextElementSibling?.getAttribute('role')).toBe('dialog');
  });

  it('other cards are unchanged', async () => {
    await show('board');
    expect(backdrop()).toBeNull();
  });
});
