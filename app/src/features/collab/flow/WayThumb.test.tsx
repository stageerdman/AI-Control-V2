// @vitest-environment happy-dom
/* WayThumb (design/workflows/way-thumb.md): one face per node, one arrow per hand-off / sign-off, dashed
   only for sign-offs, the empty mark, the skeleton, the same frame as the editor, aria-hidden. */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../characters', () => ({ Hero: () => null }));

import { frame, toGraph } from './model';
import { THUMB, thumbLayout, WayThumb } from './WayThumb';

const people = [
  { id: 'ada', name: 'Ada' },
  { id: 'elon', name: 'Elon' },
  { id: 'jony', name: 'Jony' },
];
const way = {
  gates: [{ after: 'jony', reviewer: 'elon', kind: 'review' as const, why: 'checks it' }],
  steps: [
    { from: 'ada', to: 'jony', why: 'their part' },
    { from: 'jony', to: 'ada', why: 'back' },
  ],
  first: 'ada',
  layout: { ada: { x: 150, y: 300 }, elon: { x: 650, y: 80 }, jony: { x: 650, y: 520 } },
};

afterEach(cleanup);

describe('WayThumb', () => {
  it('draws one face per node and one arrow per hand-off or sign-off; dashed only for sign-offs', () => {
    const { container } = render(<WayThumb way={way} people={people} size="md" />);
    expect(container.querySelectorAll('.wt-face')).toHaveLength(3);
    expect(container.querySelectorAll('.wt-edge')).toHaveLength(3);
    expect(container.querySelectorAll('.wt-edge.signoff')).toHaveLength(1);
    /* no ✓ glyph below lg */
    expect(container.querySelector('.wt-check')).toBeNull();
  });

  it('lg: the ✓ sits on the sign-off arrow; ghosts show as faint rings', () => {
    const { container } = render(
      <WayThumb way={way} people={people} size="lg" ghosts={[{ id: 'ana', x: 650, y: 300 }]} />,
    );
    expect(container.querySelectorAll('.wt-check')).toHaveLength(1);
    expect(container.querySelectorAll('.wt-ghost')).toHaveLength(1);
  });

  it('nothing drawn: the generic way mark, never a broken box', () => {
    const { getByTestId } = render(<WayThumb way={null} people={people} size="sm" />);
    expect(getByTestId('wt-empty')).toBeTruthy();
    const { getAllByTestId } = render(<WayThumb way={{ gates: [] }} people={people} size="sm" />);
    expect(getAllByTestId('wt-empty')).toHaveLength(2);
  });

  it('loading: a skeleton of the same size', () => {
    const { getByTestId } = render(<WayThumb way={way} people={people} size="sm" loading />);
    expect(getByTestId('wt-skel').className).toContain('wt-sm');
  });

  it('is decorative: aria-hidden on the whole picture', () => {
    const { container } = render(<WayThumb way={way} people={people} size="sm" />);
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });

  it('temporary: dashed frame', () => {
    const { container } = render(<WayThumb way={way} people={people} size="md" temporary />);
    expect((container.firstElementChild as HTMLElement).className).toContain('temp');
  });

  it('positions keep the editor frame: same order and proportions, inside the box', () => {
    const g = toGraph(way);
    if (!g) throw new Error('drawn');
    const L = thumbLayout(g, 'md');
    const f = frame(g.nodes, { x: 40, y: 40 });
    const at = (id: string) => L.nodes.find((n) => n.id === id) ?? { x: Number.NaN, y: Number.NaN };
    const [a, b, c] = [at('ada'), at('elon'), at('jony')];
    /* proportional to the editor's coordinates */
    const sx = (b.x - a.x) / (650 - 150);
    const sy = (c.y - b.y) / (520 - 80);
    expect(Math.abs(sx - sy)).toBeLessThan(0.01);
    expect(sx).toBeGreaterThan(0);
    for (const n of L.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(THUMB.md.w);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(THUMB.md.h);
    }
    expect(f.width).toBeGreaterThan(0);
  });

  it('opposite arrows between one pair bend apart', () => {
    const g = toGraph(way);
    if (!g) throw new Error('drawn');
    const L = thumbLayout(g, 'lg');
    const [there, back] = L.edges;
    expect(there.x1 === back.x2 && there.y1 === back.y2).toBe(false);
  });
});
