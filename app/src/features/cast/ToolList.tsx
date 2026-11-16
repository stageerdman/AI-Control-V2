/* An agent's tools in three plain rows — Edit / Run / Reach — straight from the server's toolList
   (design/cast/tools.md). Pure and read-only; an empty row reads "Nothing" so the gap is honest. */
import type { ToolList as Tools } from '../../api/types';

const ROWS = [
  { key: 'edit', label: 'Edit', none: 'Nothing — reads only' },
  { key: 'run', label: 'Run', none: 'Nothing' },
  { key: 'reach', label: 'Reach', none: 'Nothing' },
] as const;

export function ToolList({ list }: { list: Tools }) {
  return (
    <dl className="tl">
      {ROWS.map(({ key, label, none }) => {
        const items = list[key];
        return (
          <div className="tl-row" key={key}>
            <dt>{label}</dt>
            {!items.length ? (
              <dd className="tl-none">{none}</dd>
            ) : key === 'run' ? (
              <dd>{items.join(' · ')}</dd>
            ) : (
              items.map((it) => <dd key={it}>{it}</dd>)
            )}
          </div>
        );
      })}
    </dl>
  );
}
