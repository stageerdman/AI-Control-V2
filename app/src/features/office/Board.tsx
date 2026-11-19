/* The things you can zoom into (prototype office-board.js, spec-office §4) — on the real backend:
     board     whiteboard: the project's % (to its target), features in progress, the task list (stage
               per row: in review / sent back / merging), "How we work →"
     how       How we work (HowWeWork.tsx): the way, drawn; edit it in place, or ask the director
     health    health board: the latest report (A–F + good / to fix), the repo + GitHub, "Run health check"
     features  features folder: Now / Planned / Shipped (identical rows) + add
     feature   one feature: name, status, Description + Vision as plain text blocks, save / delete
     reports   the Reports tray → list · report → one report (features/reports)
   The camera zooms onto the object (OfficePage), the scene behind is covered by a still scrim, the
   card fades in. Esc / Back = one layer. */
import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import {
  type Goal,
  invalidate,
  isApiError,
  type ProjectApp,
  type ProjectHealth,
  setQueryData,
  studio,
  useMutation,
  useQuery,
  type WorkflowsView,
} from '../../api';
import type { OfficeSub } from '../../shell/router';
import { Button, toast } from '../../ui';
import { type Person, type Resolve, WayThumb } from '../collab';
import { PortsSheet, portsLine, usePorts } from '../ports';
import { type Report, ReportsList, ReportView } from '../reports';
import { type Feature, type FeatureStatus, keys, type OfficeProgress, officeApi } from './api';
import { featureTags, taskTags } from './estimates';
import { GithubRow } from './GithubRow';
import { HowWeWork } from './HowWeWork';
import { Glyph, QuestBoard } from './QuestBoard';
import { ASPECTS, appView, boardProgress } from './state';
import { TimeTag, useTimesheet } from './TimeTag';
import { ago } from './time';

export const OBJ_OF: Partial<Record<OfficeSub, 'whiteboard' | 'health' | 'dossier' | 'reports'>> = {
  board: 'whiteboard',
  how: 'whiteboard',
  health: 'health',
  features: 'dossier',
  feature: 'dossier',
  reports: 'reports',
  report: 'reports',
};
const ST_LABEL: Record<FeatureStatus, string> = {
  now: 'In progress',
  planned: 'Planned',
  shipped: 'Shipped',
};
const GRADE_WORD: Record<string, string> = {
  A: 'Great',
  B: 'Good',
  C: 'Needs work',
  D: 'Weak',
  F: 'Failing',
};

export type BoardProps = {
  pid: string;
  sub: OfficeSub;
  id?: string;
  /** The director's short name ("Pixel"). */
  dir: string;
  go: (sub: OfficeSub, id?: string) => void;
  /** Esc from the page: return true when the card handled it (e.g. the unsaved-changes prompt). */
  escapeRef: RefObject<(() => boolean) | null>;
  onFollowUp: (r: Report, agentId: string) => void;
  /** Agent id → display name (task hovers). */
  nameOf: (id: string) => string;
  /** Names / faces / emblems for the collaboration chips. */
  resolve: Resolve;
  /** Everyone on the project: who can stand on a workflow drawing. */
  people: Person[];
};

