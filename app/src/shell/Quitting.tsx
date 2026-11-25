/* While Quit is still pausing agents after a moment, the desktop shell sends `studio://stopping`:
   the window's content gives way to one calm line until the app exits. No buttons, no spinner,
   nothing to dismiss (design: updates/2026-11-25 MENU BAR STUDIO - OPEN/plan.md §3). */
import { listen } from '@tauri-apps/api/event';
import { type ReactNode, useEffect, useState } from 'react';
import { inTauri } from './in-tauri';

export const STOPPING_EVENT = 'studio://stopping';
export const STOPPING_LINE = "Pausing your agents. They'll carry on next time.";

type Listen = (event: string, on: () => void) => Promise<() => void>;

/** `subscribe` is for tests; in the desktop window it is Tauri's `listen`, in a browser nothing. */
export function Quitting({ children, subscribe }: { children: ReactNode; subscribe?: Listen }) {
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const sub = subscribe ?? (inTauri() ? listen : undefined);
    if (!sub) return;
    const off = sub(STOPPING_EVENT, () => setStopping(true));
    return () => void off.then((f) => f()).catch(() => undefined);
  }, [subscribe]);

  // The live region stays mounted and only its text changes, so VoiceOver announces it once.
  return (
    <>
      {!stopping && children}
      <p role="status" aria-live="polite" className={stopping ? 'quitting' : 'quitting-idle'}>
        {stopping ? STOPPING_LINE : ''}
      </p>
    </>
  );
}
