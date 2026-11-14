// @vitest-environment happy-dom
/* OFFICE: the project's portrait — the framed picture next to the features folder, and its sheet's rules. */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setApiBase } from '../../api';
import { LogoTile } from '../projects/LogoTile';
import { officeLayout } from './layout';
import { nameCheck, pickError, plaqueLines, squareCrop } from './portrait';
import { boardFacts } from './state';
import { officeArt, portraitInner, syncArt } from './theme';

const tile = { g1: '#ff6f73', g2: '#ffc24b', glyph: 'leaf' };
afterEach(cleanup);

describe('the portrait', () => {
  it('pick rules: png/jpeg/webp/gif only, ≤ 10 MB, not empty', () => {
    expect(pickError({ type: 'image/png', size: 1000 })).toBeNull();
    expect(pickError({ type: 'image/gif', size: 1000 })).toBeNull();
    expect(pickError({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(pickError({ type: 'application/pdf', size: 1000 })).toMatch(/PNG/);
    expect(pickError({ type: 'image/jpeg', size: 11 * 1024 * 1024 })).toMatch(/over 10 MB/);
    expect(pickError({ type: 'image/webp', size: 0 })).toMatch(/empty/);
  });

  it('crops the centred square', () => {
    expect(squareCrop(800, 600)).toEqual({ sx: 100, sy: 0, side: 600 });
    expect(squareCrop(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
    expect(squareCrop(64, 64)).toEqual({ sx: 0, sy: 0, side: 64 });
  });

  it('the name: trimmed, spaces folded, 1–60 characters; the plaque clips long names', () => {
    expect(nameCheck('  Habit   Hatch ')).toEqual({ ok: true, name: 'Habit Hatch' });
    expect(nameCheck('   ')).toEqual({ ok: false, why: 'Give it a name.' });
    expect(nameCheck('x'.repeat(61)).ok).toBe(false);
    expect(plaqueLines('Fox')).toEqual({ lines: ['Fox'], size: 10 });
    expect(plaqueLines('Habit Hatch')).toEqual({ lines: ['Habit Hatch'], size: 10 });
    expect(plaqueLines('Habit Hatchery').lines).toEqual(['Habit Hatchery']);
    // a normal ~20-character name shows whole, on two lines split at a space
    expect(plaqueLines('Tip Splitter Deluxe').lines).toEqual(['Tip Splitter', 'Deluxe']);
    expect(plaqueLines('Recipe Scaler for Teams').lines).toEqual(['Recipe Scaler', 'for Teams']);
    expect(plaqueLines('The Very Long Project Name 123').lines).toEqual(['The Very Long', 'Project Name…']);
    expect(plaqueLines('Supercalifragilisticexpialidocious').lines).toEqual([
      'Supercalifragi',
      'listicexpiali…',
    ]);
    for (const n of ['Fox', 'Habit Hatch', 'Tip Splitter Deluxe', 'The Very Long Project Name 123'])
      for (const l of plaqueLines(n).lines) expect(l.length).toBeLessThanOrEqual(14);
  });

  it('the frame shows the picture, else the project’s tile; the name goes on its plaque and the plinth', () => {
    setApiBase('http://127.0.0.1:4811');
    expect(portraitInner({ name: 'x', image: 'http://h/p.png?v=1&a=<', tile })).toContain(
      '<image href="http://h/p.png?v=1&amp;a=&lt;"',
    );
    const t = portraitInner({ name: 'x', image: null, tile });
    expect(t).toContain('stop-color="#ff6f73"');
    expect(t).toContain('<path'); // the glyph
    expect(
      portraitInner({ name: 'x', image: null, tile: { g1: 'red;"><script>', g2: '#fff', glyph: 'leaf' } }),
    ).not.toContain('<script>');
    const plan = officeLayout({ teams: [], solo: [] });
    const host = document.createElement('div');
    host.innerHTML = officeArt(plan, { title: 'Habit Hatch', teams: {} });
    syncArt(host, boardFacts({ project: { name: 'Hatchery', imageUrl: '/projects/h/image?v=2', tile } }));
    expect(host.querySelector('#otPortraitName')?.textContent).toBe('Hatchery');
    expect(host.querySelector('#otPortraitPlate')?.getAttribute('height')).toBe('20');
    syncArt(host, boardFacts({ project: { name: 'Tip Splitter Deluxe', imageUrl: null, tile } }));
    expect([...host.querySelectorAll('#otPortraitName tspan')].map((t) => t.textContent)).toEqual([
      'Tip Splitter',
      'Deluxe',
    ]);
    expect(host.querySelector('#otPortraitPlate')?.getAttribute('height')).toBe('30');
    syncArt(host, boardFacts({ project: { name: 'Hatchery', imageUrl: '/projects/h/image?v=2', tile } }));
    expect(host.querySelector('#otPlinthName')?.textContent).toBe('HATCHERY');
    expect(host.querySelector('#otPortraitPic image')?.getAttribute('href')).toBe(
      'http://127.0.0.1:4811/projects/h/image?v=2',
    );
    syncArt(host, boardFacts({ project: { name: 'Hatchery', imageUrl: null, tile } }));
    expect(host.querySelector('#otPortraitPic image')).toBeNull();
    expect(host.querySelector('#otPortraitPic rect')).toBeTruthy();
  });

  it('the Projects card icon uses the picture when there is one', () => {
    setApiBase('http://127.0.0.1:4811');
    const { container, rerender } = render(<LogoTile tile={tile} imageUrl="/projects/h/image?v=2" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'http://127.0.0.1:4811/projects/h/image?v=2',
    );
    rerender(<LogoTile tile={tile} imageUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
