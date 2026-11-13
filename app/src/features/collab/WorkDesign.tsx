/* "How we'll work" — the orchestrator's collaboration design, calmly: one line on who it talks to,
   the review chain as chips (after → reviewer · kind; the why on hover), one muted rule line.
   Read-only: in setup the side chat changes it, in the office the "How we work" card asks the
   orchestrator. Chips that changed since the last render flash mint once. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Collaboration } from '../../api';
import { Emblem, Hero } from '../../characters';
import { changedKeys, type DesignView, designView, type Resolve } from './model';
import './collab.css';

export function WorkDesign({
  collab,
  orch,
  resolve,
  title = 'How we’ll work',
}: {
  collab: Collaboration | null | undefined;
  /** The orchestrator's short name ("Pixel"). */
  orch: string;
  resolve: Resolve;
  title?: string;
}) {
  const view = useMemo(() => designView(collab, orch, resolve), [collab, orch, resolve]);
  const prev = useRef<DesignView | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const c = changedKeys(prev.current, view);
    prev.current = view;
    if (!c.size) return;
    setFlash(c);
    const t = setTimeout(() => setFlash(new Set()), 700);
    return () => clearTimeout(t);
  }, [view]);

  return (
    <section className="wd" aria-label={title}>
      <h3 className="wd-eyebrow">{title}</h3>
      <p className="wd-talk">{view.talk}.</p>
      {view.chips.length > 0 && (
        <ul className="wd-gates">
          {view.chips.map((c) => (
            <li
              key={c.key}
              className={`wd-gate${flash.has(c.key) ? ' flash' : ''}`}
              title={c.why}
              aria-label={`${c.after.label} → ${c.reviewer.name}, ${c.kind}: ${c.why}`}
            >
              {c.after.team?.emblem && (
                <Emblem id={c.after.team.emblem} color={c.after.team.color} size={18} decorative />
              )}
              <span className="wd-after">{c.after.label}</span>
              <span className="wd-arrow" aria-hidden="true">
                →
              </span>
              <span className="wd-face" aria-hidden="true">
                {c.reviewer.ghost || !c.reviewer.look ? (
                  <Hero ghost size={22} />
                ) : (
                  <Hero agent={{ name: c.reviewer.name, look: c.reviewer.look }} size={22} />
                )}
              </span>
              <span className="wd-who">{c.reviewer.name}</span>
              <span className="wd-kind">· {c.kind}</span>
            </li>
          ))}
          {view.more > 0 && <li className="wd-gate wd-more">+{view.more}</li>}
        </ul>
      )}
      <p className="wd-hint">{view.hint}</p>
    </section>
  );
}