/** The card: a non-modal dialog that keeps Tab inside and fades in once the camera has landed. */
function ZoomCard({
  kind,
  label,
  fresh,
  children,
}: {
  kind: string;
  label: string;
  fresh: boolean;
  children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(!fresh);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per card
  useEffect(() => {
    const focus = () => el.current?.querySelector<HTMLElement>('.ob-back')?.focus({ preventScroll: true });
    if (shown) {
      focus();
      return;
    }
    const t = setTimeout(
      () => {
        setShown(true);
        setTimeout(focus, 0);
      },
      matchMedia('(prefers-reduced-motion:reduce)').matches ? 0 : 480,
    );
    return () => clearTimeout(t);
  }, []);
  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !el.current) return;
    const f = [...el.current.querySelectorAll<HTMLElement>('button,textarea,input,a[href]')].filter(
      (x) => !(x as HTMLButtonElement).disabled,
    );
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      ref={el}
      className={`ob-card ob-k-${kind}${shown ? ' in' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      onKeyDown={trap}
    >
      {children}
    </div>
  );
}

const Back = ({ label, aria, onClick }: { label: string; aria: string; onClick: () => void }) => (
  <button type="button" className="ob-back" aria-label={aria} onClick={onClick}>
    ← {label}
  </button>
);
const Mark = ({ st }: { st: FeatureStatus }) => (
  <span className={`ob-mark m-${st}`} aria-hidden="true">
    {st === 'shipped' && (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 8.5l2.6 2.6L12 5.6"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )}
  </span>
);

export function Board(p: BoardProps) {
  const obj = OBJ_OF[p.sub];
  const lastObj = useRef<string | undefined>(undefined);
  const fresh = lastObj.current !== obj;
  lastObj.current = obj;
  const k = `${p.sub}/${p.id ?? ''}`;
  const office = () => p.go('room');
  switch (p.sub) {
    case 'board':
      return (
        <ZoomCard key={k} kind="board" label="Whiteboard" fresh={fresh}>
          <Back label="Office" aria="Back to the office" onClick={office} />
          <Whiteboard {...p} />
        </ZoomCard>
      );
    case 'how':
      return (
        <ZoomCard key="how" kind="how" label="How we work" fresh={fresh}>
          <HowWeWork {...p} />
        </ZoomCard>
      );
    case 'health':
      return (
        <ZoomCard key={k} kind="health" label="Health check report" fresh={fresh}>
          <Back label="Office" aria="Back to the office" onClick={office} />
          <Health pid={p.pid} />
        </ZoomCard>
      );
    case 'features':
      return (
        <ZoomCard key={k} kind="features" label="Features" fresh={fresh}>
          <Back label="Office" aria="Back to the office" onClick={office} />
          <Folder {...p} />
        </ZoomCard>
      );
    case 'feature':
      return (
        <ZoomCard key={k} kind="feature" label="Feature" fresh={fresh}>
          <FeaturePage {...p} id={p.id ?? ''} />
        </ZoomCard>
      );
    case 'reports':
      return (
        <ZoomCard key={k} kind="reports" label="Reports" fresh={fresh}>
          <ReportsList
            projectId={p.pid}
            back={{ label: 'Office', onClick: office }}
            onOpen={(r) => p.go('report', r.id)}
          />
        </ZoomCard>
      );
    case 'report':
      return (
        <ZoomCard key={k} kind="report" label="Report" fresh={fresh}>
          <ReportView
            projectId={p.pid}
            reportId={p.id ?? ''}
            onBack={() => p.go('reports')}
            onArchived={() => p.go('reports')}
            onFollowUp={p.onFollowUp}
          />
        </ZoomCard>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------ whiteboard */
export const useWork = (pid: string) => useQuery<Goal[]>(keys.work(pid), () => studio.projects.work(pid));
export const useFeatures = (pid: string) =>
  useQuery<Feature[]>(keys.features(pid), () => officeApi.features(pid));
export const useProgress = (pid: string) =>
  useQuery<OfficeProgress | null>(keys.progress(pid), () => officeApi.progress(pid));
export const useWorkflows = (pid: string) =>
  useQuery<WorkflowsView>(keys.workflows(pid), () => officeApi.workflows(pid));
export const useHealth = (pid: string) =>
  useQuery<ProjectHealth>(keys.health(pid), () => studio.projects.health(pid));

/** The Quest Board (QuestBoard.tsx): header with the project's compact ring, then Main / Side Quests. */
function Whiteboard({ pid, dir, go, nameOf, resolve, people }: BoardProps) {
  const work = useWork(pid);
  const workflows = useWorkflows(pid);
  const usual = workflows.data?.workflows[0];
  const words = usual?.inWords || usual?.summary;
  const features = useFeatures(pid);
  const progress = useProgress(pid);
  const sheet = useTimesheet(pid);
  const times = taskTags(sheet.data, nameOf);
  const goals = work.data ?? [];
  const { pct, target, shipped, aria } = boardProgress(goals, progress.data);
  const C = 2 * Math.PI * 20;
  return (
    <div className="qb">
      <header className="qb-head">
        <h2>
          <Glyph id="main" size={22} />
          Quest Board
        </h2>
        <div className="qb-to">
          {target && <b title={target}>to {target}</b>}
          <TargetEdit pid={pid} target={target} />
        </div>
        <div
          className="qb-ring"
          role="img"
          aria-label={shipped ? `${aria}. ${shipped}` : aria}
          title={shipped ?? undefined}
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="20" fill="none" stroke="#ece8f5" strokeWidth="7" />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="var(--coral)"
              strokeWidth="7"
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
              strokeDasharray={`${((C * pct) / 100).toFixed(1)} ${C.toFixed(1)}`}
            />
          </svg>
          <b aria-hidden="true">
            {pct}
            <small>%</small>
          </b>
        </div>
        <button
          type="button"
          className="qb-way"
          aria-label={words ? `How we work: ${words}` : 'How we work'}
          onClick={() => go('how')}
        >
          <WayThumb way={usual} people={people} size="sm" loading={workflows.loading && !workflows.data} />
          How we work
        </button>
      </header>
      <QuestBoard
        pid={pid}
        dir={dir}
        goals={goals}
        features={features.data ?? []}
        go={go}
        nameOf={nameOf}
        who={resolve.agent}
        defaultWorkflowId={usual?.id}
        times={times}
      />
    </div>
  );
}

/** The ring's target: a ghost link under it — "Set a target" / "Change target" → a 40-char field. */
function TargetEdit({ pid, target }: { pid: string; target: string | null }) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (edit) ref.current?.focus();
  }, [edit]);
  const save = async (raw: string) => {
    const v = raw.trim().slice(0, 40) || null;
    if (v === target) return setEdit(false);
    setBusy(true);
    try {
      await studio.projects.update(pid, { target: v });
      setQueryData<OfficeProgress | null>(keys.progress(pid), (p) => (p ? { ...p, target: v } : null));
      void invalidate('projects');
      setEdit(false);
    } catch (e) {
      toast(`Couldn’t save the target — ${isApiError(e) ? e.message : 'try again'}`);
    } finally {
      setBusy(false);
    }
  };
  if (!edit)
    return (
      <button type="button" className="ob-target" onClick={() => setEdit(true)}>
        {target ? 'Change target' : 'Set a target'}
      </button>
    );
  return (
    <input
      ref={ref}
      className="ob-target-in"
      defaultValue={target ?? ''}
      maxLength={40}
      placeholder="e.g. v1.0"
      aria-label="Target (what the % is towards)"
      disabled={busy}
      onBlur={(e) => void save(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void save(e.currentTarget.value);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setEdit(false);
        }
      }}
    />
  );
}

/* ------------------------------------------------------------ the project's app (run it) */
export const useApp = (pid: string) => useQuery<ProjectApp>(keys.app(pid), () => officeApi.app(pid));

/** One row on the health card: status + Open app, Start / Stop; Details = run command + last lines. */
function AppRow({ pid }: { pid: string }) {
  const app = useApp(pid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const a = app.data;
  const act = async (fn: () => Promise<ProjectApp>) => {
    setBusy(true);
    setErr(null);
    try {
      setQueryData(keys.app(pid), await fn());
    } catch (e) {
      setErr(isApiError(e) ? e.message : 'That didn’t work — try again.');
    } finally {
      setBusy(false);
      void app.refetch();
    }
  };
  const saveCommand = (raw: string) => {
    const v = raw.trim();
    if (!v || v === (a?.command ?? '')) return;
    void act(() => officeApi.setAppCommand(pid, v));
  };
  const running = a?.status === 'running';
  const v = a ? appView(a) : null;
  return (
    <li className="ob-app">
      <div className="ob-app-row">
        <span className="ob-pi" aria-hidden="true">
          ▶
        </span>
        <b>App</b>
        <span className="ob-pv">
          {!a || !v ? (
            app.error ? (
              'Couldn’t read the app'
            ) : (
              '…'
            )
          ) : (
            <>
              <span className={v.tone === 'ok' ? 'ob-ok' : v.tone === 'bad' ? 'ob-bad' : undefined}>
                {v.label}
              </span>
              {v.port && <span className="ob-port"> · port {v.port}</span>}
              {v.url && (
                <>
                  {' · '}
                  <a href={v.url} target="_blank" rel="noreferrer" className="ob-applink">
                    Open app ↗
                  </a>
                </>
              )}
            </>
          )}
        </span>
        <span className="ob-app-acts">
          {a && (
            <Button
              small
              variant="ghost"
              disabled={busy || (!running && !a.command)}
              onClick={() => void act(() => (running ? officeApi.stopApp(pid) : officeApi.startApp(pid)))}
            >
              {busy ? '…' : (v?.action ?? 'Start')}
            </Button>
          )}
          <button
            type="button"
            className="ob-target"
            aria-expanded={open}
            onClick={() => {
              setOpen((o) => !o);
              if (!open) void app.refetch();
            }}
          >
            {open ? 'Hide' : 'Details'}
          </button>
        </span>
      </div>
      {err && (
        <p className="ob-err" role="alert">
          {err}
        </p>
      )}
      {!open && v?.showLog && a && a.log.length > 0 && (
        <pre className="ob-app-log ob-app-out">{a.log.slice(-12).join('\n')}</pre>
      )}
      {open && a && (
        <div className="ob-app-more">
          <PortsLine pid={pid} />
          <label className="ob-fl" htmlFor="obRun">
            Run command{a.source ? <span className="ob-app-src"> · from {a.source}</span> : null}
          </label>
          <input
            id="obRun"
            className="ob-app-cmd"
            defaultValue={a.command ?? ''}
            key={a.command ?? ''}
            placeholder="e.g. npm run dev"
            spellCheck={false}
            disabled={busy}
            onBlur={(e) => saveCommand(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                saveCommand(e.currentTarget.value);
              }
            }}
          />
          {a.log.length > 0 ? (
            <pre className="ob-app-log">{a.log.slice(-20).join('\n')}</pre>
          ) : (
            <p className="ob-empty">No output yet.</p>
          )}
        </div>
      )}
    </li>
  );
}

/** "Ports 3290–3294 · app on 3290 · 3291 also listening · All ports" (G3: the Switchboard's per-project line). */
function PortsLine({ pid }: { pid: string }) {
  const ports = usePorts();
  const [open, setOpen] = useState(false);
  const mine = ports.data?.projects.find((p) => p.projectId === pid);
  if (!mine) return null;
  return (
    <p className="ob-ports">
      {portsLine(mine)}
      {' · '}
      <button type="button" className="ob-applink ob-linkbtn" onClick={() => setOpen(true)}>
        All ports
      </button>
      <PortsSheet open={open} onClose={() => setOpen(false)} focusProject={pid} />
    </p>
  );
}

/* ------------------------------------------------------------ health report */
function Health({ pid }: { pid: string }) {
  const health = useHealth(pid);
  const run = useMutation(() => studio.projects.checkHealth(pid), { invalidate: [keys.health(pid)] });
  const h = health.data;
  const latest = h?.latest ?? null;
  const git = h?.git;
  const project = useQuery('projects', studio.projects.list).data?.find((p) => p.id === pid);
  return (
    <>
      <header className="ob-hhead">
        <h2>Health check</h2>
        <span>{latest ? `Checked ${ago(latest.createdAt)}` : 'Not checked yet'}</span>
        <Button
          small
          variant="ghost"
          className="ob-hact"
          disabled={run.pending}
          onClick={() => run.mutate(undefined)}
        >
          {run.pending ? 'Checking…' : 'Run health check'}
        </Button>
      </header>
      {run.error && (
        <p className="ob-err" role="alert">
          {isApiError(run.error) ? run.error.message : 'The check didn’t finish.'}
        </p>
      )}
      <ul className="ob-proj" aria-label="Repository">
        <GithubRow pid={pid} name={project?.name ?? pid} folder={project?.folder ?? null} health={h} />
        <li>
          <span className="ob-pi" aria-hidden="true">
            ⌂
          </span>
          <b>Local repo</b>
          <span className="ob-pv">
            {!git
              ? '…'
              : !git.repo
                ? 'No git repository yet'
                : `${git.branch ?? 'detached'} · ${git.commits} commit${git.commits === 1 ? '' : 's'} · `}
            {git?.repo &&
              (git.clean ? (
                <span className="ob-ok">clean</span>
              ) : (
                `${git.changes} uncommitted change${git.changes === 1 ? '' : 's'}`
              ))}
          </span>
        </li>
        <AppRow pid={pid} />
      </ul>
      {health.loading && <p className="ob-empty">Loading…</p>}
      {health.error && !h && <p className="ob-err">Couldn’t load the health report.</p>}
      {h && !latest && (
        <p className="ob-empty">
          No check yet. Run one — it reads the code, changes nothing, and grades it here.
        </p>
      )}
      {latest && <p className="ob-summary">{latest.summary}</p>}
      {latest && (
        <ul className="ob-health">
          {ASPECTS.map(([key, name]) => {
            const it = latest[key];
            return (
              <li key={key}>
                <div className="ob-hk">
                  <span className={`ob-grade g-${it.grade}`} aria-hidden="true">
                    {it.grade}
                  </span>
                  <b>{name}</b>
                  <span className="ob-hw">
                    {GRADE_WORD[it.grade]}
                    <span className="sr-only"> (grade {it.grade})</span>
                  </span>
                </div>
                <p>
                  <span className="ob-hl">Good</span>
                  {it.good}
                </p>
                <p>
                  <span className="ob-hl">To fix</span>
                  {it.fix}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ------------------------------------------------------------ features folder */
function Folder({ pid, dir, go }: BoardProps) {
  const features = useFeatures(pid);
  const times = featureTags(useTimesheet(pid).data);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const create = useMutation((n: string) => officeApi.createFeature(pid, { name: n }), {
    invalidate: [keys.features(pid)],
  });
  const list = features.data ?? [];
  const group = (st: FeatureStatus, title: string) => {
    const rows = list.filter((f) => f.status === st).sort((a, b) => a.order - b.order);
    if (!rows.length) return null;
    return (
      <>
        <h3>{title}</h3>
        <ul className="ob-rows">
          {rows.map((f) => (
            <li key={f.id}>
              <button type="button" className="ob-row" onClick={() => go('feature', f.id)}>
                <Mark st={f.status} />
                <span className="sr-only">{ST_LABEL[f.status]}:</span>
                <span className="ob-rn">{f.name}</span>
                <TimeTag tag={times.get(f.id)} />
                <span className="ob-chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  };
  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      const f = await create.mutateAsync(n);
      setName('');
      setAdding(false);
      go('feature', f.id);
    } catch {
      /* shown below */
    }
  };
  return (
    <>
      <header className="ob-hhead">
        <h2>Features</h2>
      </header>
      <div className="ob-scroll">
        {features.loading && <p className="ob-empty">Loading…</p>}
        {features.error && !features.data && <p className="ob-err">Couldn’t load the features.</p>}
        {features.data && !list.length && (
          <p className="ob-empty">No features yet. Tell {dir} what to build first.</p>
        )}
        {group('now', 'Now')}
        {group('planned', 'Planned')}
        {group('shipped', 'Shipped')}
        {adding ? (
          <form
            className="ob-newf"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              // biome-ignore lint/a11y/noAutofocus: the user just asked to add one
              autoFocus
              aria-label="New feature name"
              placeholder="Feature name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
            />
            <Button small variant="hero" type="submit" disabled={!name.trim() || create.pending}>
              Add
            </Button>
          </form>
        ) : (
          <button type="button" className="ob-add" onClick={() => setAdding(true)}>
            + New feature
          </button>
        )}
        {create.error && (
          <p className="ob-err" role="alert">
            {isApiError(create.error) ? create.error.message : 'Couldn’t add it.'}
          </p>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ one feature */
type Draft = { name: string; status: FeatureStatus; description: string; vision: string };
const draftOf = (f: Feature): Draft => ({
  name: f.name,
  status: f.status,
  description: f.description,
  vision: f.vision,
});
const same = (a: Draft, b: Draft) =>
  a.name.trim() === b.name.trim() &&
  a.status === b.status &&
  a.description === b.description &&
  a.vision === b.vision;

function FeaturePage({ pid, id, go, escapeRef }: BoardProps & { id: string }) {
  const features = useFeatures(pid);
  const f = features.data?.find((x) => x.id === id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState<null | 'leave' | 'delete'>(null);
  const [savedAt, setSavedAt] = useState(false);
  const save = useMutation(
    (d: Draft) =>
      officeApi.updateFeature(pid, id, {
        name: d.name.trim() || (f?.name ?? 'Feature'),
        description: d.description.trim(),
        vision: d.vision.trim(),
        ...(f && d.status !== f.status ? { status: d.status } : {}),
      }),
    { invalidate: [keys.features(pid)] },
  );
  const del = useMutation(() => officeApi.deleteFeature(pid, id), { invalidate: [keys.features(pid)] });
  useEffect(() => {
    if (f && !draft) setDraft(draftOf(f));
  }, [f, draft]);
  const d = draft ?? (f ? draftOf(f) : null);
  const dirty = !!(f && d && !same(d, draftOf(f)));
  const leave = () => go('features');
  const onEscape = () => {
    if (dirty && confirm !== 'leave') {
      setConfirm('leave');
      return true;
    }
    leave();
    return true;
  };
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useEffect(() => {
    escapeRef.current = () => escRef.current();
    return () => {
      escapeRef.current = null;
    };
  }, [escapeRef]);

  if (features.loading) return <p className="ob-empty">Loading…</p>;
  if (!f || !d)
    return (
      <>
        <Back label="Features" aria="Back to all features" onClick={leave} />
        <p className="ob-empty" style={{ marginTop: 16 }}>
          This feature isn’t here any more.
        </p>
      </>
    );
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...d, ...patch });
    setSavedAt(false);
  };
  const doSave = async (then?: () => void) => {
    try {
      const nf = await save.mutateAsync(d);
      setDraft(draftOf(nf));
      setSavedAt(true);
      setConfirm(null);
      then?.();
    } catch {
      /* error line below */
    }
  };
  return (
    <>
      <Back label="Features" aria="Back to all features" onClick={() => onEscape()} />
      <header className="ob-hhead">
        <input
          className="ob-name"
          aria-label="Feature name"
          value={d.name}
          maxLength={120}
          onChange={(e) => set({ name: e.target.value })}
        />
      </header>
      <fieldset className="ob-sts" aria-label="Status">
        {(['now', 'planned', 'shipped'] as const).map((st) => (
          <button key={st} type="button" aria-pressed={d.status === st} onClick={() => set({ status: st })}>
            <Mark st={st} />
            {ST_LABEL[st]}
          </button>
        ))}
      </fieldset>
      <label className="ob-fl" htmlFor="obDesc">
        Description
      </label>
      <textarea
        id="obDesc"
        className="ob-ta"
        rows={5}
        value={d.description}
        onChange={(e) => set({ description: e.target.value })}
      />
      <label className="ob-fl" htmlFor="obVis">
        Vision
      </label>
      <textarea
        id="obVis"
        className="ob-ta"
        rows={4}
        value={d.vision}
        onChange={(e) => set({ vision: e.target.value })}
      />
      {(save.error || del.error) && (
        <p className="ob-err" role="alert" style={{ marginTop: 12 }}>
          {isApiError(save.error ?? del.error) ? (save.error ?? del.error)?.message : 'Couldn’t save.'}
        </p>
      )}
      <footer className="ob-foot">
        {confirm === 'leave' ? (
          <div className="ob-confirm" role="alert">
            <span>Unsaved changes.</span>
            <Button small variant="ghost" onClick={() => setConfirm(null)}>
              Keep editing
            </Button>
            <Button small variant="ghost" onClick={leave}>
              Discard
            </Button>
            <Button small variant="hero" onClick={() => void doSave(leave)}>
              Save
            </Button>
          </div>
        ) : confirm === 'delete' ? (
          <div className="ob-confirm" role="alert">
            <span>Delete “{f.name}”? This can’t be undone.</span>
            <Button small variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              small
              variant="dark"
              onClick={async () => {
                try {
                  await del.mutateAsync(undefined);
                  toast(`Deleted ${f.name}`);
                  leave();
                } catch {
                  /* error line above */
                }
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <>
            <Button small variant="ghost" className="ob-del" onClick={() => setConfirm('delete')}>
              Delete
            </Button>
            <span className="ob-saved" aria-live="polite">
              {dirty ? 'Unsaved' : savedAt ? 'Saved' : ''}
            </span>
            <Button small variant="hero" disabled={!dirty || save.pending} onClick={() => void doSave()}>
              {save.pending ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </footer>
    </>
  );
}

export { ago };
