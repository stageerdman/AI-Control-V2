/* Thinking power: four steps in one segmented control and one plain line saying what the step means
   (design/cast/thinking.md). Hovering a step previews its line; picking saves at once. Reusable: the
   goal/task override will use the same dial. */
import { useState } from 'react';
import type { ThinkingStep } from '../../api/types';
import { Radios } from './Radios';
import { THINKING, thinkingAbout } from './thinking';

export function ThinkingDial({
  id,
  value,
  onPick,
  label = 'Thinking power',
}: {
  id: string;
  value: ThinkingStep;
  onPick: (s: ThinkingStep) => void;
  label?: string;
}) {
  const [peek, setPeek] = useState<ThinkingStep | null>(null);
  const about = `${id}About`;
  return (
    <div className="th-dial">
      <Radios
        label={label}
        className="tk-mode th-steps"
        value={value}
        describedBy={about}
        onPick={(v) => onPick(v as ThinkingStep)}
        onHover={(v) => setPeek(v as ThinkingStep)}
        onLeave={() => setPeek(null)}
        items={THINKING.map((o) => ({ value: o.step, label: o.label, content: o.label }))}
      />
      <p className={`th-about${peek && peek !== value ? ' peek' : ''}`} id={about}>
        {thinkingAbout(peek ?? value)}
      </p>
    </div>
  );
}
