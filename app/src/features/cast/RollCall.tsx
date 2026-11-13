/* Cast → Teams: the roll call. Each team stands as a group on its own little stage (captain front
   and centre with the armband, the crew in a shallow V behind), its emblem and name beside it.
   Hover / keyboard focus = a team-coloured stage light, emblem glow, crew turns + hops, the
   captain salutes. Ghost row at the end = new team. ↑/↓ move between rows. */
import { useRef } from 'react';
import type { Agent, Team } from '../../api/types';
import { Emblem, Hero, setFacing, setPose } from '../../characters';
import { hueHex } from '../../design/palette';
import { go } from '../../shell/router';
import { hop, reducedMotion } from './fx';
import { capLine, orderedMembers, ROW_OFFS, rowStep } from './model';

export const STAR = (
  <svg className="star" viewBox="-10 -10 20 20" aria-hidden="true" focusable="false">
    <path d="M0 -8 L2.4 -2.6 L8 -2.5 L3.7 1.2 L5 6.8 L0 3.8 L-5 6.8 L-3.7 1.2 L-8 -2.5 L-2.4 -2.6Z" />
  </svg>
);

export function RollCall({ teams, agents, hidden }: { teams: Team[]; agents: Agent[]; hidden?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const byId = new Map(agents.map((a) => [a.id, a]));
  return (
    // biome-ignore lint/a11y/useSemanticElements: the prototype's roll call list
    <div
      ref={list}
      className="rollcall"
      role="list"
      aria-label="Teams"
      inert={hidden || undefined}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const rows = [...(list.current?.querySelectorAll<HTMLElement>('.team-row') ?? [])];
        const i = rows.indexOf(document.activeElement as HTMLElement);
        if (i < 0) return;
        e.preventDefault();
        rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }}
    >
      {!teams.length && <p className="rc-empty">Teams let the director call a whole crew at once.</p>}
      {teams.map((t) => (
        <TeamRow key={t.id} team={t} byId={byId} />
      ))}
      <GhostRow />
    </div>
  );
}

/** hover = focus-visible: stage light, emblem glow, crew hop, captain salute */
function rowHot(b: HTMLElement, on: boolean) {
  if (b.classList.contains('hot') === on) return;
  b.classList.toggle('hot', on);
  const list = b.closest('.rollcall');
  list?.classList.toggle('has-hot', !!list.querySelector('.team-row.hot'));
  if (reducedMotion()) return;
  [...b.querySelectorAll<HTMLElement & { _t?: ReturnType<typeof setTimeout> }>('.tr-m')].forEach((w, i) => {
    const h = w.querySelector<HTMLElement>('.hero');
    if (!h || h.classList.contains('ghost')) return;
    clearTimeout(w._t);
    if (on)
      w._t = setTimeout(() => {
        setFacing(h, 'front');
        hop(h);
        if (w.classList.contains('is-cap')) setPose(h, 'salute');
      }, i * 50);
    else {
      setFacing(h, (w.dataset.facing as 'front') || 'three-quarter', {
        dir: (w.dataset.dir as 'left') || 'right',
      });
      setPose(h, 'idle');
    }
  });
}
const hotHandlers = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => rowHot(e.currentTarget, true),
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget;
    if (!(document.activeElement === b && b.matches(':focus-visible'))) rowHot(b, false);
  },
  onFocus: (e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.matches(':focus-visible')) rowHot(e.currentTarget, true);
  },
  onBlur: (e: React.FocusEvent<HTMLButtonElement>) => rowHot(e.currentTarget, false),
};

