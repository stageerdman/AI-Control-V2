/* AI Credits Tracker, server side: every run's limit readings come in here (claude-cli.ts › onLimits), are stored
   when they change, and whoever watches (GET /credits/events) hears the new view at once. */
import type { Db } from '../db/connection.ts';
import type { Store } from '../db/store.ts';
import { readSpans } from '../performance/spans.ts';
import { type Forecast, forecast } from './forecast.ts';
import type { LimitReading } from './reading.ts';
import { type AgentShare, shareOf } from './share.ts';
import { limitStore } from './store.ts';

export type CreditsView = Forecast & {
  /** The studio's own tokens in the binding window, per agent (most first). */
  studioShare: (AgentShare & { name: string })[];
};
type Watcher = (view: CreditsView) => void;

export type CreditsDeps = {
  db: Db;
  store: Store;
  now?: () => number;
  /** A reading that can't be stored never fails the run it came from: it is reported here instead. */
  report?: (message: string, context: Record<string, unknown>) => void;
};

export function createCredits({
  db,
  store,
  now = Date.now,
  report = (message, context) => console.error(`[credits] ${message}`, context),
}: CreditsDeps) {
  const readings = limitStore(db);
  const watchers = new Set<Watcher>();

  const studioShare = (f: Forecast): CreditsView['studioShare'] => {
    const opensAt = f.windows.find((w) => w.name === f.binding)?.opensAt;
    if (!opensAt) return [];
    const spans = store.projects.list().flatMap((p) => readSpans(db, p.id));
    return shareOf(spans, Date.parse(opensAt)).map((s) => ({
      ...s,
      name: store.agents.get(s.agentId)?.name ?? s.agentId,
    }));
  };
  const view = (): CreditsView => {
    const f = forecast(readings.all(), now());
    return { ...f, studioShare: studioShare(f) };
  };

  return {
    view,
    /** A run's reading: stored if anything changed, then told to every watcher. Never throws. */
    record(reading: LimitReading): void {
      try {
        if (!readings.record(reading) || !watchers.size) return;
        const v = view();
        for (const w of watchers) w(v);
      } catch (e) {
        report('Could not record a usage reading', {
          at: reading.at,
          windows: reading.windows.map((w) => w.name),
          error: (e as Error).message,
        });
      }
    },
    /** Returns the unsubscribe function. */
    watch(fn: Watcher): () => void {
      watchers.add(fn);
      return () => watchers.delete(fn);
    },
  };
}
export type Credits = ReturnType<typeof createCredits>;
