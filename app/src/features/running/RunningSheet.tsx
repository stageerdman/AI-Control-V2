/* RUNNING (design/running/running.md): what's running in this project and how to stop it.
   The stage pill shows only while something runs; the sheet lists one row per agent (what it's doing, since
   when, its commands) with Stop, the app last with its own Stop, and one primary action: Stop all agents
   (a short confirm in place). Stopping keeps every chat, so agents can carry on later. */
import { useEffect, useRef, useState } from 'react';
import { type Agent, isApiError, setQueryData } from '../../api';
import { Hero } from '../../characters';
import { Button, Sheet } from '../../ui';
import { ago } from '../office/time';
import { type RunningItem, runningKey, stopItems, useRunning } from './api';
import { type AgentRow, groupRunning, runningCount, without } from './model';
import './running.css';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The stage control: "● 3 running" while anything runs; nothing otherwise. */
export function RunningPill({
  items,
  pressed,
  onClick,
}: {
  items: RunningItem[] | undefined;
  pressed: boolean;
  onClick: () => void;
}) {
  const n = runningCount(groupRunning(items ?? []));
  if (!n) return null;
  return (
    <button
      type="button"
      className="o-ctl rn-pill"
      aria-pressed={pressed}
      aria-label={`${n} running now — see and stop`}
      onClick={onClick}
    >
      <span className="rn-dot" aria-hidden="true" /> {n} running
    </button>
  );
}

export function RunningSheet({
  pid,
  open,
  onClose,
  agents,
}: {
  pid: string;
  open: boolean;
  onClose: () => void;
  agents: Record<string, Agent>;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Running now" className="rn">
      {open && <RunningBody pid={pid} agents={agents} />}
    </Sheet>
  );
}

function RunningBody({ pid, agents }: { pid: string; agents: Record<string, Agent> }) {
  const q = useRunning(pid, 2000);
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the sheet opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const view = groupRunning(q.data ?? []);
  const nameOf = (r: AgentRow) =>
    r.agentId === null ? 'The studio' : (agents[r.agentId]?.name ?? 'An agent');

  const stop = async (key: string, ids: string[], who: string) => {
    setErr(null);
    setStopping((s) => new Set(s).add(key));
    try {
      await stopItems(pid, ids);
      setQueryData<RunningItem[]>(runningKey(pid), (l) => without(l, ids));
    } catch (e) {
      setErr(`Couldn’t stop ${who}. ${isApiError(e) ? e.message : 'Try again.'}`);
    } finally {
      setStopping((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      void refetch().catch(() => undefined);
    }
  };
  const stopAll = async () => {
    setConfirm(false);
    await stop(
      '*',
      view.agents.flatMap((r) => r.ids),
      'everyone',
    );
  };

  return (
    <div className="rn-body">
      <h2>Running now</h2>
      <p className="hint">Stopping keeps their chat, so they can carry on later.</p>
      {!q.data && q.loading && <p className="hint">Looking…</p>}
      {!q.data && q.error && (
        <p className="hint" role="alert">
          Couldn’t read what’s running.{' '}
          <Button small variant="ghost" onClick={() => void refetch()}>
            Try again
          </Button>
        </p>
      )}
      <ul className="rn-list" aria-live="polite" aria-label="Running now">
        {view.agents.map((r) => {
          const key = r.agentId ?? '';
          const who = nameOf(r);
          const busy = stopping.has(key) || stopping.has('*');
          const ag = r.agentId ? agents[r.agentId] : undefined;
          return (
            <li key={key} className="rn-row">
              <Hero agent={ag ?? null} ghost={!ag} size="xs" pose="idle" facing="front" />
              <span className="rn-what">
                <b>{who}</b>
                <span className="rn-doing">
                  {r.doing || 'Working'} · started {ago(r.since)}
                </span>
                {r.commands.length > 0 && (
                  <span className="rn-cmds" title={r.commands.join('\n')}>
                    <span className="sr-only">Running {plural(r.commands.length, 'command')}: </span>
                    {r.commands.map((c, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: commands can repeat; order is stable
                      <code key={i}>{c}</code>
                    ))}
                  </span>
                )}
              </span>
              <Button
                small
                variant="ghost"
                disabled={busy}
                aria-label={`Stop ${who}`}
                onClick={() => void stop(key, r.ids, who)}
              >
                {busy ? 'Stopping…' : 'Stop'}
              </Button>
            </li>
          );
        })}
        {view.app && (
          <li className="rn-row">
            <span className="rn-app" aria-hidden="true">
              ▶
            </span>
            <span className="rn-what">
              <b>The app</b>
              <span className="rn-doing">
                {view.app.label} · started {ago(view.app.startedAt)}
              </span>
            </span>
            <Button
              small
              variant="ghost"
              disabled={stopping.has('app')}
              aria-label="Stop the app"
              onClick={() => view.app && void stop('app', [view.app.id], 'the app')}
            >
              {stopping.has('app') ? 'Stopping…' : 'Stop'}
            </Button>
          </li>
        )}
      </ul>
      {q.data && !view.agents.length && !view.app && <p className="rn-empty">Nothing is running.</p>}
      {err && (
        <p className="rn-err" role="alert">
          {err}
        </p>
      )}
      {view.agents.length > 0 && (
        <footer className="rn-foot">
          {confirm ? (
            <StopAllConfirm
              n={view.agents.length}
              onKeep={() => setConfirm(false)}
              onStop={() => void stopAll()}
            />
          ) : (
            <Button variant="hero" disabled={stopping.has('*')} onClick={() => setConfirm(true)}>
              {stopping.has('*') ? 'Stopping…' : 'Stop all agents'}
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

function StopAllConfirm({ n, onKeep, onStop }: { n: number; onKeep: () => void; onStop: () => void }) {
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  return (
    <div className="rn-confirm" role="alert">
      <span>Stop {n === 1 ? 'the agent' : `all ${n} agents`} now? Their chats are kept.</span>
      <Button small variant="ghost" onClick={onKeep}>
        Keep working
      </Button>
      <Button small variant="dark" ref={go} onClick={onStop}>
        Stop all
      </Button>
    </div>
  );
}
