/** Progress bar (.progress) — the studio's main "how far along" signal. */
export function Progress({
  value,
  tone,
  small,
  label = 'Progress',
}: {
  /** 0–100 */
  value: number;
  tone?: 'mint' | 'coral';
  small?: boolean;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={['progress', tone, small && 'sm'].filter(Boolean).join(' ')}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** On/off switch (.switch). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
