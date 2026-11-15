// @vitest-environment happy-dom
/* Rearrange (spec-ux-team-rebuild §3, office path): the Move to… menu moves a person, the bar counts the
   changes, and Cancel puts everyone back. Nothing is applied while arranging. */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const plan = vi.fn();
vi.mock('./api', async (orig) => {
  const real = await orig<typeof import('./api')>();
  return {
    ...real,
    rebuildApi: {
      lineup: () =>
        Promise.resolve({
          teams: [
            { id: 't1', name: 'Founders', captainId: 'jony', members: [{ id: 'jony', name: 'Jony', role: 'ui' }, { id: 'bob', name: 'Bob', role: 'dev' }] },
            { id: 't2', name: 'Build', captainId: 'elon', members: [{ id: 'elon', name: 'Elon', role: 'dev' }] },
          ],
          specialists: [],
        }),
      plan: (...a: unknown[]) => plan(...a),
      apply: vi.fn(),
      undo: vi.fn(),
    },
  };
});
vi.mock('../../../characters', () => ({ Hero: () => null }));

import { Rearrange } from './Rearrange';

const flush = () => act(async () => {});
const zone = (name: string) => screen.getByRole('region', { name });

describe('Rearrange', () => {
  afterEach(cleanup);

  it('Move to… moves a person, the bar counts it, Cancel resets', async () => {
    render(<Rearrange pid="x" faceOf={() => null} director="Dee" onClose={() => {}} />);
    await flush();
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
});
