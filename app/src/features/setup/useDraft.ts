/* The draft on screen. The query cache entry `draft:<id>` is the one copy: edits land there at
   once and reach the server as a PATCH (typing is debounced; anything pending is flushed before a
   step change and when you leave — "saved as you go"). Crew replies (chat, accept) write into the
   same entry, so a reply that lands after you left is there when you come back. */
import { useCallback, useEffect } from 'react';
import { type Draft, type DraftPatch, getQueryData, setQueryData, studio, useQuery } from '../../api';
import { toast } from '../../ui';
import { DRAFTS_KEY } from './drafts';

export const draftKey = (id: string) => `draft:${id}`;
const DEBOUNCE_MS = 400;
const pending = new Map<string, { patch: DraftPatch; timer: ReturnType<typeof setTimeout> }>();

/** Merge into the cached draft (and the Projects list) without a request. */
export function putDraft(id: string, patch: Partial<Draft>): void {
  setQueryData<Draft>(draftKey(id), (prev) => ({ ...(prev as Draft), ...patch }));
  const list = getQueryData<Draft[]>(DRAFTS_KEY);
  if (list)
    setQueryData(
      DRAFTS_KEY,
      list.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
}

async function send(id: string, patch: DraftPatch): Promise<void> {
  try {
    await studio.drafts.update(id, patch);
  } catch (e) {
    toast(`Couldn’t save the draft — ${(e as Error).message}`);
    throw e;
  }
}

/** Send whatever is waiting for this draft now. */
export function flushDraft(id: string): Promise<void> {
  const p = pending.get(id);
  if (!p) return Promise.resolve();
  clearTimeout(p.timer);
  pending.delete(id);
  return send(id, p.patch).catch(() => undefined);
}

export function useDraft(id: string) {
  const q = useQuery(draftKey(id), () => studio.drafts.get(id));

  /** Typing: shows now, saves a moment later. */
  const edit = useCallback(
    (patch: DraftPatch) => {
      putDraft(id, patch as Partial<Draft>);
      const prev = pending.get(id);
      if (prev) clearTimeout(prev.timer);
      const merged = { ...prev?.patch, ...patch };
      pending.set(id, {
        patch: merged,
        timer: setTimeout(() => void flushDraft(id), DEBOUNCE_MS),
      });
    },
    [id],
  );

  /** A step change or a choice: shows now, saved right away (with anything pending). Rejects on failure. */
  const save = useCallback(
    async (patch: DraftPatch) => {
      putDraft(id, patch as Partial<Draft>);
      const prev = pending.get(id);
      if (prev) {
        clearTimeout(prev.timer);
        pending.delete(id);
      }
      await send(id, { ...prev?.patch, ...patch });
    },
    [id],
  );

  useEffect(() => () => void flushDraft(id), [id]);

  return { ...q, edit, save };
}
