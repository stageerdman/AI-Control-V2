/* "How this team works" (design/workflows/team-way.md), directly under Crew on the team panel.
   Every team with 2+ members has a way: its own drawing, else the server's ready-made one in the team's
   shape (Captain checks all · Pass it along). Shape saves at once; Adjust (or the thumb) opens the drawing;
   "Back to the default" clears an own way with one Undo. GET/PUT /teams/:id/workflow → {workflow, own, shape}. */
import { useEffect, useRef, useState } from 'react';
import { getQueryData, isApiError, setQueryData, useQuery } from '../../api';
import type { Agent, Team, TeamWorkflow, WayShape } from '../../api/types';
import { toast } from '../../ui';
import { FlowSheet, freeSpot, type Graph, type Person, toGraph, WayThumb, withDrawing } from '../collab';
import { castApi, type TeamWayView } from './api';
import { shortName } from './model';
import { Radios } from './Radios';

export const teamWayKey = (id: string) => `teams:${id}:workflow`;

const SHAPES: { value: WayShape; label: string }[] = [
  { value: 'captain', label: 'Captain checks all' },
  { value: 'chain', label: 'Pass it along' },
];

/** Members not on the drawing, at free spots (Adjust's faint cards / the thumb's dashed rings). */
export function looseMembers(g: Graph | null, members: readonly string[]) {
  const nodes = [...(g?.nodes ?? [])];
  const on = new Set(nodes.map((n) => n.id));
  const out = [];
  for (const id of members) {
    if (on.has(id)) continue;
    const n = { id, ...freeSpot(nodes) };
    nodes.push(n);
    out.push(n);
  }
  return out;
}

/** Arrows touching `ids` in a way (for "Removed Elon's 2 arrows."). */
const arrowsOf = (w: TeamWorkflow | null, ids: Set<string>) =>
  (w && toGraph(w)?.edges.filter((e) => ids.has(e.from) || ids.has(e.to)).length) || 0;

