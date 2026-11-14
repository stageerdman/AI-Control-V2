/* "just now" · "5 min ago" · "3h ago" · "yesterday" · "4 days ago" — the board's one clock word. */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(m)) return '';
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Agent time on the work clock: "0m" · "<1m" · "45m" · "3h" · "12h 40m" · "128h" (100h and up: hours only).
    Never days — agent time adds parallel runs up, so "3d" would read like calendar time. */
export function worked(ms: number): string {
  const t = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const m = Math.floor(t / 60000);
  if (t > 0 && m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h >= 100) return `${h}h`;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
