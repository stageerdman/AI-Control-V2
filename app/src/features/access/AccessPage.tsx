/* The Key Cabinet (prototype: renderAccess). Global entries — saved once, granted per project.
   The UI only ever sees hasValue + last4; values are write-only (see AccessForm). */
import { useState } from 'react';
import { invalidate, useQuery } from '../../api/query';
import { studio } from '../../api/studio';
import type { Project } from '../../api/types';
import type { PageProps } from '../../shell/pages';
import { Button, EmptyState, ErrorState, Loading, SceneHead, toast } from '../../ui';
import { AccessForm, type AccessFormMode, formError } from './AccessForm';
import { accessApi, type Credential, keys } from './api';
import { credLook, masked, plural } from './mark';
import './access.css';

export function importSummary(r: { imported: unknown[]; refreshed: unknown[] }): string {
  if (!r.imported.length && !r.refreshed.length) return '🔑 The cabinet already matches the global .env';
  const parts = [
    r.imported.length && `${plural(r.imported.length, 'new key')} imported`,
    r.refreshed.length && `${plural(r.refreshed.length, 'entry', 'entries')} refreshed`,
  ].filter(Boolean);
  return `🔑 ${parts.join(' · ')} — masked`;
}

export function AccessPage(_: PageProps<'access'>) {
  const creds = useQuery(keys.cabinet, accessApi.list);
  const projects = useQuery('projects', studio.projects.list);
  const [form, setForm] = useState<AccessFormMode | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function runImport() {
    setImporting(true);
    try {
      toast(importSummary(await accessApi.importFromEnv()));
      await invalidate(keys.cabinet);
    } catch (e) {
      toast(`⚠ Import failed — ${formError(e)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <SceneHead
        kicker="The Key Cabinet"
        title="Saved once — granted per project"
        actions={
          <div className="row" style={{ gap: 10 }}>
            <Button onDark onClick={runImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import from .env'}
            </Button>
            <Button variant="hero" onClick={() => setForm({ kind: 'add' })}>
              ＋ Add access
            </Button>
          </div>
        }
      >
        An access entry is a key, what it serves, and how to use it. Agents hold nothing by default; a project
        grants reach, and values stay masked everywhere.
      </SceneHead>
      <div className="vault">
        <h2>🔐 Access entries</h2>
        <p className="sub">You see where a key goes — never the key itself.</p>
        {creds.loading && <Loading label="Opening the cabinet…" />}
        {creds.error && <ErrorState error={creds.error} onRetry={() => invalidate(keys.cabinet)} />}
        {creds.data && creds.data.length === 0 && (
          <EmptyState
            title="The cabinet is empty"
            action={
              <Button variant="hero" onClick={() => setForm({ kind: 'add' })}>
                ＋ Add access
              </Button>
            }
          >
            Add a key, or import the ones already in your global .env.
          </EmptyState>
        )}
        {creds.data?.map((c) => (
          <AccessEntry
            key={c.id}
            cred={c}
            projects={projects.data}
            open={expanded === c.id}
            onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
            onEdit={() => setForm({ kind: 'edit', cred: c })}
            onReplace={() => setForm({ kind: 'replace', cred: c })}
          />
        ))}
        <div className="masklock">🔒 Values are masked everywhere in AI Studio, including logs.</div>
      </div>
      <AccessForm mode={form} onClose={() => setForm(null)} />
    </>
  );
}

function AccessEntry({
  cred: c,
  projects,
  open,
  onToggle,
  onEdit,
  onReplace,
}: {
  cred: Credential;
  projects: Project[] | undefined;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onReplace: () => void;
}) {
  const look = credLook(c);
  const val = masked(c);
  const used = c.projectIds.length;
  const holders = c.projectIds.map((id) => projects?.find((p) => p.id === id)?.name ?? id);
  const detailsId = `cred-details-${c.id}`;
  return (
    <div className="access-entry">
      <div className="ic" style={{ background: look.color }} aria-hidden="true">
        {look.mark}
      </div>
      <div className="body">
        <div className="row" style={{ gap: 0 }}>
          <b>{c.name}</b>
          <span className="val">{c.envVar}</span>
          {val ? <span className="val">{val}</span> : <span className="val none">no key yet</span>}
        </div>
        {c.serves && <div className="serves">{c.serves}</div>}
        <div className="afford">
          {c.docsUrl && (
            <a href={c.docsUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open ${c.name} docs`}>
              Docs ↗
            </a>
          )}
          <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
            Details {open ? '▴' : '▾'}
          </button>
          <button type="button" onClick={onReplace}>
            {c.hasValue ? 'Replace key' : 'Add key'}
          </button>
          <button type="button" onClick={onEdit}>
            Edit
          </button>
          <span className="used">Used by {plural(used, 'project')}</span>
        </div>
        {open && (
          <div className="expand" id={detailsId}>
            {c.instructions && (
              <>
                <b>Instructions:</b> {c.instructions}
                <br />
              </>
            )}
            Lands in each granted project's .env as <code>{c.envVar}</code>.
            <br />
            {used ? (
              <>Granted to {holders.join(', ')}.</>
            ) : (
              <>No project holds it yet — grant it from a project's safe.</>
            )}
            <br />
            {c.hasValue ? (
              c.last4 ? (
                <>
                  Masked value ends in <code>{c.last4}</code>.{' '}
                </>
              ) : (
                <>The key is too short to show even its last 4. </>
              )
            ) : (
              <>No key saved yet. </>
            )}
            The real value never enters the screen, clipboard, or logs.
          </div>
        )}
      </div>
    </div>
  );
}
