// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, clearQueryCache } from '../../api';
import type { Feature } from './api';

const f = (o: Partial<Feature>): Feature => ({
  id: 'f',
  projectId: 'p',
  name: 'F',
  status: 'planned',
  order: 1,
  pct: null,
  owner: null,
  description: '',
  createdAt: '2026-11-03T10:00:00',
  updatedAt: '2026-11-10T10:00:00',
  closedAt: null,
  ...o,
});
let list: Feature[] = [];
const api = {
  features: vi.fn(async () => list),
  createFeature: vi.fn(async (_pid: string, b: { name: string; status: string }) =>
    f({ id: 'new', name: b.name, status: b.status as Feature['status'] }),
  ),
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
const { FeatureList } = await import('./FeatureList');

const go = vi.fn();
const field = () => screen.getByRole('searchbox') as HTMLInputElement;
const type = (v: string) => fireEvent.change(field(), { target: { value: v } });
const chip = (name: RegExp) => screen.getByRole('radio', { name });
const rowNames = () => [...document.querySelectorAll('.ob-row .ob-rn')].map((x) => x.textContent);
const show = async () => {
  render(<FeatureList pid="p" dir="Pixel" go={go} />);
  await screen.findByRole('radiogroup');
};

beforeEach(() => {
  clearQueryCache();
  go.mockReset();
  api.createFeature.mockClear();
  list = [
    f({ id: 'a', name: 'UX: Feature List', status: 'now' }),
    f({ id: 'c', name: 'Notifications', status: 'planned', description: 'in time' }),
    f({ id: 'b', name: 'Time estimates', status: 'shipped', closedAt: '2026-11-19T09:00:00' }),
    f({ id: 'd', name: 'Thinking Power', status: 'shelved', closedAt: '2026-11-19T09:00:00' }),
  ];
});
afterEach(cleanup);

describe('FeatureList', () => {
  it('groups by stage with headings, dates each row, hides unused stage chips', async () => {
    await show();
    expect([...document.querySelectorAll('.ob-scroll h3')].map((h) => h.textContent)).toEqual([
      'Now',
      'Planned',
      'Shipped',
      'Shelved',
    ]);
    expect(rowNames()).toEqual(['UX: Feature List', 'Notifications', 'Time estimates', 'Thinking Power']);
    expect(screen.getByRole('button', { name: /Time estimates/ }).textContent).toContain(
      'Shipped 19 November',
    );
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'All4',
      'Now1',
      'Planned1',
      'Shipped1',
      'Shelved1',
    ]);
    expect(chip(/All/).getAttribute('aria-checked')).toBe('true');
  });

  it('a chip filters (no heading); tapping it again goes back to All', async () => {
    await show();
    fireEvent.click(chip(/Shelved/));
    expect(rowNames()).toEqual(['Thinking Power']);
    expect(document.querySelector('.ob-scroll h3')).toBeNull();
    fireEvent.click(chip(/Shelved/));
    expect(chip(/All/).getAttribute('aria-checked')).toBe('true');
    expect(rowNames()).toHaveLength(4);
  });

  it('arrow keys move through the chips', async () => {
    await show();
    fireEvent.keyDown(chip(/All/), { key: 'ArrowRight' });
    expect(chip(/Now/).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(chip(/Now/), { key: 'ArrowLeft' });
    fireEvent.keyDown(chip(/All/), { key: 'ArrowLeft' });
    expect(chip(/Shelved/).getAttribute('aria-checked')).toBe('true');
  });

  it('search filters live, counts follow, Enter opens the first match', async () => {
    await show();
    type('time');
    expect(rowNames()).toEqual(['Notifications', 'Time estimates']);
    expect(chip(/All/).textContent).toBe('All2');
    expect(chip(/Now/).textContent).toBe('Now0');
    expect(screen.getByRole('button', { name: /Add “time”/ })).toBeTruthy();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(go).toHaveBeenCalledWith('feature', 'c');
    expect(api.createFeature).not.toHaveBeenCalled();
  });

  it('an exact name hides the Add row and Enter opens it', async () => {
    await show();
    type('time estimates');
    expect(screen.queryByRole('button', { name: /Add “/ })).toBeNull();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(go).toHaveBeenCalledWith('feature', 'b');
  });

  it('nothing matches: Enter adds in Planned, then opens the new feature', async () => {
    await show();
    type('Dark mode');
    expect(screen.getByText('Nothing matches “Dark mode”.')).toBeTruthy();
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(go).toHaveBeenCalledWith('feature', 'new'));
    expect(api.createFeature).toHaveBeenCalledWith('p', { name: 'Dark mode', status: 'planned' });
    expect(field().value).toBe('');
  });

  it('with the Now chip on, a new feature lands in Now; the stage message offers all stages', async () => {
    await show();
    fireEvent.click(chip(/Now/));
    type('Dark mode');
    expect(screen.getByText(/Nothing in Now matches “Dark mode”/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add “Dark mode”/ }));
    await waitFor(() =>
      expect(api.createFeature).toHaveBeenCalledWith('p', { name: 'Dark mode', status: 'now' }),
    );
  });

  it('Search all stages resets the chip', async () => {
    await show();
    fireEvent.click(chip(/Shelved/));
    type('time');
    fireEvent.click(screen.getByRole('button', { name: 'Search all stages' }));
    expect(chip(/All/).getAttribute('aria-checked')).toBe('true');
    expect(rowNames()).toEqual(['Notifications', 'Time estimates']);
  });

  it('add failed: the server message, text kept', async () => {
    api.createFeature.mockRejectedValueOnce(new ApiError(422, 'validation', 'Name is too long'));
    await show();
    type('Dark mode');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toBe('Name is too long');
    expect(field().value).toBe('Dark mode');
    expect(go).not.toHaveBeenCalled();
  });

  it('Esc clears the text first', async () => {
    await show();
    type('time');
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field().value).toBe('');
    expect(rowNames()).toHaveLength(4);
  });

  it('empty office: no chips, the field says Add a feature', async () => {
    list = [];
    render(<FeatureList pid="p" dir="Pixel" go={go} />);
    expect(await screen.findByText(/No features yet\. Type one above, or tell Pixel/)).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(field().placeholder).toBe('Add a feature');
  });
});
