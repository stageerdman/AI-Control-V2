// @vitest-environment happy-dom
/* The credits line rendered state by state, the card's open/close, the one-time announcement, reduced motion,
   and the live hook against a fake EventSource. */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCredits } from './api';
import { CreditsLineView } from './CreditsLine';
import { type Forecast, view, type WindowForecast } from './model';

const NOW = Date.parse('2026-11-24T14:30:00Z');
const iso = (min: number) => new Date(NOW + min * 60_000).toISOString();
const win = (over: Partial<WindowForecast> = {}): WindowForecast => ({
  name: 'five_hour',
  used: 0.38,
  left: 0.62,
  resetsAt: iso(120),
  opensAt: iso(-180),
  ratePerHour: 0.09,
  hitsAt: null,
  verdict: 'lasts',
  readingAgeMs: 0,
  ...over,
});
const fc = (state: Forecast['state'], w: WindowForecast | null): Forecast => ({
  state,
  binding: w?.name ?? null,
  windows: w ? [w] : [],
  readingAgeMs: w ? 0 : null,
  at: new Date(NOW).toISOString(),
});
const C = { locale: 'en-US', timeZone: 'UTC' };
const draw = (f: Forecast) => render(<CreditsLineView view={view(f, NOW, C)} />);
const root = () => document.querySelector('.credits') as HTMLElement;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CreditsLineView', () => {
  it('none: an empty meter, no chip', () => {
    draw(fc('none', null));
    expect(root().dataset.state).toBe('none');
    expect(screen.getByRole('meter').getAttribute('aria-label')).toMatch(/no reading yet/);
    expect(document.querySelector('.credits-chip')).toBeNull();
  });

  it('ok: the fill is the share left, labelled in words, no chip', () => {
    draw(fc('ok', win()));
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('62');
    expect(meter.getAttribute('aria-label')).toBe('AI credits: 62% left, lasts until it resets at 4:30 pm');
    expect((meter.querySelector('.credits-fill') as HTMLElement).style.width).toBe('62%');
    expect(root().dataset.tone).toBe('rainbow');
    expect(document.querySelector('.credits-chip')).toBeNull();
  });

  it('warning: thick warm line and the chip; the chip opens the card', () => {
    draw(fc('warning', win({ verdict: 'hits', hitsAt: iso(40) })));
    expect(root().dataset.tone).toBe('warm');
    expect(root().dataset.thick).toBe('true');
    const chip = screen.getByRole('button', { name: 'runs out ≈ 3:10 pm' });
    fireEvent.click(chip);
    expect(screen.getByRole('dialog', { name: '62% left' })).toBeTruthy();
    expect(screen.getByText('Runs out in ~40 min (≈ 3:10 pm) · resets 4:30 pm')).toBeTruthy();
  });

  it('limited: no fill, the chip says when it is back', () => {
    draw(fc('limited', win({ used: 1, left: 0, verdict: 'limited' })));
    expect(root().dataset.state).toBe('limited');
    expect(screen.getByRole('button', { name: 'Limit reached · back at 4:30 pm' })).toBeTruthy();
  });

  it('the card: focus opens it, Escape closes it and focus stays on the line', () => {
    draw(fc('ok', win()));
    const hit = screen.getByRole('button', { name: 'AI credits details' });
    act(() => hit.focus());
    expect(hit.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('false');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(hit);
  });

  it('the card: hover opens after a beat, leaving closes it after a beat', () => {
    vi.useFakeTimers();
    draw(fc('ok', win()));
    const hit = screen.getByRole('button', { name: 'AI credits details' });
    fireEvent.pointerEnter(hit, { pointerType: 'mouse', clientX: 300 });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => vi.advanceTimersByTime(160));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.pointerLeave(hit, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(260));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a tap outside closes the card', () => {
    draw(fc('ok', win()));
    fireEvent.click(screen.getByRole('button', { name: 'AI credits details' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces a warning once per episode', () => {
    const f = fc('warning', win({ verdict: 'hits', hitsAt: iso(40) }));
    const r = draw(f);
    const live = () => (document.querySelector('[aria-live="polite"]') as HTMLElement).textContent;
    expect(live()).toBe('AI credits low: runs out in about 40 minutes.');
    r.rerender(
      <CreditsLineView view={view({ ...f, windows: [win({ verdict: 'hits', hitsAt: iso(30) })] }, NOW, C)} />,
    );
    expect(live()).toBe('AI credits low: runs out in about 40 minutes.');
  });

  it('reduced motion: no animation hook, words and colours stay', () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      draw(fc('warning', win({ verdict: 'hits', hitsAt: iso(40) })));
      expect(root().dataset.animate).toBeUndefined();
      expect(root().dataset.tone).toBe('warm');
      expect(screen.getByRole('button', { name: 'runs out ≈ 3:10 pm' })).toBeTruthy();
    } finally {
      window.matchMedia = mm;
    }
  });
});

describe('useCredits', () => {
  it('listens to the credits stream and keeps the latest forecast', () => {
    const made: { url: string; fire: (type: string, data: unknown) => void; closed: boolean }[] = [];
    class FakeES {
      readyState = 1;
      onopen = null;
      onerror = null;
      handlers: Record<string, ((e: MessageEvent) => void)[]> = {};
      rec: (typeof made)[number];
      constructor(url: string) {
        this.rec = {
          url,
          closed: false,
          fire: (type, data) => {
            for (const h of this.handlers[type] ?? [])
              h({ data: JSON.stringify(data), lastEventId: '' } as MessageEvent);
          },
        };
        made.push(this.rec);
      }
      addEventListener(t: string, fn: (e: MessageEvent) => void) {
        this.handlers[t] = [...(this.handlers[t] ?? []), fn];
      }
      close() {
        this.rec.closed = true;
      }
    }
    const { result, unmount } = renderHook(() => useCredits({ EventSource: FakeES }));
    expect(result.current.forecast).toBeNull();
    expect(made[0]?.url).toMatch(/\/credits\/events$/);
    const f = fc('ok', win());
    act(() => made[0]?.fire('credits', f));
    expect(result.current.forecast).toEqual(f);
    unmount();
    expect(made[0]?.closed).toBe(true);
  });
});
