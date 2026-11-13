/* Building blocks of every setup step: the card (dark stage over a cream body + foot) and a
   character on the stage with its name plate. */
import type { ReactNode } from 'react';
import type { Agent } from '../../api';
import { Hero, type HeroProps } from '../../characters/Hero';
import { Button } from '../../ui';

export type StepProps = { label: string };

/** One step: the stage (crew acts here), the body, the foot. `stageProps` for the picker stage. */
export function StepCard({
  label,
  stage,
  stageClass,
  stageProps,
  body,
  foot,
}: {
  label: string;
  stage: ReactNode;
  stageClass?: string;
  stageProps?: React.HTMLAttributes<HTMLDivElement>;
  body: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <section className="np-card" aria-label={label}>
      <div className={['np-stage', stageClass].filter(Boolean).join(' ')} {...stageProps}>
        {stage}
      </div>
      <div className="np-body">{body}</div>
      <footer className="np-foot" hidden={!foot}>
        {foot}
      </footer>
    </section>
  );
}

/** The step heading — focus lands here when a step has no better target. */
export const StepTitle = ({ children }: { children: ReactNode }) => (
  <h2 tabIndex={-1} data-step-title>
    {children}
  </h2>
);

export function Foot({
  onBack,
  backDisabled,
  children,
}: {
  onBack?: () => void;
  backDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {onBack && (
        <Button onClick={onBack} disabled={backDisabled}>
          ← Back
        </Button>
      )}
      <span className="spacer" />
      {children}
    </>
  );
}

/** A character on the stage with an optional plate (name + small kind line). */
export function Actor({
  agent,
  plate,
  kind,
  className,
  ...hero
}: Omit<HeroProps, 'agent'> & {
  agent: Agent | null | undefined;
  plate?: ReactNode;
  kind?: string;
  className?: string;
}) {
  return (
    <div className={['np-actor', className].filter(Boolean).join(' ')}>
      <Hero agent={agent} size={112} {...hero} />
      {(plate || kind) && (
        <span className="np-plate">
          {plate}
          {kind && <small>{kind}</small>}
        </span>
      )}
    </div>
  );
}
