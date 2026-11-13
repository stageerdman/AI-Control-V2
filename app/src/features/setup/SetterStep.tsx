/* 4 — Setup: the Project Setter turns the accepted draft into a project (POST /drafts/:id/finish).
   Its steps stream live from GET /drafts/:id/events (`setup.step`); the finish response is the
   truth at the end. Then: "Open the office →". */
import { useEffect, useRef, useState } from 'react';
import {
  type Agent,
  type Draft,
  invalidate,
  openEventStream,
  type Project,
  type SetupStep,
  studio,
} from '../../api';
import { go } from '../../shell/router';
import { LogoTile } from '../projects/LogoTile';
import { nickOf } from '../projects/model';
import { tileFor } from '../projects/tile';
import { fireConfetti, sparkle } from './confetti';
import { DRAFTS_KEY } from './drafts';
import { type SetterState, setterDone, setterFailed, setterPct, setterStart, setterStep } from './flow';
import { Actor, Foot, StepCard, StepTitle } from './parts';

/** One Setter per draft per session (StrictMode mounts twice; a remount must not run it again). */
const runs = new Map<string, Promise<{ project: Project; steps: SetupStep[] }>>();

export function SetterStep({
  d,
  setter,
  onBack,
}: {
  d: Draft;
  setter: Agent | undefined;
  onBack: () => void;
}) {
  const [st, setSt] = useState<SetterState>(() => setterStart(d.mode));
  const [project, setProject] = useState<Project | null>(null);
  const [attempt, setAttempt] = useState(0);
  const open = useRef<HTMLButtonElement>(null);
  const name = d.name.trim();

  // biome-ignore lint/correctness/useExhaustiveDependencies: one run per attempt
  useEffect(() => {
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
      run = (async () => {
        await new Promise((r) => setTimeout(r, 250)); // let the stream connect first
        const res = await studio.drafts.finish(d.id);
        const p = res.project;
        /* the studio lot shows it on set with the tile the draft had (best effort) */
        const project = await studio.projects
          .update(p.id, { tile: tileFor(name || p.name), status: 'live' })
          .catch(() => p);
        return { project, steps: res.steps };
      })();
      runs.set(d.id, run);
    }
    run.then(
      ({ project: p, steps }) => {
        void invalidate('projects');
        void invalidate(DRAFTS_KEY);
        if (!alive) return;
        stream.close();
        setSt(setterDone(steps, d.mode));
        setProject(p);
        sparkle(50, 30);
        setTimeout(() => open.current?.focus(), 60);
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

  const done = !!project;
  const pct = done ? 100 : setterPct(st);
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
        <Foot onBack={st.failed ? onBack : undefined}>
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
              ref={open}
              type="button"
              className="btn btn-hero np-primary"
              disabled={!done}
              onClick={() => {
                if (!project) return;
                fireConfetti();
                go({ name: 'office', projectId: project.id, sub: 'room' });
              }}
            >
              Open the office →
            </button>
          )}
        </Foot>
      }
    />
  );
}
