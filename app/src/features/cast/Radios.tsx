/* Radio group with roving tabindex; arrows move + select (ARIA radio pattern) — the prototype's
   cxRadios, used for the team colour swatches and the emblem picker. */
import { type ReactNode, useRef } from 'react';
import { COLOR_NAMES, HUES, PALETTE } from '../../design/palette';

export type RadioItem = { value: string; label: string; title?: string; content: ReactNode };

export function Radios({
  label,
  items,
  value,
  onPick,
  className = '',
  onHover,
  onLeave,
  autoFocus,
  describedBy,
}: {
  describedBy?: string;
  label: string;
  items: RadioItem[];
  value: string;
  onPick: (v: string) => void;
  className?: string;
  onHover?: (v: string) => void;
  onLeave?: () => void;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const cur = Math.max(
    0,
    items.findIndex((it) => it.value === value),
  );
  const move = (j: number) => {
    refs.current[j]?.focus();
    const it = items[j];
    if (it && it.value !== value) onPick(it.value);
  };
  return (
    <div
      className={`cx-radios ${className}`}
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      onMouseLeave={onLeave}
      onKeyDown={(e) => {
        const i = refs.current.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[
          e.key
        ];
        let j: number | null = null;
        if (step) j = (i + step + items.length) % items.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = items.length - 1;
        else return;
        e.preventDefault();
        e.stopPropagation();
        move(j);
      }}
    >
      {items.map((it, i) => (
        // biome-ignore lint/a11y/useSemanticElements: button radios (roving tabindex)
        <button
          key={it.value}
          ref={(el) => {
            refs.current[i] = el;
            if (el && autoFocus && i === cur && !el.dataset.focused) {
              el.dataset.focused = '1';
              setTimeout(() => el.focus(), 0);
            }
          }}
          type="button"
          role="radio"
          className="cx-radio"
          data-value={it.value}
          aria-checked={it.value === value}
          aria-label={it.label}
          title={it.title}
          tabIndex={i === cur ? 0 : -1}
          onClick={() => it.value !== value && onPick(it.value)}
          onMouseEnter={onHover ? () => onHover(it.value) : undefined}
        >
          {it.content}
        </button>
      ))}
    </div>
  );
}

const CHECK = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
      fill="none"
      stroke="#241a44"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function HueSwatches({
  value,
  onPick,
  label = 'Colour',
}: {
  value: string;
  onPick: (v: string) => void;
  label?: string;
}) {
  return (
    <Radios
      label={label}
      className="swatches"
      value={value}
      onPick={onPick}
      items={HUES.map((h) => ({
        value: h,
        label: `${label} ${COLOR_NAMES[h]}`,
        title: COLOR_NAMES[h],
        content: (
          <span className="sw" style={{ '--c': PALETTE[h] } as React.CSSProperties}>
            {CHECK}
          </span>
        ),
      }))}
    />
  );
}
