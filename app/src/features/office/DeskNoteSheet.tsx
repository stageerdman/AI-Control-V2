/* The paper on a robot's desk (STUDIO LIFE, spec-ux-office §1): the note it left itself before it forgot —
   where it is, what it's doing, the next step — and the earlier ones. Read-only. Opening it marks this robot's
   notes seen (for this viewer), so the desk stops glowing. */
import { useEffect, useState } from 'react';
import { type DeskNote, studio, useQuery } from '../../api';
import { Button, Sheet } from '../../ui';
import { relWhen } from '../reports';
import { keys } from './api';
import { clip } from './life';

const EARLIER = 20;

export function DeskNoteSheet({
  pid,
  agentId,
  nick,
  open,
  onClose,
  onSeen,
}: {
  pid: string;
  agentId: string | null;
  nick: string;
  open: boolean;
  onClose: () => void;
  /** The newest note's time once it's on screen. */
  onSeen: (agentId: string, at: string) => void;
}) {
  return (
    <Sheet open={open && !!agentId} onClose={onClose} label={`${nick}’s notes to self`}>
      {open && agentId && <NoteBody pid={pid} agentId={agentId} nick={nick} onSeen={onSeen} />}
    </Sheet>
  );
}

export function NoteBody({
  pid,
  agentId,
  nick,
  onSeen,
}: {
  pid: string;
  agentId: string;
  nick: string;
  onSeen: (agentId: string, at: string) => void;
}) {
  const q = useQuery(keys.deskNotes(pid, agentId), () => studio.deskNotes(pid, agentId));
  const { refetch } = q;
  const [picked, setPicked] = useState<DeskNote | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read fresh once, when the sheet opens
  useEffect(() => {
    void refetch().catch(() => undefined);
  }, []);
  const notes = q.data?.notes ?? [];
  const latest = notes[0];
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per newest note
  useEffect(() => {
    if (latest) onSeen(agentId, latest.at);
  }, [latest?.at]);

  if (!q.data && q.error)
    return (
      <div className="lf">
        <h2>Note to self</h2>
        <div className="rp-error" role="alert">
          <span>Couldn’t read the note.</span>
          <Button small onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  if (!q.data)
    return (
      <div className="lf">
        <h2>Note to self</h2>
        <p className="hint">Reading the note…</p>
      </div>
    );
  if (!latest)
    return (
      <div className="lf">
        <h2>Note to self</h2>
        <p className="rp-empty">No notes on this desk.</p>
      </div>
    );

  const now = new Date();
  const shown = picked ?? latest;
  const earlier = notes.slice(1, 1 + EARLIER);
  return (
    <div className="lf">
      {picked && (
        <button type="button" className="ob-back" onClick={() => setPicked(null)}>
          ← Latest note
        </button>
      )}
      <h2>Note to self</h2>
      <p className="dn-by">
        {nick} · {relWhen(shown.at, now)}
      </p>
      <dl className="dn-note">
        <div>
          <dt>Where I am</dt>
          <dd>{shown.where}</dd>
        </div>
        <div>
          <dt>What I’m doing</dt>
          <dd>{shown.doing}</dd>
        </div>
        <div>
          <dt>Next step</dt>
          <dd>{shown.next}</dd>
        </div>
      </dl>
      {!picked && earlier.length > 0 && (
        <>
          <h3 className="dn-h">Earlier ({earlier.length})</h3>
          <ul className="rp-rows">
            {earlier.map((n) => (
              <li key={n.id}>
                <button type="button" className="rp-row" onClick={() => setPicked(n)}>
                  <span className="rp-r1">
                    <span className="rp-title">{clip(n.next, 60)}</span>
                    <span className="rp-when">{relWhen(n.at, now)}</span>
                  </span>
                  <span className="rp-chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
