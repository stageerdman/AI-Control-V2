/* 3 — Setup: the Project Setter sets the draft's folder up (POST /drafts/:id/setup) — the user's
   order: the Setter first, then the orchestrator picks the team. Its steps stream live from
   GET /drafts/:id/events (`setup.step`); the setup response is the truth at the end. Idempotent on
   the server, so a retry only adds what's missing. Then: "Call in <orchestrator> →". */
import { useEffect, useRef, useState } from 'react';
import { type Agent, type Draft, invalidate, openEventStream, studio } from '../../api';
import { LogoTile } from '../projects/LogoTile';
import { nickOf } from '../projects/model';
import { tileFor } from '../projects/tile';
import { type SetupResult, setupDraft } from './api';
import { sparkle } from './confetti';
import { DRAFTS_KEY } from './drafts';
import {
  type SetterState,
  setterAlreadyDone,
  setterDone,
  setterFailed,
  setterPct,
  setterStart,
  setterStep,
} from './flow';
import { Actor, Foot, StepCard, StepTitle } from './parts';
import { putDraft } from './useDraft';

/** One Setter run per draft per session (StrictMode mounts twice; a remount must not run it again). */
const runs = new Map<string, Promise<SetupResult>>();

export function SetterStep({
  d,
  setter,
  orch,
  onBack,
  onNext,
}: {
  d: Draft;
  setter: Agent | undefined;
  orch: Agent | undefined;
  onBack: () => void;
  onNext: () => void;
}) {
  const [st, setSt] = useState<SetterState>(() =>
    d.setupAt ? setterAlreadyDone(d.mode) : setterStart(d.mode),
  );
  const [attempt, setAttempt] = useState(0);
  const next = useRef<HTMLButtonElement>(null);
  const name = d.name.trim();
  const setUp = !!d.setupAt;

  // biome-ignore lint/correctness/useExhaustiveDependencies: one run per attempt; a set-up draft never reruns
  useEffect(() => {
    if (setUp && attempt === 0 && !runs.has(d.id)) return;
    let alive = true;
    const t0 = Date.now() - 1500; // ignore steps of an earlier attempt replayed by the stream
    const stream = openEventStream(
      studio.drafts.eventsUrl(d.id),
      (e) => {
        if (!alive || Date.parse(e.at) < t0) return;
        if (e.type === 'setup.step') setSt((s) => setterStep(s, e.payload, d.mode));
        if (e.type === 'setup.failed') setSt((s) => setterFailed(s, e.payload.message));
      },
      { types: ['setup.step', 'setup.failed'] },
    );
    let run = runs.get(d.id);
    if (!run) {
      run = new Promise((ok) => setTimeout(ok, 250)).then(() => setupDraft(d.id)); // let the stream connect first
      runs.set(d.id, run);
    }
    run.then(
      (r) => {
        putDraft(d.id, {
          folder: r.draft.folder,
          setupAt: r.draft.setupAt,
          setupCommit: r.draft.setupCommit,
        });
        void invalidate(DRAFTS_KEY);
        void invalidate('sandbox:');
        if (!alive) return;
        stream.close();
        setSt(setterDone(r.steps, d.mode));
        sparkle(50, 30);
        setTimeout(() => next.current?.focus(), 60);
      },
      (e: Error) => {
        runs.delete(d.id);
        if (!alive) return;
        stream.close();
        setSt((s) => setterFailed(s, e.message));
      },
    );
    return () => {
      alive = false;
      stream.close();
    };
  }, [d.id, attempt]);

  const done = st.done && !st.failed;
  const pct = setterPct(st);
  return (
    <StepCard
      label="Setup"
      stage={
        <>
          <Actor
            key={done ? 'salute' : 'writing'}
            agent={setter}
            pose={done ? 'salute' : st.failed ? 'frustrated' : 'writing'}
            holding={done ? undefined : 'binder'}
            dir="right"
            size={128}
            className="np-setter"
          />
          <div className="np-tilewrap sm">
            <LogoTile tile={tileFor(name || 'project')} />
            <b>{name}</b>
          </div>
        </>
      }
      body={
        <>
          <StepTitle>
            {done
              ? 'All set up'
              : st.failed
                ? 'The setup stopped'
                : `${nickOf(setter) || 'The Project Setter'}, the Project Setter, is setting up ${name}`}
          </StepTitle>
          <p className="np-sub">
            {d.mode === 'adopt'
              ? 'It reads the folder first and only adds what is missing.'
              : 'The standard AI Studio scaffold, nothing more.'}
          </p>
          <div
            className="progress np-prog"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="fill" style={{ width: `${pct}%` }} />
          </div>
          <ul className="np-checks">
            {st.rows.map((r) => (
              <li
                key={r.step}
                className={
                  r.state === 'kept'
                    ? 'done kept'
                    : r.state === 'skipped'
                      ? 'skipped'
                      : done && !r.state
                        ? 'done'
                        : r.state
                }
              >
                <span className="np-tick" aria-hidden="true" />
                <b>{r.label}</b>
                <span className="np-detail">{r.detail}</span>
              </li>
            ))}
          </ul>
          {st.failed && (
            <p className="np-err" role="alert">
              {st.failed}
            </p>
          )}
        </>
      }
      foot={
        /* the prototype: no way back once the Setter is done */
        <Foot onBack={done ? undefined : onBack}>
          {st.failed ? (
            <button
              type="button"
              className="btn btn-hero np-primary"
              data-autofocus
              onClick={() => {
                setSt(setterStart(d.mode));
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          ) : (
            <button
              ref={next}
              type="button"
              className="btn btn-hero np-primary"
              disabled={!done}
              data-autofocus={done ? true : undefined}
              onClick={onNext}
            >
              Call in {nickOf(orch) || 'the orchestrator'} →
            </button>
          )}
        </Foot>
      }
    />
  );
}
