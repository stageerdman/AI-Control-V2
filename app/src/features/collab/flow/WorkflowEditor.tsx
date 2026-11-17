/* The workflow editor (WORKFLOWS Phase 5b): one calm canvas for all three kinds (office, team,
   temporary). Agents are faces you drag (or move with the arrow keys); two arrow styles only —
   solid = hands work to, dashed with a ✓ = signs off; a decision's branches are small italic words.
   "Starts here" / "Signs last" are badges set from the selected node's toolbar. The same arrows are
   listed as text under the canvas: the keyboard and screen-reader path, and where problems show.
   One primary action: Save. Temporary drawings are read-only (one line says who changes them). */
import { type KeyboardEvent, type PointerEvent, useId, useMemo, useRef, useState } from 'react';
import { isApiError, type Look } from '../../../api';
import { Hero } from '../../../characters';
import { Button } from '../../../ui';
import {
  addAgent,
  addDecision,
  addEdge,
  draftEdge,
  edgeReady,
  edgeWords,
  type FlowEdge,
  type FlowNode,
  frame,
  GRID,
  type Graph,
  issueCount,
  kindLabel,
  MAX_EDGES,
  MAX_NODES,
  moveNode,
  newGraph,
  nodeLabel,
  type Pinned,
  pinIssues,
  removeEdge,
  removeNode,
  SIGNOFF_KINDS,
  sameGraph,
  setEdge,
  setNode,
  setRole,
} from './model';
import './flow.css';

export type Person = { id: string; name: string; look?: Look };
export type EditorProps = {
  /** The saved drawing (null = none yet). */
  graph: Graph | null;
  /** Who may stand on a node (the project, the team's members, the crew). */
  people: Person[];
  /** Set = read-only, with this one line (temporary workflows). */
  readOnly?: string;
  /** Throws the server's error on a refusal (422 details are pinned to their arrow / node). */
  onSave?: (g: Graph) => Promise<void>;
  /** Where the graph sits in the request body (`workflows.0.graph`, `graph`, '' ). */
  issuePrefix?: string;
  /** Unsaved changes, for the opener's "leave?" prompt. */
  onDirty?: (dirty: boolean) => void;
  /** A line under the canvas when the drawing replaces checks it couldn't draw. */
  note?: string;
};

