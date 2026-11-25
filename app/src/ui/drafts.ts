/* Unsent messages, kept per chat. What you typed and didn't send is still there when you come back:
   after switching chats, leaving the office, or quitting the app (localStorage; Tauri's WebView keeps it).
   One key per project and person, so a draft never shows in someone else's chat. No UI: it just works. */
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';

const PREFIX = 'aistudio.draft:';
const WAIT_MS = 300;

export const draftKey = (projectId: string, personId: string): string => `${PREFIX}${projectId}:${personId}`;

/** Saves waiting for their debounce: key → text. */
const pending = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>();

function write(key: string, text: string): void {
  try {
    if (text) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    /* storage full or blocked: the text stays in the box, nothing breaks */
  }
}

export function loadDraft(key: string): string {
  const p = pending.get(key);
  if (p) return p.text;
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

/** Debounced (one timer per key). Empty text removes the draft. */
export function saveDraft(key: string, text: string): void {
  const p = pending.get(key);
  if (p) clearTimeout(p.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    write(key, text);
  }, WAIT_MS);
  pending.set(key, { text, timer });
}

/** Removes the draft now and cancels any save still waiting for it. */
export function clearDraft(key: string): void {
  const p = pending.get(key);
  if (p) clearTimeout(p.timer);
  pending.delete(key);
  write(key, '');
}

/** Writes every waiting save now. */
export function flushDrafts(): void {
  for (const [key, p] of pending) {
    clearTimeout(p.timer);
    write(key, p.text);
  }
  pending.clear();
}

/* Leaving a box, hiding or closing the window: write now. Quit events alone aren't enough (Tauri may skip them). */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushDrafts);
  window.addEventListener('beforeunload', flushDrafts);
  document.addEventListener('focusout', flushDrafts);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDrafts();
  });
}

/** Where the cursor was in each chat, for this session. */
const cursors = new Map<string, [number, number]>();

/**
 * The text of one chat's message box, kept as a draft under `key`. A new key swaps in that chat's own
 * draft in the same render, so the old text never shows in the new chat. `setText('')` (a send) clears
 * the draft. A setter kept from an earlier key (a send that failed after you switched) writes to that
 * key's draft, never the box on screen. Pass the box's ref to bring the cursor back when you return.
 */
export function useDraft(
  key: string,
  ref?: RefObject<HTMLTextAreaElement | null>,
): [string, (next: string | ((prev: string) => string)) => void] {
  const [st, setSt] = useState(() => ({ key, text: loadDraft(key) }));
  let cur = st;
  if (st.key !== key) {
    const el = ref?.current;
    if (el) cursors.set(st.key, [el.selectionStart, el.selectionEnd]);
    cur = { key, text: loadDraft(key) };
    setSt(cur);
  }
  const shown = useRef(cur);
  shown.current = cur;

  const setText = useCallback(
    (next: string | ((prev: string) => string)) => {
      const onScreen = shown.current.key === key;
      const prev = onScreen ? shown.current.text : loadDraft(key);
      const v = typeof next === 'function' ? next(prev) : next;
      if (v) saveDraft(key, v);
      else clearDraft(key);
      if (!onScreen) return;
      shown.current = { key, text: v };
      setSt(shown.current);
    },
    [key],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the chat changes
  useLayoutEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const [a, b] = cursors.get(key) ?? [el.value.length, el.value.length];
    el.setSelectionRange(Math.min(a, el.value.length), Math.min(b, el.value.length));
  }, [key]);

  return [cur.text, setText];
}

/** Tests only: forget waiting saves and cursors. */
export function resetDraftsForTests(): void {
  for (const p of pending.values()) clearTimeout(p.timer);
  pending.clear();
  cursors.clear();
}
