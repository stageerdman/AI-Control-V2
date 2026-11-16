/* Parts tray: every option of one look slot side by side, worn by the agent's own bot (colour: named
   swatches). Hover / focus tries an option on (onTry), click / Enter / Space picks it (onPick),
   Esc / ✕ / a click outside / tabbing out closes it (onClose). It never saves: the caller owns the look. */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Look } from '../../api/types';
import { heroSVG, LOOK_SLOTS, type LookSlotId } from '../../characters';
import { hueHex } from '../../design/palette';
import { trayOptions } from './model';

const COLS = 5;
const PLURAL: Record<LookSlotId, string> = {
  antenna: 'Antennas',
  hat: 'Hats',
  face: 'Faces',
  body: 'Bodies',
  tool: 'Tools',
  hue: 'Colours',
};

export type CloseWhy = 'dismiss' | 'blur';

export function LookTray({
  slot,
  look,
  name,
  anchor,
  onTry,
  onPick,
  onClose,
}: {
  slot: LookSlotId;
  look: Look;
  name?: string;
  /** the slot tag that opened it (the tray lines up with it and returns focus there) */
  anchor?: HTMLElement | null;
  onTry: (look: Look | null) => void;
  onPick: (look: Look) => void;
  onClose: (why: CloseWhy) => void;
}) {
  const sl = LOOK_SLOTS.find((s) => s.id === slot);
  const colour = slot === 'hue';
  /* built once per opening (≤ 24 bots), not on every hover */
  // biome-ignore lint/correctness/useExhaustiveDependencies: the options of the look the tray opened on
  const opts = useMemo(() => trayOptions(look, slot), [slot]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: same
  const thumbs = useMemo(
    () =>
      colour
        ? []
        : opts.map((o) => heroSVG({ name, look: o.look }, { size: 56, facing: 'front', props: true })),
    [opts],
  );
  const cur = Math.max(
    0,
    opts.findIndex((o) => o.current),
  );
  const [focus, setFocus] = useState(cur);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLElement | null)[]>([]);
  const shown = opts[hover ?? focus] ?? opts[cur];

  /* on the stage (out of the rig's transform), beside the tag, kept inside the stage;
     without a stage (tests, previews) it stays where it is rendered */
  const [stage] = useState(() => anchor?.closest<HTMLElement>('.z-stage') ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on open
  useLayoutEffect(() => {
    cells.current[cur]?.focus({ preventScroll: true });
    const el = box.current;
    if (!el || !stage || !anchor) return;
    const s = stage.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    if (!s.width) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(16, Math.min(a.left - s.left, s.width - 16 - w));
    const top = Math.max(16, Math.min(a.top - s.top - 6, s.height - 16 - h));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.maxHeight = `${Math.max(120, s.height - 32)}px`;
  }, []);

  /* a click anywhere else closes (the slot tags toggle themselves) */
  // biome-ignore lint/correctness/useExhaustiveDependencies: once
  useLayoutEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || box.current?.contains(t) || t.closest?.('.lk-tag')) return;
      onClose('dismiss');
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, []);

  const tryOn = (i: number | null) => {
    const o = i === null ? null : opts[i];
    onTry(o && !o.current ? o.look : null);
  };
  const moveTo = (i: number) => {
    const n = Math.max(0, Math.min(opts.length - 1, i));
    setFocus(n);
    cells.current[n]?.focus();
  };
  const pick = (i: number) => {
    const o = opts[i];
    if (o) onPick(o.look);
  };
  const cols = colour ? opts.length : COLS;
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault(); // the zoom stays open
      e.stopPropagation();
      onClose('dismiss');
      return;
    }
    if (!(e.target as HTMLElement).matches('[role="option"]')) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    if (k in step) moveTo(focus + (step[k] as number));
    else if (k === 'Home') moveTo(0);
    else if (k === 'End') moveTo(opts.length - 1);
    else if (k === 'Enter' || k === ' ') pick(focus);
    else return;
    e.preventDefault();
  };

  const tray = (
    // biome-ignore lint/a11y/noStaticElementInteractions: keys bubble up from the options and ✕
    <div
      ref={box}
      className={`lk-tray${colour ? ' colour' : ''}${stage ? ' on-stage' : ''}`}
      data-slot={slot}
      onKeyDown={onKey}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !box.current?.contains(to)) onClose('blur');
      }}
    >
      <div className="lk-tray-top">
        <span className="lk-tray-title" aria-hidden="true">
          {sl?.label} · <b>{shown?.name}</b>
        </span>
        <button type="button" className="lk-tray-x" aria-label="Close" onClick={() => onClose('dismiss')}>
          ✕
        </button>
      </div>
      <div
        className="lk-grid"
        role="listbox"
        aria-label={PLURAL[slot]}
        aria-orientation={colour ? 'horizontal' : undefined}
        onPointerLeave={() => {
          setHover(null);
          tryOn(focus);
        }}
      >
        {opts.map((o, i) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: Enter / Space are handled on the tray (onKey), roving focus
          <div
            key={o.value}
            ref={(el) => {
              cells.current[i] = el;
            }}
            role="option"
            aria-selected={o.current}
            aria-label={o.current ? `${o.name}, current` : o.name}
            tabIndex={i === focus ? 0 : -1}
            className={`lk-cell${o.current ? ' cur' : ''}`}
            data-value={o.value}
            onPointerEnter={() => {
              setHover(i);
              tryOn(i);
            }}
            onFocus={() => {
              setFocus(i);
              if (hover === null) tryOn(i);
            }}
            onClick={() => pick(i)}
          >
            {colour ? (
              <>
                <span className="lk-swatch" style={{ background: hueHex(o.value) }} aria-hidden="true" />
                <span className="lk-sw-name" aria-hidden="true">
                  {o.name}
                </span>
              </>
            ) : (
              <span
                className="lk-mini"
                aria-hidden="true"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: our own bot SVG
                dangerouslySetInnerHTML={{ __html: thumbs[i] ?? '' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
  return stage ? createPortal(tray, stage) : tray;
}
