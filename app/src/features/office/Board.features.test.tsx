// @vitest-environment happy-dom
/* Every office card (whiteboard, how we work, health, features, one feature, reports, one report)
   closes on a click on the dimmed background — the same as Esc, one layer back — and only there. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache } from '../../api';
import type { OfficeSub } from '../../shell/router';
import type { Feature } from './api';

vi.mock('../../characters', async (orig) => ({
  ...(await orig<typeof import('../../characters')>()),
  Hero: () => null,
}));
vi.mock('../reports', async (orig) => ({
  ...(await orig<typeof import('../reports')>()),
  ReportsList: () => <h2>Reports</h2>,
  ReportView: () => <h2>One report</h2>,
}));
vi.mock('./HowWeWork', () => ({ HowWeWork: () => <h2>How we work</h2> }));
vi.mock('./GithubRow', () => ({ GithubRow: () => null }));

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
  app: vi.fn(async () => null),
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
vi.mock('../../api/studio', () => ({
  studio: { projects: { work: async () => [], health: async () => null, list: async () => [] } },
}));

const { Board } = await import('./Board');

const go = vi.fn();
const show = (sub: OfficeSub, id?: string, onEsc: (() => boolean) | null = null) =>
  render(
    <Board
      pid="p"
      sub={sub}
      id={id}
      dir="Pixel"
      go={go}
      escapeRef={{ current: onEsc }}
      onFollowUp={() => {}}
      nameOf={(x) => x}
      resolve={{ agent: () => null } as never}
      people={[]}
    />,
  );
const backdrop = () => document.querySelector('.ob-dismiss') as HTMLElement;
/** A real click: press and release on the same element. */
const click = (el: Element) => {
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
};

beforeEach(() => {
  clearQueryCache();
  go.mockReset();
});
afterEach(cleanup);

describe('office cards: close on background click', () => {
  it.each([
    ['board', 'Whiteboard', 'room'],
    ['how', 'How we work', 'board'],
    ['health', 'Health check report', 'room'],
    ['features', 'Features', 'room'],
    ['reports', 'Reports', 'room'],
    ['report', 'Report', 'reports'],
  ] as const)('%s: a click on the background goes one layer back', (sub, label, to) => {
    show(sub, sub === 'report' ? 'r1' : undefined);
    const b = backdrop();
    expect(b.getAttribute('aria-hidden')).toBe('true');
    expect(b.nextElementSibling?.getAttribute('aria-label')).toBe(label);
    click(b);
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith(to);
  });

  it('the card’s own Esc handler goes first (unsaved changes are never lost)', () => {
    const esc = vi.fn(() => true);
    show('how', undefined, esc);
    click(backdrop());
    expect(esc).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();
  });

  it('one feature with unsaved changes asks first instead of closing', async () => {
    const ref = { current: null as (() => boolean) | null };
    render(
      <Board
        pid="p"
        sub="feature"
        id="a"
        dir="Pixel"
        go={go}
        escapeRef={ref}
        onFollowUp={() => {}}
        nameOf={(x) => x}
        resolve={{ agent: () => null } as never}
        people={[]}
      />,
    );
    const name = (await screen.findByRole('textbox', { name: 'Feature name' })) as HTMLInputElement;
    click(backdrop());
    expect(go).toHaveBeenCalledWith('features');
    go.mockReset();
    fireEvent.change(name, { target: { value: 'Alerts' } });
    click(backdrop());
    expect(go).not.toHaveBeenCalled();
    expect(screen.getByText('Unsaved changes.')).toBeTruthy();
  });

  it('clicks inside the card do not close it', async () => {
    show('features');
    await screen.findByText('Notifications');
    click(screen.getByRole('dialog', { name: 'Features' }));
    click(screen.getByRole('heading', { name: 'Features' }));
    click(screen.getByRole('searchbox'));
    click(screen.getByRole('radio', { name: /All/ }));
    expect(go).not.toHaveBeenCalled();
    click(screen.getByText('Notifications'));
    expect(go).toHaveBeenCalledTimes(1);
    expect(go).toHaveBeenCalledWith('feature', 'a');
  });

  it('a drag from inside the card onto the background does not close it', async () => {
    show('features');
    await screen.findByText('Notifications');
    fireEvent.mouseDown(screen.getByRole('searchbox'));
    fireEvent.click(backdrop());
    expect(go).not.toHaveBeenCalled();
  });
});
