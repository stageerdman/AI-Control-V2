/* A feature's stages (updates/2026-11-19 FEATURE LIST): now / planned are open work; shipped / shelved / denied
   are closed — out of progress, at the bottom of the list, dated by when they closed. */
export const FEATURE_STATUSES = ['now', 'planned', 'shipped', 'shelved', 'denied'] as const;
export type FeatureStatus = (typeof FEATURE_STATUSES)[number];
/** What a working agent may set; shelving and denying are the user's (or the director's) call. */
export const AGENT_FEATURE_STATUSES = ['now', 'planned', 'shipped'] as const;
/** Where a proposed feature may start: open stages only (a proposal is for work still to land). */
export const PROPOSED_STATUSES = ['now', 'planned'] as const;
export type ProposedStatus = (typeof PROPOSED_STATUSES)[number];

export const isClosed = (s: string) => s === 'shipped' || s === 'shelved' || s === 'denied';

/** closedAt once a feature moves `from` a stage (undefined = just created) `to` another, at time `t`: a new closed
    stage is dated now, an open one has no date, and staying put keeps what it `was`. */
export function closedAtAfter(
  from: FeatureStatus | undefined,
  to: FeatureStatus,
  was: string | null,
  t: string,
): string | null {
  if (from === to) return was;
  return isClosed(to) ? t : null;
}
