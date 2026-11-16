/* The how-to page (GET /projects/:id/how-to): every object in the office, how the AIs use it, and how often
   they really did on this project (the object-use log). Plain HTML, no scripts. */
import { OFFICE_OBJECTS, type OfficeObject } from './objects.ts';
import type { ToolUse } from './usage.ts';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const code = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const WHO = { everyone: 'every agent', director: 'the director', leaders: 'leaders' } as const;

/** Per tool: total uses and the agents who used it, most first. */
function byTool(uses: readonly ToolUse[], nameOf: (id: string) => string) {
  const m = new Map<string, { uses: number; errors: number; by: string[] }>();
  for (const u of uses) {
    const t = m.get(u.tool) ?? { uses: 0, errors: 0, by: [] };
    t.uses += u.uses;
    t.errors += u.errors;
    t.by.push(`${nameOf(u.agentId)} ×${u.uses}`);
    m.set(u.tool, t);
  }
  return m;
}

function objectSection(o: OfficeObject, counts: ReturnType<typeof byTool>): string {
  const rows = o.tools
    .map((t) => {
      const c = counts.get(t.name);
      const used = c ? `${c.uses}${c.errors ? ` (${c.errors} failed)` : ''} — ${esc(c.by.join(', '))}` : 'not yet';
      return `<tr><td><code>${esc(t.name)}</code></td><td>${WHO[t.who]}</td><td>${used}</td></tr>`;
    })
    .join('');
  return `<section><h2>${esc(o.name)}</h2><p>${code(o.what)}</p><p><b>How the AIs use it:</b> ${code(o.how)}</p>
<table><thead><tr><th>Tool</th><th>Who</th><th>Used here</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function howToPage(project: string, uses: readonly ToolUse[], nameOf: (id: string) => string): string {
  const counts = byTool(uses, nameOf);
  const total = uses.reduce((n, u) => n + u.uses, 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>How the office works — ${esc(project)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 20px;color:#222}
table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666}code{background:#f3f0fa;padding:1px 5px;border-radius:4px}</style>
</head><body><h1>How the office works</h1>
<p>Every object in the ${esc(project)} office, how the AIs use it, and how often they really did here (${total} tool uses so far).</p>
${OFFICE_OBJECTS.map((o) => objectSection(o, counts)).join('\n')}
</body></html>`;
}
