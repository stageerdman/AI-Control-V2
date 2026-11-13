import type { HTMLAttributes } from 'react';

/** Soft glass panel on the twilight background. */
export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/6 p-6 shadow-2xl shadow-black/30 backdrop-blur ${className}`}
      {...rest}
    />
  );
}
