/* Page registry — feature builders: build your page in src/features/<name>/ and add ONE line here.
   Unregistered routes show the "Building…" placeholder. See src/README.md. */
import { lazy } from 'react';
import { Pager as OfficePager } from './features/office/Pager';
import type { PageRegistry, PagerComponent } from './shell/pages';

const Cast = lazy(() => import('./features/cast/CastPage').then((m) => ({ default: m.CastPage })));
const Gallery = lazy(() => import('./gallery/Gallery').then((m) => ({ default: m.Gallery })));

export const pages: PageRegistry = {
  gallery: Gallery,
  cast: Cast,
  'cast.agent': Cast,
  'cast.tinker': Cast,
  'cast.team': Cast,
  access: lazy(() => import('./features/access/AccessPage').then((m) => ({ default: m.AccessPage }))),
  blueprint: lazy(() =>
    import('./features/blueprint/BlueprintPage').then((m) => ({ default: m.BlueprintPage })),
  ),
  projects: lazy(() => import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))),
  new: lazy(() => import('./features/setup/SetupPage').then((m) => ({ default: m.SetupPage }))),
  office: lazy(() => import('./features/office/OfficePage').then((m) => ({ default: m.OfficePage }))),
};

/** The global pager (bottom-left). U4 sets it. */
export const Pager: PagerComponent | null = OfficePager;
