/* The workflow editor (WORKFLOWS Phase 5b): one calm canvas for all three kinds (office, team,
   temporary). Agents (and teams) are cards you drag or move with the arrow keys; two arrow styles
   only — solid = hands work to, dashed with a ✓ = signs off; a branch ("only if …") is small italic
   words on its arrow. "Starts here" / "Signs last" are badges set from the selected node's toolbar.
   The same arrows are listed as text under the canvas: the keyboard and screen-reader path, and
   where problems show. One primary action: Save. Temporary drawings are read-only. */
import {
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isApiError, type Look } from '../../../api';
import { Hero } from '../../../characters';
import { Button } from '../../../ui';
import {
  ANY,
  addEdge,
  addNode,
  draftEdge,
  edgeReady,
  edgeRoom,
  edgeWords,
  type FlowEdge,
  type FlowNode,
  frame,
  GRID,
  type Graph,
  issueCount,
  kindLabel,
  localIssues,
  MAX_NODES,
  moveNode,
  NO_ISSUES,
  newGraph,
  type Pinned,
  pinIssues,
  removeEdge,
  removeNode,
  SIGNOFF_KINDS,
  sameGraph,
  setEdge,
  setRole,
} from './model';
import './flow.css';

/** Someone who may stand on a node: an agent (with a face) or a team (`team: true`). */
export type Person = { id: string; name: string; look?: Look; team?: boolean };
export type EditorProps = {
  /** The saved drawing (null = none yet) — `toGraph(workflow)`. */
  graph: Graph | null;
  /** Who may stand on a node (the project's people and teams, the team's members, the crew). */
  people: Person[];
  /** Set = read-only, with this one line (temporary workflows). */
  readOnly?: string;
  /** Throws the server's error on a refusal (422 / 409 details are pinned to their arrow / node). */
  onSave?: (g: Graph) => Promise<void>;
  /** Where the workflow sits in the request body (`workflows.0`, `workflow`). */
  issuePrefix?: string;
  /** Unsaved changes, for the opener's "leave?" prompt. */
  onDirty?: (dirty: boolean) => void;
  /** A quiet line under the canvas. */
  note?: string;
  /** 'view' = the picture only (How we work): zoomed to fit, no toolbar, no dragging, no selection,
      nodes aren't tab stops (the arrow list is the keyboard path). Default: edit (or read-only). */
  mode?: 'view' | 'edit';
  /** The arrow list: undefined = always shown; false = folded (visually hidden, still read out). */
  listOpen?: boolean;
  /** The opener hosts Save (How we work's title row): no footer; `controls.current.save()` saves. */
  controls?: MutableRefObject<EditorControls | null>;
  /** id of the words line that describes the canvas. */
  describedBy?: string;
  /** Selected when it opens (team panel's "Connect"). */
  select?: string;
  /** Cards with no arrow aren't a problem: they're left out of the save (team Adjust's faint cards). */
  dropLoose?: boolean;
};
export type EditorControls = { save: () => Promise<boolean>; dirty: boolean; saving: boolean };

const NODE = { w: 128, h: 64 };
type Draft = Omit<FlowEdge, 'id'> & { id?: string };

/** Where the arrow leaves a node's box towards (dx, dy). */
function edgeOf(dx: number, dy: number) {
  const hw = NODE.w / 2 + 4;
  const hh = NODE.h / 2 + 4;
  if (!dx && !dy) return { x: 0, y: 0 };
  const s = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: dx * s, y: dy * s };
}

