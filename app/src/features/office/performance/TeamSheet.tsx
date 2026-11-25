/* How the team works — the wall clock's sheet, grown up (design: updates/2026-11-16 AGENT PERFORMANCE - OPEN/
   design.md). One read per office and range (GET /projects/:id/performance); everything it says is worked out
   in model.ts. Top to bottom: range · three measures (also the chooser) · one chart · Worth a look · who does
   the work · kind of work · how long work takes (HowLong.tsx, its own read: GET /projects/:id/timesheet).
   Money appears only in the token view (tokens/, under the Tokens card), rounded and "if paid per use". */
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { type Agent, useQuery } from '../../../api';
import { Hero } from '../../../characters';
import { hueHex } from '../../../design/palette';
import { Button, Pill, Sheet } from '../../../ui';
import { Radios } from '../../cast/Radios';
import { keys, officeApi, type Performance, type PerfRange } from '../api';
import { useTimesheet } from '../TimeTag';
import { worked } from '../time';
import { HowLong } from './HowLong';
import {
  type Bar,
  bars,
  barTip,
  type Crew,
  chartWords,
  detailLine,
  flags,
  groups,
  kinds,
  MEASURES,
  type Measure,
  RANGES,
  stateOf,
  trend,
  valueText,
} from './model';
import { TokensView } from './tokens/TokensView';
import './performance.css';

const LIVE_EVERY = 30_000;
const rangeKey = (pid: string) => `ai-studio:team-range:${pid}`;
function readRange(pid: string): PerfRange {
  try {
    const v = localStorage.getItem(rangeKey(pid));
    return v === '30d' || v === 'all' ? v : '7d';
  } catch {
    return '7d';
  }
}

/** One office's performance for a range; read fresh when the sheet opens, again every 30 s while anyone works. */
function usePerformance(pid: string, range: PerfRange) {
  const q = useQuery<Performance>(keys.performance(pid, range), () => officeApi.performance(pid, range));
  const live = (q.data?.live ?? 0) > 0;
  const { refetch } = q;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once per range, when it shows
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, [range]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refetch().catch(() => undefined), LIVE_EVERY);
    return () => clearInterval(t);
  }, [live, refetch]);
  return q;
}

export function TeamSheet({
  pid,
  name,
  open,
  onClose,
  agents,
  crew,
}: {
  pid: string;
  name: string;
  open: boolean;
  onClose: () => void;
  agents: Record<string, Agent>;
  crew: Crew;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={`How the team works on ${name}`} className="pf-sheet" wide>
      {open && <TeamBody pid={pid} name={name} agents={agents} crew={crew} />}
    </Sheet>
  );
}

function TeamBody({
  pid,
  name,
  agents,
  crew,
}: {
  pid: string;
  name: string;
  agents: Record<string, Agent>;
  crew: Crew;
}) {
  const [range, setRange] = useState<PerfRange>(() => readRange(pid));
  const pickRange = (r: PerfRange) => {
    setRange(r);
    try {
      localStorage.setItem(rangeKey(pid), r);
    } catch {
      /* private mode: just not remembered */
    }
  };
  const q = usePerformance(pid, range);
  const sheet = useTimesheet(pid);
  /* switching range: keep the last numbers on screen (dimmed) until the new ones land, so nothing jumps */
  const last = useRef<Performance | undefined>(undefined);
  if (q.data) last.current = q.data;
  const p = q.data ?? (q.error ? undefined : last.current);
  const retry = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (q.error && !p) retry.current?.focus();
  }, [q.error, p]);

  return (
    <div className="ts pf">
      <h2>How the team works</h2>
      <p className="hint">Everything the crew did on {name}.</p>
      {!p && q.error ? (
        <p className="hint" role="alert">
          Couldn’t read how the team works: {q.error instanceof Error ? q.error.message : String(q.error)}{' '}
          <Button ref={retry} small variant="ghost" onClick={() => void q.refetch()}>
            Try again
          </Button>
        </p>
      ) : !p ? (
        <Loading range={range} onRange={pickRange} />
      ) : (
        <>
          <TeamView
            p={p}
            name={name}
            agents={agents}
            crew={crew}
            range={range}
            onRange={pickRange}
            busy={!q.data}
          />
          <HowLong sheet={sheet.data} agents={agents} />
        </>
      )}
    </div>
  );
}

