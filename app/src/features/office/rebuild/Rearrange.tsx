/* Rearrange (spec-ux-team-rebuild §3, office path): the project as team tables, a solo row and the door. Drag a
   robot to another table, to Solo (= specialist) or to the door (= leaves); keyboard and screen readers use each
   robot's "Move to…" menu. Nothing applies while arranging: the bar reads "N changes" with Cancel / Review, and
   Review opens the same confirm card as the chat path. One card, two ways in. */
import { useEffect, useRef, useState } from 'react';
import { Hero } from '../../../characters';
import { Button } from '../../../ui';
import {
  changesOf,
  type Lineup,
  lineupOf,
  MAX_TEAM,
  type Place,
  placeKey,
  placesOf,
  type RebuildCard as Card,
  rebuildApi,
  seatsAt,
  toRebuild,
} from './api';
import { type FaceOf, RebuildCard } from './RebuildCard';
import './rebuild.css';

export type RearrangeProps = {
  pid: string;
  faceOf: FaceOf;
  /** The director's short name (work going back to them). */
  director: string;
  onClose: () => void;
};

const SOLO: Place = { kind: 'solo' };
const OUT: Place = { kind: 'out' };
const placeName = (l: Lineup, p: Place) =>
  p.kind === 'solo' ? 'Solo (specialist)' : p.kind === 'out' ? 'Leaves the project' : (l.teams.find((t) => t.id === p.teamId)?.name ?? 'a team');

