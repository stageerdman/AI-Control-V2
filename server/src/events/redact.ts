/* Secrets never enter the event log. Two nets: every known secret value (from the
   SecretStore) and the shapes of common API keys, replaced wherever they appear in
   a string — even inside a longer text. Pure. */

export const REDACTED = '••••';
/** Shorter values are too likely to collide with ordinary words to scan for. */
export const MIN_SCANNED_SECRET = 8;

const KEY_SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
];

export function redactSecrets<T>(value: T, secrets: readonly string[]): { value: T; redacted: number } {
  const known = [...new Set(secrets.filter((s) => s.length >= MIN_SCANNED_SECRET))].sort(
    (a, b) => b.length - a.length,
  );
  let redacted = 0;
  const clean = (s: string) => {
    let out = s;
    for (const k of known) {
      if (out.includes(k)) {
        redacted += out.split(k).length - 1;
        out = out.split(k).join(REDACTED);
      }
    }
    for (const re of KEY_SHAPES) {
      out = out.replace(re, () => {
        redacted++;
        return REDACTED;
      });
    }
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return clean(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value) as T, redacted };
}
