/* A goal's workflow, only when it is the exception (WORKFLOWS Phase 5): nothing for the usual way, a plain text
   chip for another stable one, the same chip dashed + the lead's tiny avatar for a temporary one ("◌ Elon leads").
   v2: with `onOpen` it's a button that opens How we work on that way (design/workflows/how-we-work.md). */
import type { Look } from '../../api';
import { Hero } from '../../characters';
import type { WorkflowChipView } from './workflow-view';
import './workflows.css';

export function WorkflowChip({
  chip,
  who,
  onOpen,
}: {
  chip: WorkflowChipView | null;
  /** The lead's face (null: someone who left — a ghost). */
  who?: (id: string) => { name: string; look?: Look } | null;
  /** Open How we work on this way (the chip's `way` id). */
  onOpen?: (way: string) => void;
}) {
  if (!chip) return null;
  const lead = chip.lead ? who?.(chip.lead) : null;
  const label = chip.temporary ? `Temporary way: ${chip.name}` : `Way: ${chip.name}`;
  const inner = (
    <>
      {chip.temporary && (
        <span className="wf-lead" aria-hidden="true">
          {lead?.look ? (
            <Hero agent={{ name: lead.name, look: lead.look }} size={16} />
          ) : (
            <Hero ghost size={16} />
          )}
        </span>
      )}
      <span aria-hidden="true">{chip.name}</span>
    </>
  );
  const cls = `wf-chip${chip.temporary ? ' temp' : ''}`;
  if (onOpen)
    return (
      <button
        type="button"
        className={`${cls} wf-chip-btn`}
        title={label}
        aria-label={`Open the way: ${chip.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(chip.way);
        }}
      >
        {inner}
      </button>
    );
  return (
    <span className={cls} title={label}>
      <span className="sr-only">{label}</span>
      {inner}
    </span>
  );
}
