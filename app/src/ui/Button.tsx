import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** React 19: a ref is a plain prop (focus the button from outside). */
  ref?: Ref<HTMLButtonElement>;
  /** hero = the one main action on a screen; ghost = everything else; dark = ink pill. */
  variant?: 'hero' | 'ghost' | 'dark';
  /** Ghost button sitting on the twilight background. */
  onDark?: boolean;
  small?: boolean;
};

/** The prototype's pill button (.btn). */
export function Button({
  variant = 'ghost',
  onDark,
  small,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, onDark && 'on-dark', small && 'btn-sm', className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={cls} {...rest} />;
}
