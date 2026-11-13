/* 1 — Name (+ the folder when adopting) and an optional one-liner the orchestrator reads.
   The stage shows the live logo tile and where the project will live. */
import { useRef } from 'react';
import { type Draft, useQuery } from '../../api';
import { Button } from '../../ui';
import { LogoTile } from '../projects/LogoTile';
import { tileFor } from '../projects/tile';
import { sandboxFolders, sandboxPath } from './api';
import { canContinue, STEP, slugify, tildePath, titleOf } from './flow';
import { Foot, StepCard, StepTitle } from './parts';

export function NameStep({
  d,
  edit,
  onBack,
  onNext,
}: {
  d: Draft;
  edit: (p: { name?: string; about?: string; folder?: string | null }) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const adopt = d.mode === 'adopt';
  const folders = useQuery(adopt ? 'sandbox:folders' : null, sandboxFolders);
  const sandbox = useQuery('sandbox:path', sandboxPath);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const nm = d.name.trim();
  const ok = canContinue(STEP.name, d, []);
  const root = sandbox.data ? tildePath(sandbox.data) : '';
  const where = adopt ? (d.folder ? `${root}/${d.folder}` : '') : nm ? `${root}/${slugify(nm)}` : '';
  const list = folders.data ?? [];

  const pick = (folder: string) => {
    const prevAuto = d.folder && d.name === titleOf(d.folder);
    edit({ folder, ...(!d.name.trim() || prevAuto ? { name: titleOf(folder) } : {}) });
  };
  const onKeys = (e: React.KeyboardEvent, i: number) => {
    const dd = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (!dd) return;
    e.preventDefault();
    const j = (i + dd + list.length) % list.length;
    radios.current[j]?.focus();
    pick(list[j].folder);
  };
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && ok) onNext();
  };
  const sel = list.findIndex((f) => f.folder === d.folder);
  const showFields = !adopt || !!d.folder;

  return (
    <StepCard
      label="Name"
      stage={
        <div className="np-tilewrap">
          <LogoTile key={nm} tile={nm ? tileFor(nm) : null} className="np-tile" />
          <b>{nm || (adopt ? 'Pick a folder' : 'Your project')}</b>
          <span className="np-tpath">{where}</span>
        </div>
      }
      body={
        <>
          <StepTitle>{adopt ? 'Which folder?' : 'Name your project'}</StepTitle>
          {adopt &&
            (folders.error ? (
              <p className="np-err" role="alert">
                Couldn’t read the sandbox — {folders.error.message}{' '}
                <Button small onClick={() => void folders.refetch()}>
                  Try again
                </Button>
              </p>
            ) : folders.loading ? (
              <p className="np-sub">Looking in the sandbox…</p>
            ) : !list.length ? (
              <div className="np-empty">
                No folders to adopt yet. Put a project folder in <code>{root || 'the sandbox'}</code>, then{' '}
                <Button small onClick={() => void folders.refetch()}>
                  look again
                </Button>
              </div>
            ) : (
              <div className="np-folders" role="radiogroup" aria-label="Folders in the sandbox">
                {list.map((f, i) => (
                  // biome-ignore lint/a11y/useSemanticElements: the prototype's roving radio buttons (styled cards)
                  <button
                    key={f.folder}
                    ref={(el) => {
                      radios.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    className="np-folder"
                    aria-checked={d.folder === f.folder}
                    tabIndex={i === Math.max(0, sel) ? 0 : -1}
                    data-autofocus={!d.folder && i === 0 ? true : undefined}
                    onClick={() => pick(f.folder)}
                    onKeyDown={(e) => onKeys(e, i)}
                  >
                    <span className="np-fic" aria-hidden="true">
                      📁
                    </span>
                    <span className="np-fpath">
                      {root}/{f.folder}
                    </span>
                    <span className="np-fmeta">
                      {f.git ? 'git' : 'no git yet'}
                      {f.marked ? ' · has .project' : ''}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          <div className="np-namefields" hidden={!showFields}>
            <div className="field">
              <label htmlFor="npName">Project name</label>
              <input
                id="npName"
                autoComplete="off"
                placeholder="e.g. Kite Notes"
                maxLength={60}
                value={d.name}
                data-autofocus={showFields && (!adopt || !!d.folder) ? true : undefined}
                onChange={(e) => edit({ name: e.target.value })}
                onKeyDown={enter}
              />
            </div>
            <div className="field">
              <label htmlFor="npAbout">
                What is it? <span className="np-opt">optional — your orchestrator reads this</span>
              </label>
              <input
                id="npAbout"
                autoComplete="off"
                placeholder="e.g. a tiny weekend app for sharing recipes"
                value={d.about}
                onChange={(e) => edit({ about: e.target.value })}
                onKeyDown={enter}
              />
            </div>
          </div>
        </>
      }
      foot={
        <Foot onBack={onBack}>
          <button type="button" className="btn btn-hero np-primary" disabled={!ok} onClick={onNext}>
            Continue
          </button>
        </Foot>
      }
    />
  );
}
