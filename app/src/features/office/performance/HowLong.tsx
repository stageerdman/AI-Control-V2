/* The team sheet's last section, "How long work takes" (design/time-estimates.md): what a task / goal /
   feature usually takes, then the latest finished tasks with their time. All finished work, so the range
   picker above doesn't change it. Hidden until something has finished. */
import type { Agent } from '../../../api';
import { Hero } from '../../../characters';
import type { Timesheet } from '../api';
import { guessRows, latestDone } from '../estimates';
import { worked } from '../time';

export function HowLong({ sheet, agents }: { sheet: Timesheet | undefined; agents: Record<string, Agent> }) {
  const rows = guessRows(sheet);
  const done = latestDone(sheet);
  if (!rows.length && !done.length) return null;
  return (
    <section aria-labelledby="pf-howlong">
      <h3 id="pf-howlong">How long work takes</h3>
      <p className="hint pf-hl-hint">From all finished work.</p>
      {rows.length ? (
        <ul className="pf-guess">
          {rows.map((r) => (
            <li key={r.id}>
              <span>{r.label}</span>
              <span className="ts-num">
                <span aria-hidden="true">~{r.usual}</span>
                <span className="sr-only">usually about {r.usual}</span>
              </span>
              <span className="pf-soft">
                most {r.range} · from {r.basis} done
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Guesses start once 3 tasks are done.</p>
      )}
      {done.length > 0 && (
        <>
          <h4 className="pf-team">Latest done</h4>
          <ul className="pf-done">
            {done.map((t) => {
              const a = agents[t.agentId];
              return (
                <li key={t.itemId}>
                  <Hero agent={a ?? null} ghost={!a} size="xs" pose="idle" facing="front" />
                  <span className="pf-done-t" title={t.text}>
                    {t.text}
                    <span className="sr-only">, by {a?.name ?? 'a retired agent'}, took</span>
                  </span>
                  <span className="ts-num">{worked(t.time.activeMs)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
