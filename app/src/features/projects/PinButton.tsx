/* The pin: one tap pins a project to My Workplace, one tap unpins it. A sibling of the card's own
   button (never inside it), in the top-right of a .pcard-slot. Faint until the card is hovered or
   focused; solid when pinned. `focusTick`: set (and bumped) when this card just changed shelf, so
   focus follows it there and a keyboard user keeps their place. */
import { useEffect, useRef } from 'react';

export function PinButton({
  name,
  pinned,
  onToggle,
  focusTick,
}: {
  name: string;
  pinned: boolean;
  onToggle: () => void;
  focusTick?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusTick) ref.current?.focus();
  }, [focusTick]);
  const label = `${pinned ? 'Unpin' : 'Pin'} ${name}`;
  return (
    <button
      ref={ref}
      type="button"
      className={`pin-btn${pinned ? ' on' : ''}`}
      aria-label={label}
      aria-pressed={pinned}
      title={label}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M15 3l6 6-2.5 1-3.5 3.5.5 4.5-2 2-4-4-5.5 5.5-1-1L8.5 15l-4-4 2-2 4.5.5L14.5 6z"
          fill={pinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
