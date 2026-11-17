/* How we work, v2 (design/workflows/how-we-work.md): the drawing is the page.
     Back · title row (h2 + the one action) · kicker · canvas · words line · "Show as a list" ·
     Other ways row · ask the director.
   View by default; Edit turns the same canvas editable in place (Save / Cancel in the title row).
   `id` (route): a stable way's id, or `goal-<goalId>` for a temporary one; unknown → the usual way. */
import { type FormEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { type Goal, invalidate, isApiError, setQueryData, type Workflow } from '../../api';
import { formatRoute, type OfficeSub } from '../../shell/router';
import { Button } from '../../ui';
import {
  type EditorControls,
  type Graph,
  type Person,
  type Resolve,
  type ThumbWay,
  toGraph,
  WayThumb,
  WorkflowEditor,
  withDrawing,
} from '../collab';
import { keys, officeApi } from './api';
import { useWork, useWorkflows } from './Board';
import './how-we-work.css';

/* "Show as a list" opens by default when the page was reached by keyboard (the last input was a key) */
let lastKey = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (lastKey = true), true);
  window.addEventListener('pointerdown', () => (lastKey = false), true);
}

export type HowProps = {
  pid: string;
  id?: string;
  dir: string;
  go: (sub: OfficeSub, id?: string) => void;
  escapeRef: RefObject<(() => boolean) | null>;
  resolve: Resolve;
  people: Person[];
};

type Shown =
  | { kind: 'office'; way: Workflow; first: boolean }
  | { kind: 'temp'; goal: Goal; way: NonNullable<Goal['workflow']> };

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isTemp = (g: Goal) => !!g.workflow?.temporary;

