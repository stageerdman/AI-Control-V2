// @vitest-environment happy-dom
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptainPip, Emblem } from './Emblem';
import { Hero, type HeroHandle } from './Hero';
import { _resetHeroSeq } from './hero-svg';

const pete = {
  id: 'a-pete',
  name: 'Pixel Pete',
  role: 'Frontend',
  look: {
    hat: 'headphones',
    tool: 'stylus',
    decal: 'Frontend',
    body: 'sprout',
    antenna: 'spikes',
    face: 'freckles',
    hue: 'teal',
  },
};

describe('<Hero> / <Emblem>', () => {
  beforeEach(() => {
    _resetHeroSeq();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['idle sm', { size: 'sm' as const }],
    [
      'typing seated md, labelled',
      { size: 'md' as const, pose: 'typing' as const, seated: true, label: true },
    ],
    ['captain xs (pip)', { size: 'xs' as const, captain: true, armband: 'sun' }],
    ['ghost', { size: 'md' as const, ghost: true }],
  ])('hero snapshot: %s', (_n, props) => {
    const { container } = render(<Hero agent={pete} {...props} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('labels for screen readers only when asked', () => {
    const { container, rerender } = render(<Hero agent={pete} pose="needs-input" label />);
    expect(container.querySelector('.hero')?.getAttribute('aria-label')).toBe(
      'Pixel Pete, Frontend, needs your input',
    );
    rerender(<Hero agent={pete} />);
    expect(container.querySelector('.hero')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('changes pose / facing in place (same element, animated turn) and rebuilds on identity change', () => {
    const { container, rerender } = render(<Hero agent={pete} pose="typing" seated />);
    const el = container.querySelector('.hero') as HTMLElement;
    rerender(<Hero agent={pete} pose="celebrating" seated={false} facing="front" />);
    expect(container.querySelector('.hero')).toBe(el);
    expect(el.classList.contains('pose-celebrating')).toBe(true);
    expect(el.classList.contains('seated')).toBe(false);
    expect(el.classList.contains('face-front')).toBe(true);
    rerender(<Hero agent={pete} look={{ hue: 'coral' }} pose="celebrating" facing="front" />);
    const el2 = container.querySelector('.hero') as HTMLElement;
    expect(el2).not.toBe(el);
    expect(el2.dataset.hue).toBe('coral');
    expect(el2.classList.contains('pose-celebrating')).toBe(true);
  });

  it('exposes imperative setPose / setFacing on a ref', () => {
    const ref = createRef<HeroHandle>();
    const { container } = render(<Hero ref={ref} agent={pete} />);
    act(() => {
      ref.current?.setPose('sleeping');
      ref.current?.setFacing('side', { dir: 'left' });
    });
    const el = container.querySelector('.hero') as HTMLElement;
    expect(el.className).toContain('pose-sleeping');
    expect(el.className).toContain('face-side');
    expect(el.className).toContain('dir-l');
    expect(ref.current?.el).toBe(el);
  });

  it.each([
    ['team', <Emblem key="t" team={{ emblem: 'rocket', color: 'grape' }} size={88} />],
    ['id + small (no stitch)', <Emblem key="s" id="castle" color="#ff6f73" size="sm" />],
    ['decorative', <Emblem key="d" id="compass" color="mint" decorative />],
    ['pip', <CaptainPip key="p" hue="teal" />],
  ])('emblem snapshot: %s', (_n, el) => {
    const { container } = render(el);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
