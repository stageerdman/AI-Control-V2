/* Drifting dust motes behind the studio (prototype app.js _motes) — calm, off under reduced motion. */
import { useMemo } from 'react';

export function Motes({ count = 22 }: { count?: number }) {
  const motes = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const s = 2 + Math.random() * 5;
        return {
          width: `${s}px`,
          height: `${s}px`,
          left: `${Math.random() * 100}vw`,
          bottom: `${-10 - Math.random() * 20}vh`,
          animationDuration: `${14 + Math.random() * 20}s`,
          animationDelay: `${-Math.random() * 20}s`,
        };
      }),
    [count],
  );
  return (
    <div className="sky-motes" aria-hidden="true">
      {motes.map((style, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static decorative list
        <span key={i} className="mote" style={style} />
      ))}
    </div>
  );
}