function RangePick({ range, onRange }: { range: PerfRange; onRange: (r: PerfRange) => void }) {
  return (
    <Radios
      label="Range"
      className="pf-range"
      value={range}
      onPick={(v) => onRange(v as PerfRange)}
      items={RANGES.map((r) => ({ value: r.id, label: r.label, content: r.label }))}
    />
  );
}

function Loading({ range, onRange }: { range: PerfRange; onRange: (r: PerfRange) => void }) {
  return (
    <div className="pf-loading" aria-busy="true">
      <div className="pf-top">
        <RangePick range={range} onRange={onRange} />
      </div>
      <div className="pf-cards pf-cards-ghost" aria-hidden="true">
        {MEASURES.map((m) => (
          <div key={m.id} className="pf-card">
            <span className="pf-card-label">{m.label}</span>
            <span className="pf-ghost-num" />
          </div>
        ))}
      </div>
      <div className="pf-chart-space" />
      <p className="hint">Reading the clock…</p>
    </div>
  );
}

export function TeamView({
  p,
  name,
  agents,
  crew,
  range,
  onRange,
  busy = false,
  now = Date.now(),
}: {
  p: Performance;
  name: string;
  agents: Record<string, Agent>;
  crew: Crew;
  range: PerfRange;
  onRange: (r: PerfRange) => void;
  busy?: boolean;
  now?: number;
}) {
  const [measure, setMeasure] = useState<Measure>('ms');
  const [picked, setPicked] = useState<string | null>(null);
  const [flat, setFlat] = useState(false);
  const state = stateOf(p);
  if (state === 'empty') return <p className="ts-empty">No work yet. This fills in once the crew starts.</p>;

  const who = (id: string) => {
    const a = agents[id];
    return a ? { name: a.name, role: a.role } : null;
  };
  const nameOf = (id: string) => agents[id]?.name ?? 'A retired agent';
  const pick = (id: string | null) => setPicked((cur) => (id === cur ? null : id));
  const hints = flags(p, crew, who);

  return (
    <div className="pf-body" aria-busy={busy || undefined} data-busy={busy || undefined}>
      <div className="pf-top">
        <RangePick range={range} onRange={onRange} />
        {p.live > 0 && (
          <Pill tone="live" dot>
            {p.live} working
          </Pill>
        )}
      </div>

      <Cards p={p} range={range} measure={measure} onMeasure={setMeasure} />
      <Chart p={p} measure={measure} picked={picked} agents={agents} onClear={() => setPicked(null)} />
      {measure === 'tokens' && state === 'normal' && <TokensView p={p} nameOf={nameOf} />}

      {state === 'quiet' ? (
        range !== 'all' && (
          <p className="pf-quiet">
            Nobody worked on {name} in {RANGES.find((r) => r.id === range)?.words}.{' '}
            <Button small variant="ghost" onClick={() => onRange('all')}>
              See all time
            </Button>
          </p>
        )
      ) : (
        <>
          {hints && (
            <section aria-labelledby="pf-flags">
              <h3 id="pf-flags">Worth a look</h3>
              {hints.length ? (
                <ul className="pf-flags">
                  {hints.map((f) => (
                    <li key={`${f.agentId}${f.rest}`}>
                      <span
                        className="pf-dot"
                        aria-hidden="true"
                        style={{ background: hueHex(agents[f.agentId]?.look?.hue) }}
                      />
                      <span>
                        {f.lead}
                        <button type="button" className="pf-name" onClick={() => setPicked(f.agentId)}>
                          {f.name}
                        </button>
                        {f.rest}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Nothing stands out. The work is spread well.</p>
              )}
            </section>
          )}
          <Who
            p={p}
            crew={crew}
            agents={agents}
            measure={measure}
            flat={flat}
            onFlat={() => setFlat((f) => !f)}
            picked={picked}
            onPick={pick}
            now={now}
            nameOf={nameOf}
          />
          <Kinds p={p} picked={picked} nameOf={nameOf} />
        </>
      )}
    </div>
  );
}

/* ---------- the three measures (they are also the chooser) */

function Cards({
  p,
  range,
  measure,
  onMeasure,
}: {
  p: Performance;
  range: PerfRange;
  measure: Measure;
  onMeasure: (m: Measure) => void;
}) {
  return (
    <Radios
      label="Measure"
      className="pf-cards"
      value={measure}
      onPick={(v) => onMeasure(v as Measure)}
      items={MEASURES.map((m) => {
        const n = p.totals[m.id];
        const t = trend(m.id, n, p.previous?.[m.id], range);
        const star = m.id === 'tokens' && p.unmeasured > 0;
        return {
          value: m.id,
          label: `${m.label}: ${valueText(m.id, n)}${t ? `, ${t.spoken}` : ''}${star ? '. Some early work wasn’t measured in tokens.' : ''}`,
          content: (
            <span className="pf-card">
              <span className="pf-card-label">{m.label}</span>
              <span className="pf-card-num">
                {valueText(m.id, n)}
                {star && (
                  <sup className="pf-star" title="Some early work wasn’t measured in tokens.">
                    *
                  </sup>
                )}
              </span>
              {t && (
                <span className="pf-trend" title={t.text}>
                  <span className="pf-trend-long">{t.text}</span>
                  <span className="pf-trend-short">{t.short}</span>
                </span>
              )}
            </span>
          ),
        };
      })}
    />
  );
}

/* ---------- one chart */

function Chart({
  p,
  measure,
  picked,
  agents,
  onClear,
}: {
  p: Performance;
  measure: Measure;
  picked: string | null;
  agents: Record<string, Agent>;
  onClear: () => void;
}) {
  const bs = bars(p, measure, picked);
  const pickedName = picked ? (agents[picked]?.name ?? 'A retired agent') : null;
  const words = chartWords(p, bs, measure, pickedName);
  const max = Math.max(0, ...bs.map((b) => b.value));
  const top = max > 0 ? bs.findIndex((b) => b.value === max) : -1;
  const [focus, setFocus] = useState(bs.length - 1);
  const [tip, setTip] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.min(focus, bs.length - 1);
  const colour = picked ? hueHex(agents[picked]?.look?.hue) : undefined;
  const move = (j: number) => {
    setFocus(j);
    setTip(j);
    refs.current[j]?.focus();
  };
  return (
    <section className="pf-chart">
      <div className="pf-chart-head">
        <h3>{words.title}</h3>
        {pickedName && (
          <button
            type="button"
            className="chip pf-clear"
            onClick={onClear}
            aria-label="Back to the whole team"
          >
            {pickedName} ✕
          </button>
        )}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a chart's bars, not form fields — a fieldset would mislead */}
      <div
        className="pf-bars"
        role="group"
        aria-label={words.summary}
        data-n={bs.length}
        key={`${p.range}-${measure}`}
        style={colour ? ({ '--bar': colour } as CSSProperties) : undefined}
        onKeyDown={(e) => {
          const step = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
          const j = step ? at + step : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
          if (j == null || j < 0 || j >= bs.length) return;
          e.preventDefault();
          move(j);
        }}
        onMouseLeave={() => setTip(null)}
      >
        {bs.map((b, i) => (
          <BarCol
            key={b.key}
            b={b}
            i={i}
            max={max}
            top={i === top}
            live={b.today && p.live > 0}
            measure={measure}
            tabbable={i === at}
            showTip={tip === i}
            onTip={(on) => setTip(on ? i : null)}
            onFocus={() => {
              setFocus(i);
              setTip(i);
            }}
            refFn={(el) => {
              refs.current[i] = el;
            }}
          />
        ))}
      </div>
    </section>
  );
}

function BarCol({
  b,
  i,
  max,
  top,
  live,
  measure,
  tabbable,
  showTip,
  onTip,
  onFocus,
  refFn,
}: {
  b: Bar;
  i: number;
  max: number;
  top: boolean;
  live: boolean;
  measure: Measure;
  tabbable: boolean;
  showTip: boolean;
  onTip: (on: boolean) => void;
  onFocus: () => void;
  refFn: (el: HTMLButtonElement | null) => void;
}) {
  const h = max > 0 ? (100 * b.value) / max : 0;
  return (
    <div className="pf-col">
      <button
        ref={refFn}
        type="button"
        className={`pf-bar${b.value ? '' : ' stub'}${live ? ' live' : ''}`}
        aria-label={barTip(b)}
        tabIndex={tabbable ? 0 : -1}
        onMouseEnter={() => onTip(true)}
        onFocus={onFocus}
        onBlur={() => onTip(false)}
      >
        {top && <span className="pf-top-val">{valueText(measure, b.value)}</span>}
        <span
          className="pf-fill"
          style={{ height: b.value ? `${Math.max(4, h)}%` : undefined, animationDelay: `${i * 12}ms` }}
        />
      </button>
      <span className="pf-day" aria-hidden="true">
        {b.label}
      </span>
      {showTip && (
        <span className="pf-tip" role="tooltip">
          {barTip(b)}
        </span>
      )}
    </div>
  );
}

/* ---------- who does the work */

function Who({
  p,
  crew,
  agents,
  measure,
  flat,
  onFlat,
  picked,
  onPick,
  now,
  nameOf,
}: {
  p: Performance;
  crew: Crew;
  agents: Record<string, Agent>;
  measure: Measure;
  flat: boolean;
  onFlat: () => void;
  picked: string | null;
  onPick: (id: string) => void;
  now: number;
  nameOf: (id: string) => string;
}) {
  const gs = groups(p, crew, measure, flat, nameOf);
  const canGroup = crew.teams.length >= 2;
  return (
    <section aria-labelledby="pf-who">
      <div className="pf-who-head">
        <h3 id="pf-who">Who does the work</h3>
        {canGroup && (
          <button type="button" className="pf-link" onClick={onFlat} aria-pressed={!flat}>
            {flat ? 'everyone ▾' : 'by team ▾'}
          </button>
        )}
      </div>
      {gs.map((g) => (
        <div key={g.id} className="pf-group">
          {g.title && (
            <h4 className="pf-team">
              {g.title} · {valueText(measure, g.total)}
            </h4>
          )}
          <ul className="pf-rows">
            {g.rows.map((r) => {
              const ag = agents[r.agentId];
              const open = picked === r.agentId;
              const value = r.a ? valueText(measure, r.value) : '—';
              const hue = hueHex(ag?.look?.hue);
              return (
                <li key={r.agentId} className={r.a ? '' : 'faded'}>
                  <button
                    type="button"
                    className="pf-row"
                    aria-expanded={open}
                    onClick={() => onPick(r.agentId)}
                    disabled={!r.a}
                  >
                    <Hero
                      agent={ag ?? null}
                      ghost={!ag}
                      size="xs"
                      pose={r.a?.live ? 'typing' : 'idle'}
                      facing="front"
                    />
                    <span className="pf-who-name">
                      <b>{ag?.name ?? 'A retired agent'}</b>
                      <span className="pf-role">{r.captain ? '★ Captain' : ag?.role}</span>
                    </span>
                    {r.share != null && (
                      <span className="pf-share" aria-hidden="true">
                        <span style={{ width: `${r.share}%`, background: hue }} />
                      </span>
                    )}
                    <span className="ts-num pf-num">
                      {r.a?.live && <span className="pf-live" role="img" aria-label="working now" />}
                      {value}
                    </span>
                    {r.arrow ? (
                      <span
                        className="pf-arrow"
                        role="img"
                        aria-label={r.arrow === '↑' ? 'more than before' : 'less than before'}
                      >
                        {r.arrow}
                      </span>
                    ) : (
                      <span className="pf-arrow" />
                    )}
                  </button>
                  {open && r.a && <p className="pf-detail">{detailLine(r.a, now)}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/* ---------- kind of work (always time; follows the range and the picked agent) */

function Kinds({
  p,
  picked,
  nameOf,
}: {
  p: Performance;
  picked: string | null;
  nameOf: (id: string) => string;
}) {
  const ks = kinds(p, picked);
  const total = ks.reduce((s, k) => s + k.ms, 0);
  if (!ks.length) return null;
  return (
    <section aria-labelledby="pf-kinds">
      <h3 id="pf-kinds">{picked ? `${nameOf(picked)}’s kind of work` : 'Kind of work'}</h3>
      <ul className="ts-kinds">
        {ks.map((k) => (
          <li key={k.kind}>
            <span>{k.label}</span>
            <span className="ts-num">{worked(k.ms)}</span>
            <div className="progress sm" aria-hidden="true">
              <div className="fill" style={{ width: `${total ? Math.max(2, (100 * k.ms) / total) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
