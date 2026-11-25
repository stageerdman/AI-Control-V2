/* The one auto-growing message box. A textarea grows with its text, line by line, up to a cap
   (40% of the window, at most 10 lines); past the cap it scrolls inside. Empty goes back to one line.
   Measured in a layout effect (height auto → scrollHeight in the same frame), so it never flickers. */
import { type RefObject, useCallback, useEffect, useLayoutEffect } from 'react';

const MAX_LINES = 10;

const px = (v: string) => Number.parseFloat(v) || 0;

/** Default cap: 40% of the window, and no more than 10 lines of text (plus padding and border). */
function defaultMax(el: HTMLTextAreaElement, cs: CSSStyleDeclaration): number {
  const line = px(cs.lineHeight) || px(cs.fontSize) * 1.4 || 20;
  const chrome = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  const lines = MAX_LINES * line + chrome;
  const share = (el.ownerDocument.defaultView?.innerHeight ?? 800) * 0.4;
  return Math.max(Math.min(share, lines), line + chrome);
}

/** Fit `el` to its text now. Exported for tests and for callers that resize outside React. */
export function fitTextarea(el: HTMLTextAreaElement, maxPx?: number): void {
  if (el.value === '') {
    el.style.height = '';
    el.style.overflowY = 'hidden';
    return;
  }
  const cs = getComputedStyle(el);
  const keep = el.scrollTop;
  el.style.height = 'auto';
  const border = cs.boxSizing === 'border-box' ? px(cs.borderTopWidth) + px(cs.borderBottomWidth) : 0;
  const pad = cs.boxSizing === 'border-box' ? 0 : -(px(cs.paddingTop) + px(cs.paddingBottom));
  const want = el.scrollHeight + border + pad;
  const max = maxPx ?? defaultMax(el, cs);
  if (want > max) {
    el.style.height = `${max}px`;
    el.style.overflowY = 'auto';
    el.scrollTop = keep;
  } else {
    el.style.height = `${want}px`;
    el.style.overflowY = 'hidden';
  }
}

export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts?: { maxPx?: number },
): void {
  const maxPx = opts?.maxPx;
  const fit = useCallback(() => {
    const el = ref.current;
    /* a hidden box measures 0: leave it as it was until it shows again */
    if (el && (el.value === '' || el.scrollHeight > 0)) fitTextarea(el, maxPx);
  }, [ref, maxPx]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit whenever the text changes
  useLayoutEffect(fit, [fit, value]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);
}
