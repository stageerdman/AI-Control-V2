import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';

type Common = { label: string; hint?: string };

/** Labelled text input (.field). */
export function Field({ label, hint, id, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && (
        <p id={`${fid}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Labelled textarea (.field). */
export function TextArea({
  label,
  hint,
  id,
  rows = 3,
  ...rest
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <textarea id={fid} rows={rows} aria-describedby={hint ? `${fid}-hint` : undefined} {...rest} />
      {hint && (
        <p id={`${fid}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}
