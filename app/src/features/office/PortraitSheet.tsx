/* The portrait's sheet (OFFICE): change how the project is shown in AI Studio — its display name and its picture.
   Nothing on disk changes: the folder, branch, .project and the GitHub repo keep their names; the picture lives
   in the studio's data folder. */
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { apiUrl, isApiError, type Project, studio } from '../../api';
import { Button, Sheet } from '../../ui';
import { LogoTile } from '../projects/LogoTile';
import { nameCheck, PICK_TYPES, pickError, toSquarePng } from './portrait';
import '../projects/projects.css';

export function PortraitSheet({
  project,
  open,
  onClose,
  onSaved,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  /** The server's project after a change (the office + Projects caches take it). */
  onSaved: (p: Project) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} label={`${project.name} — picture and name`}>
      {open && <PortraitBody project={project} onSaved={onSaved} />}
    </Sheet>
  );
}

export function PortraitBody({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState<null | 'name' | 'picture'>(null);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setName(project.name), [project.name]);

  const check = nameCheck(name);
  const changed = check.ok && check.name !== project.name;
  const fail = (e: unknown, fallback: string) =>
    setNote({ text: isApiError(e) || e instanceof Error ? e.message : fallback, bad: true });

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!check.ok || !changed) return;
    setBusy('name');
    try {
      onSaved(await studio.projects.update(project.id, { name: check.name }));
      setNote({ text: 'Name saved.' });
    } catch (err) {
      fail(err, 'The name didn’t save.');
    } finally {
      setBusy(null);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const why = pickError(f);
    if (why) return setNote({ text: why, bad: true });
    setBusy('picture');
    try {
      onSaved(await studio.projects.setImage(project.id, await toSquarePng(f)));
      setNote({ text: 'Picture saved.' });
    } catch (err) {
      fail(err, 'The picture didn’t save.');
    } finally {
      setBusy(null);
      if (file.current) file.current.value = '';
    }
  };
  const use = async (path: string) => {
    setBusy('picture');
    try {
      onSaved(await studio.projects.linkImage(project.id, path));
      setNote({ text: 'Using the app’s icon. It updates when the file changes.' });
    } catch (err) {
      fail(err, 'That icon didn’t work.');
    } finally {
      setBusy(null);
    }
  };
  const reset = async () => {
    setBusy('picture');
    try {
      onSaved(await studio.projects.clearImage(project.id));
      setNote({ text: 'Back to the tile.' });
    } catch (err) {
      fail(err, 'That didn’t go through.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pt">
      <h2>Picture and name</h2>
      <p className="hint">Only changes how it’s shown in AI Studio — the folder and repo keep their names.</p>
      <div className="pt-pic">
        <LogoTile tile={project.tile} imageUrl={project.imageUrl} className="pt-big" />
        <div className="pt-pic-actions">
          <Button small variant="ghost" disabled={!!busy} onClick={() => file.current?.click()}>
            {busy === 'picture' ? 'Saving…' : 'Choose picture…'}
          </Button>
          {project.imageUrl && (
            <Button small variant="ghost" disabled={!!busy} onClick={() => void reset()}>
              Reset to the tile
            </Button>
          )}
          <input
            ref={file}
            type="file"
            accept={PICK_TYPES.join(',')}
            hidden
            aria-label="Choose a picture"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>
      </div>
      <AppIcons project={project} busy={!!busy} onUse={(p) => void use(p)} />
      <form className="field pt-name" onSubmit={saveName}>
        <label htmlFor="ptName">Name</label>
        <div className="pt-row">
          <input
            id="ptName"
            value={name}
            maxLength={80}
            autoComplete="off"
            aria-invalid={!check.ok}
            onChange={(e) => {
              setName(e.target.value);
              setNote(null);
            }}
          />
          <Button small variant="hero" type="submit" disabled={!changed || !!busy}>
            {busy === 'name' ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {!check.ok && <p className="pt-why">{check.why}</p>}
      </form>
      <p className={`pt-note${note?.bad ? ' bad' : ''}`} role="status" aria-live="polite">
        {note?.text ?? ''}
      </p>
    </div>
  );
}

/** The icon files found in the project folder, as one-click thumbnails; nothing shows when there are none. */
function AppIcons({
  project,
  busy,
  onUse,
}: {
  project: Project;
  busy: boolean;
  onUse: (path: string) => void;
}) {
  const [paths, setPaths] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    studio.projects.iconFiles(project.id).then(
      (r) => live && setPaths(r.paths),
      () => live && setPaths([]),
    );
    return () => {
      live = false;
    };
  }, [project.id]);
  /* a file that can't be shown (broken, wrong type) drops out of the row */
  const [broken, setBroken] = useState<string[]>([]);
  const shown = (paths ?? []).filter((p) => !broken.includes(p));
  if (!shown.length) return null;
  return (
    <fieldset className="pt-app">
      <legend>From the app</legend>
      <div className="pt-app-row">
        {shown.map((p) => {
          const on = project.imageSource === p;
          return (
            <button
              key={p}
              type="button"
              className={`pt-app-pick${on ? ' on' : ''}`}
              title={p}
              aria-label={`Use ${p}`}
              aria-pressed={on}
              disabled={busy}
              onClick={() => !on && onUse(p)}
            >
              <img
                src={apiUrl(studio.projects.iconPreviewPath(project.id, p)) ?? ''}
                alt=""
                draggable={false}
                onError={() => setBroken((b) => [...b, p])}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
