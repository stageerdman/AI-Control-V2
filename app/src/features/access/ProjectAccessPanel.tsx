/* "What <project> can reach" (spec-ux-G2 §1c) — every access in the cabinet with a grant switch
   (auto-saves; a project is granted a whole access, never single fields), the env var names an agent
   gets, and "Sync to .env". Accesses added since the project last looked carry the coral "new" dot:
   the panel marks them seen when it opens, and the dots stay until it closes. Names only, never a
   secret value. Reusable: the Office safe puts it in a <Sheet>. */
import { Fragment, useEffect, useRef, useState } from 'react';
import { invalidate, setQueryData, useQuery } from '../../api/query';
import { Button, ErrorState, Loading, Switch, toast } from '../../ui';
import { formError } from './AccessEditor';
import { type AccessSync, accessApi, keys, type ProjectAccess, type ProjectAccessItem } from './api';
import { credLook, masked, plural } from './mark';
import './access.css';

/** One honest line about a sync — names only. */
export function syncSummary(r: AccessSync): string {
  const parts: string[] = [];
  parts.push(r.written.length ? `Wrote ${r.written.join(', ')}` : 'Nothing to write');
  if (r.removed.length) parts.push(`removed ${r.removed.join(', ')}`);
  if (r.missing.length) parts.push(`no value yet for ${r.missing.join(', ')}`);
  if (r.gitignore === 'added') parts.push('added .env to .gitignore');
  return `${parts.join(' · ')}.`;
}

/** Apply a toggle locally (optimistic) — the count follows. */
export function withGrant(a: ProjectAccess, accessId: string, granted: boolean): ProjectAccess {
  const accesses = a.accesses.map((x) => (x.id === accessId ? { ...x, granted } : x));
  return { ...a, accesses, granted: accesses.filter((x) => x.granted).length };
}

/** New since the project last looked first, then A–Z. `fresh` = the ids that were new when the panel opened. */
export const sortForSafe = (list: ProjectAccessItem[], fresh: ReadonlySet<string>): ProjectAccessItem[] =>
  [...list].sort(
    (a, b) =>
      Number(fresh.has(b.id)) - Number(fresh.has(a.id)) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );

/** "STRIPE_SECRET_KEY ••••wxyz · STRIPE_PUBLISHABLE_KEY · …1 more" as parts (the first `max`). */
export function fieldLine(a: Pick<ProjectAccessItem, 'fields'>, max = 3) {
  const parts = a.fields.map((f) => ({
    id: f.id,
    label: f.label,
    envVar: f.envVar,
    extra: !f.hasValue ? '(no value yet)' : f.secret ? masked(f) : null,
    none: !f.hasValue,
  }));
  return { shown: parts.slice(0, max), all: parts, more: Math.max(0, parts.length - max) };
}

export function ProjectAccessPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const key = keys.project(projectId);
  const access = useQuery(key, () => accessApi.project(projectId));
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<AccessSync | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  /* the "new" set as it was when the panel opened — kept until it closes, then gone next time */
  const fresh = useRef<Set<string> | null>(null);
  const a = access.data;
  if (a && !fresh.current) fresh.current = new Set(a.accesses.filter((x) => x.isNew).map((x) => x.id));
  const loaded = !!a;
  useEffect(() => {
    if (loaded) void accessApi.seen(projectId).catch(() => undefined); // a dot is not worth an error
  }, [loaded, projectId]);

  async function toggle(x: ProjectAccessItem, next: boolean) {
    const before = access.data;
    if (before) setQueryData(key, withGrant(before, x.id, next));
    try {
      setQueryData(key, await (next ? accessApi.grant(projectId, x.id) : accessApi.revoke(projectId, x.id)));
      const n = x.fields.length;
      toast(
        next
          ? `🔑 ${x.name} granted to ${projectName}${n > 1 ? ` (${plural(n, 'field')})` : ''}`
          : `🔒 ${x.name} revoked from ${projectName}`,
      );
      void invalidate(keys.cabinet); // "Used by N" on the cabinet
    } catch (err) {
      if (before) setQueryData(key, before);
      toast(`⚠ Couldn't change ${x.name} — ${formError(err)}`);
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

  const isFresh = (id: string) => fresh.current?.has(id) ?? false;
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
              {a.granted} of {plural(a.total, 'access', 'accesses')}
            </b>
            . Agents get only what you grant here.
          </p>
          {a.accesses.length === 0 && (
            <p className="hint">
              The cabinet is empty — add one under <a href="#access">Access</a>.
            </p>
          )}
          {sortForSafe(a.accesses, fresh.current ?? new Set()).map((x) => {
            const look = credLook({ name: x.name, envVar: x.fields[0]?.envVar });
            const line = fieldLine(x);
            const expanded = !!opened[x.id];
            const listId = `pa-fields-${x.id}`;
            return (
              <div key={x.id} className={`toggle-row${x.granted ? ' on' : ''}`}>
                <span className={`pa-new${isFresh(x.id) ? ' on' : ''}`} aria-hidden="true" />
                <div className="ic" style={{ background: look.color }} aria-hidden="true">
                  {look.mark}
                </div>
                <div className="t">
                  <b>
                    {isFresh(x.id) && <span className="sr-only">New since you last looked: </span>}
                    {x.name}
                  </b>
                  {x.serves && <div className="sv">{x.serves}</div>}
                  {expanded ? (
                    <ul className="pa-all" id={listId}>
                      {line.all.map((f) => (
                        <li key={f.id}>
                          {f.label} → <code>{f.envVar}</code>
                          {f.extra && <span className={f.none ? ' pa-none' : ' pa-mask'}> {f.extra}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="vl" id={listId}>
                      {line.shown.map((f, i) => (
                        <Fragment key={f.id}>
                          {i > 0 && ' · '}
                          <span>
                            <code>{f.envVar}</code>
                            {f.extra && <span className={f.none ? 'pa-none' : 'pa-mask'}> {f.extra}</span>}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  )}
                  {line.more > 0 && (
                    <button
                      type="button"
                      className="pa-more"
                      aria-expanded={expanded}
                      aria-controls={listId}
                      onClick={() => setOpened((o) => ({ ...o, [x.id]: !expanded }))}
                    >
                      {expanded ? 'Fewer' : `…${line.more} more`}
                    </button>
                  )}
                </div>
                <span className="state">{x.granted ? 'Granted' : 'Not granted'}</span>
                <Switch
                  checked={x.granted}
                  label={`Grant ${x.name} to ${projectName}`}
                  onChange={(next) => toggle(x, next)}
                />
              </div>
            );
          })}
          <div className="pa-sync">
            <Button variant="hero" small onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync to .env'}
            </Button>
            <span className="hint">
              Writes the granted accesses into {projectName}'s .env (never committed).
            </span>
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

/** The office safe's dot: how many accesses are new to this project (shares the panel's cache entry). */
export function useNewAccessCount(projectId: string): number {
  return useQuery(keys.project(projectId), () => accessApi.project(projectId)).data?.newCount ?? 0;
}
/** Refetch a project's access view (on `access.changed`, and when the safe closes so its dot clears). */
export const refreshProjectAccess = (projectId: string) => invalidate(keys.project(projectId));
