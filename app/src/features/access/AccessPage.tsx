/* The Key Cabinet (spec-ux-G2 §1a). Global accesses — saved once, granted per project. An access is
   everything one service needs (keys, a username, a URL). The UI only ever sees hasValue + last4 for
   a secret; values are write-only (see AccessEditor). */
import { useState } from 'react';
import { invalidate, useQuery } from '../../api/query';
import { studio } from '../../api/studio';
import type { Project } from '../../api/types';
import type { PageProps } from '../../shell/pages';
import { Button, EmptyState, ErrorState, Loading, SceneHead } from '../../ui';
import { AccessEditor, type EditorMode } from './AccessEditor';
import { type Access, accessApi, keys } from './api';
import { accessMeta, credLook, fieldShown } from './mark';
import './access.css';

const byName = (a: Access, b: Access) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function AccessPage(_: PageProps<'access'>) {
  const cabinet = useQuery(keys.cabinet, accessApi.list);
  const projects = useQuery('projects', studio.projects.list);
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const add = () => setEditor({ kind: 'add' });

  const list = [...(cabinet.data ?? [])].sort(byName);
  return (
    <>
      <SceneHead
        kicker="The Key Cabinet"
        title="Saved once — granted per project"
        actions={
          <Button variant="hero" onClick={add}>
            ＋ Add new access
          </Button>
        }
      >
        An access is everything one service needs — keys, a username, a URL. Agents hold nothing by default; a
        project grants it, and secrets stay masked everywhere.
      </SceneHead>
      <div className="vault">
        <h2>🔐 Accesses</h2>
        <p className="sub">You see where an access goes — never its secrets.</p>
        {cabinet.loading && <Loading label="Opening the cabinet…" />}
        {cabinet.error && <ErrorState error={cabinet.error} onRetry={() => invalidate(keys.cabinet)} />}
        {cabinet.data && cabinet.data.length === 0 && (
          <EmptyState
            title="The cabinet is empty"
            action={
              <Button variant="hero" onClick={add}>
                ＋ Add new access
              </Button>
            }
          />
        )}
        {list.map((a) => (
          <AccessRow
            key={a.id}
            access={a}
            projects={projects.data}
            open={expanded === a.id}
            onToggle={() => setExpanded(expanded === a.id ? null : a.id)}
            onEdit={() => setEditor({ kind: 'edit', access: a })}
          />
        ))}
        <div className="masklock">🔒 Secrets are masked everywhere in AI Studio, including logs.</div>
      </div>
      <AccessEditor mode={editor} onClose={() => setEditor(null)} />
    </>
  );
}

function AccessRow({
  access: a,
  projects,
  open,
  onToggle,
  onEdit,
}: {
  access: Access;
  projects: Project[] | undefined;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const look = credLook({ name: a.name, envVar: a.fields[0]?.envVar });
  const meta = accessMeta(a);
  const single = a.fields.length === 1 ? a.fields[0] : undefined;
  const shown = single && fieldShown(single);
  const holders = a.projectIds.map((id) => projects?.find((p) => p.id === id)?.name ?? id);
  const detailsId = `access-details-${a.id}`;
  return (
    <div className="access-entry">
      <div className="ic" style={{ background: look.color }} aria-hidden="true">
        {look.mark}
      </div>
      <div className="body">
        <div className="row" style={{ gap: 0 }}>
          <b>{a.name}</b>
          {shown && (
            <span className={`val${shown.kind === 'none' ? ' none' : ''}`} title={shown.full}>
              {shown.text}
            </span>
          )}
        </div>
        {a.serves && <div className="serves">{a.serves}</div>}
        {a.folder && (
          <div className="serves">
            Folder · read and write: <code>{a.folder}</code>
          </div>
        )}
        <div className="afford">
          <span className="used">
            {meta.fields && <>{meta.fields} · </>}
            {meta.missing && (
              <>
                <span className="missing">{meta.missing}</span> ·{' '}
              </>
            )}
            {meta.used}
          </span>
          {a.docsUrl && (
            <a href={a.docsUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open ${a.name} docs`}>
              Docs ↗
            </a>
          )}
          <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
            Details {open ? '▴' : '▾'}
          </button>
          <button type="button" onClick={onEdit} aria-label={`Edit ${a.name}`}>
            Edit
          </button>
        </div>
        {open && (
          <div className="expand" id={detailsId}>
            {a.fields.length > 0 && (
              <ul className="fieldlist" aria-label={`${a.name} fields`}>
                {a.fields.map((f) => {
                  const s = fieldShown(f);
                  return (
                    <li key={f.id}>
                      <span className="fl">{f.label}</span>
                      <code className="fe">{f.envVar}</code>
                      <span className={`fv ${s.kind}`} title={s.full}>
                        {s.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {a.instructions && (
              <>
                <b>Instructions:</b> {a.instructions}
                <br />
              </>
            )}
            {holders.length ? (
              <>Granted to {holders.join(', ')}.</>
            ) : (
              <>No project holds it yet — grant it from a project's safe.</>
            )}
            <br />
            Secret values never enter the screen, clipboard, or logs.
          </div>
        )}
      </div>
    </div>
  );
}
