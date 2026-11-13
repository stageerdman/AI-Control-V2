/* "In setup" card on Projects: calm — tile, name, step + orchestrator, step dots; resume / delete. */
import type { Agent, Draft } from '../../api';
import { go } from '../../shell/router';
import { LogoTile } from '../projects/LogoTile';
import { tileFor } from '../projects/tile';
import { deleteDraft } from './drafts';
import { draftCard } from './flow';
import './setup.css';

export function DraftCard({ draft, orchestrators }: { draft: Draft; orchestrators: Agent[] }) {
  const c = draftCard(draft, orchestrators);
  return (
    <div className="np-dcard">
      <button
        type="button"
        className="np-dresume"
        aria-label={c.label}
        onClick={() => go({ name: 'new', draftId: draft.id })}
      >
        <LogoTile tile={draft.name.trim() ? tileFor(draft.name.trim()) : null} small />
        <span className="np-dtext">
          <b>{c.title}</b>
          <span>{c.line}</span>
        </span>
        <span className="np-ddots" aria-hidden="true">
          {c.dots.map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed five steps
            <i key={i} className={d} />
          ))}
        </span>
      </button>
      <button
        type="button"
        className="np-ddel"
        aria-label={`Delete draft ${c.title}`}
        onClick={() => void deleteDraft(draft.id, draft.name)}
      >
        ✕
      </button>
    </div>
  );
}
