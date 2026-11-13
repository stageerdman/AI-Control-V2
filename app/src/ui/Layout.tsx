import type { HTMLAttributes, ReactNode } from 'react';

/** Light panel on the twilight stage (.panel). */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['panel', className].filter(Boolean).join(' ')} {...rest} />;
}

/** Page heading: kicker, title, one line of context, actions on the right (.scene-head). */
export function SceneHead({
  kicker,
  title,
  children,
  actions,
}: {
  kicker?: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="scene-head">
      <div>
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && (
        <>
          <span className="spacer" />
          {actions}
        </>
      )}
    </div>
  );
}