export function Rearrange(p: RearrangeProps) {
  const [lineup, setLineup] = useState<Lineup | null>(null);
  const [err, setErr] = useState('');
  const [from, setFrom] = useState<Record<string, Place>>({});
  const [to, setTo] = useState<Record<string, Place>>({});
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ agent: string; x: number; y: number; back: HTMLElement } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const root = useRef<HTMLDivElement>(null);

  const load = () => {
    setErr('');
    rebuildApi.lineup(p.pid).then(
      (w) => {
        const l = lineupOf(w);
        const at = placesOf(l);
        setLineup(l);
        setFrom(at);
        setTo(at);
        setCard(null);
      },
      () => setErr('Couldn’t read who sits where.'),
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, when it opens
  useEffect(() => {
    load();
    root.current?.focus({ preventScroll: true });
  }, []);

  const name = (a: string) => p.faceOf(a)?.name ?? a;
  const changes = changesOf(from, to);
  const full = (pl: Place) => pl.kind === 'team' && seatsAt(to, pl.teamId) >= MAX_TEAM;

  const place = (agent: string, pl: Place) => {
    if (!lineup || placeKey(to[agent]) === placeKey(pl)) return;
    if (full(pl)) {
      setSaid(`${placeName(lineup, pl)} is full — ${MAX_TEAM} at most.`);
      return;
    }
    setTo((t) => ({ ...t, [agent]: pl }));
    setSaid(`${name(agent)}: ${placeName(lineup, pl)}.`);
  };

  const review = async () => {
    if (!lineup || !changes.length || busy) return;
    setBusy(true);
    setErr('');
    const r = await rebuildApi.plan(p.pid, toRebuild(lineup, from, to));
    setBusy(false);
    if (r.ok) setCard(r.card);
    else setErr(r.error);
  };

  const zones: { key: string; place: Place; title: string; hint?: string; door?: boolean }[] = lineup
    ? [
        ...lineup.teams.map((t) => ({ key: `team:${t.id}`, place: { kind: 'team', teamId: t.id } as Place, title: t.name })),
        { key: 'solo', place: SOLO, title: 'Solo desks', hint: 'Works on their own, as a specialist.' },
        { key: 'out', place: OUT, title: 'The door', hint: 'Leaves this project.', door: true },
      ]
    : [];

  return (
    // biome-ignore lint/a11y/useSemanticElements: an in-room overlay, not a modal dialog element
    <div
      ref={root}
      className="rr"
      role="dialog"
      aria-modal="true"
      aria-label="Rearrange the teams"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !menu) {
          e.stopPropagation();
          p.onClose();
        }
      }}
    >
      <header className="rr-head">
        <div>
          <h2>Rearrange</h2>
          <p>Drag people between tables, to a solo desk, or to the door. Nothing changes until you confirm.</p>
        </div>
        <Button variant="ghost" onDark onClick={p.onClose}>
          Close
        </Button>
      </header>

      {card ? (
        <div className="rr-review">
          <RebuildCard
            card={card}
            faceOf={p.faceOf}
            director={p.director}
            onKept={() => setCard(null)}
            onUndone={load}
          />
        </div>
      ) : (
        <>
          <div className="rr-room">
            {!lineup && !err && <p className="hint">Looking around the room…</p>}
            {zones.map((z) => {
              const here = Object.keys(to).filter((a) => placeKey(to[a]) === z.key);
              return (
                <section
                  key={z.key}
                  aria-label={z.title}
                  className={`rr-zone${z.door ? ' door' : ''}${over === z.key ? ' over' : ''}${full(z.place) ? ' full' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(z.key);
                  }}
                  onDragLeave={() => setOver((o) => (o === z.key ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const a = e.dataTransfer.getData('text/plain');
                    if (a && to[a]) place(a, z.place);
                  }}
                >
                  <h3>
                    {z.title}
                    {z.place.kind === 'team' && (
                      <span className="rb-sub">
                        {' '}
                        · {here.length}/{MAX_TEAM}
                      </span>
                    )}
                  </h3>
                  {z.hint && <p className="hint">{z.hint}</p>}
                  <ul>
                    {here.map((a) => (
                      <li
                        key={a}
                        className={`rr-bot${changes.includes(a) ? ' moved' : ''}`}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', a)}
                      >
                        <span aria-hidden="true">
                          <Hero
                            agent={(p.faceOf(a) ?? { name: name(a) }) as Parameters<typeof Hero>[0]['agent']}
                            size={28}
                            pose="idle"
                            facing="front"
                          />
                        </span>
                        <b>{name(a)}</b>
                        <button
                          type="button"
                          className="rr-to"
                          aria-haspopup="menu"
                          aria-label={`Move ${name(a)} to…`}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenu({ agent: a, x: r.left, y: r.bottom + 4, back: e.currentTarget });
                          }}
                        >
                          Move to…
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {err && (
            <p className="rb-err" role="alert" style={{ padding: '0 18px' }}>
              {err}
            </p>
          )}
          <footer className="rr-bar">
            <b>{changes.length === 0 ? 'No changes yet' : changes.length === 1 ? '1 change' : `${changes.length} changes`}</b>
            <Button variant="ghost" onClick={changes.length ? () => setTo(from) : p.onClose}>
              Cancel
            </Button>
            <Button variant="hero" aria-disabled={!changes.length || busy || undefined} onClick={() => void review()}>
              {busy ? 'Planning…' : 'Review'}
            </Button>
          </footer>
        </>
      )}

      {menu && lineup && (
        <MoveMenu
          x={menu.x}
          y={menu.y}
          options={zones.map((z) => ({
            label: z.title === 'Solo desks' ? 'Solo (specialist)' : z.door ? 'Leaves the project' : z.title,
            current: placeKey(to[menu.agent]) === z.key,
            disabled: full(z.place) && placeKey(to[menu.agent]) !== z.key,
            pick: () => place(menu.agent, z.place),
          }))}
          onClose={() => {
            menu.back.focus({ preventScroll: true });
            setMenu(null);
          }}
        />
      )}
      <p className="sr-only" role="status">
        {said}
      </p>
    </div>
  );
}

function MoveMenu({
  x,
  y,
  options,
  onClose,
}: {
  x: number;
  y: number;
  options: { label: string; current: boolean; disabled: boolean; pick: () => void }[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not([aria-disabled="true"])')?.focus();
  }, []);
  const step = (d: number) => {
    const bs = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    bs[(i + d + bs.length) % bs.length]?.focus();
  };
  return (
    <ul
      ref={ref}
      className="rr-menu"
      role="menu"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          step(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          step(-1);
        }
      }}
    >
      {options.map((o) => (
        <li key={o.label} role="none">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={o.current}
            aria-disabled={o.disabled || undefined}
            onClick={() => {
              if (o.disabled) return;
              o.pick();
              onClose();
            }}
          >
            {o.current ? '✓ ' : ''}
            {o.label}
            {o.disabled ? ' — full' : ''}
          </button>
        </li>
      ))}
    </ul>
  );
}
