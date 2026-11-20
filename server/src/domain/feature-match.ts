/* Finding features by what someone calls them: case and extra spaces don't matter, and part of a name is enough
   ("dark" finds "Dark mode"). An exact name wins over partial ones, so a full name never comes back ambiguous. */

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The features whose name matches `query`: the exact match(es) if any, else every name containing it (in the
    order given). Empty query: none. */
export function matchFeatures<F extends { name: string }>(features: readonly F[], query: string): F[] {
  const q = norm(query);
  if (!q) return [];
  const exact = features.filter((f) => norm(f.name) === q);
  return exact.length ? exact : features.filter((f) => norm(f.name).includes(q));
}
