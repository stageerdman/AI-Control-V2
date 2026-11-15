// @vitest-environment happy-dom
/* The pager's top tucks it away to a slim strip and brings it back; the choice is remembered. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api', () => ({
  studio: { projects: { list: vi.fn(), work: vi.fn(async () => []) }, agents: { list: vi.fn() } },
  useQuery: (key: string) => ({ data: key === 'projects' || key === 'agents' ? [] : [], refetch: vi.fn() }),
}));
vi.mock('./api', () => ({
  keys: { pager: 'pager' },
  officeApi: { studioAsks: vi.fn(), seen: vi.fn(async () => ({})) },
}));

import { Pager } from './Pager';

const route = { name: 'projects' } as never;

describe('tucking the pager away', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('the top hides it down and pops it back up; hidden controls are out of reach; remembered', () => {
    const { container, unmount } = render(<Pager route={route} />);
    const wrap = container.querySelector('#pager') as HTMLElement;
    const tab = screen.getByRole('button', { name: 'Tuck the pager away' });
    expect(tab.getAttribute('aria-expanded')).toBe('true');
    expect(wrap.className).not.toContain('down');

    fireEvent.click(tab);
    expect(wrap.className).toContain('down');
    expect(screen.getByRole('button', { name: 'Show the pager' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(container.querySelector('.o-pg-body')?.hasAttribute('inert')).toBe(true);
    expect(localStorage.getItem('aistudio.pager.down')).toBe('1');

    unmount();
    const again = render(<Pager route={route} />);
    expect(again.container.querySelector('#pager')?.className).toContain('down'); // remembered
    fireEvent.click(screen.getByRole('button', { name: 'Show the pager' }));
    expect(again.container.querySelector('#pager')?.className).not.toContain('down');
    expect(again.container.querySelector('.o-pg-body')?.hasAttribute('inert')).toBe(false);
  });
});
