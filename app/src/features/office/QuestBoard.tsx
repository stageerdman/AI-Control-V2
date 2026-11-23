/* The Quest Board's two sections (design-quest-board.md in updates/2026-11-16 MAIN AND SIDE QUESTS):
     Main Quests  one big card (ribbon · progress · the trail of steps) + the other features in progress, folded
     Side Quests  pinned cards, one per side-quest goal; older finished ones fold into one strip
   Every row and card keeps the task card's anatomy (TaskCard.tsx): mark · title · who · why it stopped. */
import { useState } from 'react';
import { type Goal, invalidate, isApiError, type Look, studio, useQuery, type WaitingNote } from '../../api';
import { Hero } from '../../characters';
import type { OfficeSub } from '../../shell/router';
import { Button, toast } from '../../ui';
import { type Feature, keys } from './api';
import type { TimeTag as TimeTagView } from './estimates';
import { type MainQuest, questBoard, type SideQuest } from './quests';
import { SignedLine } from './SignoffStrip';
import { taskCard } from './state';
import { Mark, People, Problem, TaskCard } from './TaskCard';
import { canStartFresh, notesOf, StartFresh, WaitingNotes } from './TaskTools';
import { TimeTag } from './TimeTag';
import { WorkflowChip } from './WorkflowChip';
import { chipOf, signedLine } from './workflow-view';
import './quests.css';

type Props = {
  pid: string;
  dir: string;
  goals: Goal[];
  features: Feature[];
  go: (sub: OfficeSub, id?: string) => void;
  nameOf: (id: string) => string;
  /** A face for a workflow's lead (null: someone who left). */
  who?: Who;
  /** The project's usual workflow: a goal on it shows no chip. */
  defaultWorkflowId?: string;
  /** For tests: what "this hour" is. */
  now?: Date;
  /** Time per top-level task id (estimates.ts): what it took, or what it usually takes. */
  times?: Map<string, TimeTagView>;
};

type Who = (id: string) => { name: string; look?: Look } | null;
type Wf = {
  pid?: string;
  notes?: WaitingNote[];
  who?: Who;
  wid?: string;
  open?: (way: string) => void;
  times?: Map<string, TimeTagView>;
};

