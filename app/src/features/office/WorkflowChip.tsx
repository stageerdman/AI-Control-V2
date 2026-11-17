/* A goal's workflow, only when it is the exception (WORKFLOWS Phase 5): nothing for the usual way, a plain text
   chip for another stable one, the same chip dashed + the lead's tiny avatar for a temporary one ("◌ Elon leads").
   No new colour. */
import type { Look } from '../../api';
import { Hero } from '../../characters';
import type { WorkflowChipView } from './workflow-view';
import './workflows.css';

export function WorkflowChip({
  chip,
  who,
}: {
  chip: WorkflowChipView | null;
  /** The lead's face (null: someone who left — a ghost). */
  who?: (id: string) => { name: string; look?: Look } | null;
}) {
  if (!chip) return null;
  const lead = chip.lead ? who?.(chip.lead) : null;
  const label = chip.temporary ? `Temporary workflow: ${chip.name}` : `Workflow: ${chip.name}`;
  return (
    <span className={`wf-chip${chip.temporary ? ' temp' : ''}`} title={label}>
      <span className="sr-only">{label}</span>
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
    </span>
  );
}
