/* A task's sign-offs (WORKFLOWS Phase 5): 16px faces, at most 3, then "+N". Every state has a glyph as well as
   a colour — pending = hollow grey ring, signed = full colour + ✓, sent back = amber ring + ↩. The words
   ("Health Analyst: signed") are the tooltip and the screen-reader text. No reviewer → nothing at all. */
import type { Signoff } from '../../api';
import { Hero } from '../../characters';
import { signoffView } from './workflow-view';
import './workflows.css';

const GLYPH = { pending: null, signed: '✓', 'sent-back': '↩' } as const;

export function SignoffStrip({ signoffs }: { signoffs: Signoff[] | undefined }) {
  const v = signoffView(signoffs);
  if (!v) return null;
  return (
    <span className="so" role="img" aria-label={v.label} title={v.label}>
      {v.faces.map((f) => (
        <span key={f.key} className={`so-face s-${f.state}`} title={f.label}>
          {f.person.look ? (
            <Hero agent={{ name: f.person.name, look: f.person.look }} size={16} />
          ) : (
            <Hero ghost size={16} />
          )}
          {GLYPH[f.state] && <b className="so-badge">{GLYPH[f.state]}</b>}
        </span>
      ))}
      {v.more > 0 && <span className="so-more">+{v.more}</span>}
    </span>
  );
}

/** "Signed by A, B" — one muted line under a done goal. */
export const SignedLine = ({ text }: { text: string | null }) =>
  text ? <p className="so-line">{text}</p> : null;