export function HowWeWork({ pid, id, dir, go, escapeRef, resolve, people }: HowProps) {
  const wq = useWorkflows(pid);
  const goals = useWork(pid).data ?? [];
  const wfs = wq.data?.workflows ?? [];
  const temps = goals.filter((g) => g.status === 'running' && isTemp(g));

  /* the way on the canvas: from the route, swapped in place by the row (URL replaced, no history entry) */
  const [sel, setSel] = useState(id);
  useEffect(() => setSel(id), [id]);
  const shown: Shown | null = (() => {
    if (sel?.startsWith('goal-')) {
      const g = goals.find((x) => x.id === sel.slice(5) && isTemp(x));
      if (g?.workflow) return { kind: 'temp', goal: g, way: g.workflow };
    }
    const w = wfs.find((x) => x.id === sel) ?? wfs[0];
    return w ? { kind: 'office', way: w, first: w === wfs[0] } : null;
  })();
  const pick = (way: string) => {
    setSel(way);
    history.replaceState(null, '', formatRoute({ name: 'office', projectId: pid, sub: 'how', id: way }));
  };

  /* edit in place */
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [ask, setAsk] = useState<null | (() => void)>(null);
  const [startedAs, setStartedAs] = useState('');
  const controls = useRef<EditorControls | null>(null);
  const [listOpen, setListOpen] = useState(lastKey);
  const office = shown?.kind === 'office' ? shown.way : null;
  const graph = shown ? toGraph({ ...shown.way, gates: shown.way.gates ?? [] }) : null;
  const graphKey = JSON.stringify(graph);
  const changedMeanwhile = editing && office && startedAs && startedAs !== JSON.stringify(office);

  const startEdit = () => {
    if (!office) return;
    setStartedAs(JSON.stringify(office));
    setEditing(true);
    setDirty(false);
  };
  const stopEdit = () => {
    setEditing(false);
    setDirty(false);
    setAsk(null);
  };
  /** Leave edit mode (or the page) — asks first when there are unsaved changes. */
  const guard = (then: () => void) => {
    if (editing && dirty) setAsk(() => then);
    else then();
  };
  const back = () =>
    guard(() => {
      stopEdit();
      go('board');
    });

  const escRef = useRef<() => boolean>(() => false);
  escRef.current = () => {
    if (ask) {
      setAsk(null);
      return true;
    }
    if (editing) guard(stopEdit);
    else go('board');
    return true;
  };
  useEffect(() => {
    escapeRef.current = () => escRef.current();
    return () => {
      escapeRef.current = null;
    };
  }, [escapeRef]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(t);
  }, [savedFlash]);

  const saveDrawing = async (g: Graph) => {
    if (!office) return;
    const list: Workflow[] = wfs.map((w) => (w.id === office.id ? withDrawing(w, g) : w));
    const r = await officeApi.saveWorkflows(pid, list);
    setQueryData(keys.workflows(pid), r);
  };
  const save = async () => {
    if (!controls.current || saving) return;
    setSaving(true);
    try {
      if (await controls.current.save()) {
        stopEdit();
        setSavedFlash(true);
      }
    } finally {
      setSaving(false);
    }
  };

  /* who can stand on the drawing: the project's people, plus a temporary crew from outside it */
  const onCanvas: Person[] =
    shown?.kind === 'temp'
      ? [
          ...people,
          ...[shown.way.lead ?? '', ...(shown.way.crew ?? [])].flatMap((a) => {
            const w = a && !people.some((x) => x.id === a) ? resolve.agent(a) : null;
            return w ? [{ id: a, name: w.name, look: w.look }] : [];
          }),
        ]
      : people;

  const wordsId = `hw-words-${pid}`;
  const words = shown ? shown.way.inWords || shown.way.summary : '';
  const ended = shown?.kind === 'temp' && shown.goal.status !== 'running';
  const kicker = !shown ? null : shown.kind === 'temp' ? (
    <>
      <b>Just for this goal</b> · {short(shown.goal.text, 60)} ·{' '}
      {ended ? 'this goal has ended' : 'ends when it ships'} · ask {dir} to change it
    </>
  ) : shown.first ? (
    <>
      <b>Office way</b> · every goal unless {dir} picks another
    </>
  ) : (
    <>
      <b>Office way</b> · {shown.way.name}
      {shown.way.when ? ` · for ${shown.way.when}` : ''}
    </>
  );

  const showRow = !editing && (wfs.length > 1 || temps.length > 0);
  const action = editing ? (
    <>
      <Button small variant="ghost" onClick={() => guard(stopEdit)} disabled={saving}>
        Cancel
      </Button>
      <Button small variant="hero" onClick={() => void save()} disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  ) : office && graph ? (
    <Button small variant="hero" onClick={startEdit}>
      Edit
    </Button>
  ) : null;

  return (
    <div className="hw">
      <button type="button" className="ob-back" aria-label="Back to the Quest Board" onClick={back}>
        ← Quest Board
      </button>
      <header className="hw-title">
        <h2 className="ob-h">How we work</h2>
        <span className="hw-saved" aria-live="polite">
          {savedFlash ? 'Saved ✓' : ''}
        </span>
        <span className="hw-acts">{action}</span>
      </header>
      {ask && (
        <div className="ob-confirm hw-ask-leave" role="alert">
          <span>This way isn’t saved.</span>
          <Button small variant="ghost" onClick={() => setAsk(null)}>
            Keep editing
          </Button>
          <Button
            small
            variant="ghost"
            onClick={() => {
              const then = ask;
              stopEdit();
              then();
            }}
          >
            Discard
          </Button>
        </div>
      )}

      {wq.error && !wq.data ? (
        <div className="hw-canvas hw-msg">
          <p>Couldn’t load how this office works.</p>
          <Button small variant="ghost" onClick={() => void wq.refetch()}>
            Try again
          </Button>
        </div>
      ) : !shown ? (
        <>
          <p className="hw-kicker hw-skel" aria-hidden="true" />
          <div className="hw-canvas hw-skel" data-testid="hw-loading">
            <span className="sr-only">Loading…</span>
          </div>
        </>
      ) : (
        <>
          <p className="hw-kicker">{kicker}</p>
          {changedMeanwhile && (
            <p className="hw-meanwhile">Changed by {dir} meanwhile. Your save replaces it.</p>
          )}
          <div className={`hw-canvas${shown.kind === 'temp' ? ' temp' : ''}${editing ? ' editing' : ''}`}>
            {!graph && !editing ? (
              <div className="hw-msg">
                <p>Nothing drawn yet. {dir} briefs each team’s captain and nobody signs off.</p>
                {office && (
                  <Button variant="hero" onClick={startEdit}>
                    Draw how we work
                  </Button>
                )}
              </div>
            ) : (
              <WorkflowEditor
                key={editing ? `edit:${office?.id}` : `view:${graphKey}`}
                mode={editing ? 'edit' : 'view'}
                graph={graph}
                people={onCanvas}
                controls={editing ? controls : undefined}
                onSave={editing ? saveDrawing : undefined}
                onDirty={editing ? setDirty : undefined}
                issuePrefix={office ? `workflows.${wfs.indexOf(office)}` : undefined}
                describedBy={words ? wordsId : undefined}
                listOpen={editing || listOpen}
              />
            )}
          </div>
          {words && (
            <p className="hw-words" id={wordsId}>
              {words}
            </p>
          )}
          {graph && !editing && (
            <button
              type="button"
              className="ob-target hw-list"
              aria-expanded={listOpen}
              onClick={() => setListOpen((o) => !o)}
            >
              {listOpen ? 'Hide the list' : 'Show as a list'}
            </button>
          )}
          {showRow && (
            <WaysRow
              wfs={wfs}
              temps={temps}
              people={people}
              current={shown.kind === 'temp' ? `goal-${shown.goal.id}` : shown.way.id}
              onPick={pick}
            />
          )}
        </>
      )}
      {!editing && <AskDirector pid={pid} dir={dir} />}
    </div>
  );
}

