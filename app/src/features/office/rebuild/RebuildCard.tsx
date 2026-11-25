/* The one confirm card for a team rebuild (spec-ux-team-rebuild §3) — under a director reply in chat, and from
   Rearrange's Review in the office. One line per person or team, grouped by what happens to them; removals first.
   Nothing applies until Rebuild. Focus starts on Keep as is; Enter on Rebuild confirms; a typed or spoken
   "yes"/"no" does the same (answerByVoice). After it applies, the card becomes the Undo line. */
import { useEffect, useId, useRef, useState } from 'react';
import { Hero } from '../../../characters';
import { Button } from '../../../ui';
import {
  type ApplyBody,
  type RebuildCard as Card,
  type CardEnd,
  type HandoverTo,
  isStaleError,
  type LonePick,
  type Person,
  rebuildApi,
  UNDO_MS,
} from './api';
import './rebuild.css';

export type FaceOf = (id: string) => { name: string; look?: unknown } | null;

/* ---------- outcomes survive the card unmounting (switching threads, closing Rearrange) */
type Outcome =
  | { kind: 'kept' }
  | { kind: 'done'; token: string; summary: string; at: number }
  | { kind: 'undone' }
  /* its plan ran out (out of date, already holds, lost to a restart): it closed itself */
  | { kind: 'expired' }
  /* applied earlier (saved on the chat line): no Undo from here */
  | { kind: 'applied'; summary?: string };
const outcomes = new Map<string, Outcome>();
/** How the server says the card ended (saved on its chat line) → what it shows. */
const savedOutcome = (closed?: CardEnd, summary?: string): Outcome | undefined =>
  closed === 'kept'
    ? { kind: 'kept' }
    : closed === 'expired'
      ? { kind: 'expired' }
      : closed === 'applied'
        ? { kind: 'applied', summary }
        : undefined;
/** The user already answered this card here (Rebuild or Keep as is). */
export const isRebuildSettled = (planId: string) => outcomes.has(planId);
/** For tests. */
export const resetRebuildCards = () => {
  outcomes.clear();
  live.length = 0;
};

