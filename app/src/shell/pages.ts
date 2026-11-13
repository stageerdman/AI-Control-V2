/* What a page is, for feature builders. Register yours in src/pages.tsx. */
import type { ComponentType } from 'react';
import type { Route, RouteName } from './router';

/** A page gets its (narrowed) route. */
export type PageProps<N extends RouteName = RouteName> = { route: Extract<Route, { name: N }> };
export type PageRegistry = { [N in RouteName]?: ComponentType<PageProps<N>> };
/** The global pager (bottom-left, positions itself). Gets the current route. */
export type PagerComponent = ComponentType<{ route: Route }>;
