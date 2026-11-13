/* The project-setup space (#new[/<draftId>]) — the prototype's studio-new.js (v6 N1–N4) on the real
   drafts API. A standalone studio page: leave any time, the draft waits on Projects ("In setup").
   #new (no id) is the Start step; choosing new/adopt creates the draft and moves to #new/<id>. */
import { useEffect, useMemo, useState } from 'react';
import { type Agent, type Draft, type DraftPatch, isApiError, studio, useQuery } from '../../api';
import type { PageProps } from '../../shell/pages';
import { go } from '../../shell/router';
import { Button, EmptyState, ErrorState, Loading, toast } from '../../ui';
import { deleteDraft } from './drafts';
import { orchOf, resetsTeamTalk, STEP, STEPS, stepOf } from './flow';
import { NameStep } from './NameStep';
import { OrchestratorStep } from './OrchestratorStep';
import { SetterStep } from './SetterStep';
import { StartStep } from './StartStep';
import { TeamStep } from './TeamStep';
import { flushDraft, useDraft } from './useDraft';
import './setup.css';

type Crew = { setter?: Agent; orchestrators: Agent[]; creator?: Agent; agents: Agent[] };
const crewOf = (agents: Agent[]): Crew => ({
  setter: agents.find((a) => a.kind === 'setter'),
  orchestrators: agents.filter((a) => a.kind === 'orchestrator'),
  creator: agents.find((a) => a.kind === 'creator'),
  agents,
});

export function SetupPage({ route }: PageProps<'new'>) {
  const agents = useQuery('agents', studio.agents.list);
  const teams = useQuery('teams', studio.teams.list);
  const crew = useMemo(() => crewOf(agents.data ?? []), [agents.data]);
  const err = agents.error ?? teams.error;
  if (err)
    return (
      <ErrorState
        error={err}
        title="Couldn’t load the Cast"
        onRetry={() => {
          void agents.refetch();
          void teams.refetch();
        }}
      />
    );
  if (agents.loading || teams.loading) return <Loading label="Calling the crew…" />;
  if (!route.draftId) return <Fresh crew={crew} />;
  return <Walkthrough key={route.draftId} id={route.draftId} crew={crew} teams={teams.data ?? []} />;
}

/** #new — nothing saved yet: pick new / adopt, then the draft exists. */
function Fresh({ crew }: { crew: Crew }) {
  const [busy, setBusy] = useState(false);
  const pick = async (mode: 'new' | 'adopt') => {
    setBusy(true);
    try {
      const d = await studio.drafts.create({
        mode,
        step: STEP.name,
        orchestratorId: crew.orchestrators[0]?.id ?? null,
      });
      location.replace(`#new/${encodeURIComponent(d.id)}`);
    } catch (e) {
      toast(`Couldn’t start the draft — ${(e as Error).message}`);
      setBusy(false);
    }
  };
  return (
    <Page mode={null} name="" step={STEP.start}>
      <StartStep
        crew={{ setter: crew.setter, orch: crew.orchestrators[0], creator: crew.creator }}
        busy={busy}
        onPick={(m) => void pick(m)}
      />
    </Page>
  );
}

