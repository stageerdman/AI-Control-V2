// @vitest-environment happy-dom
/* Rearrange (spec-ux-team-rebuild §3, office path): the Move to… menu moves a person, the bar counts the
   changes, and Cancel puts everyone back. Nothing is applied while arranging. 'Left this project' lists who
   left; Bring back runs at once (outside the draft) and they reappear under Solo desks. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; name: string; role: string };
const TEAMS = [
  { id: 't1', name: 'Founders', captainId: 'jony', members: [{ id: 'jony', name: 'Jony', role: 'ui' }, { id: 'bob', name: 'Bob', role: 'dev' }] },
  { id: 't2', name: 'Build', captainId: 'elon', members: [{ id: 'elon', name: 'Elon', role: 'dev' }] },
];
let wire: { teams: typeof TEAMS; specialists: Row[]; left?: Row[] };
const plan = vi.fn();
const bringBack = vi.fn();
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>();
  return {
    ...real,
    rebuildApi: {
      lineup: () => Promise.resolve(structuredClone(wire)),
      plan: (...a: unknown[]) => plan(...a),
      bringBack: (...a: unknown[]) => bringBack(...a),
      apply: vi.fn(),
      undo: vi.fn(),
    },
  };
});
vi.mock('../../../characters', () => ({ Hero: () => null }));

import { Rearrange } from './Rearrange';

const flush = () => act(async () => {});
const zone = (name: string) => screen.getByRole('region', { name });
const open = async () => {
  render(<Rearrange pid="x" faceOf={() => null} director="Dee" onClose={() => {}} />);
  await flush();
};

describe('Rearrange', () => {
  beforeEach(() => {
    wire = { teams: structuredClone(TEAMS), specialists: [] };
    plan.mockReset();
    bringBack.mockReset();
  });
  afterEach(cleanup);

  it('Move to… moves a person, the bar counts it, Cancel resets', async () => {
    await open();
    expect(screen.getByText('No changes yet')).toBeTruthy();
    expect(within(zone('Founders')).getByText('bob')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Move bob to…' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Build/ }));

    expect(within(zone('Build')).getByText('bob')).toBeTruthy();
    expect(within(zone('Founders')).queryByText('bob')).toBeNull();
    expect(screen.getByText('1 change')).toBeTruthy();
    expect(plan).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('No changes yet')).toBeTruthy();
    expect(within(zone('Founders')).getByText('bob')).toBeTruthy();
  });

  it('hides “Left this project” when nobody has left', async () => {
    await open();
    expect(screen.queryByRole('region', { name: 'Left this project' })).toBeNull();
    wire.left = [];
    cleanup();
    await open();
    expect(screen.queryByText('Left this project')).toBeNull();
  });

  it('Bring back runs at once, keeps the draft, and they show under Solo desks', async () => {
    wire.left = [{ id: 'ada', name: 'Ada', role: 'research' }];
    await open();
    const left = zone('Left this project');
    expect(within(left).getByText('Ada')).toBeTruthy();
    expect(within(left).getByText('research')).toBeTruthy();

    // a pending draft move survives the reload
    fireEvent.click(screen.getByRole('button', { name: 'Move bob to…' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Build/ }));
    expect(screen.getByText('1 change')).toBeTruthy();

    let done: (v: unknown) => void = () => {};
    bringBack.mockReturnValue(new Promise((r) => (done = r)));
    const btn = within(left).getByRole('button', { name: 'Bring back Ada as a specialist' });
    fireEvent.click(btn);
    expect(bringBack).toHaveBeenCalledWith('x', 'ada');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.textContent).toBe('Bringing back…');
    fireEvent.click(btn);
    expect(bringBack).toHaveBeenCalledTimes(1);

    wire = { ...wire, specialists: [{ id: 'ada', name: 'Ada', role: 'research' }], left: [] };
    await act(async () => done({ ok: true, name: 'Ada' }));
    await flush();

    expect(screen.queryByRole('region', { name: 'Left this project' })).toBeNull();
    expect(within(zone('Solo desks')).getByText('ada')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Ada is back as a specialist');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move ada to…');
    // not a draft change: still just Bob's move
    expect(screen.getByText('1 change')).toBeTruthy();
    expect(within(zone('Build')).getByText('bob')).toBeTruthy();
    expect(plan).not.toHaveBeenCalled();
  });

  it('a failed Bring back shows the error on that row only', async () => {
    wire.left = [
      { id: 'ada', name: 'Ada', role: 'research' },
      { id: 'cy', name: 'Cy', role: 'qa' },
    ];
    bringBack.mockResolvedValue({ ok: false, error: 'Ada is on a break.' });
    await open();
    const btn = screen.getByRole('button', { name: 'Bring back Ada as a specialist' });
    fireEvent.click(btn);
    await flush();

    const msg = screen.getByText('Ada is on a break.');
    expect(btn.getAttribute('aria-describedby')).toBe(msg.id);
    expect(btn.getAttribute('aria-busy')).toBeNull();
    expect(btn.textContent).toBe('Bring back');
    expect(screen.getByRole('button', { name: 'Bring back Cy as a specialist' }).getAttribute('aria-describedby')).toBeNull();
    expect(within(zone('Left this project')).getByText('Ada')).toBeTruthy();
    expect(screen.getByText('No changes yet')).toBeTruthy();
  });
});
