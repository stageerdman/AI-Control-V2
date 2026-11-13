/* Empty / loading / error states — always with a robot, never a bare spinner. */
import type { ReactNode } from 'react';
import { isApiError } from '../api/client';
import { Hero } from '../characters/Hero';
import type { HeroAgent, Pose } from '../characters/hero-svg';
import { Button } from './Button';

const SCOUT: HeroAgent = {
  name: 'Scout',
  look: { hat: 'detective', tool: 'magnifier', body: 'sprout', antenna: 'bob', face: 'none', hue: 'rose' },
};
const FIXER: HeroAgent = {
  name: 'Fixer',
  look: { hat: 'hardhat', tool: 'wrench', body: 'bruiser', antenna: 'tuft', face: 'none', hue: 'coral' },
};
const RUNNER: HeroAgent = {
  name: 'Runner',
  look: { hat: 'none', tool: 'none', body: 'hero', antenna: 'swoop', face: 'none', hue: 'teal' },
};

export function EmptyState({
  title,
  children,
  action,
  agent = SCOUT,
  pose = 'thinking',
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  agent?: HeroAgent;
  pose?: Pose;
}) {
  return (
    <div className="empty-state">
      <Hero agent={agent} size={120} pose={pose} />
      <h2>{title}</h2>
      {children && <p style={{ color: 'rgba(255,246,233,.7)', fontWeight: 600, margin: 0 }}>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <Hero agent={RUNNER} size={96} pose="walking" facing="side" />
      <p style={{ fontWeight: 700, margin: 0 }}>{label}</p>
    </div>
  );
}

/** Honest error: what failed, the server's message, and a retry when there is one. */
export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : String(error);
  const issues = isApiError(error) ? error.issues : [];
  return (
    <div className="empty-state" role="alert">
      <Hero agent={FIXER} size={110} pose="frustrated" />
      <h2>{title}</h2>
      <p style={{ color: 'rgba(255,246,233,.75)', fontWeight: 600, margin: 0, maxWidth: '60ch' }}>
        {message}
      </p>
      {issues.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, textAlign: 'left', fontSize: 13, opacity: 0.8 }}>
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button onDark onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
