/* Cast → Agents, after the lineup: a quiet "Recently deleted (n)" row, only when n > 0.
   Open it → a plain list: faded avatar, name, role, "Deleted 2 days ago · kept until Dec 14",
   one Restore. No bulk action, no delete-forever. Spec: design/cast/recently-deleted.md */
import { useEffect, useId, useState } from 'react';
import { isApiError, useQuery } from '../../api';
import { Hero } from '../../characters';
import { type DeletedAgent, KEYS, listDeletedAgents } from './api';
import { bringBack } from './store';
import './recently-deleted.css';

const DAY = 24 * 3600 * 1000;

/** "just now" · "3 hours ago" · "yesterday" · "2 days ago" */
export function ago(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  if (ms < 3600 * 1000) return 'just now';
  if (ms < DAY) {
    const h = Math.floor(ms / 3600 / 1000);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.floor(ms / DAY);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
/** "Dec 14" */
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function RecentlyDeleted({ hidden }: { hidden?: boolean }) {
  const { data, loading, error, refetch } = useQuery(KEYS.deleted, listDeletedAgents);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const n = data?.length ?? 0;
  useEffect(() => {
    if (n === 0) setOpen(false);
  }, [n]);
  /* loading, a failed list, or nothing deleted: the row is not there at all */
  if (loading || n === 0) return null;
  return (
    <section className="rd" inert={hidden || undefined} aria-label="Recently deleted">
      <button
        type="button"
        className="rd-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        Recently deleted ({n})
        <svg viewBox="0 0 24 24" aria-hidden="true" className="rd-chev">
          <path d="M8 10l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul id={listId} className="rd-list">
          {data?.map((d) => (
            <Row key={d.token} d={d} />
          ))}
          {error && (
            <li className="rd-note">
              Couldn’t refresh this list.{' '}
              <button type="button" className="rd-link" onClick={() => void refetch()}>
                Try again
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Row({ d }: { d: DeletedAgent }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const errId = useId();
  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await bringBack(d.token, d.name);
    } catch (e) {
      setErr(
        isApiError(e) && e.status === 404
          ? 'Their 30 days ran out, so they can’t come back.'
          : `Couldn’t bring ${d.name} back${isApiError(e) && e.message ? `: ${e.message.replace(/\.$/, '')}` : ''}. Try again.`,
      );
      setBusy(false);
    }
  };
  return (
    <li className="rd-row">
      <span className="rd-fig" aria-hidden="true">
        <Hero agent={{ name: d.name, look: d.look }} size="xs" facing="front" />
      </span>
      <span className="rd-text">
        <span className="rd-name">{d.name}</span>
        <span className="rd-role">{d.role || 'No role yet'}</span>
        <span className="rd-when">
          Deleted {ago(d.deletedAt)} · kept until {shortDate(d.expiresAt)}
        </span>
        {err && (
          <span className="rd-err" id={errId} role="alert">
            {err}
          </span>
        )}
      </span>
      <button
        type="button"
        className="btn btn-sm rd-restore"
        aria-label={`Restore ${d.name}`}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        aria-describedby={err ? errId : undefined}
        onClick={() => void go()}
      >
        {busy ? 'Restoring…' : 'Restore'}
      </button>
    </li>
  );
}
