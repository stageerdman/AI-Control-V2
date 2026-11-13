/* "What <project> can reach" (prototype: openProjectAccess) — every cabinet entry with a grant
   switch (auto-saves), plus "Sync to .env" that writes the granted keys into the project's .env.
   Reusable: the Office safe (U4) puts it in a <Sheet>. Shows env var NAMES only, never values.

     <Sheet open={open} onClose={close} label={`${project.name} access`}>
       <ProjectAccessPanel projectId={project.id} projectName={project.name} />
     </Sheet>
*/
import { useState } from 'react';
import { invalidate, setQueryData, useQuery } from '../../api/query';
import { Button, ErrorState, Loading, Switch, toast } from '../../ui';
import { formError } from './AccessForm';
import { type AccessEntry, type AccessSync, accessApi, keys, type ProjectAccess } from './api';
import { credLook, masked } from './mark';
import './access.css';

/** One honest line about a sync — names only. */
export function syncSummary(r: AccessSync): string {
  const parts: string[] = [];
  parts.push(r.written.length ? `Wrote ${r.written.join(', ')}` : 'No keys to write');
  if (r.removed.length) parts.push(`removed ${r.removed.join(', ')}`);
  if (r.missing.length) parts.push(`no value yet for ${r.missing.join(', ')}`);
  if (r.gitignore === 'added') parts.push('added .env to .gitignore');
  return `${parts.join(' · ')}.`;
}

/** Apply a toggle locally (optimistic) — count follows. */
export function withGrant(a: ProjectAccess, credentialId: string, granted: boolean): ProjectAccess {
  const entries = a.entries.map((e) => (e.credentialId === credentialId ? { ...e, granted } : e));
  return { ...a, entries, granted: entries.filter((e) => e.granted).length };
}

export function ProjectAccessPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const key = keys.project(projectId);
  const access = useQuery(key, () => accessApi.project(projectId));
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<AccessSync | null>(null);

  async function toggle(e: AccessEntry, next: boolean) {
    const before = access.data;
    if (before) setQueryData(key, withGrant(before, e.credentialId, next));
    try {
      setQueryData(key, await accessApi.setGrants(projectId, { [e.credentialId]: next }));
      toast(next ? `🔑 ${e.name} granted to ${projectName}` : `🔒 ${e.name} revoked from ${projectName}`);
      void invalidate(keys.cabinet); // "used by N" on the cabinet
    } catch (err) {
      if (before) setQueryData(key, before);
      toast(`⚠ Couldn't change ${e.name} — ${formError(err)}`);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const r = await accessApi.sync(projectId);
      setResult(r);
      toast(`🔑 ${projectName}'s .env is in sync`);
    } catch (err) {
      toast(`⚠ Sync failed — ${formError(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  const a = access.data;
  return (
    <div className="project-access">
      <h2>What {projectName} can reach</h2>
      {access.loading && <Loading label="Opening the safe…" />}
      {access.error && <ErrorState error={access.error} onRetry={access.refetch} />}
      {a && (
        <>
          <p className="hint" style={{ margin: '8px 0 16px' }}>
            {projectName} can reach{' '}
            <b>
              {a.granted} of {a.total}
            </b>{' '}
            capabilities. Agents inherit only what you grant here — values stay masked.
          </p>
          {a.entries.length === 0 && (
            <p className="hint">
              The cabinet is empty — add keys under <a href="#access">Access</a>.
            </p>
          )}
          {a.entries.map((e) => {
            const look = credLook(e);
            const val = masked(e);
            return (
              <div key={e.credentialId} className={`toggle-row${e.granted ? ' on' : ''}`}>
                <div className="ic" style={{ background: look.color }} aria-hidden="true">
                  {look.mark}
                </div>
                <div className="t">
                  <b>{e.name}</b> <span className="vl">{val ?? 'no key yet'}</span>
                  <div className="sv">{e.serves || e.envVar}</div>
                </div>
                <span className="state">{e.granted ? 'Granted' : 'Not granted'}</span>
                <Switch
                  checked={e.granted}
                  label={`Grant ${e.name} to ${projectName}`}
                  onChange={(next) => toggle(e, next)}
                />
              </div>
            );
          })}
          <div className="pa-sync">
            <Button variant="hero" small onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync to .env'}
            </Button>
            <span className="hint">Writes the granted keys into {projectName}'s .env (never committed).</span>
          </div>
          {result && (
            <p className="pa-result" role="status">
              {syncSummary(result)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