export function QuestBoard({
  pid,
  dir,
  goals,
  features,
  go,
  nameOf,
  who,
  defaultWorkflowId,
  now,
  times,
}: Props) {
  const b = questBoard(goals, features, now);
  /* notes only wait on running agents: read them only while something runs */
  const running = goals.some((g) => g.items.some((i) => i.status === 'running'));
  const { data: notes } = useQuery(running ? keys.notes(pid) : null, () => studio.projects.notes(pid));
  const wf: Wf = { pid, notes, who, wid: defaultWorkflowId, open: (way) => go('how', way), times };
  return (
    <>
      <section aria-labelledby="qbMain" className="qb-sec">
        <h3 id="qbMain">Main Quests</h3>
        <MainCard pid={pid} dir={dir} q={b.main} go={go} nameOf={nameOf} wf={wf} />
        {b.others.length > 0 && (
          <ul className="qb-others">
            {b.others.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => go('feature', f.id)}>
                  <Glyph id="main" />
                  <span className="qb-on">{f.name}</span>
                  <span className="ob-track" aria-hidden="true">
                    <i style={{ width: `${f.pct ?? 0}%` }} />
                  </span>
                  <span className="ob-pct">{f.pct ?? 0}%</span>
                  <span className="ob-chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {b.tagged && (
        <section aria-labelledby="qbSide" className="qb-sec">
          <div className="qb-sh">
            <h3 id="qbSide">Side Quests</h3>
            {b.count && <span className="qb-count">{b.count}</span>}
          </div>
          <GoalActions pid={pid} goals={b.stuckSide} label="Side quest stopped partway." />
          {!b.side.length && !b.doneEarlier.length ? (
            <p className="ob-empty">No side quests. All quiet.</p>
          ) : (
            <>
              {b.side.length > 0 && <SideGrid quests={b.side} nameOf={nameOf} wf={wf} />}
              <DoneStrip quests={b.doneEarlier} nameOf={nameOf} />
            </>
          )}
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------ main quest */
function MainCard({
  pid,
  dir,
  q,
  go,
  nameOf,
  wf,
}: {
  pid: string;
  dir: string;
  q: MainQuest | null;
  go: Props['go'];
  nameOf: Props['nameOf'];
  wf: Wf;
}) {
  if (!q)
    return (
      <div className="qb-main empty">
        <div className="qb-top" aria-hidden="true">
          <div className="qb-rh">
            <div className="qb-ribbon" />
          </div>
        </div>
        <p className="ob-empty">No main quest yet. Tell {dir} what to build.</p>
      </div>
    );
  const lastDone = q.steps.reduce((n, s, i) => (s.item.status === 'done' ? i : n), -1);
  const label = `Main quest: ${q.name}, ${q.pct}%, ${q.done} of ${q.total} step${q.total === 1 ? '' : 's'}`;
  return (
    <div className="qb-main">
      <div className="qb-top">
        <h4 className="qb-rh">
          {q.featureId ? (
            <button
              type="button"
              className="qb-ribbon"
              title={q.name}
              aria-label={label}
              onClick={() => go('feature', q.featureId ?? undefined)}
            >
              <span>{q.name}</span>
            </button>
          ) : (
            <span className="qb-ribbon" title={q.name}>
              <span aria-hidden="true">{q.name}</span>
              <span className="sr-only">{label}</span>
            </span>
          )}
        </h4>
        <WorkflowChip chip={chipOf(q.goal, wf.wid)} who={wf.who} onOpen={wf.open} />
        {q.featureId && (
          <button type="button" className="qb-ships" onClick={() => go('feature', q.featureId ?? undefined)}>
            {q.ships ? 'Ships when done ›' : 'Part of this quest ›'}
          </button>
        )}
      </div>
      <div className="qb-prog" aria-hidden="true">
        <b>
          {q.pct}
          <small>%</small>
        </b>
        <span>
          {q.done} of {q.total} step{q.total === 1 ? '' : 's'}
        </span>
        <span className="ob-track">
          <i style={{ width: `${q.pct}%` }} />
        </span>
      </div>
      {q.steps.length ? (
        <ul className="ob-tasks qb-trail">
          {q.steps.map((s, i) => {
            const stuck = q.stuckGoalOf[s.id];
            // a later step behind a stopped one waits for that one: only the first stopped step offers Start fresh
            const fresh = canStartFresh(
              s.item,
              q.steps.map((x) => x.item),
            );
            return (
              <TaskCard
                key={s.id}
                item={s.item}
                nameOf={nameOf}
                time={wf.times?.get(s.item.id)}
                className={i < lastDone ? 'qb-lit' : undefined}
                actions={
                  stuck || fresh ? (
                    <>
                      {stuck && <GoalActions pid={pid} goals={[{ id: stuck } as Goal]} label={null} />}
                      {fresh && <StartFresh pid={pid} item={s.item} />}
                    </>
                  ) : undefined
                }
                notes={<WaitingNotes pid={pid} notes={notesOf(s.item, wf.notes)} nameOf={nameOf} />}
              />
            );
          })}
        </ul>
      ) : (
        <p className="ob-empty">No steps yet. {dir} writes them here as the plan takes shape.</p>
      )}
      <SignedLine text={signedLine(q.goal)} />
    </div>
  );
}

/* ------------------------------------------------------------ side quests */
const PIN: Record<string, string> = {
  todo: 'var(--sun-deep)',
  active: 'var(--sun-deep)',
  done: 'var(--teal)',
  failed: 'var(--coral)',
  stopped: 'rgba(91,82,128,.4)',
};

function SideGrid({ quests, nameOf, wf }: { quests: SideQuest[]; nameOf: Props['nameOf']; wf?: Wf }) {
  return (
    <ul className="qb-grid">
      {quests.map((q, i) => (
        <SideCard key={q.goal.id} q={q} i={i} nameOf={nameOf} wf={wf} />
      ))}
    </ul>
  );
}

function SideCard({ q, i, nameOf, wf }: { q: SideQuest; i: number; nameOf: Props['nameOf']; wf?: Wf }) {
  const v = q.item
    ? taskCard(q.item, nameOf)
    : ({ mark: 'todo', people: [], status: null, tone: null, problem: null, sr: 'To do:' } as const);
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: each card is one focus stop (design §5, keyboard)
    <li className={`qb-side m-${v.mark} t${i % 4}`} tabIndex={0}>
      <Pin color={PIN[v.mark]} />
      <div className="qb-st">
        <span className="qb-title">
          <span className="sr-only">Side quest. {v.sr} </span>
          {q.goal.text}
        </span>
        <Mark mark={v.mark} />
      </div>
      <div className="qb-who">
        {v.problem ? (
          <Problem problem={v.problem} failed={v.mark === 'failed'} />
        ) : v.mark === 'todo' ? (
          <span className="qb-wait">Waiting</span>
        ) : (
          <span className="ob-right">
            <People v={v} />
            <TimeTag tag={q.item ? wf?.times?.get(q.item.id) : null} />
          </span>
        )}
        {wf && <WorkflowChip chip={chipOf(q.goal, wf.wid)} who={wf.who} onOpen={wf.open} />}
      </div>
      {wf?.pid && q.item && (
        <>
          <WaitingNotes pid={wf.pid} notes={notesOf(q.item, wf.notes)} nameOf={nameOf} />
          {canStartFresh(q.item, q.goal.items) && (
            <div className="ob-acts">
              <StartFresh pid={wf.pid} item={q.item} />
            </div>
          )}
        </>
      )}
      {wf && <SignedLine text={signedLine(q.goal)} />}
    </li>
  );
}

/** "✓ 4 more side quests done · (faces) Pete, Ava, Scarlett +1 · Show ▾" — unfolds into the same cards. */
function DoneStrip({ quests, nameOf }: { quests: SideQuest[]; nameOf: Props['nameOf'] }) {
  const [open, setOpen] = useState(false);
  if (!quests.length) return null;
  const seen = new Map<string, { id: string; name: string; look?: unknown }>();
  for (const q of quests) {
    const p = q.item ? taskCard(q.item, nameOf).people[0] : undefined;
    if (p && !seen.has(p.id)) seen.set(p.id, p);
  }
  const people = [...seen.values()];
  const names =
    people
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ') + (people.length > 3 ? ` +${people.length - 3}` : '');
  const n = quests.length;
  return (
    <>
      <div className="qb-done">
        <span className="qb-tick" aria-hidden="true">
          ✓
        </span>
        <span>
          {n} more side quest{n === 1 ? '' : 's'} done
        </span>
        {people.length > 0 && (
          <span className="qb-dpeople">
            <span className="ob-faces" aria-hidden="true">
              {people.slice(0, 3).map((p) => (
                <span className="ob-face" key={p.id}>
                  {p.look ? (
                    <Hero agent={{ name: p.name, look: p.look as never }} size={22} />
                  ) : (
                    <Hero ghost size={22} />
                  )}
                </span>
              ))}
            </span>
            <span className="qb-dn">by {names}</span>
          </span>
        )}
        <button type="button" className="ob-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide ▴' : 'Show ▾'}
        </button>
      </div>
      {open && <SideGrid quests={quests} nameOf={nameOf} />}
    </>
  );
}

/* ------------------------------------------------------------ parts */
/** Work that stopped partway: carry on where it was, or drop it off the board. */
export function GoalActions({
  pid,
  goals,
  label,
}: {
  pid: string;
  goals: Pick<Goal, 'id'>[];
  label: string | null;
}) {
  const [busy, setBusy] = useState(false);
  if (!goals.length) return null;
  const all = async (fn: (goalId: string) => Promise<unknown>, what: string) => {
    setBusy(true);
    try {
      for (const g of goals) await fn(g.id);
    } catch (e) {
      toast(`Couldn’t ${what} — ${isApiError(e) ? e.message : 'try again'}`);
    } finally {
      void invalidate(keys.work(pid));
      setBusy(false);
    }
  };
  const bar = (
    <>
      <Button
        small
        variant="hero"
        disabled={busy}
        onClick={() => void all((id) => studio.projects.resumeGoal(pid, id), 'continue')}
      >
        Continue
      </Button>
      <Button
        small
        disabled={busy}
        onClick={() => void all((id) => studio.projects.cancelGoal(pid, id), 'drop it')}
      >
        Drop
      </Button>
    </>
  );
  if (label === null) return bar;
  return (
    <div className="ob-stopped">
      <span>{label}</span>
      {bar}
    </div>
  );
}

const Pin = ({ color }: { color: string }) => (
  <svg className="qb-pin" viewBox="0 0 20 22" aria-hidden="true" style={{ ['--pin' as string]: color }}>
    <ellipse cx="11" cy="19" rx="6" ry="2" fill="#241a44" opacity=".16" />
    <circle cx="10" cy="9" r="7.5" fill="var(--pin)" />
    <circle cx="7.4" cy="6.4" r="2.2" fill="#fff6e9" opacity=".85" />
  </svg>
);

/** The quest glyphs (parts/quest-glyphs.svg); only #main is used — the server has no side-quest kind yet. */
export const Glyph = ({ id, size = 16 }: { id: 'main'; size?: number }) => (
  <svg className={`qb-g qb-g-${id}`} viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
    <path d="M3.5 2v12.5" stroke="#241a44" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M4.4 2.6h9l-2.4 3 2.4 3h-9z" fill="#ff9b3d" />
  </svg>
);