export function TeamWay({
  team,
  byId,
  onShape,
}: {
  team: Team;
  byId: Map<string, Agent>;
  onShape: (s: WayShape) => void;
}) {
  const n = team.members.length;
  const ready = !!team.id && n >= 2;
  const key = ready ? teamWayKey(team.id) : null;
  const q = useQuery<TeamWayView>(key, () => castApi.teams.workflow(team.id));
  const [open, setOpen] = useState<null | { select?: string }>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  /* redraw when the crew, captain or shape change: now (optimistic) and again once the server confirms */
  const ids = team.members.map((m) => m.agentId);
  const sig = `${ids.join(',')}|${team.captainId}|${team.wayShape ?? 'captain'}`;
  type Seen = { sig: string; at: string; ids: string[]; pending?: { before?: TeamWayView; gone: string[] } };
  const last = useRef<Seen | null>(null);
  const refetch = q.refetch;
  useEffect(() => {
    const l = last.current;
    if (!key || !l) {
      /* opening the panel again: a cached way may be old (the director can change it by voice) */
      if (key && !l && getQueryData<TeamWayView>(key)) void refetch();
      last.current = key ? { sig, at: team.updatedAt, ids } : null;
      return;
    }
    const changed = l.sig !== sig;
    const confirmed = !changed && !!l.pending && l.at !== team.updatedAt;
    if (!changed && !confirmed) return;
    if (changed) {
      /* optimistic: redraw now; remember what it was so the confirming read can say what changed */
      last.current = {
        sig,
        at: team.updatedAt,
        ids,
        pending: {
          before: l.pending ? l.pending.before : getQueryData<TeamWayView>(key),
          gone: [...(l.pending?.gone ?? []), ...l.ids.filter((id) => !ids.includes(id))],
        },
      };
      void refetch();
      return;
    }
    const { before, gone: g } = l.pending ?? { gone: [] };
    last.current = { sig, at: team.updatedAt, ids };
    const gone = new Set(g.filter((id) => !ids.includes(id)));
    void refetch().then(() => {
      const now = getQueryData<TeamWayView>(key);
      if (!before?.own || !gone.size || !now) return;
      if (!now.own) setNote('Back to the default: nobody was left on your way.');
      else {
        const k = arrowsOf(before.workflow, gone);
        const who = [...gone].map((id) => (byId.get(id) ? shortName(byId.get(id) as Agent) : 'them'));
        if (k) setNote(`Removed ${who.join(' and ')}’s ${k} arrow${k === 1 ? '' : 's'}.`);
      }
    });
  });

  if (n === 0) return null;
  const head = <h3 className="zp-label">How this team works</h3>;
  if (n === 1 || !team.id)
    return (
      <section className="zp-sec sq-way">
        {head}
        <p className="zp-hint-line">
          {n === 1
            ? 'Add one more and we’ll sketch how they work together.'
            : 'Name the crew and we’ll sketch how they work together.'}
        </p>
      </section>
    );

  const people: Person[] = ids.flatMap((id) => {
    const a = byId.get(id);
    return a ? [{ id: a.id, name: shortName(a), look: a.look }] : [];
  });

  if (q.error && !q.data)
    return (
      <section className="zp-sec sq-way">
        {head}
        <p className="zp-hint-line">
          Couldn’t load this team’s way.{' '}
          <button type="button" className="zp-link" onClick={() => void q.refetch()}>
            Try again
          </button>
        </p>
      </section>
    );

  const v = q.data;
  const way = v?.workflow ?? null;
  const graph = way ? toGraph(way) : null;
  const ghosts = looseMembers(graph, ids);
  const words = way ? way.inWords || way.summary || way.name : '';
  const shape = v?.shape ?? team.wayShape ?? 'captain';
  const name = team.name || 'This team';

  const put = async (w: TeamWorkflow | null) => {
    const r = await castApi.teams.saveWorkflow(team.id, w);
    if (key) setQueryData(key, r);
    return r;
  };
  const backToDefault = async () => {
    const mine = way;
    setNote(null);
    setRefused(null);
    try {
      await put(null);
      toast('Back to the default.', {
        undo: () =>
          void put(mine).catch((e) =>
            setRefused(isApiError(e) ? e.message : 'Couldn’t bring your own way back.'),
          ),
      });
    } catch (e) {
      setRefused(isApiError(e) ? e.message : 'Couldn’t go back to the default.');
    }
  };

  return (
    <section className="zp-sec sq-way" aria-busy={!v}>
      <div className="sq-way-head">
        {head}
        {v && (
          <button type="button" className="btn-glass sq-way-btn" onClick={() => setOpen({})}>
            Adjust
          </button>
        )}
      </div>
      {v && !v.own && (
        <Radios
          label="How this team works"
          className="tk-mode sq-shape"
          value={shape}
          onPick={(s) => {
            setNote(null);
            onShape(s as WayShape);
          }}
          items={SHAPES.map((s) => ({ ...s, content: s.label }))}
        />
      )}
      <button
        type="button"
        className="sq-way-thumb"
        disabled={!v}
        aria-label={v ? `Adjust how ${name} works: ${words}` : 'Loading how this team works'}
        onClick={() => setOpen({})}
      >
        <WayThumb
          way={way}
          people={people}
          size="lg"
          loading={!v}
          ghosts={v?.own ? ghosts : undefined}
        />
      </button>
      {v && (
        <p className={`zp-hint-line sq-way-words${refused ? ' bad' : ''}`} role={refused ? 'alert' : undefined}>
          {refused ?? (
            <>
              {v.own && 'Your own way. '}
              {words}
              {v.own && (
                <>
                  {' '}
                  <button type="button" className="zp-link" onClick={() => void backToDefault()}>
                    Back to the default
                  </button>
                </>
              )}
            </>
          )}
        </p>
      )}
      {v?.own &&
        ghosts.map((g) => {
          const a = byId.get(g.id);
          if (!a) return null;
          return (
            <p key={g.id} className="zp-hint-line sq-way-loose">
              {shortName(a)} isn’t connected yet.{' '}
              <button type="button" className="zp-link" onClick={() => setOpen({ select: g.id })}>
                Connect
              </button>
            </p>
          );
        })}
      {note && (
        <p className="zp-hint-line sq-way-note" role="status">
          {note}
        </p>
      )}
      {open && v && (
        <FlowSheet
          open
          onClose={() => setOpen(null)}
          title={`How ${name} works`}
          sub={words}
          graph={graph && { ...graph, nodes: [...graph.nodes, ...ghosts] }}
          people={people}
          issuePrefix="workflow"
          dropLoose
          select={open.select}
          onSave={async (g) => {
            if (!way) return;
            await put(withDrawing(way, g));
            setNote(null);
            setRefused(null);
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
