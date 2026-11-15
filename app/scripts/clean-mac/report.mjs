// What the clean-up prints, as plain lines: the plan before asking, the summary after. Pure, so tested.
import { commitVerdict } from '../install-mac/plan.mjs';

const ACTION = {
  app: 'app → Trash',
  dmg: 'disk image → Trash',
  volume: 'mounted disk image → eject',
  ghost: 'Spotlight / Launch Services entry for a missing app → forget',
};
const short = (c) => (c ? c.slice(0, 7) : 'unknown');
const pad = (s, n) => (s.length >= n ? `${s}  ` : s.padEnd(n));

/** Shorten the home folder to ~ so paths fit on a line. */
export const tilde = (home) => (p) => (p === home || p.startsWith(`${home}/`) ? `~${p.slice(home.length)}` : p);

export function formatPlan({ copies, target, repo, source, show }) {
  const width = Math.min(60, Math.max(...copies.map((c) => show(c.path).length), 0) + 2);
  const lines = [
    'AI Studio clean-up',
    `  Checkout:      ${show(repo)} (${source.branch})`,
    `  Latest master: ${short(source.latest)}${source.fastForward ? `  (from GitHub; local master ${short(source.master)} will fast-forward to it)` : ''}`,
    ...source.notes.map((n) => `  Note:          ${n}`),
    '',
  ];
  if (!copies.length) lines.push('No copies of AI Studio found.');
  else lines.push(`Found ${copies.length} ${copies.length === 1 ? 'copy' : 'copies'}:`);
  copies.forEach((c, i) => {
    const why = c.path === target ? ' (replaced by the new build)' : '';
    lines.push(`  ${String(i + 1).padStart(2)}. ${pad(show(c.path), width)}${ACTION[c.kind]}${why}`);
  });
  lines.push('', `Then: build AI Studio from master ${short(source.latest)} and install it as ${target}.`);
  return lines;
}

const DONE = { app: 'moved to the Trash', dmg: 'moved to the Trash', volume: 'ejected', ghost: 'forgotten' };

export function formatSummary({ outcomes, target, built, master, leftovers, show }) {
  const verdict = commitVerdict(built, master);
  const lines = ['', 'Done.', outcomes.length ? 'Removed:' : 'Removed: nothing (no old copies)'];
  for (const o of outcomes)
    lines.push(o.error ? `  ✗ ${show(o.path)}: could not (${o.error}); left in place` : `  ✓ ${show(o.path)}: ${DONE[o.kind]}`);
  lines.push(
    '',
    `  New app:       ${target}`,
    `  Built from:    ${short(built)}`,
    `  Latest master: ${short(master)}`,
    `  Result:        ${verdict}`,
    `  Spotlight:     ${leftovers.length ? `still lists ${leftovers.map((c) => show(c.path)).join(', ')} (may clear within a minute; run again if not)` : `lists only ${target}`}`,
    '',
    'Check it:',
    `  1. Open AI Studio from Spotlight. Hover "AI Studio" at the top left: it should read Build ${short(built)}.`,
    '  2. Open a project, click an agent, then Open chat: 🕘 History is at the top of the chat; it lists past chats.',
  );
  return { lines, ok: verdict === 'MATCH' && !outcomes.some((o) => o.error) };
}
