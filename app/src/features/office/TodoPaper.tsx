/* The to-do paper on a robot's desk (STUDIO LIFE): its saved list — work others asked of it, in the order it came,
   and its own reminders. Read-only; the agent ticks items off itself. */
import { studio, useQuery } from '../../api';
import { keys } from './api';

const RECENT_DONE = 5;

export function TodoPaper({
  pid,
  agentId,
  nameOf,
}: {
  pid: string;
  agentId: string;
  nameOf: (agentId: string) => string;
}) {
  const q = useQuery(keys.todos(pid, agentId), () => studio.todos(pid, agentId));
  const all = q.data?.todos ?? [];
  const open = all.filter((t) => t.status === 'open');
  const done = all.filter((t) => t.status === 'done').slice(0, RECENT_DONE);
  if (!q.data) return null;
  return (
    <div className="lf">
      <h2>To-do</h2>
      {open.length === 0 ? (
        <p className="rp-empty">Nothing on the list.</p>
      ) : (
        <ol className="td-list">
          {open.map((t) => (
            <li key={t.id}>
              <span>{t.text.split('\n')[0]}</span>
              <span className="hint">
                {t.fromId ? ` · asked by ${nameOf(t.fromId)}` : ' · own reminder'}
                {t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleString()}` : ''}
                {t.notify ? ' · pages you when done' : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      {done.length > 0 && (
        <>
          <h3 className="dn-h">Done lately</h3>
          <ul className="td-list td-done">
            {done.map((t) => (
              <li key={t.id}>
                <s>{t.text.split('\n')[0]}</s>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
