/* No Silent Stuck Tasks, on the task card (design/task-tools.md):
     WaitingNotes  a running task whose agent has notes queued for its next step: see them, or clear them
     StartFresh    a stopped task: start it over from main (earlier work stays on a branch) */
import { useId, useState } from 'react';
import { type ChecklistItem, invalidate, isApiError, studio, type WaitingNote } from '../../api';
import { Button, toast } from '../../ui';
import { keys } from './api';

/** The notes waiting for whoever is on this task now (its builder, or its reviewer / members). */
export function notesOf(item: ChecklistItem, notes: WaitingNote[] | undefined): WaitingNote[] {
  if (item.status !== 'running' || !notes?.length) return [];
  const on = new Set([item.agentId, ...(item.workingNow ?? []).map((p) => p.id)]);
  return notes.filter((n) => on.has(n.agentId));
}

/** What the note says, without the studio's wrapper for the agent ("AI Studio — a note from … while you work: …
    Take it into account …"). Other notes (an access just shared) read as they are. */
export function saidIn(text: string): string {
  const m = /^AI Studio — a note from .+? while you work: ([\s\S]*?)\nTake it into account[^\n]*$/.exec(text);
  return m?.[1] ?? text;
}

const didNotLand = (i: ChecklistItem) => i.status === 'failed' || i.status === 'cancelled';

/** A stopped top-level task can start over; a team's split task can't (the server refuses it). Nor can one that
    waits on an earlier step that didn't land: the studio would skip it again at once (server domain/task-order.ts)
    — that earlier step is the one to start over. `goalItems`: the tasks of its goal, to check that order. */
export function canStartFresh(item: ChecklistItem, goalItems: readonly ChecklistItem[] = []): boolean {
  if (!didNotLand(item) || item.parentId || item.subtasks?.length) return false;
  const order = goalItems
    .filter((x) => x.goalId === item.goalId && !x.parentId)
    .sort((a, b) => a.position - b.position);
  let start = order.findIndex((x) => x.id === item.id);
  while (start > 0 && order[start]?.parallel) start--;
  return !order.slice(0, Math.max(start, 0)).some(didNotLand);
}

export function WaitingNotes({
  pid,
  notes,
  nameOf,
}: {
  pid: string;
  notes: WaitingNote[];
  nameOf: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();
  if (!notes.length) return null;
  const agents = [...new Set(notes.map((n) => n.agentId))];
  const n = notes.length;
  const clear = async () => {
    setBusy(true);
    try {
      let cleared = 0;
      for (const a of agents) cleared += (await studio.projects.clearNotes(pid, a)).cleared;
      toast(cleared ? `Cleared ${cleared} note${cleared === 1 ? '' : 's'}` : 'Already delivered');
      setOpen(false);
    } catch (e) {
      toast(`Couldn’t clear the notes — ${isApiError(e) ? e.message : 'try again'}`);
    } finally {
      void invalidate(keys.notes(pid));
      setBusy(false);
    }
  };
  return (
    <div className="ob-notes">
      <p>
        <span>
          {n} note{n === 1 ? '' : 's'} waiting for {agents.map(nameOf).join(', ')}
        </span>
        <button
          type="button"
          className="ob-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide' : 'See'}
        </button>
        <button type="button" className="ob-more" disabled={busy} onClick={() => void clear()}>
          Clear
        </button>
      </p>
      {open && (
        <ol id={id} className="ob-raw ob-notelist">
          {notes.map((x) => (
            <li key={`${x.runId}:${x.at}`}>
              <b>{x.from === 'the user' ? 'You' : x.from}</b> {saidIn(x.text)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function StartFresh({ pid, item }: { pid: string; item: ChecklistItem }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { keptOn } = await studio.projects.restartFresh(pid, item.id);
      toast(keptOn ? `Starting fresh from main. Earlier work kept on ${keptOn}` : 'Starting fresh from main');
    } catch (e) {
      toast(`Couldn’t start fresh — ${isApiError(e) ? e.message : 'try again'}`);
    } finally {
      void invalidate(keys.work(pid));
      setBusy(false);
    }
  };
  return (
    <Button
      small
      disabled={busy}
      title="Start over from main. Work so far is kept on a branch."
      onClick={() => void go()}
    >
      Start fresh
    </Button>
  );
}