const NODE = { w: 128, h: 64 };
const NO_ISSUES: Pinned = { edges: {}, nodes: {}, general: [] };

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
  const ro = p.readOnly !== undefined;
  const [base, setBase] = useState<Graph | null>(p.graph);
  const [g, setG] = useState<Graph | null>(p.graph);
  const [sel, setSel] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [draft, setDraft] = useState<(Omit<FlowEdge, 'id'> & { id?: string }) | null>(null);
  const [issues, setIssues] = useState<Pinned>(NO_ISSUES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [said, setSaid] = useState('');
  const [addWho, setAddWho] = useState('');
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const frozen = useRef<ReturnType<typeof frame> | null>(null);
  const nodeEls = useRef(new Map<string, HTMLButtonElement>());

  const byId = useMemo(() => new Map(p.people.map((x) => [x.id, x])), [p.people]);
  const nameOf = (a: string) => byId.get(a)?.name ?? 'Someone';
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
      setDraft(draftEdge(g, sel, id));
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
    const next = g.nodes.length === 1 ? null : removeNode(g, n.id);
    change(next);
    setSel(null);
    setConnecting(false);
    say(`${nodeLabel(n, nameOf)} removed, with its arrows.`);
  };
  const add = (agent: string) => {
    if (!agent) return;
    const next = g ? addAgent(g, agent) : newGraph(agent);
    const n = next.nodes[next.nodes.length - 1];
    change(next);
    setSel(n.id);
    setAddWho('');
    say(`${nameOf(agent)} added${g ? '' : ': starts here and signs last'}. Arrow keys move them.`);
    setTimeout(() => nodeEls.current.get(n.id)?.focus(), 0);
  };
  const addQuestion = () => {
    if (!g) return;
    const next = addDecision(g, 'Which way?');
    const n = next.nodes[next.nodes.length - 1];
    change(next);
    setSel(n.id);
    setTimeout(() => document.getElementById(`${uid}-q`)?.focus(), 0);
  };

  /* ---------- arrows */
  const saveDraft = () => {
    if (!g || !draft || !edgeReady(g, draft)) return;
    const { id, ...e } = draft;
    const next = id ? setEdge(g, id, e) : addEdge(g, e);
    change(next);
    setDraft(null);
    const made = next.edges.find((x) => x.id === (id ?? next.edges[next.edges.length - 1].id));
    if (made) say(`${id ? 'Changed' : 'Added'}: ${edgeWords(next, made, nameOf)}.`);
    if (made) {
      setIssues((s) => ({
        ...s,
        edges: Object.fromEntries(Object.entries(s.edges).filter(([k]) => k !== made.id)),
      }));
    }
  };

  /* ---------- save */
  const save = async () => {
    if (!g || !p.onSave || saving) return;
    setSaving(true);
    setIssues(NO_ISSUES);
    try {
      await p.onSave(g);
      setBase(g);
      setSaved(true);
      say('Saved.');
    } catch (err) {
      const pinned = isApiError(err)
        ? pinIssues(g, err.details, p.issuePrefix ?? '')
        : { ...NO_ISSUES, general: ['That didn’t save — try again.'] };
      if (isApiError(err) && !issueCount(pinned)) pinned.general.push(err.message);
      setIssues(pinned);
      say(
        `Not saved: ${issueCount(pinned)} problem${issueCount(pinned) === 1 ? '' : 's'} to fix, marked below.`,
      );
    } finally {
      setSaving(false);
    }
  };

  /* ---------- render */
  const free = p.people.filter((x) => !g?.nodes.some((n) => n.type === 'agent' && n.agent === x.id));
  const others = p.people.filter((x) => !free.includes(x));
  const pos = (n: FlowNode) => ({ x: n.x - f.minX, y: n.y - f.minY });
  const pairs = new Map<string, string[]>();
  for (const e of g?.edges ?? []) {
    const k = [e.from, e.to].sort().join('|');
    pairs.set(k, [...(pairs.get(k) ?? []), e.id]);
  }

  return (
    <section
      className="fe"
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
      {ro && <p className="fe-ro">{p.readOnly}</p>}
      {!g ? (
        <div className="fe-empty">
          <p>{ro ? 'Nothing drawn yet.' : 'Start with who picks the work up first.'}</p>
          {!ro && (
            <AgentPicker
              id={`${uid}-first`}
              people={p.people}
              value={addWho}
              onPick={add}
              label="First agent"
            />
          )}
        </div>
      ) : (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a click on empty canvas clears the selection */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape / the node buttons are the keyboard path */}
          <div
            className={`fe-canvas${connecting ? ' connecting' : ''}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSel(null);
                setConnecting(false);
              }
            }}
          >
            <div className="fe-board" style={{ width: f.width, height: f.height }}>
              <svg className="fe-arrows" width={f.width} height={f.height} aria-hidden="true">
                <defs>
                  <marker
                    id={`${uid}-tip`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0 0L10 5L0 10z" className="fe-tip" />
                  </marker>
                  <marker
                    id={`${uid}-tipbad`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0 0L10 5L0 10z" className="fe-tip bad" />
                  </marker>
                </defs>
                {g.edges.map((e) => {
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
                      {e.branch !== undefined && (
                        <text x={mx} y={my - 7} className="fe-branch" textAnchor="middle">
                          {e.branch}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
              {g.nodes.map((n) => {
                const at = pos(n);
                const who = n.type === 'agent' ? byId.get(n.agent) : undefined;
                const bad = !!issues.nodes[n.id];
                const badges = [g.start === n.id && 'Starts here', g.end === n.id && 'Signs last'].filter(
                  Boolean,
                ) as string[];
                const label = `${nodeLabel(n, nameOf)}${n.type === 'decision' ? ', a decision' : ''}${
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
                    className={`fe-node ${n.type}${sel === n.id ? ' sel' : ''}${bad ? ' bad' : ''}`}
                    style={{ left: at.x, top: at.y }}
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
                    {n.type === 'agent' ? (
                      <>
                        <span className="fe-face" aria-hidden="true">
                          {who?.look ? (
                            <Hero agent={{ name: who.name, look: who.look }} size={34} />
                          ) : (
                            <Hero ghost size={34} />
                          )}
                        </span>
                        <span className="fe-name">{who?.name ?? 'Someone'}</span>
                      </>
                    ) : (
                      <span className="fe-q">{n.question}</span>
                    )}
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
            <div
              className="fe-tools"
              role="toolbar"
              aria-label={selected ? `${nodeLabel(selected, nameOf)}` : 'Add'}
            >
              {connecting && selected ? (
                <>
                  <span className="fe-hint">Pick where {nodeLabel(selected, nameOf)}’s work goes.</span>
                  <Button small variant="ghost" onClick={() => setConnecting(false)}>
                    Cancel
                  </Button>
                </>
              ) : selected ? (
                <>
                  {selected.type === 'decision' ? (
                    <input
                      id={`${uid}-q`}
                      className="fe-in fe-qin"
                      aria-label="The decision’s question"
                      maxLength={120}
                      value={selected.question}
                      onChange={(e) => change(setNode(g, selected.id, { question: e.target.value }))}
                    />
                  ) : (
                    <>
                      <b className="fe-who">{nodeLabel(selected, nameOf)}</b>
                      <button
                        type="button"
                        className="fe-tog"
                        aria-pressed={g.start === selected.id}
                        onClick={() => change(setRole(g, selected.id, 'start'))}
                      >
                        Starts here
                      </button>
                      <button
                        type="button"
                        className="fe-tog"
                        aria-pressed={g.end === selected.id}
                        onClick={() => change(setRole(g, selected.id, 'end'))}
                      >
                        Signs last
                      </button>
                    </>
                  )}
                  <Button
                    small
                    variant="ghost"
                    disabled={g.nodes.length < 2 || g.edges.length >= MAX_EDGES}
                    onClick={() => {
                      setConnecting(true);
                      setDraft(null);
                      say(
                        `Pick where ${nodeLabel(selected, nameOf)}’s work goes: Tab to a node, press Enter.`,
                      );
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
                    <>
                      <AgentPicker
                        id={`${uid}-add`}
                        people={free.length ? [...free, ...others] : p.people}
                        value={addWho}
                        onPick={add}
                        label="+ Agent"
                      />
                      <Button small variant="ghost" onClick={addQuestion}>
                        + Decision
                      </Button>
                    </>
                  )}
                  <span className="fe-hint">Select a node to connect it.</span>
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
              onChange={setDraft}
              onDone={saveDraft}
              onCancel={() => setDraft(null)}
            />
          )}

          <h4 className="fe-h" id={`${uid}-list`}>
            Arrows
          </h4>
          {!g.edges.length ? (
            <p className="fe-none">{ro ? 'No arrows.' : 'No arrows yet. Select a node, then Connect to…'}</p>
          ) : (
            <ol className="fe-list" aria-labelledby={`${uid}-list`}>
              {g.edges.map((e) => {
                const errs = issues.edges[e.id];
                return (
                  <li key={e.id} className={errs ? 'bad' : undefined}>
                    <span className={`fe-glyph${e.signoff ? ' signoff' : ''}`} aria-hidden="true">
                      {e.signoff ? '✓' : e.branch !== undefined ? '◇' : '→'}
                    </span>
                    <span className="fe-words">{edgeWords(g, e, nameOf)}</span>
                    {!ro && (
                      <span className="fe-acts">
                        <button type="button" className="fe-link" onClick={() => setDraft({ ...e })}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="fe-link danger"
                          aria-label={`Remove: ${edgeWords(g, e, nameOf)}`}
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
        </>
      )}

      {(issues.general.length > 0 || Object.keys(issues.nodes).length > 0) && (
        <ul className="fe-errs" role="alert">
          {issues.general.map((m) => (
            <li key={m}>{m}</li>
          ))}
          {Object.entries(issues.nodes).map(([id, ms]) => (
            <li key={id}>
              {nodeLabel(
                g?.nodes.find((n) => n.id === id),
                nameOf,
              )}
              : {ms.join(' · ')}
            </li>
          ))}
        </ul>
      )}
      {p.note && !ro && <p className="fe-note">{p.note}</p>}
      {!ro && (
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

function AgentPicker({
  id,
  people,
  value,
  onPick,
  label,
}: {
  id: string;
  people: Person[];
  value: string;
  onPick: (agent: string) => void;
  label: string;
}) {
  return (
    <select
      id={id}
      className="fe-in fe-pick"
      aria-label={label === '+ Agent' ? 'Add an agent' : label}
      value={value}
      disabled={!people.length}
      onChange={(e) => onPick(e.target.value)}
    >
      <option value="">{people.length ? label : 'Nobody to add'}</option>
      {people.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
}

/** One small form for a new or changed arrow: hand-off or sign-off, why; a branch out of a decision. */
function ArrowForm({
  uid,
  g,
  draft,
  nameOf,
  onChange,
  onDone,
  onCancel,
}: {
  uid: string;
  g: Graph;
  draft: Omit<FlowEdge, 'id'> & { id?: string };
  nameOf: (a: string) => string;
  onChange: (d: Omit<FlowEdge, 'id'> & { id?: string }) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const from = g.nodes.find((n) => n.id === draft.from);
  const to = g.nodes.find((n) => n.id === draft.to);
  const decision = from?.type === 'decision';
  const canSign = from?.type === 'agent' && to?.type === 'agent' && from.agent !== to.agent;
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
        {nodeLabel(from, nameOf)} <span aria-hidden="true">→</span>
        <span className="sr-only">to</span> {nodeLabel(to, nameOf)}
      </p>
      {decision ? (
        <label className="fe-field">
          <span>If</span>
          <input
            // biome-ignore lint/a11y/noAutofocus: the user just drew this arrow
            autoFocus
            className="fe-in"
            maxLength={40}
            placeholder="yes"
            value={draft.branch ?? ''}
            onChange={(e) => set({ branch: e.target.value })}
          />
        </label>
      ) : (
        <fieldset className="fe-kind">
          <legend className="sr-only">What this arrow means</legend>
          <label>
            <input
              type="radio"
              name={`${uid}-kind`}
              checked={!draft.signoff}
              onChange={() => set({ signoff: undefined })}
            />
            Hands work to
          </label>
          <label className={canSign ? undefined : 'off'}>
            <input
              type="radio"
              name={`${uid}-kind`}
              disabled={!canSign}
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
      )}
      <label className="fe-field">
        <span>Why{decision ? ' (optional)' : ''}</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the user just drew this arrow
          autoFocus={!decision}
          className="fe-in"
          maxLength={200}
          placeholder={
            draft.signoff ? 'e.g. payments must not break' : 'e.g. the UI is ready, wire the endpoint'
          }
          value={draft.why ?? ''}
          onChange={(e) => set({ why: e.target.value })}
        />
      </label>
      <div className="fe-form-acts">
        <Button small variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button small variant="dark" type="submit" disabled={!edgeReady(g, draft)}>
          {draft.id ? 'Change arrow' : 'Add arrow'}
        </Button>
      </div>
    </form>
  );
}
