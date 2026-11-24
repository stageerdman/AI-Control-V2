/* The Vault's Folders: folders on this Mac that a project's agents may open. Each has an on/off switch
   for this project. "＋ Add folder" opens a small form in place: the folder (Choose… or paste), how agents
   may use it (Read only / Read & write) and where it shows (Only this project / All projects). A global
   folder shows in every project's Vault, off until switched on there; adding it here switches it on here. */
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../api';
import { invalidate, setQueryData } from '../../api/query';
import { Button, Switch, toast } from '../../ui';
import { formError } from './AccessEditor';
import { accessApi, keys, type ProjectAccessItem } from './api';
import {
  cleanPath,
  emptyFolderDraft,
  type FolderDraft,
  folderBlocker,
  folderLine,
  folderName,
} from './folders';
import { Segmented } from './Segmented';

export function FolderSection({
  projectId,
  projectName,
  folders,
  onToggle,
}: {
  projectId: string;
  projectName: string;
  folders: ProjectAccessItem[];
  onToggle: (x: ProjectAccessItem, next: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const addBtn = useRef<HTMLButtonElement>(null);
  const close = () => {
    setAdding(false);
    setTimeout(() => addBtn.current?.focus(), 0);
  };
  return (
    <section className="pa-folders" aria-labelledby={`pa-folders-${projectId}`}>
      <div className="pa-head">
        <h3 id={`pa-folders-${projectId}`}>Folders</h3>
        {!adding && (
          <Button small ref={addBtn} onClick={() => setAdding(true)}>
            ＋ Add folder
          </Button>
        )}
      </div>
      {adding && <AddFolder projectId={projectId} projectName={projectName} onDone={close} />}
      {!adding && folders.length === 0 && (
        <p className="hint pa-empty">
          No folders yet. Add one to let agents open files outside {projectName}.
        </p>
      )}
      {folders.map((x) => (
        <div key={x.id} className={`toggle-row${x.granted ? ' on' : ''}`}>
          <div className="ic pa-folder-ic" aria-hidden="true">
            📁
          </div>
          <div className="t">
            <b>{x.name}</b>
            <div className="sv">{folderLine(x, projectName)}</div>
            <div className="vl">
              <code>{x.folder}</code>
            </div>
          </div>
          <span className="state">{x.granted ? 'On' : 'Off'}</span>
          <Switch
            checked={x.granted}
            label={`Let ${projectName}'s agents open ${x.name}`}
            onChange={(next) => onToggle(x, next)}
          />
        </div>
      ))}
    </section>
  );
}

function AddFolder({
  projectId,
  projectName,
  onDone,
}: {
  projectId: string;
  projectName: string;
  onDone: () => void;
}) {
  const [d, setD] = useState<FolderDraft>(emptyFolderDraft);
  const [busy, setBusy] = useState<'pick' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const set = (p: Partial<FolderDraft>) => {
    setD((x) => ({ ...x, ...p }));
    setError(null);
  };
  const why = folderBlocker(d);

  async function pick() {
    setBusy('pick');
    setError(null);
    try {
      const { path } = await accessApi.pickFolder();
      if (path) set({ path });
    } catch (err) {
      setError(formError(err));
    } finally {
      setBusy(null);
      input.current?.focus();
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (why) return;
    const folder = cleanPath(d.path);
    const name = folderName(folder);
    const body = { name, folder, folderMode: d.mode, fields: [] };
    setBusy('save');
    setError(null);
    try {
      if (d.scope === 'project') {
        await accessApi.addLocal(projectId, body);
        await invalidate(keys.project(projectId));
        toast(`📁 ${name} added to ${projectName}`);
      } else {
        const a = await accessApi.create(body);
        setQueryData(keys.project(projectId), await accessApi.grant(projectId, a.id));
        toast(`📁 ${name} added for all projects — on in ${projectName}`);
      }
      void invalidate(keys.cabinet);
      onDone();
    } catch (err) {
      /* already in the Vault, in this same place: switch that one on instead */
      const existing =
        isApiError(err) && err.status === 409 ? (err.details as { existingId?: string })?.existingId : null;
      if (existing) {
        try {
          setQueryData(keys.project(projectId), await accessApi.grant(projectId, existing));
          toast(`📁 ${name} was already in the Vault — it's on in ${projectName}`);
          onDone();
          return;
        } catch (again) {
          setError(formError(again));
        }
      } else setError(formError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="pa-add"
      onSubmit={save}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
      aria-label="Add a folder"
    >
      <label className="ae-k" htmlFor={`pa-path-${projectId}`}>
        Folder
      </label>
      <div className="pa-path">
        <input
          ref={input}
          id={`pa-path-${projectId}`}
          value={d.path}
          placeholder="/Users/you/Documents/notes"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={tried && !!why}
          aria-describedby={`pa-why-${projectId}`}
          onChange={(e) => set({ path: e.target.value })}
        />
        <Button small onClick={pick} disabled={busy !== null}>
          {busy === 'pick' ? 'Choosing…' : 'Choose…'}
        </Button>
      </div>
      <div className="pa-choices">
        <Segmented
          label="Agents may"
          value={d.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'read', label: 'Read only' },
            { value: 'write', label: 'Read & write' },
          ]}
        />
        <Segmented
          label="Show in"
          value={d.scope}
          onChange={(scope) => set({ scope })}
          options={[
            { value: 'project', label: `Only ${projectName}` },
            { value: 'all', label: 'All projects' },
          ]}
        />
      </div>
      <p
        className="hint pa-note"
        id={`pa-why-${projectId}`}
        role={error || (tried && why) ? 'alert' : undefined}
      >
        {error ? (
          <span className="pa-err">{error}</span>
        ) : tried && why ? (
          <span className="pa-err">{why}</span>
        ) : d.scope === 'all' ? (
          'Every project lists it, switched off until you turn it on there.'
        ) : (
          `Only ${projectName} sees it.`
        )}
      </p>
      <div className="pa-actions">
        <Button variant="hero" small type="submit" disabled={busy !== null}>
          {busy === 'save' ? 'Adding…' : 'Add folder'}
        </Button>
        <Button small onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
