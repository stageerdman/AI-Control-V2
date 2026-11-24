/* "Built for you" (design/team-built-card.md): the card in the director's chat after the Agent Creator built a team
   from the user's yes. It shows the team, its people, the captain and the yes. Each row: Edit (opens it in the
   Cast, where its name and everything else change) and, for what this build made, Remove (Undo on the row).
   Remove all takes the whole build back, with Undo. Names and looks are live from the Cast. */
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '../../../api';
import type { Agent, Team } from '../../../api/types';
import { Emblem, Hero } from '../../../characters';
import { go } from '../../../shell/router';
import { useCast } from '../../cast/store';
import {
  bringAllBack,
  bringOneBack,
  builtApi,
  plainError,
  removeAll,
  removedOne,
  removeOne,
  requestsKey,
  type TeamRequest,
} from './api';
import './built.css';

export type BuiltCardProps = {
  pid: string;
  requestId: string;
  /** The chat line ("Tinker built The Tide Tellers for you: …"): who built it, and the fallback text. */
  text: string;
};

/** "Tinker built The Tide Tellers for you: …" → "Tinker". */
export const builderOf = (text: string) => /^(.+?) built /.exec(text)?.[1] ?? 'The Agent Creator';

/** "2:14 PM" today, else "Nov 24, 2:14 PM". */
export function whenSaid(at: string, now = new Date()): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function BuiltCard({ pid, requestId, text }: BuiltCardProps) {
  const q = useQuery(requestsKey(pid), () => builtApi.list(pid));
  const req = q.data?.find((r) => r.id === requestId);
  /* a card newer than the cached list: read it once more */
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (q.data && !req && !q.fetching && !asked) {
      setAsked(true);
      void q.refetch();
    }
  }, [q, req, asked]);
  const cast = useCast();
  if (req?.built && cast.agents && cast.teams)
    return <Card pid={pid} req={req} builder={builderOf(text)} agents={cast.agents} teams={cast.teams} />;
  const lost = !!q.error || (asked && !q.fetching && !req) || (!!req && !req.built);
  return lost ? <p className="bc-line">{text}</p> : null;
}

type Row = { kind: 'team' | 'agent'; id: string; live: Agent | Team | null; fresh: boolean };

function Card(p: { pid: string; req: TeamRequest; builder: string; agents: Agent[]; teams: Team[] }) {
  const { pid, req } = p;
  const built = req.built as NonNullable<TeamRequest['built']>;
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [said, setSaid] = useState('');
  const team = p.teams.find((t) => t.id === built.teamId) ?? null;
  /* seated people first, in their seats; then new agents no longer seated */
  const seated = team?.members.map((m) => m.agentId) ?? [];
  const rows: Row[] = [
    { kind: 'team', id: built.teamId, live: team, fresh: true },
    ...[...seated, ...built.agentIds.filter((a) => !seated.includes(a))].map((a) => ({
      kind: 'agent' as const,
      id: a,
      live: p.agents.find((x) => x.id === a) ?? null,
      fresh: built.agentIds.includes(a),
    })),
  ];
  const teamName = team?.name ?? removedOne(built.teamId)?.name ?? 'the team';

  const run = async (key: string, job: () => Promise<void>, done: string, fallback: string, who?: string) => {
    if (busy) return;
    setBusy(key);
    setErr('');
    try {
      await job();
      setSaid(done);
    } catch (x) {
      setErr(plainError(x, fallback, who));
    } finally {
      setBusy(null);
    }
  };

  if (req.undoneAt) {
    const n = built.agentIds.length;
    return (
      <p className="bc-line" role="status">
        <span>
          Removed {teamName}
          {n ? ` and ${n === 1 ? 'its new agent' : `its ${n} new agents`}` : ''}. They’re in Recently deleted.
        </span>
        {!!built.restoreTokens?.length && (
          <button
            type="button"
            className="bc-text"
            aria-disabled={!!busy || undefined}
            onClick={() =>
              void run('all', () => bringAllBack(pid, req.id), `${teamName} is back.`, 'Couldn’t bring them back.')
            }
          >
            {busy === 'all' ? 'Bringing back…' : 'Undo'}
          </button>
        )}
        {err && <span className="bc-err">{err}</span>}
      </p>
    );
  }

  const title = `${id}-t`;
  return (
    <section className="bc-card" aria-labelledby={title} aria-busy={!!busy || undefined}>
      <h3 id={title} className="bc-eyebrow">
        {p.builder} built {teamName} for you
      </h3>
      <ul className="bc-rows">
        {rows.map((r) => (
          <RowLine
            key={r.id}
            r={r}
            captain={r.id === team?.captainId}
            busy={busy}
            edit={() => go(r.kind === 'team' ? { name: 'cast.team', id: r.id } : { name: 'cast.agent', id: r.id })}
            remove={(name) =>
              void run(
                r.id,
                () =>
                  removeOne(
                    pid,
                    r.kind === 'team'
                      ? { kind: 'team', team: r.live as Team }
                      : { kind: 'agent', agent: r.live as Agent },
                  ),
                `${name} removed.`,
                `Couldn’t remove ${name}.`,
                name,
              )
            }
            undo={(name) =>
              void run(r.id, () => bringOneBack(pid, r.id), `${name} is back.`, `Couldn’t bring ${name} back.`)
            }
          />
        ))}
      </ul>
      {err && (
        <p className="bc-err" role="alert">
          {err}
        </p>
      )}
      <footer className="bc-foot">
        <p className="bc-yes">
          You said <q>{req.yes.words}</q> <time dateTime={req.yes.at}>· {whenSaid(req.yes.at)}</time>
        </p>
        <button
          type="button"
          className="bc-text soft"
          aria-disabled={!!busy || undefined}
          onClick={() =>
            void run('all', () => removeAll(pid, req.id), `${teamName} removed.`, 'Couldn’t remove the build.')
          }
        >
          {busy === 'all' ? 'Removing…' : 'Remove all'}
        </button>
      </footer>
      <p className="sr-only" role="status">
        {said}
      </p>
    </section>
  );
}

