/* The app frame: three layers like the prototype — the studio (title, nav, stage), the office
   (full screen) and the dev gallery — plus the global pager slot and the toaster. */
import { type ComponentType, Suspense, useEffect, useRef } from 'react';
import { Loading, Toaster } from '../ui';
import { Building } from './Building';
import { BUILD, buildLabel } from './build';
import { Motes } from './Motes';
import type { PageRegistry, PagerComponent } from './pages';
import { go, type Route, STAGES, stageOf, useRoute } from './router';
import { StaleNotice } from './StaleNotice';
import './shell.css';

export function Shell({
  pages,
  Pager,
  TopLine,
}: {
  pages: PageRegistry;
  Pager?: PagerComponent | null;
  /** The strip over the top edge (the credits line); on the studio and the office, not the gallery. */
  TopLine?: ComponentType | null;
}) {
  const route = useRoute();
  const Page = (pages[route.name] ?? Building) as ComponentType<{ route: Route }>;
  const stage = stageOf(route);
  const layer = route.name === 'office' ? 'office' : route.name === 'gallery' ? 'gallery' : 'studio';
  useStageKeys(stage);

  const page = (
    <Suspense fallback={<Loading />}>
      <Page route={route} />
    </Suspense>
  );
  return (
    <>
      {TopLine && layer !== 'gallery' && <TopLine />}
      <Motes />
      {layer === 'studio' && <Studio stage={stage}>{page}</Studio>}
      {layer === 'office' && (
        <section id="office" aria-label="Project office">
          {page}
        </section>
      )}
      {layer === 'gallery' && (
        <section id="gallery" aria-label="Character gallery (dev)">
          {page}
        </section>
      )}
      {Pager && <Pager route={route} />}
      <StaleNotice />
      <Toaster />
    </>
  );
}

function Studio({ stage, children }: { stage: ReturnType<typeof stageOf>; children: React.ReactNode }) {
  const scene = useRef<HTMLElement>(null);
  const first = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: move focus to the new scene when the stage changes
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scene.current?.focus({ preventScroll: true });
  }, [stage]);
  const label = STAGES.find((s) => s.id === stage)?.label ?? 'Studio';
  return (
    <div id="studio">
      <header className="topbar">
        <div className="brand" title={buildLabel(BUILD)}>
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4" fill="#fff" />
              <circle cx="12" cy="12" r="8.5" stroke="#fff" strokeWidth="1.6" opacity=".7" />
            </svg>
          </span>
          <div>
            <b>AI Studio</b>
            <span>Your AI crew</span>
          </div>
        </div>
        <nav className="stages" aria-label="Studio sections">
          {STAGES.map((s) => (
            <a key={s.id} href={`#${s.id}`} aria-current={s.id === stage ? 'page' : undefined}>
              {s.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="stage">
        <section key={stage} ref={scene} className="scene active" tabIndex={-1} aria-label={label}>
          {children}
        </section>
      </main>
    </div>
  );
}

/** ←/→ move between studio stages when focus is on the page or the nav (never steals arrows from lists). */
function useStageKeys(stage: ReturnType<typeof stageOf>) {
  useEffect(() => {
    if (!stage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      const t = e.target as HTMLElement;
      if (/input|textarea|select/i.test(t.tagName) || t.isContentEditable || document.querySelector('.scrim'))
        return;
      const free = t === document.body || t.closest?.('nav.stages') || t.classList?.contains('scene');
      if (!free) return;
      const i = STAGES.findIndex((s) => s.id === stage);
      const j = e.key === 'ArrowRight' ? Math.min(STAGES.length - 1, i + 1) : Math.max(0, i - 1);
      if (i >= 0 && j !== i) {
        e.preventDefault();
        go(STAGES[j].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);
}