/* ---------- voice / typed yes-no: the newest live card answers */
type Live = { planId: string; yes: () => void; no: () => void };
const live: Live[] = [];
const YES = /^(yes|yep|yeah|yup|sure|ok|okay|rebuild|do it|go ahead|confirm|yes please|yes rebuild)$/;
const NO = /^(no|nope|keep|keep it|keep as is|cancel|don'?t|no thanks|leave it)$/;
export function voiceVerdict(text: string): 'yes' | 'no' | null {
  const t = text
    .toLowerCase()
    .replace(/[.!?,’']/g, (c) => (c === '’' || c === "'" ? "'" : ''))
    .trim()
    .replace(/\s+/g, ' ');
  if (YES.test(t)) return 'yes';
  if (NO.test(t)) return 'no';
  return null;
}
/** A short yes/no while a card is waiting: it answers the card (true) instead of becoming a message. */
export function answerByVoice(text: string): boolean {
  const v = voiceVerdict(text);
  const card = live[live.length - 1];
  if (!v || !card) return false;
  if (v === 'yes') card.yes();
  else card.no();
  return true;
}

/* ---------- words */
const handLabel = (to: HandoverTo, toName: string, director: string) =>
  to === 'captain'
    ? `goes to ${toName} (captain)`
    : to === 'director'
      ? `goes back to ${director} to reassign`
      : to === 'finish-first'
        ? 'finishes this item, then leaves'
        : 'stops now and hands over';
const items = (n: number) => (n === 1 ? '1 open item' : `${n} open items`);
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
export const copySentence = (team: string, others: string[]) =>
  `${team} also work${/s$/i.test(team) ? '' : 's'} on ${list(others)} — this project gets its own copy.`;

export type RebuildCardProps = {
  card: Card;
  /** Faces + names by agent id. */
  faceOf: FaceOf;
  /** The director's short name (work going back to them). */
  director: string;
  /** Greyed from outside: a newer message came in. */
  stale?: boolean;
  /** How the server says it ended (a saved chat line): it shows its one line, never the live card. */
  closed?: CardEnd;
  /** An applied card's one-line summary. */
  summary?: string;
  /** Take focus on Keep as is when it appears (default true). */
  focus?: boolean;
  /** The undo window starts here (a chat reply's time; default now). */
  onApplied?: (r: { undoToken: string; summary: string }) => void;
  onKept?: () => void;
  onUndone?: () => void;
  /** It ran out (or the user dismissed one that had): it no longer holds New chat back. */
  onExpired?: () => void;
};

/* ---------- a11y: when the card turns into its one line, focus follows (keyboard) or the line is announced
   (voice / typed answer, focus elsewhere) — never both, never silence, never focus dropped to the page. */
const KEPT = 'Kept as is.';
const UNDONE = 'Undone — the team is back as it was.';
/* out of date: one state, one set of words — live, after a restart, or coming back (Merlin's note) */
const OUT_OF_DATE = 'Out of date';
const whyOutOfDate = (director: string) =>
  `Nothing changed — the team moved on since this plan. Ask ${director} again if you still want it.`;
const CLOSED = 'Out-of-date plan closed — nothing changed.';
/** The card folds shut, then its one line fades in; reduced motion: no fold. */
const FOLD_MS = 220;
const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const doneText = (summary?: string) =>
  summary ? `Done — ${summary.replace(/^Done\s*[—-]\s*/i, '')}` : 'Done.';
/** Focus is inside `el`, or was until the focused control was removed (focus fell back to the page). */
const holdsFocus = (el: HTMLElement | null, was: boolean) => {
  const a = document.activeElement;
  return !!el && ((!!a && el.contains(a)) || (was && (!a || a === document.body)));
};
/** Remember focus-within across a focused control unmounting. */
function useFocusWithin() {
  const was = useRef(false);
  const handlers = {
    onFocus: () => {
      was.current = true;
    },
    onBlur: (e: React.FocusEvent) => {
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) was.current = false;
    },
  };
  return { was, handlers };
}
function useGrabFocus<T extends HTMLElement>(grab: boolean) {
  const ref = useRef<T>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount
  useEffect(() => {
    if (grab) ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
function QuietLine({ text, grab }: { text: string; grab: boolean }) {
  const ref = useGrabFocus<HTMLParagraphElement>(grab);
  return (
    <p ref={ref} tabIndex={-1} className="rb-line rb-quiet">
      {text}
    </p>
  );
}
const settleOutOfDate = (planId: string) => outcomes.set(planId, { kind: 'expired' });

export function RebuildCard(p: RebuildCardProps) {
  const { card } = p;
  const [outcome, setOutcome] = useState<Outcome | undefined>(
    () => outcomes.get(card.planId) ?? savedOutcome(p.closed, p.summary),
  );
  const [said, setSaid] = useState('');
  const [grab, setGrab] = useState(false);
  const settle = (o: Outcome, hadFocus: boolean) => {
    outcomes.set(card.planId, o);
    setOutcome(o);
    setGrab(hadFocus);
    setSaid(
      hadFocus
        ? ''
        : o.kind === 'kept'
          ? KEPT
          : o.kind === 'undone'
            ? UNDONE
            : o.kind === 'expired'
              ? CLOSED
              : doneText(o.summary),
    );
  };
  const ranOut = (hadFocus: boolean) => {
    settle({ kind: 'expired' }, hadFocus);
    p.onExpired?.();
  };
  const body =
    outcome?.kind === 'kept' ? (
      <QuietLine key="kept" text={KEPT} grab={grab} />
    ) : outcome?.kind === 'undone' ? (
      <QuietLine key="undone" text={UNDONE} grab={grab} />
    ) : outcome?.kind === 'expired' ? (
      <QuietLine key="expired" text={CLOSED} grab={grab} />
    ) : outcome?.kind === 'applied' ? (
      <QuietLine key="applied" text={doneText(outcome.summary)} grab={grab} />
    ) : outcome?.kind === 'done' ? (
      <UndoLine
        key="done"
        token={outcome.token}
        summary={outcome.summary}
        since={outcome.at}
        grab={grab}
        onUndone={(hadFocus) => {
          settle({ kind: 'undone' }, !!hadFocus);
          p.onUndone?.();
        }}
      />
    ) : (
      <LiveCard
        key="live"
        {...p}
        onApplied={(r, hadFocus) => {
          settle({ kind: 'done', token: r.undoToken, summary: r.summary, at: Date.now() }, hadFocus);
          p.onApplied?.(r);
        }}
        onKept={(hadFocus) => {
          settle({ kind: 'kept' }, hadFocus);
          p.onKept?.();
        }}
        onRanOut={ranOut}
      />
    );
  return (
    <>
      {body}
      {/* always mounted, so a change of text is announced */}
      <p className="sr-only rb-say" role="status">
        {said}
      </p>
    </>
  );
}

type Picks = {
  hand: Record<string, HandoverTo>;
  captain: Record<string, string>;
  lone: Record<string, LonePick>;
};
const firstPicks = (c: Card): Picks => ({
  hand: Object.fromEntries(
    c.leaves.filter((l) => l.openItems.length).map((l) => [l.id, l.openItems[0].to] as const),
  ),
  captain: Object.fromEntries((c.captains ?? []).map((x) => [x.teamId, x.agentId])),
  lone: Object.fromEntries((c.lone ?? []).map((x) => [x.agentId, x.pick])),
});
/* only what the user changed goes back (the server keeps its defaults) */
export function applyBodyOf(c: Card, picks: Picks): ApplyBody {
  const first = firstPicks(c);
  const hand = Object.entries(picks.hand)
    .filter(([a, to]) => first.hand[a] !== to)
    .map(([agent, to]) => ({ agent, to }));
  const captain = Object.entries(picks.captain)
    .filter(([t, a]) => first.captain[t] !== a)
    .map(([team, agent]) => ({ team, agent }));
  const lone = Object.entries(picks.lone)
    .filter(([a, to]) => first.lone[a] !== to)
    .map(([agent, to]) => ({ agent, to }));
  return {
    ...(hand.length ? { handover: hand } : {}),
    ...(captain.length ? { captain } : {}),
    ...(lone.length ? { lone } : {}),
  };
}

function LiveCard(
  p: Omit<RebuildCardProps, 'onApplied' | 'onKept'> & {
    onApplied: (r: { undoToken: string; summary: string }, hadFocus: boolean) => void;
    onKept: (hadFocus: boolean) => void;
    onRanOut: (hadFocus: boolean) => void;
  },
) {
  const { card, faceOf, director } = p;
  const id = useId();
  const keep = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const within = useFocusWithin();
  const [picks, setPicks] = useState<Picks>(() => firstPicks(card));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /* Close pressed: the card's height while it folds shut (null = open) */
  const [folding, setFolding] = useState<number | null>(null);
  const fold = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(fold.current), []);
  const stale = card.stale || !!p.stale;
  const had = () => holdsFocus(root.current, within.was.current);
  /* the server closes the card for good (it never comes back after a restart); the line shows at once */
  const close = () => void rebuildApi.dismiss(card.planId);

  const rebuild = async () => {
    if (busy || stale) return;
    setBusy(true);
    setErr('');
    const r = await rebuildApi.apply(card.planId, applyBodyOf(card, picks));
    setBusy(false);
    if (r.ok) p.onApplied({ undoToken: r.undoToken, summary: r.summary }, had());
    /* out of date or already true: the server closed it — it closes here too, never blocking the chat */ else if (
      isStaleError(r.error)
    )
      p.onRanOut(had());
    else setErr(r.error);
  };
  const kept = () => {
    if (busy) return;
    close();
    p.onKept(had());
  };
  /* the one way out of an out-of-date card: closed on the server at once, then it folds into its line */
  const dismiss = () => {
    if (folding !== null) return;
    const hadFocus = had();
    close();
    settleOutOfDate(card.planId); // closed even if the thread switches mid-fold
    if (reducedMotion()) return p.onRanOut(hadFocus);
    setFolding(root.current?.offsetHeight ?? 0);
    fold.current = setTimeout(() => p.onRanOut(hadFocus), FOLD_MS);
  };
  const ref = useRef({ rebuild, keep: kept });
  ref.current = { rebuild, keep: kept };

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus once, when the card appears
  useEffect(() => {
    if (p.focus !== false) keep.current?.focus({ preventScroll: true });
  }, []);
  /* Keep as is / Rebuild go away when the plan goes out of date: focus already in the card moves to Close
     instead of dropping to the page. It never takes focus from anywhere else (the composer keeps it). */
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when it turns stale
  useEffect(() => {
    if (stale && had()) closeBtn.current?.focus({ preventScroll: true });
  }, [stale]);
  useEffect(() => {
    if (stale) return;
    const me: Live = {
      planId: card.planId,
      yes: () => void ref.current.rebuild(),
      no: () => ref.current.keep(),
    };
    live.push(me);
    return () => {
      const i = live.indexOf(me);
      if (i >= 0) live.splice(i, 1);
    };
  }, [card.planId, stale]);

  const specialists = card.specialists ?? [];
  const moves = card.moves ?? [];
  const newTeams = card.newTeams ?? [];
  const captains = card.captains ?? [];
  const lone = card.lone ?? [];
  const copies = card.copies ?? [];
  const title = `${id}-t`;

  return (
    <section
      ref={root}
      {...within.handlers}
      className={`rb-card${stale ? ' stale' : ''}${folding !== null ? ' folding' : ''}`}
      style={folding !== null ? ({ '--rb-h': `${folding}px` } as React.CSSProperties) : undefined}
      aria-labelledby={title}
      aria-describedby={stale ? `${id}-stale` : undefined}
      aria-busy={busy || undefined}
    >
      {/* out of date, the card stops asking: the question mark goes */}
      <h3 id={title}>{stale ? 'Rebuild the team' : 'Rebuild the team?'}</h3>
      <dl className="rb-groups">
        {card.leaves.length > 0 && (
          <Group label="Leaves this project" warm>
            {card.leaves.map((l) => (
              <li key={l.id} className="rb-who">
                <Faces
                  people={l.kind === 'team' ? (l.members ?? []) : [{ id: l.id, name: l.name }]}
                  faceOf={faceOf}
                />
                <span className="rb-name">
                  {l.name}
                  {l.kind === 'team' && <span className="rb-sub"> · whole team</span>}
                </span>
                {l.openItems.length > 0 && (
                  <WorkLine
                    id={`${id}-h-${l.id}`}
                    leaver={l}
                    to={picks.hand[l.id] ?? l.openItems[0].to}
                    director={director}
                    disabled={busy}
                    fixed={stale}
                    onChange={(to) => setPicks((s) => ({ ...s, hand: { ...s.hand, [l.id]: to } }))}
                  />
                )}
              </li>
            ))}
          </Group>
        )}
        {specialists.length > 0 && (
          <Group label={specialists.length === 1 ? 'Becomes a specialist' : 'Become specialists'}>
            {specialists.map((s) => (
              <li key={s.id} className="rb-who">
                <Faces people={[s]} faceOf={faceOf} />
                <span className="rb-name">{s.name}</span>
              </li>
            ))}
          </Group>
        )}
        {moves.length > 0 && (
          <Group label="Moves">
            {moves.map((m) => (
              <li key={m.agentId} className="rb-who">
                <Faces people={[{ id: m.agentId, name: m.name }]} faceOf={faceOf} />
                <span className="rb-name">
                  {m.name}
                  <span className="rb-sub">
                    {' '}
                    {/* heard as "from The Founders to Build", seen as "The Founders → Build" */}
                    {m.fromTeam && (
                      <>
                        <span className="sr-only">from </span>
                        {m.fromTeam}{' '}
                      </>
                    )}
                    <span aria-hidden="true">→ </span>
                    <span className="sr-only">to </span>
                    {m.toTeam}
                  </span>
                </span>
              </li>
            ))}
          </Group>
        )}
        {newTeams.length > 0 && (
          <Group label="New teams">
            {newTeams.map((t) => (
              <li key={t.name} className="rb-who">
                <Faces people={t.members} faceOf={faceOf} />
                <span className="rb-name">
                  {t.name}
                  <span className="rb-sub">
                    {' '}
                    · captain {t.captainName} ({t.members.map((m) => m.name).join(', ')})
                  </span>
                </span>
              </li>
            ))}
          </Group>
        )}
        {captains.length > 0 && (
          <Group label={captains.length === 1 ? 'New captain' : 'New captains'}>
            {captains.map((c) => (
              <li key={c.teamId} className="rb-who">
                <Faces
                  people={[{ id: picks.captain[c.teamId] ?? c.agentId, name: c.name }]}
                  faceOf={faceOf}
                />
                <span className="rb-name">{c.teamName}</span>
                <Pick
                  id={`${id}-c-${c.teamId}`}
                  label={`Captain of ${c.teamName}`}
                  value={picks.captain[c.teamId] ?? c.agentId}
                  disabled={busy}
                  fixed={stale}
                  options={uniq([{ id: c.agentId, name: c.name }, ...c.choices]).map((x) => [x.id, x.name])}
                  onChange={(v) => setPicks((s) => ({ ...s, captain: { ...s.captain, [c.teamId]: v } }))}
                />
              </li>
            ))}
          </Group>
        )}
        {lone.length > 0 && (
          <Group label="Left on their own">
            {lone.map((x) => (
              <li key={x.agentId} className="rb-who">
                <Faces people={[{ id: x.agentId, name: x.name }]} faceOf={faceOf} />
                <span className="rb-name">
                  {x.name}
                  <span className="rb-sub"> would be alone at {x.teamName}</span>
                </span>
                <Pick
                  id={`${id}-l-${x.agentId}`}
                  label={`What happens to ${x.name}`}
                  value={picks.lone[x.agentId] ?? x.pick}
                  disabled={busy}
                  fixed={stale}
                  options={[
                    ['specialist', `Make ${x.name} a specialist`],
                    ['remove', `Remove ${x.name} too`],
                  ]}
                  onChange={(v) =>
                    setPicks((s) => ({ ...s, lone: { ...s.lone, [x.agentId]: v as LonePick } }))
                  }
                />
              </li>
            ))}
          </Group>
        )}
      </dl>
      {copies.map((c) => (
        <p key={c.teamId} className="rb-copy">
          {copySentence(c.teamName, c.otherProjects)}
        </p>
      ))}
      {stale ? (
        <>
          <div className="rb-stale" id={`${id}-stale`} role="status">
            <p className="rb-stale-l">{OUT_OF_DATE}</p>
            <p className="rb-why">{whyOutOfDate(director)}</p>
          </div>
          {/* the user can always close a card — and this is the only thing left to do */}
          <footer className="rb-foot">
            <Button
              ref={closeBtn}
              variant="ghost"
              className="rb-ghost"
              aria-label="Close out-of-date plan"
              aria-disabled={folding !== null || undefined}
              onClick={dismiss}
            >
              Close
            </Button>
          </footer>
        </>
      ) : (
        <>
          {err && (
            <p className="rb-err" role="alert">
              {err}
            </p>
          )}
          <footer className="rb-foot">
            {/* aria-disabled, not disabled, while busy: a disabled button drops focus to the page */}
            <Button
              ref={keep}
              variant="ghost"
              className="rb-ghost"
              aria-disabled={busy || undefined}
              onClick={kept}
            >
              Keep as is
            </Button>
            <Button variant="hero" aria-disabled={busy || undefined} onClick={() => void rebuild()}>
              {busy ? 'Rebuilding…' : err ? 'Try again' : 'Rebuild'}
            </Button>
          </footer>
        </>
      )}
    </section>
  );
}

const uniq = (xs: Person[]) => xs.filter((x, i) => xs.findIndex((y) => y.id === x.id) === i);

function Group({ label, warm, children }: { label: string; warm?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rb-group${warm ? ' warm' : ''}`}>
      <dt>{label}</dt>
      <dd>
        <ul>{children}</ul>
      </dd>
    </div>
  );
}

function Faces({ people, faceOf }: { people: Person[]; faceOf: FaceOf }) {
  const shown = people.slice(0, 3);
  return (
    <span className="rb-faces" aria-hidden="true">
      {shown.map((x) => {
        const a = faceOf(x.id);
        return (
          <span key={x.id} className="rb-face">
            <Hero
              agent={(a ?? { name: x.name }) as Parameters<typeof Hero>[0]['agent']}
              ghost={!a}
              size={28}
              pose="idle"
              facing="front"
            />
          </span>
        );
      })}
      {people.length > shown.length && <span className="rb-more">+{people.length - shown.length}</span>}
    </span>
  );
}

function WorkLine({
  id,
  leaver,
  to,
  director,
  disabled,
  fixed,
  onChange,
}: {
  id: string;
  leaver: Card['leaves'][number];
  to: HandoverTo;
  director: string;
  disabled: boolean;
  fixed: boolean;
  onChange: (to: HandoverTo) => void;
}) {
  const n = leaver.openItems.length;
  const captainName = leaver.openItems.find((i) => i.to === 'captain')?.toName ?? 'their captain';
  const opts: [HandoverTo, string][] = [
    ...(leaver.running
      ? ([
          ['finish-first', 'Let them finish first'],
          ['stop-now', 'Stop now and hand over'],
        ] as [HandoverTo, string][])
      : []),
    ...(leaver.kind === 'agent' && leaver.openItems.some((i) => i.to === 'captain')
      ? ([['captain', `Hand to ${captainName} (captain)`]] as [HandoverTo, string][])
      : []),
    ['director', `Hand back to ${director}`],
  ];
  if (!opts.some(([v]) => v === to)) opts.unshift([to, handLabel(to, captainName, director)]);
  const toName = to === 'captain' ? captainName : director;
  return (
    <span className="rb-work">
      <span className="rb-arrow" aria-hidden="true">
        →
      </span>
      <span>
        {items(n)} {handLabel(to, toName, director)}
        {n <= 3 && <span className="rb-items"> ({leaver.openItems.map((i) => i.title).join('; ')})</span>}
      </span>
      <Pick
        id={id}
        label={`Change where ${leaver.name}’s work goes`}
        value={to}
        disabled={disabled}
        fixed={fixed}
        options={opts}
        onChange={(v) => onChange(v as HandoverTo)}
        change
      />
    </span>
  );
}

/* one small native menu ("change"): keyboard and screen readers get the platform's own control */
function Pick({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
  change,
  fixed,
}: {
  id: string;
  label: string;
  value: string;
  options: [string, string][];
  disabled: boolean;
  onChange: (v: string) => void;
  change?: boolean;
  /** Out of date: no dead control — the pick shows as plain text (a "change" menu just goes). */
  fixed?: boolean;
}) {
  if (options.length < 2) return null;
  if (fixed) {
    if (change) return null;
    return <span className="rb-pick rb-fixed">{options.find(([v]) => v === value)?.[1] ?? ''}</span>;
  }
  return (
    <span className={`rb-pick${change ? ' rb-change' : ''}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {change && (
        <span className="rb-change-l" aria-hidden="true">
          change
        </span>
      )}
    </span>
  );
}

/* ---------- after it applies: one line + Undo (10 min, while nobody started new work) */
export function UndoLine({
  token,
  summary,
  since = Date.now(),
  grab = false,
  onUndone,
}: {
  token: string;
  summary?: string;
  since?: number;
  /** Take focus when it appears (the user confirmed with the keyboard). */
  grab?: boolean;
  /** `hadFocus`: the Undo button held focus, so the next line should take it. */
  onUndone?: (hadFocus: boolean) => void;
}) {
  const ref = useGrabFocus<HTMLParagraphElement>(grab);
  const [state, setState] = useState<'ready' | 'busy' | 'gone' | 'done' | 'late'>(() =>
    outcomes.get(`undo:${token}`) ? 'done' : Date.now() - since >= UNDO_MS ? 'gone' : 'ready',
  );
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (state !== 'ready') return;
    const t = setTimeout(() => setState('gone'), Math.max(0, since + UNDO_MS - Date.now()));
    return () => clearTimeout(t);
  }, [state, since]);
  const undo = async () => {
    const hadFocus = holdsFocus(ref.current, false);
    setState('busy');
    const r = await rebuildApi.undo(token);
    if (r.ok) {
      outcomes.set(`undo:${token}`, { kind: 'undone' });
      setState('done');
      onUndone?.(hadFocus);
    } else {
      setMsg(r.error);
      setState('late');
      if (hadFocus) ref.current?.focus({ preventScroll: true }); // the button went away: focus stays on the line
    }
  };
  return (
    <p ref={ref} tabIndex={-1} className="rb-line" role="status">
      {state === 'done' ? (
        UNDONE
      ) : (
        <>
          <span>{doneText(summary)}</span>
          {(state === 'ready' || state === 'busy') && (
            <button type="button" className="rb-undo" disabled={state === 'busy'} onClick={() => void undo()}>
              {state === 'busy' ? 'Undoing…' : 'Undo'}
            </button>
          )}
          {state === 'late' && (
            <span className="rb-late">
              {' '}
              {/new work|too late|expired|gone/i.test(msg) || !msg
                ? 'Too late to undo — rebuild again instead.'
                : msg}
            </span>
          )}
        </>
      )}
    </p>
  );
}
