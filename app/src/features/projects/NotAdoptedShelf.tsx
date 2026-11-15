/* "Not adopted" — ~/dev folders not under AI Studio yet. One click = an adopt draft with the folder
   and its name filled in, opened on the Name step to confirm. Collapsed by default (the page
   remembers); opens on its own while searching or when the studio has nothing else to show. */
import { useState } from 'react';
import { studio } from '../../api';
import { Button, toast } from '../../ui';
import type { SandboxFolder } from '../setup/api';
import { STEP, titleOf } from '../setup/flow';
import { folderHint } from './model';

let lastOpen = false;

export function NotAdoptedShelf({
  folders,
  error,
  onRetry,
  forceOpen,
  orchestratorId,
}: {
  folders: SandboxFolder[];
  error: unknown;
  onRetry: () => void;
  forceOpen: boolean;
  orchestratorId: string | null;
}) {
  const [open, setOpen] = useState(lastOpen);
  const [busy, setBusy] = useState<string | null>(null);
  lastOpen = open;
  const shown = open || forceOpen;

  const adopt = async (folder: string) => {
    setBusy(folder);
    try {
      const d = await studio.drafts.create({
        mode: 'adopt',
        folder,
        name: titleOf(folder),
        step: STEP.name,
        orchestratorId,
      });
      location.assign(`#new/${encodeURIComponent(d.id)}`);
    } catch (e) {
      toast(`Couldn’t start the draft — ${(e as Error).message}`);
      setBusy(null);
    }
  };

  if (!error && !folders.length) return null;
  return (
    <section className="shelf loose-shelf" aria-labelledby="shelf-loose">
      <div className="shelf-head">
        <h2 id="shelf-loose">Not adopted</h2>
        {!error && (
          <span className="cnt">
            {folders.length} folder{folders.length === 1 ? '' : 's'}
          </span>
        )}
        {!error && !forceOpen && (
          <button
            type="button"
            className="shelf-toggle"
            aria-expanded={shown}
            aria-controls="loose-grid"
            onClick={() => setOpen(!open)}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      <div className="shelf-hr" />
      {error ? (
        <div className="row" style={{ gap: 10 }}>
          <p className="hint" style={{ color: 'rgba(255,246,233,.6)', margin: 0 }}>
            Couldn’t read ~/dev.
          </p>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      ) : (
        shown && (
          <div className="shelf-grid" id="loose-grid">
            {folders.map((f) => (
              <button
                key={f.folder}
                type="button"
                className="pfolder"
                aria-label={`Adopt ${f.folder}`}
                title={f.folder}
                disabled={!!busy}
                onClick={() => void adopt(f.folder)}
              >
                <h3>{f.folder}</h3>
                {folderHint(f) && <span className="sub">{folderHint(f)}</span>}
              </button>
            ))}
          </div>
        )
      )}
    </section>
  );
}