export function WorkflowEditor(p: EditorProps) {
  const uid = useId();
  const view = p.mode === 'view';
  const ro = view || p.readOnly !== undefined;
  const [base, setBase] = useState<Graph | null>(p.graph);
  const [g, setG] = useState<Graph | null>(p.graph);
  const [sel, setSel] = useState<string | null>(p.select ?? null);
  const [connecting, setConnecting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [issues, setIssues] = useState<Pinned>(NO_ISSUES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [said, setSaid] = useState('');
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const frozen = useRef<ReturnType<typeof frame> | null>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());

  const byId = useMemo(() => new Map(p.people.map((x) => [x.id, x])), [p.people]);
  const nameOf = (id: string) => (id === ANY ? 'Every change' : (byId.get(id)?.name ?? 'Someone'));
  const isTeam = (id: string) => !!byId.get(id)?.team;
  const dirty = !ro && !sameGraph(g, base);
  const lastDirty = useRef(false);
  if (lastDirty.current !== dirty) {
    lastDirty.current = dirty;
    queueMicrotask(() => p.onDirty?.(dirty));
  }

  const change = (next: Graph | null) => {
    setG(next);
    setSaved(false);
  };
  const say = (m: string) => setSaid(m);
  const selected = g?.nodes.find((n) => n.id === sel) ?? null;
  const f = frozen.current ?? frame(g?.nodes ?? []);

  /* ---------- nodes */
  const pick = (id: string) => {
    if (!g) return;
    if (connecting && sel && sel !== id) {
      setConnecting(false);
      const d = draftEdge(sel, id);
      /* that pair already hands off (or 12 do): the arrow left to draw is a sign-off */
      setDraft(edgeRoom(g, d, isTeam).handoff ? d : { ...d, signoff: 'review' });
      return;
    }
    setConnecting(false);
    setSel(id === sel ? null : id);
  };
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, n: FlowNode) => {
    if (ro || e.button !== 0) return;
    drag.current = { id: n.id, px: e.clientX, py: e.clientY, x: n.x, y: n.y, moved: false };
    frozen.current = frame(g?.nodes ?? []);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || !g) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    change(moveNode(g, d.id, d.x + dx, d.y + dy));
  };
  const onPointerUp = (n: FlowNode) => {
    const d = drag.current;
    drag.current = null;
    frozen.current = null;
    if (d?.moved) return;
    pick(n.id);
  };
  const onNodeKey = (e: KeyboardEvent<HTMLButtonElement>, n: FlowNode) => {
    if (ro || !g) return;
    const step = e.shiftKey ? GRID.big : GRID.step;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[
      e.key
    ];
    if (d) {
      e.preventDefault();
      change(moveNode(g, n.id, n.x + d[0], n.y + d[1]));
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel === n.id) {
      e.preventDefault();
      remove(n);
    }
  };
  const remove = (n: FlowNode) => {
    if (!g) return;
    change(g.nodes.length === 1 ? null : removeNode(g, n.id));
    setSel(null);
    setConnecting(false);
    say(`${nameOf(n.id)} removed, with their arrows.`);
  };
  const add = (id: string) => {
    if (!id) return;
    const next = g ? addNode(g, id) : newGraph(id);
    change(next);
    setSel(id);
    say(`${nameOf(id)} added${g ? '' : ': starts here'}. Arrow keys move them.`);
    setTimeout(() => nodeEls.current.get(id)?.focus(), 0);
  };

  /* ---------- arrows */
  const saveDraft = () => {
    if (!g || !draft || !edgeReady(g, draft, isTeam)) return;
    const { id, ...e } = draft;
    const next = id ? setEdge(g, id, e) : addEdge(g, e);
    change(next);
    setDraft(null);
    const made = id
      ? next.edges.find((x) => x.id === id)
      : next.edges.find((x) => !g.edges.some((y) => y.id === x.id));
    if (made) {
      say(`${id ? 'Changed' : 'Added'}: ${edgeWords(made, nameOf)}.`);
      setIssues((s) => ({
        ...s,
        edges: Object.fromEntries(Object.entries(s.edges).filter(([k]) => k !== made.id)),
      }));
    }
  };

  /* ---------- save */
  const save = async (): Promise<boolean> => {
    if (!g || !p.onSave || saving) return false;
    const touched = new Set(g.edges.flatMap((e) => [e.from, e.to]));
    const out: Graph = p.dropLoose ? { ...g, nodes: g.nodes.filter((n) => touched.has(n.id)) } : g;
    const local = localIssues(out, nameOf);
    if (issueCount(local)) {
      setIssues(local);
      say(`Not saved: ${issueCount(local)} problem${issueCount(local) === 1 ? '' : 's'} to fix, marked below.`);
      focusFirstProblem(local);
      return false;
    }
    setSaving(true);
    setIssues(NO_ISSUES);
    try {
      await p.onSave(out);
      setBase(g);
      setSaved(true);
      say('Saved.');
      return true;
    } catch (err) {
      const pinned = isApiError(err)
        ? pinIssues(out, err.details, p.issuePrefix ?? '')
        : { ...NO_ISSUES, general: ['That didn’t save — try again.'] };
      if (isApiError(err) && !issueCount(pinned)) pinned.general.push(err.message);
      setIssues(pinned);
      say(
        `Not saved: ${issueCount(pinned)} problem${issueCount(pinned) === 1 ? '' : 's'} to fix, marked below.`,
      );
      focusFirstProblem(pinned);
      return false;
    } finally {
      setSaving(false);
    }
  };
  /** Focus goes to the first problem: its card, else its row in the arrow list. */
  const root = useRef<HTMLElement>(null);
  const focusFirstProblem = (pin: Pinned) => {
    setTimeout(() => {
      const node = Object.keys(pin.nodes)[0];
      if (node) return nodeEls.current.get(node)?.focus();
      root.current?.querySelector<HTMLElement>('.fe-list li.bad button, .fe-errs')?.focus();
    }, 0);
  };
  if (p.controls) p.controls.current = { save, dirty, saving };
  /* view mode: zoom the whole board to the width it has */
  const canvasEl = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    if (!view || !canvasEl.current || typeof ResizeObserver === 'undefined') return;
    const el = canvasEl.current;
    const ro2 = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const f2 = frame(g?.nodes ?? []);
      if (w && h) setFit(Math.min(1, w / f2.width, h / f2.height));
    });
    ro2.observe(el);
    return () => ro2.disconnect();
  }, [view, g]);

  /* ---------- render */
  const free = p.people.filter((x) => !g?.nodes.some((n) => n.id === x.id));
  const pos = (n: FlowNode) => ({ x: n.x - f.minX, y: n.y - f.minY });
  const drawn = (g?.edges ?? []).filter((e) => e.from !== ANY);
  const pairs = new Map<string, string[]>();
  for (const e of drawn) {
    const k = [e.from, e.to].sort().join('|');
    pairs.set(k, [...(pairs.get(k) ?? []), e.id]);
  }

  return (
    <section
      ref={root}
      className={`fe${view ? ' fe-view' : ''}`}
      aria-label="Workflow drawing"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (connecting || draft)) {
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          setConnecting(false);
          setDraft(null);
        }
      }}
    >
      {p.readOnly !== undefined && <p className="fe-ro">{p.readOnly}</p>}
      {!g ? (
        <div className="fe-empty">
          <p>{ro ? 'Nothing drawn yet.' : 'Start with who picks the work up first.'}</p>
          {!ro && <PersonPicker id={`${uid}-first`} people={p.people} onPick={add} label="Who starts" />}
        </div>
      ) : (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a click on empty canvas clears the selection */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape / the node buttons are the keyboard path */}
          <div
            ref={canvasEl}
            className={`fe-canvas${connecting ? ' connecting' : ''}`}
            role={view ? 'img' : undefined}
            aria-label={view ? 'The way, drawn' : undefined}
            aria-describedby={p.describedBy}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSel(null);
                setConnecting(false);
              }
            }}
          >
            <div
              className="fe-board"
              style={{
                width: f.width,
                height: f.height,
                /* `zoom` shrinks the layout box too, so nothing scrolls */
                ...(view && fit < 1 ? { zoom: fit } : {}),
              }}
            >
              <svg className="fe-arrows" width={f.width} height={f.height} aria-hidden="true">
                <defs>
                  {['tip', 'tipbad'].map((t) => (
                    <marker
                      key={t}
                      id={`${uid}-${t}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto"
                    >
                      <path d="M0 0L10 5L0 10z" className={`fe-tip${t === 'tipbad' ? ' bad' : ''}`} />
                    </marker>
                  ))}
                </defs>
                {drawn.map((e) => {
                  const a = g.nodes.find((n) => n.id === e.from);
                  const b = g.nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const pa = pos(a);
                  const pb = pos(b);
                  const same = pairs.get([e.from, e.to].sort().join('|')) ?? [e.id];
                  const k = same.indexOf(e.id) - (same.length - 1) / 2;
                  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
                  /* parallel arrows between one pair sit side by side, never on top of each other */
                  const sign = e.from < e.to ? 1 : -1;
                  const ox = (-(pb.y - pa.y) / len) * k * 16 * sign;
                  const oy = ((pb.x - pa.x) / len) * k * 16 * sign;
                  const s = edgeOf(pb.x - pa.x, pb.y - pa.y);
                  const x1 = pa.x + s.x + ox;
                  const y1 = pa.y + s.y + oy;
                  const x2 = pb.x - s.x + ox;
                  const y2 = pb.y - s.y + oy;
                  const bad = !!issues.edges[e.id];
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  return (
                    <g key={e.id} className={`fe-edge${e.signoff ? ' signoff' : ''}${bad ? ' bad' : ''}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        markerEnd={`url(#${uid}-${bad ? 'tipbad' : 'tip'})`}
                      />
                      {e.signoff && (
                        <g transform={`translate(${mx} ${my})`}>
                          <circle r="9" className="fe-check-bg" />
                          <path d="M-4 0.5l2.6 2.6L4.2-3" className="fe-check" />
                        </g>
                      )}
                      {e.when && (
                        <text x={mx} y={my - 14} className="fe-branch" textAnchor="middle">
                          {e.when.length > 34 ? `${e.when.slice(0, 33)}…` : e.when}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {g.nodes.map((n) => {
                const at = pos(n);
                const who = byId.get(n.id);
                const team = !!who?.team;
                const bad = !!issues.nodes[n.id];
                const badges = [g.first === n.id && 'Starts here', g.final === n.id && 'Signs last'].filter(
                  Boolean,
                ) as string[];
                const label = `${nameOf(n.id)}${team ? ', a team' : ''}${
                  badges.length ? `, ${badges.join(', ')}` : ''
                }${bad ? `, problem: ${issues.nodes[n.id].join('; ')}` : ''}${
                  connecting && sel !== n.id ? '. Connect here' : ''
                }`;
                return (
                  <button
                    key={n.id}
                    ref={(el) => {
                      if (el) nodeEls.current.set(n.id, el);
                      else nodeEls.current.delete(n.id);
                    }}
                    type="button"
                    className={`fe-node${team ? ' team' : ''}${sel === n.id ? ' sel' : ''}${bad ? ' bad' : ''}${
                      p.dropLoose && !g.edges.some((e) => e.from === n.id || e.to === n.id) ? ' loose' : ''
                    }`}
                    style={{ left: at.x, top: at.y }}
                    tabIndex={view ? -1 : undefined}
                    aria-hidden={view || undefined}
                    aria-label={label}
                    aria-pressed={ro ? undefined : sel === n.id}
                    onPointerDown={(e) => onPointerDown(e, n)}
                    onPointerMove={onPointerMove}
                    onPointerUp={() => onPointerUp(n)}
                    onClick={(e) => {
                      /* keyboard Enter / Space (pointer clicks are handled on pointer up) */
                      if (e.detail === 0 && !ro) pick(n.id);
                    }}
                    onKeyDown={(e) => onNodeKey(e, n)}
                  >
                    {team ? (
                      <span className="fe-team" aria-hidden="true">
                        {(who?.name ?? '?').slice(0, 1).toUpperCase()}
                      </span>
                    ) : (
                      <span className="fe-face" aria-hidden="true">
                        {who?.look ? (
                          <Hero agent={{ name: who.name, look: who.look }} size={34} />
                        ) : (
                          <Hero ghost size={34} />
                        )}
                      </span>
                    )}
                    <span className="fe-name">{who?.name ?? 'Someone'}</span>
                    {badges.length > 0 && (
                      <span className="fe-badges" aria-hidden="true">
                        {badges.map((b) => (
                          <i key={b}>{b}</i>
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {!ro && (
            <div className="fe-tools" role="toolbar" aria-label={selected ? nameOf(selected.id) : 'Add'}>
              {connecting && selected ? (
                <>
                  <span className="fe-hint">Pick where {nameOf(selected.id)}’s work goes.</span>
                  <Button small variant="ghost" onClick={() => setConnecting(false)}>
                    Cancel
                  </Button>
                </>
              ) : selected ? (
                <>
                  <b className="fe-who">{nameOf(selected.id)}</b>
                  <button
                    type="button"
                    className="fe-tog"
                    aria-pressed={g.first === selected.id}
                    onClick={() => change(setRole(g, selected.id, 'first', isTeam))}
                  >
                    Starts here
                  </button>
                  {!isTeam(selected.id) && (
                    <button
                      type="button"
                      className="fe-tog"
                      aria-pressed={g.final === selected.id}
                      onClick={() => change(setRole(g, selected.id, 'final', isTeam))}
                    >
                      Signs last
                    </button>
                  )}
                  <Button
                    small
                    variant="ghost"
                    disabled={g.nodes.length < 2}
                    onClick={() => {
                      setConnecting(true);
                      setDraft(null);
                      say(`Pick where ${nameOf(selected.id)}’s work goes: Tab to a node, press Enter.`);
                    }}
                  >
                    Connect to…
                  </Button>
                  <button type="button" className="fe-link danger" onClick={() => remove(selected)}>
                    Remove
                  </button>
                </>
              ) : (
                <>
                  {g.nodes.length < MAX_NODES && (
                    <PersonPicker id={`${uid}-add`} people={free} onPick={add} label="+ Add someone" />
                  )}
                  <span className="fe-hint">Select a card to connect it.</span>
                </>
              )}
            </div>
          )}

          {draft && (
            <ArrowForm
              uid={uid}
              g={g}
              draft={draft}
              nameOf={nameOf}
              isTeam={isTeam}
              onChange={setDraft}
              onDone={saveDraft}
              onCancel={() => setDraft(null)}
            />
          )}

          <div className={p.listOpen === false ? 'sr-only' : undefined} data-testid="fe-arrows-list">
          <h4 className="fe-h" id={`${uid}-list`}>
            Arrows
          </h4>
          {!g.edges.length ? (
            <p className="fe-none">{ro ? 'No arrows.' : 'No arrows yet. Select a card, then Connect to…'}</p>
          ) : (
            <ol className="fe-list" aria-labelledby={`${uid}-list`}>
              {g.edges.map((e) => {
                const errs = issues.edges[e.id];
                return (
                  <li key={e.id} className={errs ? 'bad' : undefined}>
                    <span className={`fe-glyph${e.signoff ? ' signoff' : ''}`} aria-hidden="true">
                      {e.signoff ? '✓' : '→'}
                    </span>
                    <span className="fe-words">{edgeWords(e, nameOf)}</span>
                    {!ro && (
                      <span className="fe-acts">
                        {e.from !== ANY && (
                          <button type="button" className="fe-link" onClick={() => setDraft({ ...e })}>
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className="fe-link danger"
                          aria-label={`Remove: ${edgeWords(e, nameOf)}`}
                          onClick={() => {
                            change(removeEdge(g, e.id));
                            say('Arrow removed.');
                          }}
                        >
                          Remove
                        </button>
                      </span>
                    )}
                    {errs && (
                      <p className="fe-err" role="alert">
                        {errs.join(' · ')}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          </div>
        </>
      )}

      {(issues.general.length > 0 || Object.keys(issues.nodes).length > 0) && (
        <ul className="fe-errs" role="alert" tabIndex={-1}>
          {issues.general.map((m) => (
            <li key={m}>{m}</li>
          ))}
          {Object.entries(issues.nodes).map(([id, ms]) => (
            <li key={id}>
              {nameOf(id)}: {ms.join(' · ')}
            </li>
          ))}
        </ul>
      )}
      {p.note && <p className="fe-note">{p.note}</p>}
      {!ro && !p.controls && (
        <footer className="fe-foot">
          <span className="fe-saved">{dirty ? 'Unsaved' : saved ? 'Saved ✓' : ''}</span>
          <Button small variant="hero" disabled={!g || !dirty || saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </footer>
      )}
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
    </section>
  );
}

function PersonPicker({
  id,
  people,
  onPick,
  label,
}: {
  id: string;
  people: Person[];
  onPick: (id: string) => void;
  label: string;
}) {
  const agents = people.filter((x) => !x.team);
  const teams = people.filter((x) => x.team);
  return (
    <select
      id={id}
      className="fe-in fe-pick"
      aria-label={label.replace(/^\+ /, '')}
      value=""
      disabled={!people.length}
      onChange={(e) => onPick(e.target.value)}
    >
      <option value="">{people.length ? label : 'Everyone is on it'}</option>
      {agents.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
      {teams.length > 0 && (
        <optgroup label="Teams">
          {teams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** One small form for a new or changed arrow: hand-off or sign-off, why, "only when…" (optional). */
function ArrowForm({
  uid,
  g,
  draft,
  nameOf,
  isTeam,
  onChange,
  onDone,
  onCancel,
}: {
  uid: string;
  g: Graph;
  draft: Draft;
  nameOf: (id: string) => string;
  isTeam: (id: string) => boolean;
  onChange: (d: Draft) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const room = edgeRoom(g, draft, isTeam);
  const set = (patch: Partial<FlowEdge>) => onChange({ ...draft, ...patch });
  return (
    <form
      className="fe-form"
      aria-label="Arrow"
      onSubmit={(e) => {
        e.preventDefault();
        onDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <p className="fe-form-h">
        {nameOf(draft.from)} <span aria-hidden="true">→</span>
        <span className="sr-only">to</span> {nameOf(draft.to)}
      </p>
      <fieldset className="fe-kind">
        <legend className="sr-only">What this arrow means</legend>
        <label className={room.handoff ? undefined : 'off'}>
          <input
            type="radio"
            name={`${uid}-kind`}
            disabled={!room.handoff}
            checked={!draft.signoff}
            onChange={() => set({ signoff: undefined })}
          />
          Hands work to
        </label>
        <label className={room.signoff ? undefined : 'off'}>
          <input
            type="radio"
            name={`${uid}-kind`}
            disabled={!room.signoff}
            checked={!!draft.signoff}
            onChange={() => set({ signoff: 'review' })}
          />
          Signs off
        </label>
        {draft.signoff && (
          <select
            className="fe-in"
            aria-label="Kind of sign-off"
            value={draft.signoff}
            onChange={(e) => set({ signoff: e.target.value as FlowEdge['signoff'] })}
          >
            {SIGNOFF_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        )}
      </fieldset>
      <label className="fe-field">
        <span>Why</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the user just drew this arrow
          autoFocus
          className="fe-in"
          maxLength={300}
          placeholder={draft.signoff ? 'e.g. payments must not break' : 'e.g. the UI is ready, wire the endpoint'}
          value={draft.why}
          onChange={(e) => set({ why: e.target.value })}
        />
      </label>
      <label className="fe-field">
        <span>Only when</span>
        <input
          className="fe-in"
          maxLength={120}
          placeholder="optional — e.g. it touches the UI"
          value={draft.when ?? ''}
          onChange={(e) => set({ when: e.target.value })}
        />
      </label>
      <div className="fe-form-acts">
        <Button small variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button small variant="dark" type="submit" disabled={!edgeReady(g, draft, isTeam)}>
          {draft.id ? 'Change arrow' : 'Add arrow'}
        </Button>
      </div>
    </form>
  );
}
