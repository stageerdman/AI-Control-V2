/* Page registry — feature builders: build your page in src/features/<name>/ and add ONE line here.
   Unregistered routes show the "Building…" placeholder. See src/README.md. */
import { lazy } from 'react';
import type { PageRegistry, PagerComponent } from './shell/pages';

const Cast = lazy(() => import('./features/cast/CastPage').then((m) => ({ default: m.CastPage })));
const Gallery = lazy(() => import('./gallery/Gallery').then((m) => ({ default: m.Gallery })));

export const pages: PageRegistry = {
  gallery: Gallery,
  cast: Cast,
  'cast.agent': Cast,
  'cast.team': Cast,
  access: lazy(() => import('./features/access/AccessPage').then((m) => ({ default: m.AccessPage }))),
  blueprint: lazy(() =>
    import('./features/blueprint/BlueprintPage').then((m) => ({ default: m.BlueprintPage })),
  ),
  reports: lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))),
  projects: lazy(() => import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))),
  new: lazy(() => import('./features/setup/SetupPage').then((m) => ({ default: m.SetupPage }))),
};

/** The global pager (bottom-left). U4 sets it. */
export const Pager: PagerComponent | null = null;
