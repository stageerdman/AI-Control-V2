import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Small choice / filter button (.chip). Pass `pressed` for a toggle chip. */
export function Chip({
  pressed,
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={['chip', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}

export type PillTone = 'live' | 'idle' | 'needs' | 'draft' | 'archived';
/** Status pill (.pill). `dot` adds the pulsing live dot. */
export function Pill({ tone, dot, children }: { tone: PillTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
