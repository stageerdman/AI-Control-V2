/* The work clock above the director's safe (OFFICE): how long the crew has worked on this project. A calm sheet —
   the total, the kinds of work (rows with a thin share bar), who put it in, runs and turns. Agent time adds
   parallel runs up; no money anywhere (runs use the user's subscription). Running work counts up: the server
   counts it to "now", and we read again while anything is live. */
import { useEffect } from 'react';
import { type Agent, useQuery } from '../../api';
import { Hero } from '../../characters';
import { Button, Pill, Sheet } from '../../ui';
import { keys, officeApi, type WorkTime } from './api';
import { worked } from './time';

/** The project's work clock; re-read every `everyMs` while agents are working. */
export function useWorkTime(pid: string, everyMs: number) {
  const q = useQuery<WorkTime>(keys.time(pid), () => officeApi.time(pid));
  const live = (q.data?.live ?? 0) > 0;
  const { refetch } = q;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refetch().catch(() => undefined), everyMs);
    return () => clearInterval(t);
  }, [live, everyMs, refetch]);
  return q;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** The wall clock's label (it is the button that opens Agent time). */
export function clockLabel(t: WorkTime | undefined): string {
  if (!t || (!t.totalMs && !t.live)) return 'Agent time: none yet';
  const now = t.live ? `, ${plural(t.live, 'agent')} working now` : '';
  return `Agent time: ${worked(t.totalMs)}${now}`;
}

export function TimeSheet({
  pid,
  name,
  open,
  onClose,
  agents,
}: {
  pid: string;
  name: string;
  open: boolean;
  onClose: () => void;
  agents: Record<string, Agent>;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={`Agent time on ${name}`}>
      {open && <TimeBody pid={pid} name={name} agents={agents} />}
    </Sheet>
  );
}

function TimeBody({ pid, name, agents }: { pid: string; name: string; agents: Record<string, Agent> }) {
  const q = useWorkTime(pid, 30_000);
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the sheet opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const t = q.data;
  return (
    <div className="ts">
      <h2>Agent time</h2>
      {!t && q.loading && <p className="hint">Reading the clock…</p>}
      {!t && q.error && (
        <p className="hint" role="alert">
          Couldn’t read the clock: {q.error instanceof Error ? q.error.message : String(q.error)}{' '}
          <Button small variant="ghost" onClick={() => void refetch()}>
            Try again
          </Button>
        </p>
      )}
      {t && <TimeView t={t} name={name} agents={agents} />}
    </div>
  );
}

export function TimeView({ t, name, agents }: { t: WorkTime; name: string; agents: Record<string, Agent> }) {
  const empty = !t.totalMs && !t.live && !t.runs;
  return (
    <>
      <p className="hint">
        {empty || !t.since
          ? `Everything the crew works on ${name} adds up here.`
          : `Everything the crew has worked on ${name} since ${shortDate(t.since)}.`}
      </p>
      <div className="ts-total">
        <b>{worked(t.totalMs)}</b>
        {t.live > 0 && (
          <Pill tone="live" dot>
            {t.live} working now
          </Pill>
        )}
      </div>
      {empty ? (
        <p className="ts-empty">No agent time yet. The clock starts when the crew does.</p>
      ) : (
        <>
          <p className="hint">
            {plural(t.runs, 'run')} · {plural(t.turns, 'turn')}
          </p>
          <h3>Kind of work</h3>
          <ul className="ts-kinds">
            {t.byKind
              .filter((k) => k.ms > 0)
              .map((k) => (
                <li key={k.kind}>
                  <span>{k.label}</span>
                  <span className="ts-num">{worked(k.ms)}</span>
                  <div className="progress sm" aria-hidden="true">
                    <div
                      className="fill"
                      style={{ width: `${t.totalMs ? Math.max(2, (100 * k.ms) / t.totalMs) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
          <h3>Who put it in</h3>
          <ul className="ts-who">
            {t.byAgent.map((a) => {
              const ag = agents[a.agentId];
              return (
                <li key={a.agentId}>
                  <Hero agent={ag ?? null} ghost={!ag} size="xs" pose="idle" facing="front" />
                  <span className="ts-name">
                    <b>{ag?.name ?? 'A retired agent'}</b>
                    {ag?.role && <span className="hint">{ag.role}</span>}
                  </span>
                  <span className="ts-num">
                    {worked(a.ms)} <span className="hint">{plural(a.runs, 'run')}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
