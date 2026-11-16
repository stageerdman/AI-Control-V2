/* In-game look editor: ‹ › beside the bot at each slot's height, the slot tag opens a parts tray
   (LookTray: see them all, try on, pick), one random-look dice, and — when the caller offers it —
   ↺ Undo look beside the dice. Shared by the hero zoom and design-with-Tinker; the caller owns the
   look, the bot and the saving. */
import { useRef, useState } from 'react';
import type { Look } from '../../api/types';
import { LOOK_SLOTS, type LookSlotId, lookAnchors } from '../../characters';
import { type CloseWhy, LookTray } from './LookTray';
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

const PLURAL_LOW: Record<LookSlotId, string> = {
  antenna: 'antennas',
  hat: 'hats',
  face: 'faces',
  body: 'bodies',
  tool: 'tools',
  hue: 'colours',
};

export function LookRig({
  look,
  px,
  name,
  onSlot,
  onDice,
  onTry,
  onPick,
  undo,
}: {
  look: Look;
  px: number;
  /** the agent's name (thumbnails carry it, like the big bot) */
  name?: string;
  onSlot: (slot: LookSlotId, d: 1 | -1) => void;
  onDice: () => void;
  /** a tray option under the pointer / focus: show it on the bot (null = back to `look`). Never saves. */
  onTry?: (look: Look | null) => void;
  /** a tray option chosen (a different one than `look`). */
  onPick?: (slot: LookSlotId, look: Look) => void;
  /** ↺ Undo look, shown only while given: its accessible name and what it does. */
  undo?: { label: string; onUndo: () => void };
}) {
  const [open, setOpen] = useState<LookSlotId | null>(null);
  const [trial, setTrial] = useState<Look | null>(null);
  const tags = useRef<Partial<Record<LookSlotId, HTMLButtonElement | null>>>({});
  /* the arrows follow the bot as it is shown (a tried-on body moves them) */
  const ys = lookAnchors(trial ?? look, px);
  const tray = !!onPick;

  const tryOn = (l: Look | null) => {
    setTrial(l);
    onTry?.(l);
  };
  const close = (why: CloseWhy) => {
    const slot = open;
    tryOn(null);
    setOpen(null);
    if (why === 'dismiss' && slot) tags.current[slot]?.focus();
  };
  const pick = (slot: LookSlotId, l: Look) => {
    setTrial(null);
    setOpen(null);
    if (l[slot] !== look[slot]) onPick?.(slot, l);
    else onTry?.(null);
    tags.current[slot]?.focus();
  };

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
        const isOpen = open === sl.id;
        return (
          // biome-ignore lint/a11y/useSemanticElements: the prototype's labelled arrow pair
          <div
            key={sl.id}
            className={`lk-row${isOpen ? ' open' : ''}`}
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
            {tray ? (
              <button
                type="button"
                ref={(el) => {
                  tags.current[sl.id] = el;
                }}
                className="lk-tag"
                aria-label={`${tag} — show all ${PLURAL_LOW[sl.id]}`}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                onClick={() => {
                  if (isOpen) return close('dismiss');
                  tryOn(null);
                  setOpen(sl.id);
                }}
              >
                {tag}
                <span className="lk-caret" aria-hidden="true">
                  ▾
                </span>
              </button>
            ) : (
              <span className="lk-tag" aria-hidden="true">
                {tag}
              </span>
            )}
            {isOpen && (
              <LookTray
                key={sl.id}
                slot={sl.id}
                look={look}
                name={name}
                anchor={tags.current[sl.id]}
                onTry={tryOn}
                onPick={(l) => pick(sl.id, l)}
                onClose={close}
              />
            )}
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
      {undo && (
        <button
          type="button"
          className="lk-undo"
          aria-label={undo.label}
          title={undo.label}
          style={{ top: `${Math.max(-46, ys.antenna - 52) + 4}px` }}
          onClick={undo.onUndo}
        >
          <span aria-hidden="true">↺</span> Undo look
        </button>
      )}
    </div>
  );
}
