/* 2 — Who runs it? The stage IS the picker: orchestrators as a radio group (← → to choose). */
import { useRef } from 'react';
import type { Agent, Draft } from '../../api';
import { Hero } from '../../characters/Hero';
import { nickOf } from '../projects/model';
import { orchLine, orchOf } from './flow';
import { Foot, StepCard, StepTitle } from './parts';

export function OrchestratorStep({
  d,
  orchestrators,
  onPick,
  onBack,
  onNext,
}: {
  d: Draft;
  orchestrators: Agent[];
  onPick: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const btns = useRef<Record<string, HTMLButtonElement | null>>({});
  const o = orchOf(d, orchestrators);
  const choose = (id: string) => {
    onPick(id);
    btns.current[id]?.focus();
  };
  const onKeys = (e: React.KeyboardEvent, i: number) => {
    const dd = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!dd) return;
    e.preventDefault();
    e.stopPropagation(); // never the studio's ←/→ stage switch
    choose(orchestrators[(i + dd + orchestrators.length) % orchestrators.length].id);
  };
  return (
    <StepCard
      label="Orchestrator"
      stageClass="np-pick"
      stageProps={{ role: 'radiogroup', 'aria-label': 'Orchestrators' }}
      stage={orchestrators.map((a, i) => {
        const on = a.id === o?.id;
        return (
          // biome-ignore lint/a11y/useSemanticElements: the stage is the picker — robots as roving radio buttons
          <button
            key={a.id}
            ref={(el) => {
              btns.current[a.id] = el;
            }}
            type="button"
            className={`np-actor np-orch${on ? ' on' : ''}`}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-autofocus={on ? true : undefined}
            onClick={() => choose(a.id)}
            onKeyDown={(e) => onKeys(e, i)}
          >
            <Hero
              agent={a}
              size={on ? 136 : 108}
              pose={on ? 'waving' : 'idle'}
              facing={on ? 'front' : 'three-quarter'}
            />
            <span className="np-plate">{a.name}</span>
          </button>
        );
      })}
      body={
        <>
          <StepTitle>Who runs {d.name.trim() || 'this project'}?</StepTitle>
          <p className="np-sub">
            The orchestrator keeps the big picture and picks the teams.
            {orchestrators.length > 1 ? ' Use ← → to choose.' : ''}
          </p>
          {!orchestrators.length && (
            <p className="np-err" role="alert">
              There’s no orchestrator in the Cast — add one in Cast first.
            </p>
          )}
          <p className="np-quote">{orchLine(o)}</p>
        </>
      }
      foot={
        <Foot onBack={onBack}>
          <button type="button" className="btn btn-hero np-primary" disabled={!o} onClick={onNext}>
            Continue with {nickOf(o)}
          </button>
        </Foot>
      }
    />
  );
}
