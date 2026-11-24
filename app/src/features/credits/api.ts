/* AI Credits Tracker: the plan's usage, live. GET /credits/events sends the whole forecast on connect, after every
   new reading and once a minute (server/src/routes/credits.ts); the stream reconnects by itself. */
import { useEffect, useState } from 'react';
import { openEventStream, type StreamOpts } from '../../api/sse';
import type { Forecast } from './model';

export const CREDITS_STREAM = '/credits/events';

/** The latest forecast (null until the first one) and a clock that ticks each minute. */
export function useCredits(opts: Pick<StreamOpts, 'EventSource'> = {}): {
  forecast: Forecast | null;
  now: number;
} {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: one stream for the app's life
  useEffect(() => {
    const s = openEventStream(
      CREDITS_STREAM,
      (e) => {
        setForecast(e as unknown as Forecast);
        setNow(Date.now());
      },
      { types: ['credits'], ...opts },
    );
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearInterval(tick);
      s.close();
    };
  }, []);
  return { forecast, now };
}
