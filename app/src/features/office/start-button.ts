/* Ready to Test: the office's one Start button, as plain state → words (no React here, so it tests alone).
   idle → Start · starting → Starting… → (after a while) Still building… · opened (desktop) → Opened ·
   failed → Try again, with the server's plain reason and the app's last lines. A website already running
   is not a button at all: it is the "Open app" link. */
import { isApiError } from '../../api';

export type StartPhase =
  | { k: 'idle' }
  | { k: 'starting'; slow: boolean }
  | { k: 'opened' }
  | { k: 'failed'; message: string; log: string[] };

/** When "Starting…" becomes "Still building…" (a first dev build often takes this long). */
export const SLOW_MS = 8_000;
/** How long "Opened" stays before the button reads Start again. */
export const OPENED_MS = 3_000;
const LOG_LINES = 8;

export function startLabel(p: StartPhase): string {
  if (p.k === 'starting') return p.slow ? 'Still building…' : 'Starting…';
  if (p.k === 'opened') return 'Opened';
  if (p.k === 'failed') return 'Try again';
  return 'Start';
}

/** The failure to show: the server's own sentence (it is written for people) + up to 8 last log lines. */
export function failureOf(e: unknown): { message: string; log: string[] } {
  if (!isApiError(e)) return { message: 'Couldn’t start it — try again.', log: [] };
  const raw = (e.details as { log?: unknown } | undefined)?.log;
  const log = Array.isArray(raw)
    ? raw.filter((l): l is string => typeof l === 'string').slice(-LOG_LINES)
    : [];
  return { message: e.message, log };
}
