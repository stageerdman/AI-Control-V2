/* The Reports list (spec-reports §2): newest first, one button per row, unread = bold + coral dot,
   `Archived (n)` swaps to the archive. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '../../api';
import { Button } from '../../ui';
import { type ReportRow, reportsApi, reportsKey } from './api';
import { isUnread, relWhen, rowLabel } from './model';
import { AuthorLine, useCast, useHasReporter } from './parts';
import './reports.css';

export function ReportsList({
  projectId,
  onOpen,
  back,
}: {
  projectId: string;
  onOpen: (row: ReportRow) => void;
  back?: { label: string; onClick: () => void };
}) {
  const [archived, setArchived] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  const list = useQuery(reportsKey(projectId, archived), () => reportsApi.list(projectId, archived));
  const archive = useQuery(!archived ? reportsKey(projectId, true) : null, () =>
    reportsApi.list(projectId, true),
  );
  const nArchived = archive.data?.reports.length ?? 0;
  const { agents, teams } = useCast();
  const hasReporter = useHasReporter(projectId);
  const now = new Date();

  // biome-ignore lint/correctness/useExhaustiveDependencies: focus the back button when the view swaps
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    backRef.current?.focus({ preventScroll: true });
  }, [archived]);

  const backBtn = archived ? { label: 'Reports', onClick: () => setArchived(false) } : back;
  const rows = list.data?.reports ?? [];

  let body: React.ReactNode;
  if (list.error && !list.data)
    body = (
      <div className="rp-error" role="alert">
        <span>Couldn't load reports.</span>
        <Button small onClick={() => void list.refetch()}>
          Try again
        </Button>
      </div>
    );
  else if (!list.data)
    body = (
      <ul className="rp-rows" aria-busy="true" aria-label="Loading reports">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div className="rp-row rp-ph" aria-hidden="true">
              <span className="rp-bar" style={{ width: `${60 - i * 8}%`, height: 14 }} />
              <span className="rp-bar" style={{ width: '34%' }} />
              <span className="rp-bar" style={{ width: '82%' }} />
            </div>
          </li>
        ))}
      </ul>
    );
  else if (!rows.length)
    body = archived ? (
      <p className="rp-empty">Nothing archived.</p>
    ) : hasReporter === false ? (
      <p className="rp-empty">
        Nobody on this project files reports yet. Turn on <b>Files reports</b> for a role or team in{' '}
        <a href="#cast">Cast</a>.
      </p>
    ) : (
      <p className="rp-empty">
        No reports yet. Ask for research — <i>'Compare payment providers'</i> — and it lands here.
      </p>
    );
  else
    body = (
      <ul className="rp-rows">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={`rp-row${isUnread(r) ? ' unread' : ''}`}
              data-key={`rep-${r.id}`}
              aria-label={rowLabel(r, now)}
              onClick={() => onOpen(r)}
            >
              <span className="rp-r1">
                {isUnread(r) && <span className="rp-dot" aria-hidden="true" />}
                <span className="rp-title">{r.title}</span>
                <span className="rp-when">{relWhen(r.createdAt, now)}</span>
              </span>
              <span className="rp-by">
                <AuthorLine author={r.author} agents={agents} teams={teams} />
              </span>
              <span className="rp-sum">{r.summary}</span>
              <span className="rp-chev" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="rp-list">
      {backBtn && (
        <button
          ref={backRef}
          type="button"
          className="ob-back"
          data-key="back"
          aria-label={`Back to ${backBtn.label.toLowerCase() === 'office' ? 'the office' : backBtn.label}`}
          onClick={backBtn.onClick}
        >
          ← {backBtn.label}
        </button>
      )}
      <header className="rp-hhead">
        <h2>{archived ? 'Archived reports' : 'Reports'}</h2>
      </header>
      {body}
      {!archived && nArchived > 0 && (
        <footer className="rp-foot">
          <button type="button" className="rp-link" onClick={() => setArchived(true)}>
            Archived ({nArchived})
          </button>
        </footer>
      )}
    </div>
  );
}
