/* In-game look editor: ‹ › beside the bot at each slot's height + one random-look dice.
   Shared by the hero zoom and design-with-Tinker; the caller owns the look and the bot. */
import type { Look } from '../../api/types';
import { LOOK_SLOTS, type LookSlotId, lookAnchors } from '../../characters';
import { lookTag } from './model';

const DICE = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="8.5" cy="8.5" r="1.6" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1.6" fill="currentColor" />
    <circle cx="8.5" cy="15.5" r="1.6" fill="currentColor" />
  </svg>
);

export function LookRig({
  look,
  px,
  onSlot,
  onDice,
}: {
  look: Look;
  px: number;
  onSlot: (slot: LookSlotId, d: 1 | -1) => void;
  onDice: () => void;
}) {
  const ys = lookAnchors(look, px);
  return (
    // biome-ignore lint/a11y/useSemanticElements: the prototype's look rig (a labelled group of arrow pairs)
    <div
      className="lk-rig"
      role="group"
      aria-label="Look"
      style={{ '--fw': `${Math.round(px * 0.75)}px`, height: `${px}px` } as React.CSSProperties}
    >
      {LOOK_SLOTS.map((sl) => {
        const tag = lookTag(look, sl.id);
        const low = sl.label.toLowerCase();
        return (
          // biome-ignore lint/a11y/useSemanticElements: the prototype's labelled arrow pair
          <div
            key={sl.id}
            className="lk-row"
            data-slot={sl.id}
            style={{ top: `${ys[sl.id]}px` }}
            role="group"
            aria-label={tag}
          >
            <button
              type="button"
              className="lk-arrow"
              aria-label={`Previous ${low}`}
              title={`Previous ${low}`}
              onClick={() => onSlot(sl.id, -1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="lk-arrow"
              aria-label={`Next ${low}`}
              title={`Next ${low}`}
              onClick={() => onSlot(sl.id, 1)}
            >
              ›
            </button>
            <span className="lk-tag" aria-hidden="true">
              {tag}
            </span>
          </div>
        );
      })}
      <button
        type="button"
        className="lk-dice"
        aria-label="Random look"
        title="Random look"
        style={{ top: `${Math.max(-46, ys.antenna - 52)}px` }}
        onClick={onDice}
      >
        {DICE}
      </button>
    </div>
  );
}