function Walkthrough({ id, crew, teams }: { id: string; crew: Crew; teams: import('../../api').Team[] }) {
  const q = useDraft(id);
  const d = q.data;
  const [switching, setSwitching] = useState(false);
  const step = d ? stepOf(d) : 0;
  useStepFocus(d ? `${d.id}:${step}` : '');

  if (q.error)
    return isApiError(q.error) && q.error.status === 404 ? (
      <div className="np-gone">
        <EmptyState
          title="This draft is gone"
          action={
            <Button variant="hero" onClick={() => go('projects')}>
              Back to Projects
            </Button>
          }
        >
          It was set up as a project, or deleted.
        </EmptyState>
      </div>
    ) : (
      <ErrorState error={q.error} title="Couldn’t open the draft" onRetry={() => void q.refetch()} />
    );
  if (!d) return <Loading label="Opening the draft…" />;

  const to = (n: number, extra: Partial<Draft> = {}) =>
    void q.save({ step: n, ...extra }).catch(() => undefined);
  const orch = orchOf(d, crew.orchestrators);

  /* back on Start: the same mode just continues; the other mode is a new draft (mode is fixed per draft) */
  const repick = async (mode: 'new' | 'adopt') => {
    if (mode === d.mode) return to(STEP.name);
    setSwitching(true);
    try {
      await flushDraft(d.id);
      const nd = await studio.drafts.create({
        mode,
        step: STEP.name,
        name: d.name,
        about: d.about,
        orchestratorId: d.orchestratorId,
      });
      await studio.drafts.remove(d.id).catch(() => undefined);
      location.replace(`#new/${encodeURIComponent(nd.id)}`);
    } catch (e) {
      toast(`Couldn’t switch — ${(e as Error).message}`);
      setSwitching(false);
    }
  };

  let body: React.ReactNode;
  switch (step) {
    case STEP.start:
      body = (
        <StartStep
          crew={{ setter: crew.setter, orch: crew.orchestrators[0], creator: crew.creator }}
          busy={switching}
          onPick={(m) => void repick(m)}
        />
      );
      break;
    case STEP.name:
      body = (
        <NameStep d={d} edit={q.edit} onBack={() => to(STEP.start)} onNext={() => to(STEP.orchestrator)} />
      );
      break;
    case STEP.orchestrator:
      body = (
        <OrchestratorPick
          d={d}
          crew={crew}
          edit={q.edit}
          onBack={() => to(STEP.name)}
          onNext={(extra) => to(STEP.setup, extra)}
        />
      );
      break;
    case STEP.team:
      body = <TeamStep d={d} agents={crew.agents} teams={teams} orch={orch} creator={crew.creator} />;
      break;
    default:
      body = (
        <SetterStep
          d={d}
          setter={crew.setter}
          orch={orch}
          onBack={() => to(STEP.orchestrator)}
          onNext={() => to(STEP.team)}
        />
      );
  }
  return (
    <Page
      mode={d.mode}
      name={d.name}
      step={step}
      onDelete={() => void deleteDraft(d.id, d.name, () => go('projects'))}
    >
      {body}
    </Page>
  );
}

/** The orchestrator choice is saved on the draft as you pick (it waits on Projects); a different one
    after a chat starts the team talk over — a new orchestrator makes its own plan. */
function OrchestratorPick({
  d,
  crew,
  edit,
  onBack,
  onNext,
}: {
  d: Draft;
  crew: Crew;
  edit: (p: DraftPatch) => void;
  onBack: () => void;
  onNext: (extra: Partial<Draft>) => void;
}) {
  const chosen = orchOf(d, crew.orchestrators);
  return (
    <OrchestratorStep
      d={d}
      orchestrators={crew.orchestrators}
      onPick={(id) =>
        edit({ orchestratorId: id, ...(resetsTeamTalk(d, id) ? { plan: null, chat: [] } : {}) })
      }
      onBack={onBack}
      onNext={() => chosen && onNext({ orchestratorId: chosen.id })}
    />
  );
}

/** The page frame: kicker + name, the step pills, the card(s), "saved as you go" + delete. */
function Page({
  mode,
  name,
  step,
  onDelete,
  children,
}: {
  mode: Draft['mode'] | null;
  name: string;
  step: number;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`np-page${step === STEP.team ? ' with-chat' : ''}`}>
      <header className="np-pagehead">
        <div>
          <div className="kicker">{mode === 'adopt' ? 'Adopting a folder' : 'New project'} · in setup</div>
          <h1>{name.trim() || 'Untitled project'}</h1>
        </div>
        <span className="spacer" />
        <ol className="np-steps" aria-label="Setup steps">
          {STEPS.map((l, i) => (
            <li
              key={l}
              className={i < step ? 'done' : i === step ? 'now' : ''}
              aria-current={i === step ? 'step' : undefined}
            >
              <i aria-hidden="true" />
              <span>{l}</span>
            </li>
          ))}
        </ol>
      </header>
      <div className="np-grid">{children}</div>
      <div className="np-pagefoot">
        {mode && (
          <>
            <span className="hint">Saved as you go — leave anytime, it waits on Projects.</span>
            {onDelete && (
              <button type="button" className="np-del" onClick={onDelete}>
                Delete draft
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** On every step change: focus the step's target ([data-autofocus]) or its heading. */
function useStepFocus(key: string) {
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => {
      const card = document.querySelector('.np-card');
      const el =
        card?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
        card?.querySelector<HTMLElement>('[data-step-title]');
      el?.focus({ preventScroll: true });
    }, 60);
    return () => clearTimeout(t);
  }, [key]);
}