function RowLine(p: {
  r: Row;
  captain: boolean;
  busy: string | null;
  edit: () => void;
  remove: (name: string) => void;
  undo: (name: string) => void;
}) {
  const { r } = p;
  const gone = !r.live;
  const kept = removedOne(r.id);
  const name = r.live?.name ?? kept?.name ?? (r.kind === 'team' ? 'The team' : 'An agent');
  const agent = r.kind === 'agent' ? (r.live as Agent | null) : null;
  const sub = gone
    ? kept
      ? 'Removed'
      : 'Removed · in Recently deleted'
    : r.kind === 'team'
      ? 'Team · on this project'
      : [agent?.role, p.captain ? 'captain' : '', r.fresh ? '' : 'already in the Cast'].filter(Boolean).join(' · ');
  const mine = p.busy === r.id;
  return (
    <li className={`bc-row${r.kind === 'team' ? ' team' : ''}${gone ? ' gone' : ''}`}>
      <span className="bc-face" aria-hidden="true">
        {r.kind === 'team' ? (
          r.live && <Emblem team={r.live as Team} size={30} decorative />
        ) : (
          <Hero agent={agent ?? { name }} ghost={gone} size={32} pose="idle" facing="front" />
        )}
      </span>
      <span className="bc-who">
        <span className="bc-name">{name}</span>
        {sub && <span className="bc-sub">{sub}</span>}
      </span>
      <span className="bc-acts">
        {gone ? (
          kept && (
            <button
              type="button"
              className="bc-text"
              aria-label={`Bring back ${name}`}
              aria-disabled={!!p.busy || undefined}
              onClick={() => p.undo(name)}
            >
              {mine ? 'Bringing back…' : 'Undo'}
            </button>
          )
        ) : (
          <>
            <button type="button" className="bc-text" aria-label={`Edit ${name}`} onClick={p.edit}>
              Edit
            </button>
            {r.fresh && (
              <button
                type="button"
                className="bc-text soft"
                aria-label={`Remove ${name}`}
                aria-disabled={!!p.busy || undefined}
                onClick={() => p.remove(name)}
              >
                {mine ? 'Removing…' : 'Remove'}
              </button>
            )}
          </>
        )}
      </span>
    </li>
  );
}
