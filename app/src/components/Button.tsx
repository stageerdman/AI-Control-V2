import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' };

const variants = {
  primary:
    'bg-gradient-to-b from-sun to-sun-deep text-[#4a2600] shadow-lg shadow-sun-deep/30 hover:brightness-105',
  ghost: 'bg-white/10 text-cream hover:bg-white/20',
};

/** Pill button. `primary` = the one main action on a screen; `ghost` = everything else. */
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold transition active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sun disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    />
  );
}
