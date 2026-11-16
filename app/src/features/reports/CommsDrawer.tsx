/* The Communication drawer in Reports: who talked to whom about what (the comms log, newest first),
   which office objects the agents use, and a link to the full how-to page. */
import { type Agent, apiUrl, type Comm, studio, type ToolUse, useQuery } from '../../api';
import { relWhen } from './model';
import { useCast } from './parts';

const SHOWN = 50;
const CLIP = 160;

/** Newest first, at most `n`. */
export const latestComms = (comms: Comm[], n = SHOWN): Comm[] => comms.slice(-n).reverse();

/** Most-used tools first, summed over every agent. */
export const toolTotals = (uses: ToolUse[]): { tool: string; uses: number; errors: number }[] => {
  const by = new Map<string, { tool: string; uses: number; errors: number }>();
  for (const u of uses) {
    const t = by.get(u.tool) ?? { tool: u.tool, uses: 0, errors: 0 };
    t.uses += u.uses;
    t.errors += u.errors;
    by.set(u.tool, t);
  }
  return [...by.values()].sort((a, b) => b.uses - a.uses || a.tool.localeCompare(b.tool));
};

const nameOf = (id: string | null, agents: Agent[]): string => {
  if (!id) return 'everyone';
  if (id === 'user') return 'You';
  return agents.find((a) => a.id === id)?.name ?? id;
};

const clip = (s: string) => (s.length > CLIP ? `${s.slice(0, CLIP - 1)}…` : s);

export function CommsDrawer({ projectId }: { projectId: string }) {
  const comms = useQuery(`comms:${projectId}`, () => studio.comms(projectId));
  const uses = useQuery(`tool-use:${projectId}`, () => studio.toolUse(projectId));
  const { agents } = useCast();
  const now = new Date();
  const rows = latestComms(comms.data?.comms ?? []);
  const tools = toolTotals(uses.data?.uses ?? []);

  return (
    <section className="rp-comms" aria-label="Communication">
      <h3>Who talked to whom</h3>
      {!comms.data ? (
        <p className="rp-empty">{comms.error ? "Couldn't load the log." : 'Loading…'}</p>
      ) : !rows.length ? (
        <p className="rp-empty">Nobody has talked yet.</p>
      ) : (
        <ul className="rp-comm-rows">
          {rows.map((c) => (
            <li key={c.id} className="rp-comm">
              <span className="rp-r1">
                <b>{nameOf(c.from, agents)}</b> → <b>{nameOf(c.to, agents)}</b>
                <span className="rp-kind">{c.kind}</span>
                <span className="rp-when">{relWhen(c.at, now)}</span>
              </span>
              <span className="rp-sum">{clip(c.text)}</span>
            </li>
          ))}
        </ul>
      )}
      <h3>What agents use</h3>
      {!tools.length ? (
        <p className="rp-empty">No tool use logged yet.</p>
      ) : (
        <ul className="rp-tools">
          {tools.map((t) => (
            <li key={t.tool}>
              <code>{t.tool}</code> — {t.uses} {t.uses === 1 ? 'use' : 'uses'}
              {t.errors > 0 && <span className="rp-err">, {t.errors} failed</span>}
            </li>
          ))}
        </ul>
      )}
      <a className="rp-link" href={apiUrl(studio.howToPath(projectId)) ?? '#'} target="_blank" rel="noreferrer">
        How every office object is used ↗
      </a>
    </section>
  );
}
