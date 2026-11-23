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

/** A stopped top-level task can start over; a team's split task can't (the server refuses it). */
export const canStartFresh = (item: ChecklistItem) =>
  (item.status === 'failed' || item.status === 'cancelled') && !item.parentId && !item.subtasks?.length;

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
              <b>{x.from}</b> {x.text}
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
