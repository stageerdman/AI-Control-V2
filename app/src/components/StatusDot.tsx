export type DotState = 'starting' | 'ready' | 'error';

const color: Record<DotState, string> = { starting: 'bg-sun', ready: 'bg-mint', error: 'bg-coral' };
const label: Record<DotState, string> = { starting: 'Starting', ready: 'Ready', error: 'Error' };

/** Small live status light; pulses while starting. Labelled for screen readers. */
export function StatusDot({ state }: { state: DotState }) {
  return (
    <span role="img" aria-label={label[state]} className="relative inline-flex size-3">
      {state === 'starting' && (
        <span className={`absolute inset-0 animate-ping rounded-full opacity-75 ${color[state]}`} />
      )}
      <span className={`relative inline-flex size-3 rounded-full ${color[state]}`} />
    </span>
  );
}
