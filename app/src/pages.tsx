/* Page registry — feature builders: build your page in src/features/<name>/ and add ONE line here.
   Unregistered routes show the "Building…" placeholder. See src/README.md. */
import { lazy } from 'react';
import type { PageRegistry, PagerComponent } from './shell/pages';

const Gallery = lazy(() => import('./gallery/Gallery').then((m) => ({ default: m.Gallery })));

export const pages: PageRegistry = {
  gallery: Gallery,
  reports: lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))),
};

/** The global pager (bottom-left). U4 sets it. */
export const Pager: PagerComponent | null = null;
