/* A small segmented choice (a radiogroup with roving focus: arrows move and pick) — the editor's
   "Start from" look, for any short either/or. */
import { type KeyboardEvent, useId, useRef } from 'react';

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const onKeys = (e: KeyboardEvent, i: number) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    const next = options[n];
    if (!next) return;
    onChange(next.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <div className="seg">
      <span className="ae-k" id={id}>
        {label}
      </span>
      <div className="ae-templates" role="radiogroup" aria-labelledby={id} ref={group}>
        {options.map((o, i) => (
          // biome-ignore lint/a11y/useSemanticElements: a segmented control with roving focus
          <button
            key={o.value}
            type="button"
            role="radio"
            className="ae-tpl"
            aria-checked={value === o.value}
            tabIndex={value === o.value ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeys(e, i)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
