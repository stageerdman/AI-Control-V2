/* The Switchboard (spec-ux-G2 §3c): a read-only sheet of every project's port block, its app port and
   whatever else answers in the block. Reads GET /ports on open, then quietly every 5 s while open (no
   events, no animation, no live region). Opened from the Projects count line, or from a project's App
   details with that row highlighted. */
import { useEffect, useRef } from 'react';
import { useQuery } from '../../api/query';
import { studio } from '../../api/studio';
import { go } from '../../shell/router';
import { ErrorState, Loading, Sheet } from '../../ui';
import { LogoTile } from '../projects/LogoTile';
import { otherLabel, portRows } from './model';
import './ports.css';

export const PORTS_KEY = 'ports';
export const usePorts = () => useQuery(PORTS_KEY, studio.ports);

export function PortsSheet({
  open,
  onClose,
  focusProject,
}: {
  open: boolean;
  onClose: () => void;
  /** Highlight + focus this project's row (from its App details). */
  focusProject?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} label="The Switchboard" wide>
      {open && <Board onClose={onClose} focusProject={focusProject} />}
    </Sheet>
  );
}

function Board({ onClose, focusProject }: { onClose: () => void; focusProject?: string }) {
  const ports = usePorts();
  const projects = useQuery('projects', studio.projects.list);
  const agents = useQuery('agents', studio.agents.list);
  const { refetch } = ports;
  const table = useRef<HTMLTableElement>(null);

  useEffect(() => {
    void refetch();
    const t = setInterval(() => void refetch(), 5000);
    return () => clearInterval(t);
  }, [refetch]);

  const rows = ports.data && projects.data ? portRows(ports.data, projects.data, agents.data ?? []) : null;
  const ready = !!rows;
  useEffect(() => {
    if (!ready || !focusProject) return;
    const t = setTimeout(() => {
      const a = table.current?.querySelector<HTMLElement>(
        `tr[data-pid="${CSS.escape(focusProject)}"] .pt-name`,
      );
      a?.scrollIntoView({ block: 'nearest' });
      a?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [ready, focusProject]);

  const open = (pid: string) => {
    onClose();
    go({ name: 'office', projectId: pid, sub: 'room' });
  };

  return (
    <div className="pt">
      <h2>The Switchboard</h2>
      <p className="hint pt-sub">
        Every project owns a block of ports. Its agents get them as <code>PORT</code> and{' '}
        <code>AI_STUDIO_PORTS</code> — no one else uses them.
      </p>
      {!rows && (ports.loading || projects.loading) && <Loading label="Reading the switchboard…" />}
      {ports.error && !ports.data && (
        <ErrorState
          error={ports.error}
          title="Couldn’t read the switchboard"
          onRetry={() => void refetch()}
        />
      )}
      {rows && rows.length === 0 && (
        <p className="hint">No project holds ports yet — each gets a block when it’s set up.</p>
      )}
      {rows && rows.length > 0 && (
        <table className="pt-table" ref={table}>
          <caption className="sr-only">Port blocks by project</caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Block</th>
              <th scope="col">App</th>
              <th scope="col">Also listening</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.projectId}
                data-pid={r.projectId}
                className={[r.muted && 'muted', r.projectId === focusProject && 'hl']
                  .filter(Boolean)
                  .join(' ')}
              >
                <th scope="row">
                  <button type="button" className="pt-name" onClick={() => open(r.projectId)}>
                    <LogoTile tile={r.tile} imageUrl={r.imageUrl} small />
                    <span>{r.name}</span>
                  </button>
                </th>
                <td className="pt-mono">{r.block}</td>
                <td>
                  <span className="pt-mono">{r.app.port}</span> ·{' '}
                  <span className={r.app.running ? 'pt-ok' : 'pt-off'}>
                    {r.app.running ? 'running' : 'stopped'}
                  </span>
                </td>
                <td>
                  <div className="pt-also">
                    {r.others.length ? (
                      r.others.map((o) => (
                        <span key={o.port} className="pt-port">
                          {otherLabel(o)}
                        </span>
                      ))
                    ) : (
                      <span className="pt-off">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