function TeamRow({ team: t, byId }: { team: Team; byId: Map<string, Agent> }) {
  const n = t.members.length;
  const cap = t.captainId ? byId.get(t.captainId) : undefined;
  return (
    // biome-ignore lint/a11y/useSemanticElements: the prototype's list markup
    <div className="tr-li" role="listitem">
      <button
        type="button"
        className="team-row"
        data-id={t.id}
        style={{ '--team': hueHex(t.color) } as React.CSSProperties}
        aria-label={`${t.name}. ${n} member${n === 1 ? '' : 's'}${t.captainId ? `, captain ${cap?.name ?? 'none yet'}` : ''}. ${t.blurb || ''}`}
        onClick={() => go(`cast/teams/${t.id}`)}
        {...hotHandlers}
      >
        <span className="tr-stage" aria-hidden="true">
          <span className="tr-light" />
          <span className="tr-floor" />
          <span className="tr-crew">{n ? <RowCrew team={t} byId={byId} /> : <GhostCrew />}</span>
        </span>
        <span className="tr-emblem" aria-hidden="true">
          <Emblem team={t} size={88} decorative />
        </span>
        <span className="tr-text">
          <span className="tr-name">{t.name}</span>
          <span className="tr-blurb">{t.blurb || ''}</span>
          <span className="tr-meta">
            <span>
              {n} member{n === 1 ? '' : 's'}
            </span>
            {t.captainId && (
              <>
                <i aria-hidden="true">·</i>
                <span>
                  {STAR} {capLine(cap?.name)}
                </span>
              </>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}

/** the group: captain front & centre, others in a shallow V, overlapping */
function RowCrew({ team: t, byId }: { team: Team; byId: Map<string, Agent> }) {
  return (
    <>
      {orderedMembers(t)
        .slice(0, 7)
        .map((m, i) => {
          const a = byId.get(m.agentId);
          if (!a) return null;
          const off = ROW_OFFS[i] as number;
          const isCap = i === 0 && t.captainId === m.agentId;
          const side = off < 0 ? 'right' : 'left';
          const step = rowStep(i);
          return (
            <span
              key={m.agentId}
              className={`tr-m${step === 3 ? ' back' : ''}${isCap ? ' is-cap' : ''}`}
              style={
                { '--x': `${off}px`, '--lift': `${step * 10}px`, zIndex: 10 - step } as React.CSSProperties
              }
              data-facing={i === 0 ? 'front' : 'three-quarter'}
              data-dir={i === 0 ? 'right' : side}
            >
              {i === 0 ? (
                <Hero
                  agent={a}
                  size="md"
                  facing="front"
                  captain={isCap}
                  armband={isCap ? hueHex(t.color) : null}
                />
              ) : (
                <Hero agent={a} size="sm" facing="three-quarter" dir={side} />
              )}
            </span>
          );
        })}
    </>
  );
}

function GhostCrew() {
  return (
    <>
      {(
        [
          [-76, 'sm', 10],
          [0, 'md', 0],
          [76, 'sm', 10],
        ] as const
      ).map(([x, s, lift]) => (
        <span
          key={x}
          className="tr-m"
          style={{ '--x': `${x}px`, '--lift': `${lift}px` } as React.CSSProperties}
        >
          <Hero ghost size={s} facing="front" />
        </span>
      ))}
    </>
  );
}

function GhostRow() {
  return (
    // biome-ignore lint/a11y/useSemanticElements: the prototype's list markup
    <div className="tr-li tr-ghost-li" role="listitem">
      <button
        type="button"
        className="team-row tr-ghost"
        data-id="new"
        aria-label="New team. Gather a crew under a new flag."
        onMouseEnter={(e) => e.currentTarget.classList.add('hot')}
        onMouseLeave={(e) => e.currentTarget.classList.remove('hot')}
        onClick={() => go('cast/teams/new')}
      >
        <span className="tr-stage" aria-hidden="true">
          <span className="tr-light" />
          <span className="tr-floor" />
          <span className="tr-crew">
            <GhostCrew />
          </span>
        </span>
        <span className="tr-emblem" aria-hidden="true">
          <span className="em-empty">
            <b>+</b>
          </span>
        </span>
        <span className="tr-text">
          <span className="tr-name">New team</span>
          <span className="tr-blurb">Gather a crew under a new flag.</span>
        </span>
      </button>
    </div>
  );
}
