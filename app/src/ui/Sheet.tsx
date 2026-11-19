/* Sheet — the prototype's focus-trapped dialog (.scrim > .sheet). Escape and a scrim click close
   it; focus moves in on open and goes back to where it was on close. */
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropDismiss } from './backdrop';

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  wide?: boolean;
  className?: string;
  /** Show the ✕ close button (default true). */
  closeButton?: boolean;
  children: ReactNode;
};

export function Sheet({ open, onClose, label, wide, className, closeButton = true, children }: SheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const backdrop = useBackdropDismiss(() => close.current());

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => sheet.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !sheet.current) return;
      const f = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    /* a click on the dimmed background closes it (keyboard: Escape, on document) */
    <div className="scrim" {...backdrop}>
      <div
        ref={sheet}
        className={['sheet', wide && 'wide', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ position: 'relative' }}
      >
        {closeButton && (
          <button
            type="button"
            className="btn btn-ghost btn-sm close"
            aria-label="Close"
            onClick={() => close.current()}
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
