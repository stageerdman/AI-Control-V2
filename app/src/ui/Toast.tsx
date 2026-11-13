/* Toasts — one at a time, bottom centre (.toast), optional Undo. Call toast() from anywhere;
   render <Toaster/> once (the shell does). */
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';

type ToastItem = { id: number; message: ReactNode; undo?: () => void; ms: number };
let current: ToastItem | null = null;
let seq = 0;
const subs = new Set<() => void>();
const emit = () => {
  for (const fn of subs) fn();
};

/** Show a toast. With `undo`, an Undo button runs it (and dismisses). Default 2.8 s, 6 s with undo. */
export function toast(message: ReactNode, opts: { undo?: () => void; ms?: number } = {}): void {
  current = { id: ++seq, message, undo: opts.undo, ms: opts.ms ?? (opts.undo ? 6000 : 2800) };
  emit();
}
export function dismissToast(): void {
  current = null;
  emit();
}

export function Toaster() {
  const t = useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => current,
  );
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => {
      if (current?.id === t.id) dismissToast();
    }, t.ms);
    return () => clearTimeout(timer);
  }, [t]);
  return (
    <div className={`toast${t ? ' show' : ''}`} role="status" aria-live="polite">
      {t?.message}
      {t?.undo && (
        <button
          type="button"
          className="toast-undo"
          onClick={() => {
            t.undo?.();
            dismissToast();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
