/* A whiteboard task card (design/whiteboard-task-card.md): status mark · title · who has it (avatar +
   name, one status word when it adds something). A stopped task shows one plain line; the raw note
   waits behind "Details". A team item lists its members' parts under it, same anatomy, one size down. */
import { useId, useState } from 'react';
import type { ChecklistItem } from '../../api';
import { Hero } from '../../characters';
import { type CardMark, type TaskCardView, taskCard, taskHover } from './state';

type Props = { item: ChecklistItem; nameOf: (id: string) => string; sub?: boolean };

export function TaskCard({ item, nameOf, sub }: Props) {
  const v = taskCard(item, nameOf);
  const hover = taskHover(item, nameOf);
  const kids = sub ? [] : (item.subtasks ?? []);
  return (
    <li className={`ob-task m-${v.mark}`}>
      <Mark mark={v.mark} />
      <span className="ob-tt" title={hover ?? item.text}>
        <span className="sr-only">{v.sr} </span>
        {item.text}
      </span>
      <People v={v} />
      {v.problem && <Problem problem={v.problem} failed={v.mark === 'failed'} />}
      {kids.length > 0 && (
        <ul className="ob-sub" aria-label={`${item.text}: the team’s parts`}>
          {kids.map((k) => (
            <TaskCard key={k.id} item={k} nameOf={nameOf} sub />
          ))}
        </ul>
      )}
    </li>
  );
}

const Mark = ({ mark }: { mark: CardMark }) => (
  <span className="ob-box" aria-hidden="true">
    {mark === 'done' && (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3.5 8.5l3 3L12.5 5"
          fill="none"
          stroke="#fff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
    {mark === 'failed' && '!'}
  </span>
);

/** Up to 3 faces overlapped, then the name (or "Ava +2"), then the status word. Faces are decorative. */
function People({ v }: { v: TaskCardView }) {
  if (!v.people.length && !v.status) return null;
  const shown = v.people.slice(0, 3);
  const label = v.people.length > 1 ? `${v.people[0].name} +${v.people.length - 1}` : v.people[0]?.name;
  return (
    <span className="ob-people" aria-hidden="true">
      {shown.length > 0 && (
        <span className="ob-faces">
          {shown.map((p) => (
            <span className="ob-face" key={p.id}>
              {p.look ? <Hero agent={{ name: p.name, look: p.look }} size={22} /> : <Hero ghost size={22} />}
            </span>
          ))}
        </span>
      )}
      {label && <span className="ob-pn">{label}</span>}
      {v.status && <span className={`ob-stage${v.tone ? ` t-${v.tone}` : ''}`}>{v.status}</span>}
    </span>
  );
}

function Problem({
  problem,
  failed,
}: {
  problem: { message: string; details: string | null };
  failed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`ob-problem${failed ? ' bad' : ''}`}>
      <p>
        <span aria-hidden="true">{problem.message}</span>
        {problem.details && (
          <button
            type="button"
            className="ob-more"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide details' : 'Details'}
          </button>
        )}
      </p>
      {open && problem.details && (
        <pre id={id} className="ob-raw">
          {problem.details}
        </pre>
      )}
    </div>
  );
}
