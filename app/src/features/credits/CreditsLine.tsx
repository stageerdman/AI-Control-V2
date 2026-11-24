/* The credits line (design/credits-line.md): a thin rainbow over the top edge whose length is the share of the
   plan left, a chip only when it matters (low, limited), and a small card on hover, focus or tap.
   All words come from model.ts; this file only draws them and handles open/close. */
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCredits } from './api';
import { type LineView, view } from './model';
import './credits.css';

/** Live: the server's forecast through the model. Mounted once by the shell. */
export function CreditsLine() {
  const { forecast, now } = useCredits();
  return <CreditsLineView view={view(forecast, now)} />;
}

const OPEN_DELAY = 150;
const CLOSE_DELAY = 250;
const CARD_W = 280;
const EDGE = 12;

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The line, chip and card for one view (tests render this directly). */
export function CreditsLineView({ view: v }: { view: LineView }) {
  const cardId = useId();
  const titleId = useId();
  const root = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  /** Card's x anchor: the pointer's, or null = the right edge (chip, keyboard). */
  const [x, setX] = useState<number | null>(null);
  const [still, setStill] = useState(reducedMotion);
  const [paused, setPaused] = useState(() => typeof document !== 'undefined' && document.hidden);
  const said = useRef(new Set<string>());
  const [live, setLive] = useState('');

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const later = (fn: () => void, ms: number) => {
    cancel();
    timer.current = setTimeout(fn, ms);
  };
  const show = (anchor: number | null) => {
    cancel();
    setX(anchor);
    setOpen(true);
  };
  const hide = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  /* focus leaving the line, chip and card closes the card */
  useEffect(() => {
    const el = root.current;
    const onOut = (e: FocusEvent) => {
      if (!el?.contains(e.relatedTarget as Node | null)) hide();
    };
    el?.addEventListener('focusout', onOut);
    return () => el?.removeEventListener('focusout', onOut);
  }, [hide]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onVis = () => setPaused(document.hidden);
    const onMq = () => setStill(!!mq?.matches);
    document.addEventListener('visibilitychange', onVis);
    mq?.addEventListener?.('change', onMq);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  /* one polite announcement per episode of warning / limited */
  useEffect(() => {
    if (!v.announce || said.current.has(v.announce.key)) return;
    said.current.add(v.announce.key);
    setLive(v.announce.text);
  }, [v.announce]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const inside = root.current?.contains(document.activeElement);
      hide();
      if (inside) hit.current?.focus({ preventScroll: true });
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, hide]);

  const hover = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (open) cancel();
      else {
        const px = e.clientX;
        later(() => show(px), OPEN_DELAY);
      }
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') later(hide, CLOSE_DELAY);
    },
  };

  const cardStyle: CSSProperties =
    x === null
      ? { right: EDGE }
      : {
          left: Math.max(
            EDGE,
            Math.min(
              x - CARD_W / 2,
              (typeof window === 'undefined' ? 1024 : window.innerWidth) - CARD_W - EDGE,
            ),
          ),
        };

  const c = v.card;
  return (
    <div
      ref={root}
      className="credits"
      data-state={v.state}
      data-tone={v.fillTone}
      data-thick={v.thick || undefined}
      data-dim={v.dim || undefined}
      data-dashed={v.dashed || undefined}
      data-animate={!still || undefined}
      data-paused={paused || undefined}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a native <meter> can't draw the drifting rainbow fill */}
      <div
        className="credits-meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v.leftPct}
        aria-valuetext={v.aria}
        aria-label={v.aria}
      >
        <span className="credits-fill" style={{ width: `${v.fill * 100}%` }} />
      </div>
      <button
        ref={hit}
        type="button"
        className="credits-hit"
        aria-label="AI credits details"
        aria-expanded={open}
        aria-controls={cardId}
        onFocus={() => show(null)}
        onClick={(e) => show(e.detail === 0 ? null : e.clientX)}
        {...hover}
      />
      {v.chip && (
        <button
          type="button"
          className="credits-chip"
          aria-expanded={open}
          aria-controls={cardId}
          onClick={() => show(null)}
          {...hover}
        >
          <span>{v.chip}</span>
        </button>
      )}
      {open && (
        <div
          id={cardId}
          className="credits-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          style={cardStyle}
          {...hover}
        >
          <div className="credits-card-head">
            <b id={titleId}>
              {c.title}
              {c.estimated && <span className="credits-soft"> · estimated, studio use only</span>}
            </b>
            {c.window && <span className="credits-soft">{c.window}</span>}
          </div>
          {v.state !== 'none' && (
            <div className="credits-bar" aria-hidden="true">
              <span className="credits-fill" style={{ width: `${v.fill * 100}%` }} />
            </div>
          )}
          {c.rate && <p className="credits-soft">{c.rate}</p>}
          <p className="credits-verdict">{c.verdict}</p>
          {(c.other || c.age) && <hr />}
          {c.other && <p className="credits-soft">{c.other}</p>}
          {c.age && <p className="credits-soft">{c.age}</p>}
        </div>
      )}
      <div className="credits-sr" aria-live="polite">
        {live}
      </div>
    </div>
  );
}