/** "Other ways": every way as a md thumb + its name; temporary ones in their own dashed group. One tab stop,
    arrow keys move along it. */
function WaysRow({
  wfs,
  temps,
  people,
  current,
  onPick,
}: {
  wfs: Workflow[];
  temps: Goal[];
  people: Person[];
  current: string;
  onPick: (way: string) => void;
}) {
  const items: { key: string; name: string; way: ThumbWay; temp: boolean }[] = [
    ...wfs.map((w) => ({ key: w.id, name: w.name, way: w, temp: false })),
    ...temps.map((g) => ({
      key: `goal-${g.id}`,
      name: g.workflow?.name ?? g.text,
      way: { gates: [], ...g.workflow } as ThumbWay,
      temp: true,
    })),
  ];
  const ref = useRef<HTMLDivElement>(null);
  const at = Math.max(
    0,
    items.findIndex((i) => i.key === current),
  );
  const onKey = (e: KeyboardEvent) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    btns[(i + d + btns.length) % btns.length]?.focus();
  };
  const btn = (it: (typeof items)[number], i: number) => (
    <button
      key={it.key}
      type="button"
      className={`hw-way${it.temp ? ' temp' : ''}`}
      aria-current={it.key === current ? 'true' : undefined}
      tabIndex={i === at ? 0 : -1}
      onClick={() => onPick(it.key)}
    >
      <WayThumb way={it.way} people={people} size="md" temporary={it.temp} />
      <span className="hw-way-n">{it.name}</span>
    </button>
  );
  const stable = items.filter((i) => !i.temp);
  const temp = items.filter((i) => i.temp);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move focus along the row's buttons
    <div className="hw-row" ref={ref} onKeyDown={onKey}>
      <fieldset className="hw-group">
        <legend className="hw-gl">Other ways</legend>
        <div className="hw-ways">{stable.map((it) => btn(it, items.indexOf(it)))}</div>
      </fieldset>
      {temp.length > 0 && (
        <fieldset className="hw-group">
          <legend className="hw-gl">Just for one goal</legend>
          <div className="hw-ways">{temp.map((it) => btn(it, items.indexOf(it)))}</div>
        </fieldset>
      )}
    </div>
  );
}

/** The ask field: the second way to change it, and the only way to add or remove a whole way. */
function AskDirector({ pid, dir }: { pid: string; dir: string }) {
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; err?: boolean } | null>(null);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const v = ask.trim();
    if (!v || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const r = await officeApi.designCollaboration(pid, v);
      setQueryData(keys.collaboration(pid), { collaboration: r.collaboration, designed: true });
      void invalidate(keys.workflows(pid));
      setAsk('');
      setReply({ text: r.reply });
    } catch (err) {
      setReply({ text: isApiError(err) ? err.message : 'That didn’t reach the orchestrator.', err: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form className="ob-how-ask" onSubmit={send}>
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder={`Ask ${dir} to change how we work…`}
          aria-label={`Ask ${dir} to change how we work`}
          maxLength={500}
          disabled={busy}
        />
        <Button small variant="hero" type="submit" disabled={busy || !ask.trim()}>
          Send
        </Button>
      </form>
      <div className="op-log ob-how-log" aria-live="polite">
        {busy && (
          <div className="bubble them">
            <span className="sr-only">{dir} is thinking</span>
            <span className="typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {reply && (
          <div className={`bubble them${reply.err ? ' err' : ''}`}>
            <span className="who">{dir}</span>
            <span className="t">{reply.text}</span>
          </div>
        )}
      </div>
    </>
  );
}
