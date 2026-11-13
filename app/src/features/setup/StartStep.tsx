/* 0 — Start: the crew on stage; new project or adopt a folder. */
import type { Agent } from '../../api';
import { Actor, StepCard, StepTitle } from './parts';

export function StartStep({
  crew,
  busy,
  onPick,
}: {
  crew: { setter?: Agent; orch?: Agent; creator?: Agent };
  busy: boolean;
  onPick: (mode: 'new' | 'adopt') => void;
}) {
  return (
    <StepCard
      label="Start"
      stage={
        <>
          <Actor
            agent={crew.setter}
            pose="waving"
            dir="right"
            plate={crew.setter?.name}
            kind="Project Setter"
          />
          <Actor
            agent={crew.orch}
            pose="idle"
            facing="front"
            size={128}
            plate={crew.orch?.name}
            kind="Orchestrator"
          />
          <Actor
            agent={crew.creator}
            pose="idle"
            dir="left"
            plate={crew.creator?.name}
            kind="Agent Creator"
          />
        </>
      }
      body={
        <>
          <StepTitle>Start a project</StepTitle>
          <p className="np-sub">The Project Setter sets it up, then your orchestrator picks the teams.</p>
          <div className="np-choices">
            <button
              type="button"
              className="np-choice"
              data-autofocus
              disabled={busy}
              onClick={() => onPick('new')}
            >
              <span className="np-ic" aria-hidden="true">
                ＋
              </span>
              <b>New project</b>
              <span>Start fresh in a new folder</span>
            </button>
            <button type="button" className="np-choice" disabled={busy} onClick={() => onPick('adopt')}>
              <span className="np-ic" aria-hidden="true">
                ⇢
              </span>
              <b>Adopt a folder</b>
              <span>Bring existing code under AI Studio</span>
            </button>
          </div>
        </>
      }
    />
  );
}
