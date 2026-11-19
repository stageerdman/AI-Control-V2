/* Click the dimmed background to close a panel — one rule for every overlay (Sheet, office cards,
   invite card). It closes only when the press *and* the release both land on the background itself:
   a click inside the panel never does, and neither does a drag (selecting text, moving a slider)
   that starts inside and ends outside. Keyboard users close with Esc; the background is aria-hidden. */
import { type MouseEvent, useRef } from 'react';

export function useBackdropDismiss(onDismiss: (() => void) | undefined) {
  const down = useRef(false);
  return {
    onMouseDown: (e: MouseEvent) => {
      down.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      const ok = down.current && e.target === e.currentTarget;
      down.current = false;
      if (ok) onDismiss?.();
    },
  };
}
