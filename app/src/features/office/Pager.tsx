/* The pager (prototype office-pager.js, v6): a small playful device, bottom-left, on every screen.
   One page per OFFICE that needs you — inside it the "!" over a robot shows who. Scroll the pages
   (▲ ▼, wheel, arrow keys); press the screen → that office. Leave an office without answering →
   it drops off until a NEW ask arrives there (POST /asks/seen on leaving; GET /asks?unseen=true).
   There's no studio-wide stream, so it polls (every 5 s, only while the window is visible). */
import { useEffect, useRef, useState } from 'react';
import { type Project, studio, useQuery } from '../../api';
import { reducedMotion } from '../../design/palette';
import type { PagerComponent } from '../../shell/pages';
import { go, type Route } from '../../shell/router';
import { keys, officeApi, type StudioAsk } from './api';
import {
  askKey,
  freshIndex,
  leftOffice,
  officeOf,
  pagerEntries,
  pagerHidden,
  pagerLine,
} from './pager-logic';
import './office.css';

const POLL_MS = 5000;

export const Pager: PagerComponent = ({ route }: { route: Route }) => {
  const asks = useQuery<StudioAsk[]>(keys.pager, officeApi.studioAsks);
  const projects = useQuery<Project[]>('projects', studio.projects.list);
  const here = officeOf(route);
  const entries = pagerEntries(asks.data ?? [], here);
  const [idx, setIdx] = useState(0);
  const [wiggle, setWiggle] = useState(0);
  const [live, setLive] = useState('');
  const shown = useRef<Set<string> | null>(null);
  const prevRoute = useRef<Route | null>(null);
  const wheelAt = useRef(0);
  const refetch = asks.refetch;

  /* poll while visible */
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refetch();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refetch]);

  /* left an office without answering → its open asks are seen (they drop off) */
  useEffect(() => {
    const left = leftOffice(prevRoute.current, route);
    prevRoute.current = route;
    if (left)
      void officeApi.seen(left).then(
        () => refetch(),
        () => undefined,
      );
  }, [route, refetch]);

  /* a NEW ask somewhere: turn to that office, one small wiggle (no blinking, no nagging) */
  const sig = entries.map((e) => `${e.projectId}:${e.asks.map((a) => a.id).join('+')}`).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the set of asks only
  useEffect(() => {
    if (!asks.data) return;
    const first = shown.current === null;
    const seen = shown.current ?? new Set<string>();
    const fresh = freshIndex(entries, seen);
    for (const e of entries) for (const a of e.asks) seen.add(askKey(a));
    shown.current = seen;
    if (fresh >= 0) {
      setIdx(fresh);
      if (!first && !reducedMotion()) setWiggle((n) => n + 1);
    }
  }, [sig, asks.data]);

  const n = entries.length;
  const i = Math.min(idx, Math.max(0, n - 1));
  const step = (d: number) => {
    if (n < 2) return;
    const j = (i + d + n) % n;
    setIdx(j);
    const e = entries[j];
    setLive(`${e.projectName}: ${pagerLine(e)}. ${j + 1} of ${n}.`);
  };
  if (pagerHidden(route) || route.name === 'gallery') return null;

  const e = entries[i];
  const p = e ? projects.data?.find((x) => x.id === e.projectId) : undefined;
  const line = e ? pagerLine(e) : '';
  return (
    <div className={`o-pagerwrap${here ? ' in-office' : ''}`} id="pager">
      {/* biome-ignore lint/a11y/useSemanticElements: the pager device is a labelled group of controls */}
      <div
        key={wiggle}
        className={`o-pager${n ? ' has' : ''}${wiggle ? ' wiggle' : ''}`}
        role="group"
        aria-roledescription="pager"
        aria-label={
          n ? `Pager — ${n} ${n === 1 ? 'office needs' : 'offices need'} you` : 'Pager — nobody needs you'
        }
        onKeyDown={(ev) => {
          if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
            ev.preventDefault();
            ev.stopPropagation();
            step(-1);
          }
          if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
            ev.preventDefault();
            ev.stopPropagation();
            step(1);
          }
        }}
        onWheel={(ev) => {
          const now = Date.now();
          if (now - wheelAt.current < 220 || Math.abs(ev.deltaY) < 4) return;
          wheelAt.current = now;
          step(ev.deltaY > 0 ? 1 : -1);
        }}
      >
        <span className="o-pg-led" aria-hidden="true" />
        <button
          type="button"
          className="o-pg-screen"
          disabled={!e}
          aria-label={e ? `Go to the ${e.projectName} office — ${line}. Page ${i + 1} of ${n}.` : undefined}
          onClick={() => e && go({ name: 'office', projectId: e.projectId, sub: 'room' })}
        >
          {e ? (
            <>
              <span className="o-pg-top">
                <span>
                  {n} OFFICE{n === 1 ? '' : 'S'}
                </span>
                <span>
                  {i + 1}/{n}
                </span>
              </span>
              <b className="o-pg-name">
                {p && (
                  <span
                    className="o-pg-tile"
                    aria-hidden="true"
                    style={{ background: `linear-gradient(145deg,${p.tile.g1},${p.tile.g2})` }}
                  />
                )}
                <span>{e.projectName}</span>
              </b>
              <span className="o-pg-what">{line}</span>
            </>
          ) : (
            <>
              <span className="o-pg-top">
                <span>PAGER</span>
              </span>
              <b className="o-pg-name">All quiet</b>
              <span className="o-pg-what">Nobody needs you</span>
            </>
          )}
        </button>
        <div className="o-pg-keys">
          <button
            type="button"
            className="o-pg-btn"
            aria-label="Previous page"
            disabled={n < 2}
            onClick={() => step(-1)}
          >
            ▲
          </button>
          <button
            type="button"
            className="o-pg-btn"
            aria-label="Next page"
            disabled={n < 2}
            onClick={() => step(1)}
          >
            ▼
          </button>
        </div>
        <span className="sr-only" aria-live="polite">
          {live}
        </span>
      </div>
    </div>
  );
};
