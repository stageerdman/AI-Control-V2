/* The build this window runs (app/build-stamp.ts) — hover the brand to see it. */
declare const __BUILD__: { commit: string; builtAt: string };

export const BUILD = __BUILD__;

export const buildLabel = ({ commit, builtAt }: typeof BUILD) =>
  `Build ${commit} · ${builtAt.slice(0, 16).replace('T', ' ')} UTC`;
