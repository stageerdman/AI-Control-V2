/* The Office (prototype office-main.js, spec-office §1.4, §5, §8) — on the real backend.
   Load: GET /projects/:id/office (staffing + each agent's latest status) + open asks, then the
   project's event stream from `lastEventId`. The scene (engine.ts) is generated from staffing
   (layout.ts) and follows the live state (state.ts); the chat panel, the wall's zoom cards, the
   safe's Access sheet and the list mirror are React.
   v5: no top bar — the door leaves, the safe is Access, the whiteboard carries the %, the wall clock
   above the door opens the crew's time (TimeSheet).
   STUDIO LIFE: notes to self on desks, the captain's principles binder, the letterbox (+ HQ plaque) and the bell
   by the door (bring someone in) — each a thing in the room that opens a sheet. A guest coming or going
   re-reads the office view and re-lays the room out (the chat and sheets stay as they are). */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type Agent,
  type Ask,
  getQueryData,
  invalidate,
  type Project,
  type StudioEvent,
  setQueryData,
  studio,
  useEventStream,
  useQuery,
} from '../../api';
import { reducedMotion } from '../../design/palette';
import type { PageProps } from '../../shell/pages';
import { go, type OfficeSub } from '../../shell/router';
import { ErrorState, Loading, toast } from '../../ui';
import { refreshProjectAccess, useNewAccessCount } from '../access';
import type { Resolve } from '../collab';
import { invalidateReports, type ReportList, reportsApi, reportsKey } from '../reports';
import { AccessSheet } from './AccessSheet';
import { keys, type OfficeProgress, type OfficeView, officeApi, type Thread } from './api';
import { Board, OBJ_OF, useApp, useFeatures, useHealth, useProgress, useWork } from './Board';
import { BringInSheet } from './BringInSheet';
import { DeskNoteSheet } from './DeskNoteSheet';
import { OfficeEngine, type SceneAgent, type SceneTeam } from './engine';
import { type ObjectId, officeLayout } from './layout';
import { noteCounts, noteLabel, principlesLabel, readSeen, type Seen, trays, writeSeen } from './life';
import { MailSheet, refreshMail } from './MailSheet';
import { type FollowUpContext, Panel, shortOf } from './Panel';
import { PortraitSheet } from './PortraitSheet';
import { PrinciplesSheet } from './PrinciplesSheet';
import {
  activityOf,
  boardFacts,
  changedActors,
  deriveActor,
  initLive,
  type Live,
  mergeMessage,
  type PendingAsk,
  reduce,
  threadMessageOf,
} from './state';
import { clockLabel, TimeSheet, useWorkTime } from './TimeSheet';
import './office.css';

type Boot = { office: OfficeView; asks: Ask[]; hqId: string | null };
/** A re-read office view (a guest came or went): the new crew list, statuses kept from the stream's state. */
type Reload = { type: 'office.reload'; live: Live };

export function OfficePage({ route }: PageProps<'office'>) {
  const pid = route.projectId;
  const agents = useQuery('agents', studio.agents.list);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  /* always fresh on entry: the scene starts from now, the stream continues from lastEventId */
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload on project / retry
  useEffect(() => {
    let off = false;
    setBoot(null);
    setError(null);
    Promise.all([
      officeApi.office(pid),
      studio.projects.asks(pid, true),
      studio.settings().catch(() => null),
    ]).then(
      ([office, asks, settings]) => !off && setBoot({ office, asks, hqId: settings?.hqProjectId ?? null }),
      (e) => !off && setError(e),
    );
    return () => {
      off = true;
    };
  }, [pid, attempt]);

  const err = error ?? (agents.error && !agents.data ? agents.error : null);
  if (err)
    return (
      <div className="o-loading">
        <div>
          <ErrorState
            error={err}
            title="Couldn’t open this office"
            onRetry={() => setAttempt((n) => n + 1)}
          />
          <p style={{ textAlign: 'center' }}>
            <a href="#projects" style={{ color: 'var(--cream)', fontWeight: 800 }}>
              ← Back to Projects
            </a>
          </p>
        </div>
      </div>
    );
  if (!boot || !agents.data)
    return (
      <div className="o-loading">
        <Loading label="Opening the office…" />
      </div>
    );
  return <Office key={pid} pid={pid} sub={route.sub} id={route.id} boot={boot} roster={agents.data} />;
}

const POKES = ['roll', 'snug', 'stretch'] as const;
const officeEl = () => document.getElementById('office');
const HOTS: { id: ObjectId; label: string }[] = [
  { id: 'door', label: 'Leave office — back to all projects' },
  { id: 'dossier', label: 'Features — now, planned, shipped' },
  { id: 'whiteboard', label: 'Whiteboard — progress and tasks' },
  { id: 'health', label: 'Health check — code health and GitHub' },
  { id: 'reports', label: 'Reports — what the crew found out' },
  { id: 'safe', label: 'Safe — what this project can reach (Access)' },
  { id: 'clock', label: 'Agent time' },
  { id: 'portrait', label: 'Project picture and name' },
  { id: 'mailbox', label: 'Mail — letters from other projects' },
  { id: 'bell', label: 'Bring someone in' },
];
/* events that start or end agent time: the work clock reads again */
const CLOCK_EVENTS = new Set([
  'run.started',
  'run.finished',
  'goal.changed',
  'team.split',
  'health.checked',
  'collaboration.changed',
]);
const SUB_OF: Partial<Record<ObjectId, OfficeSub>> = {
  dossier: 'features',
  whiteboard: 'board',
  health: 'health',
  reports: 'reports',
};
const asPending = (a: Ask): PendingAsk => ({
  id: a.id,
  agentId: a.agentId,
  question: a.question,
  options: a.options,
  runId: a.runId,
});

function Office({
  pid,
  sub,
  id,
  boot,
  roster,
}: {
  pid: string;
  sub: OfficeSub;
  id?: string;
  boot: Boot;
  roster: Agent[];
}) {
  const [office, setOffice] = useState(boot.office);
  const hq = boot.hqId === pid;
  /* agents still in the Cast (one deleted since staffing is simply not drawn) */
  const agentsById = useMemo(() => Object.fromEntries(roster.map((a) => [a.id, a])), [roster]);
  const [live, dispatch] = useReducer(
    (s: Live, ev: StudioEvent | Reload) =>
      ev.type === 'office.reload' ? (ev as Reload).live : reduce(s, ev as StudioEvent),
    undefined,
    () => {
      const l = initLive(office, boot.asks.filter((a) => a.status === 'open').map(asPending));
      return { ...l, ids: l.ids.filter((x) => agentsById[x]) };
    },
  );
  const director = office.director;
  const teams = useMemo<Record<string, SceneTeam>>(
    () => Object.fromEntries(office.teams.map((t) => [t.id, { ...t }])),
    [office],
  );
  const teamOf = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const t of office.teams) for (const a of t.members) m[a] ??= t.id;
    return m;
  }, [office]);

  /* ---------- the wall's data */
  /* the overall % starts from the office view and follows project.progress */
  useState(() => {
    if (office.progress) setQueryData(keys.progress(pid), office.progress);
  });
  const progress = useProgress(pid);
  const app = useApp(pid);
  const work = useWork(pid);
  const features = useFeatures(pid);
  const health = useHealth(pid);
  const time = useWorkTime(pid, 60_000);
  /* the project as the portrait shows it (display name + picture); `project.changed` reads it again */
  const project = useQuery<Project>(keys.project(pid), () => studio.projects.get(pid));
  const name = project.data?.name ?? office.name;
  const reports = useQuery<ReportList>(reportsKey(pid), () => reportsApi.list(pid));
  /* STUDIO LIFE: notes on desks (seen per viewer, this browser), the binders, the letterbox */
  const deskNotes = useQuery(keys.deskNotes(pid), () => studio.deskNotes(pid));
  const [seen, setSeen] = useState<Seen>(() => readSeen(pid));
  const notes = deskNotes.data?.notes;
  const noteN = useMemo(() => noteCounts(notes ?? [], seen), [notes, seen]);
  const noteTrays = useMemo(() => trays(notes ?? [], seen), [notes, seen]);
  const markSeen = useCallback(
    (agentId: string, at: string) =>
      setSeen((s) => {
        if (s[agentId] && s[agentId] >= at) return s;
        const next = { ...s, [agentId]: at };
        writeSeen(pid, next);
        return next;
      }),
    [pid],
  );
  const principles = useQuery(keys.principles(pid), () => studio.principles.list(pid));
  const mailbox = useQuery(keys.mail(pid, 'in'), () => studio.mail.box(pid, 'in'));
  const newMail = mailbox.data?.unread ?? 0;
  /* the office opened: the director reads any new mail on his own (once per visit) */
  useEffect(() => {
    void studio.mail.open(pid).catch(() => undefined);
  }, [pid]);
  const [inFlight, setInFlight] = useState(0); /* reports being carried to the tray */
  const unread = Math.max(0, (reports.data?.unread ?? 0) - inFlight);
  const facts = useMemo(
    () =>
      boardFacts({
        goals: work.data,
        features: features.data,
        health: health.data,
        unreadReports: unread,
        newMail,
        progress: progress.data,
        time: time.data,
        project: project.data,
      }),
    [work.data, features.data, health.data, unread, newMail, progress.data, time.data, project.data],
  );

  /* ---------- the scene */
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const engine = useRef<OfficeEngine | null>(null);
  const [world, setWorld] = useState<HTMLElement | null>(null);
  const liveRef = useRef(live);
  /* the state as of this render (the scene is rebuilt from it when a guest comes or goes) */
  const liveNow = useRef(live);
  liveNow.current = live;
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const traysRef = useRef(noteTrays);
  traysRef.current = noteTrays;
  /** A guest who just joined: they walk in from the door once the room is rebuilt. */
  const arriving = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: built once per office visit, again when the crew changes
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const now = liveNow.current;
    const ids = now.ids;
    const guests = office.guests ?? [];
    const isGuest = new Set(guests.map((g) => g.agentId));
    const plan = officeLayout({
      teams: office.teams.map((t) => ({ id: t.id, members: t.members.filter((a) => agentsById[a]) })),
      solo: office.solo.filter((a) => agentsById[a] && !isGuest.has(a)),
      guests: guests.map((g) => g.agentId).filter((a) => agentsById[a]),
    });
    const agents: Record<string, SceneAgent> = {};
    for (const a of ids) agents[a] = agentsById[a] as unknown as SceneAgent;
    const e = new OfficeEngine(box, {
      plan,
      title: office.name,
      director,
      ids,
      agents,
      teams,
      teamOf,
      guests: Object.fromEntries(guests.map((g) => [g.agentId, g.brief])),
      hq,
      stage: () => stageRef.current,
      drawer: () => (matchMedia('(max-width:899px)').matches ? (panelRef.current?.offsetHeight ?? 0) : 0),
    });
    e.mount(
      ids.map((a) => deriveActor(now, a)),
      factsRef.current,
    );
    for (const p of now.pending) e.apply(deriveActor(now, p.agentId), p.question);
    for (const [a, t] of Object.entries(traysRef.current)) e.setTray(a, t);
    engine.current = e;
    if (arriving.current) {
      void e.arrive(arriving.current);
      arriving.current = null;
    }
    setWorld(box.querySelector<HTMLElement>('.o-world'));
    const onResize = () => e.fit();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      e.unmount();
      engine.current = null;
    };
  }, [office]);

  /* live state → robots (only the ones whose look changed) */
  useEffect(() => {
    const prev = liveRef.current;
    liveRef.current = live;
    const e = engine.current;
    if (!e || prev === live) return;
    for (const a of changedActors(prev, live))
      void e.apply(deriveActor(live, a), live.pending.find((p) => p.agentId === a)?.question);
  }, [live]);
  useEffect(() => engine.current?.syncFacts(facts), [facts]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: also once the scene exists (world)
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    for (const a of live.ids) e.setTray(a, noteTrays[a] ?? null);
  }, [noteTrays, world]);

  /* ---------- announcements (polite / assertive) */
  const [said, setSaid] = useState({ polite: '', loud: '' });
  const announce = useCallback(
    (msg: string, loud = false) => setSaid((s) => (loud ? { ...s, loud: msg } : { ...s, polite: msg })),
    [],
  );
  const nameOf = useCallback((a: string) => agentsById[a]?.name ?? 'Someone', [agentsById]);
  const nickOf = useCallback(
    (a: string) => (agentsById[a] ? shortOf(agentsById[a]) : 'Someone'),
    [agentsById],
  );
  const resolve = useMemo<Resolve>(
    () => ({
      agent: (a) => (agentsById[a] ? { name: shortOf(agentsById[a]), look: agentsById[a].look } : null),
      team: (t) => {
        const x = office.teams.find((y) => y.id === t);
        return x ? { id: x.id, name: x.name, emblem: x.emblem, color: x.color } : null;
      },
    }),
    [agentsById, office],
  );

  /* ---------- chat panel */
  const [thread, setThread] = useState(director);
  const threadRef = useRef(director);
  const [context, setContext] = useState<FollowUpContext | null>(null);
  const holdT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showPanel = useCallback(() => {
    const o = officeEl();
    if (o?.classList.contains('wide')) {
      o.classList.remove('wide');
      setWide(false);
    }
    if (o && matchMedia('(max-width:899px)').matches && !o.classList.contains('drawer-up')) {
      o.classList.add('drawer-up');
      setTimeout(() => engine.current?.fit(), 340);
    }
  }, []);
  const openThread = useCallback(
    (to: string, from: 'scene' | 'list' | 'chat' | 'report' = 'chat') => {
      const e = engine.current;
      const prev = threadRef.current;
      if (prev !== to && prev !== director) e?.unface(prev);
      threadRef.current = to;
      setThread(to);
      const a = deriveActor(liveRef.current, to);
      if (to === director) {
        if (from === 'scene') {
          /* the director turns to you for a moment, then gets back to it */
          e?.face(director);
          clearTimeout(holdT.current);
          holdT.current = setTimeout(() => e?.unface(director), 2600);
        }
      } else if (a.kind !== 'sleeping') e?.face(to);
      showPanel();
      announce(`Now talking to ${nameOf(to)}`);
      if (from !== 'scene')
        setTimeout(
          () => panelRef.current?.querySelector<HTMLInputElement>('.op-composer input')?.focus(),
          60,
        );
    },
    [director, showPanel, announce, nameOf],
  );
  useEffect(() => () => clearTimeout(holdT.current), []);

  /* ---------- a guest came or went: re-read the office view, re-lay the room out */
  const reload = useCallback(
    async (agentId: string, change: 'joined' | 'updated' | 'left') => {
      if (change === 'left') await engine.current?.depart(agentId);
      const fresh = await officeApi.office(pid).catch(() => null);
      if (!fresh) return;
      const cur = liveRef.current;
      const l = initLive(fresh, cur.pending);
      const ids = l.ids.filter((x) => agentsById[x]);
      /* keep what the stream already told us; the view fills in anyone new */
      const status = Object.fromEntries(ids.map((x) => [x, x in cur.status ? cur.status[x] : l.status[x]]));
      arriving.current = change === 'joined' && ids.includes(agentId) ? agentId : null;
      dispatch({ type: 'office.reload', live: { ...l, ids, status } });
      setOffice(fresh);
    },
    [pid, agentsById],
  );

  /* ---------- the stream */
  const onEvent = useCallback(
    (ev: StudioEvent) => {
      dispatch(ev);
      const e = engine.current;
      if (CLOCK_EVENTS.has(ev.type)) void invalidate(keys.time(pid));
      if (ev.type === 'project.changed') void invalidate(keys.project(pid));
      switch (ev.type) {
        case 'goal.changed':
        case 'checklist.item':
        case 'progress':
          void invalidate(keys.work(pid));
          break;
        case 'feature.changed':
          void invalidate(keys.features(pid));
          break;
        case 'project.progress': {
          const { pct, shipped, total, target } = ev.payload;
          setQueryData<OfficeProgress | null>(keys.progress(pid), (p) => ({
            pct,
            shipped,
            total,
            target: target !== undefined ? target : (p?.target ?? null),
            goal: p?.goal ?? null,
          }));
          break;
        }
        case 'collaboration.changed':
          void invalidate(keys.collaboration(pid));
          break;
        case 'handoff':
          void invalidate(keys.work(pid));
          if (
            e &&
            liveRef.current.ids.includes(ev.payload.from) &&
            liveRef.current.ids.includes(ev.payload.to)
          )
            void e.handoff(ev.payload.from, ev.payload.to);
          break;
        case 'review.approved':
          void invalidate(keys.work(pid));
          e?.approve(ev.payload.reviewerId);
          break;
        case 'review.changes':
        case 'item.merged':
        case 'team.split':
          void invalidate(keys.work(pid));
          break;
        case 'feature.shipped':
          /* one calm moment: the folder updates, the director hops, one line */
          void invalidate(keys.features(pid));
          void invalidate(keys.work(pid));
          e?.react(director, 'hop');
          announce(`Shipped: ${ev.payload.name}`);
          toast(`✓ ${ev.payload.name} shipped`);
          break;
        case 'app.status':
          void invalidate(keys.app(pid));
          void invalidate(keys.health(pid));
          break;
        case 'health.checked':
          void invalidate(keys.health(pid));
          break;
        case 'access.changed':
          void refreshProjectAccess(pid);
          break;
        case 'github.changed':
        case 'github.push':
          void invalidate(keys.health(pid));
          void invalidate('projects');
          break;
        case 'thread.message': {
          const m = threadMessageOf(ev);
          const k = keys.thread(pid, ev.payload.agentId);
          if (getQueryData<Thread>(k))
            setQueryData<Thread>(k, (prev) => ({
              projectId: pid,
              agentId: ev.payload.agentId,
              busy: ev.payload.from === 'agent' ? false : (prev?.busy ?? false),
              messages: mergeMessage(prev?.messages ?? [], m),
            }));
          if (ev.payload.from === 'agent') void e?.say(ev.payload.agentId, { ms: 1300 });
          break;
        }
        case 'run.started':
          /* the director briefs whoever starts a run: one "…" toward them */
          if (ev.payload.agentId !== director && liveRef.current.ids.includes(ev.payload.agentId))
            void e?.say(director, { to: ev.payload.agentId, ms: 1300 });
          break;
        case 'run.finished':
          if (ev.payload.status === 'succeeded') e?.react(ev.payload.agentId, 'hop');
          break;
        case 'ask.opened':
          if (liveRef.current.ids.includes(ev.payload.agentId))
            announce(`${nameOf(ev.payload.agentId)} needs your input: ${ev.payload.question}`, true);
          break;
        case 'report.filed': {
          const author = ev.payload.authorAgentId;
          void invalidateReports(pid);
          announce(`New report from ${nameOf(author)}: ${ev.payload.title}`);
          if (e && liveRef.current.ids.includes(author)) {
            setInFlight((n) => n + 1);
            void e.deliver(author, () => setInFlight((n) => Math.max(0, n - 1)));
          }
          break;
        }
        case 'report.read':
        case 'report.archived':
          void invalidateReports(pid);
          break;
        case 'desk.note': {
          const a = ev.payload.agentId;
          void invalidate(keys.deskNotes(pid));
          if (liveRef.current.ids.includes(a)) {
            void e?.forgot(a);
            announce(`${nickOf(a)} left a note to self and started fresh.`);
          }
          break;
        }
        case 'guest.changed': {
          const { agentId, change } = ev.payload;
          void reload(agentId, change);
          if (change === 'joined') announce(`${nickOf(agentId)} came in to help.`);
          if (change === 'left') announce(`${nickOf(agentId)} went home.`);
          break;
        }
        case 'staff.changed': {
          /* the director brought people in: the Cast's teams + this project changed, the room rebuilds */
          void Promise.all([invalidate('teams'), invalidate('projects'), invalidate(keys.project(pid))]).then(
            () => reload(ev.payload.added[0] ?? '', 'joined'),
          );
          const n = ev.payload.added.length;
          if (n)
            announce(
              n === 1
                ? `${nickOf(ev.payload.added[0] as string)} joined the team.`
                : `${n} people joined the project.`,
            );
          break;
        }
        case 'mail.changed':
          void refreshMail(pid);
          break;
      }
    },
    [pid, director, announce, nameOf, nickOf, reload],
  );
  const { status: stream } = useEventStream(studio.projects.eventsUrl(pid), onEvent, {
    after: office.lastEventId,
  });

  /* ---------- layers: office → board / health / features / feature / reports / report */
  const goSub = useCallback(
    (s: OfficeSub, rid?: string) => go({ name: 'office', projectId: pid, sub: s, id: rid }),
    [pid],
  );
  const escapeRef = useRef<(() => boolean) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: also re-run once the scene exists (world)
  useEffect(() => {
    const e = engine.current;
    const obj = OBJ_OF[sub] ?? null;
    stageRef.current?.classList.toggle('zooming', !!obj);
    if (e && e.zoom.obj !== obj) e.zoomTo(obj);
    if (!obj && opener.current && document.contains(opener.current))
      opener.current.focus({ preventScroll: true });
  }, [sub, world]);
  const layerBack = useCallback(() => {
    if (sub === 'feature') goSub('features');
    else if (sub === 'report') goSub('reports');
    else goSub('room');
  }, [sub, goSub]);

  /* ---------- the few interactive objects */
  const [accessOpen, setAccessOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [portraitOpen, setPortraitOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [binderFor, setBinderFor] = useState<string | null>(null);
  const newAccess = useNewAccessCount(pid);
  const leave = () => {
    if (reducedMotion()) {
      go('projects');
      return;
    }
    engine.current?.door(true);
    setTimeout(() => go('projects'), 260);
  };
  const act = (o: ObjectId) => {
    if (o === 'door') return leave();
    if (o === 'safe') {
      engine.current?.spinDial();
      setAccessOpen(true);
      return;
    }
    if (o === 'clock') return setTimeOpen(true);
    if (o === 'portrait') return setPortraitOpen(true);
    if (o === 'mailbox') return setMailOpen(true);
    if (o === 'bell') {
      engine.current?.ringBell();
      return setBellOpen(true);
    }
    const s = SUB_OF[o];
    if (s) goSub(s);
  };

  /* ---------- robots: click + keyboard */
  const pokeN = useRef(0);
  const clickActor = (a: string) => {
    const e = engine.current;
    if (!e) return;
    if (deriveActor(liveRef.current, a).kind === 'sleeping') {
      e.react(a, POKES[pokeN.current++ % POKES.length]);
      e.chip(a, 'Chat anyway', () => openThread(a, 'chat'));
      announce(`${nameOf(a)} is asleep — off shift. Chat anyway is available.`);
      return;
    }
    openThread(a, 'scene');
  };
  const focusKey = useRef(director);
  const elOf = (k: string) =>
    stageRef.current?.querySelector<HTMLElement>(
      k.startsWith('obj:')
        ? `.o-hot[data-obj="${CSS.escape(k.slice(4))}"]`
        : `.o-body[data-id="${CSS.escape(k)}"]`,
    ) ?? null;
  const roving = useCallback(() => {
    const st = stageRef.current;
    if (!st) return;
    for (const el of st.querySelectorAll<HTMLElement>('.o-body,.o-hot')) el.tabIndex = -1;
    const el =
      st.querySelector<HTMLElement>(
        focusKey.current.startsWith('obj:')
          ? `.o-hot[data-obj="${CSS.escape(focusKey.current.slice(4))}"]`
          : `.o-body[data-id="${CSS.escape(focusKey.current)}"]`,
      ) ?? st.querySelector<HTMLElement>('.o-body');
    if (el) el.tabIndex = 0;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: after the scene + hotspots exist
  useEffect(() => {
    roving();
  }, [world]);
  const focusActor = (k: string) => {
    focusKey.current = k;
    roving();
    elOf(k)?.focus({ preventScroll: true });
  };
  const order = () => {
    const e = engine.current;
    const rank = (k: string) => {
      if (k === director) return -1;
      const p = e?.pos(k);
      return p ? Math.round(p.y / 120) * 100000 + p.x : 1e9;
    };
    /* a desk's note right after its robot; a team's binder right after whoever sits at that desk */
    const people = [...liveRef.current.ids]
      .sort((a, b) => rank(a) - rank(b))
      .flatMap((a) => [
        a,
        ...(traysRef.current[a] ? [`obj:note:${a}`] : []),
        ...office.teams
          .filter((t) => e?.binders[t.id] && e.binders[t.id] === e.plan.home[a])
          .map((t) => `obj:binder:${t.id}`),
      ]);
    return [...people, ...HOTS.map((h) => `obj:${h.id}`)];
  };

  const [listOpen, setListOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const toggleWide = (on: boolean) => {
    setWide(on);
    officeEl()?.classList.toggle('wide', on);
    engine.current?.fit();
    setTimeout(() => engine.current?.fit(), 320);
  };
  useEffect(
    () => () => {
      officeEl()?.classList.remove('wide', 'drawer-up');
    },
    [],
  );

  /* one listener per render: it reads the latest state through the closures */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.scrim')) return;
      const t = e.target as HTMLElement;
      const typing = /input|textarea|select/i.test(t.tagName) || t.isContentEditable;
      if (e.key === 'Escape' && !typing) {
        if (listOpen) {
          setListOpen(false);
          return;
        }
        if (sub !== 'room') {
          e.preventDefault();
          if (!escapeRef.current?.()) layerBack();
          return;
        }
        if (threadRef.current !== director) {
          openThread(director);
          return;
        }
      }
      if (e.key === 'Escape' && typing && sub !== 'room' && t.closest('.ob-card')) {
        e.preventDefault();
        if (!escapeRef.current?.()) layerBack();
        return;
      }
      if (typing) return;
      if (e.key === '!') {
        const ask = liveRef.current.pending[0];
        if (!ask) {
          announce('Nobody needs you right now.');
          return;
        }
        e.preventDefault();
        if (sub !== 'room') goSub('room');
        focusActor(ask.agentId);
        return;
      }
      const inStage = t.closest?.('.o-body,.o-hot') && stageRef.current?.contains(t);
      if (!inStage || sub !== 'room') return;
      const ord = order();
      if (e.key === 'Home') {
        e.preventDefault();
        focusActor(director);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        focusActor(ord[ord.length - 1]);
        return;
      }
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = dirs[e.key];
      if (!d || !engine.current) return;
      e.preventDefault();
      const cur = engine.current.pos(focusKey.current);
      let best: string | null = null;
      let bs = Number.POSITIVE_INFINITY;
      for (const k of ord) {
        if (k === focusKey.current) continue;
        const p = engine.current.pos(k);
        const dx = p.x - cur.x;
        const dy = p.y - cur.y;
        const along = dx * d[0] + dy * d[1];
        if (along <= 4) continue;
        const s = along + (Math.abs(dx * d[1]) + Math.abs(dy * d[0])) * 2.2;
        if (s < bs) {
          bs = s;
          best = k;
        }
      }
      if (best) focusActor(best);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  /* ---------- render */
  const n = live.pending.length;
  const people = live.ids.length;
  const stageLabel = `Office — ${people} ${people === 1 ? 'person' : 'people'}${n ? `, ${n} need${n === 1 ? 's' : ''} you` : ''}. Arrow keys move between people; ! jumps to whoever needs you.`;
  const panelAgents = agentsById as unknown as Record<string, import('./Panel').PanelAgent>;
  const binderOf = (t: string) => principles.data?.teams.find((x) => x.teamId === t);
  const deskHots: { key: string; label: string; hover: string; open: () => void }[] = [
    ...live.ids
      .filter((a) => noteN[a])
      .map((a) => ({
        key: `note:${a}`,
        label: noteLabel(nickOf(a), noteN[a]),
        hover: 'Note to self',
        open: () => setNoteFor(a),
      })),
    ...office.teams.map((t) => {
      const keeper = t.captain && agentsById[t.captain] ? nickOf(t.captain) : null;
      return {
        key: `binder:${t.id}`,
        label: principlesLabel(t.name.replace(/^The /, ''), binderOf(t.id)?.files.length ?? 0, keeper),
        hover: 'Principles',
        open: () => setBinderFor(t.id),
      };
    }),
  ];
  const binderTeam = binderFor ? office.teams.find((t) => t.id === binderFor) : undefined;
  const binderCaptain = binderTeam?.captain && agentsById[binderTeam.captain] ? binderTeam.captain : null;
  const goalName = (gid: string) => work.data?.find((g) => g.id === gid)?.text ?? null;
  const teamName = (a: string) => (teamOf[a] ? (teams[teamOf[a] as string]?.name ?? null) : null);

  return (
    <div className="o-main">
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of robots + objects (the prototype's stage) */}
      <section
        ref={stageRef}
        className={`o-stagewrap${listOpen ? ' list-open' : ''}`}
        id="oStage"
        aria-roledescription="office scene"
        role="group"
        aria-label={stageLabel}
        onClick={(e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('.o-body');
          if (!b?.dataset.id) return;
          opener.current = b;
          clickActor(b.dataset.id);
        }}
        onKeyDown={() => undefined}
        onFocus={(e) => {
          const t = (e.target as HTMLElement).closest<HTMLElement>('.o-body,.o-hot');
          if (!t) return;
          focusKey.current = t.dataset.id ?? `obj:${t.dataset.obj}`;
          roving();
        }}
      >
        <h1 className="sr-only">{name} — the office</h1>
        <div className="o-box" ref={boxRef} />
        {world &&
          createPortal(
            HOTS.map((h) => {
              const o = engine.current?.plan.objects[h.id];
              if (!o) return null;
              const label =
                h.id === 'reports' && unread
                  ? `Reports · ${unread} new`
                  : h.id === 'mailbox' && newMail
                    ? `Mail · ${newMail} new`
                    : o.label;
              const safeNew = h.id === 'safe' && newAccess > 0;
              return (
                <button
                  key={h.id}
                  type="button"
                  className="o-hot"
                  data-obj={h.id}
                  tabIndex={-1}
                  aria-label={
                    (h.id === 'reports' && unread) || (h.id === 'mailbox' && newMail)
                      ? `${h.label} — ${h.id === 'reports' ? unread : newMail} new`
                      : safeNew
                        ? `Safe — ${name} access, ${newAccess} new`
                        : h.id === 'clock'
                          ? clockLabel(time.data)
                          : h.id === 'portrait'
                            ? `${name} — change its picture and name`
                            : h.label
                  }
                  style={{ left: o.x, top: o.y, width: o.w, height: o.h }}
                  onClick={(e) => {
                    e.stopPropagation();
                    opener.current = e.currentTarget;
                    act(h.id);
                  }}
                >
                  {label && (
                    <span className="o-hot-l" aria-hidden="true">
                      {label}
                    </span>
                  )}
                  {safeNew && <span className="o-hot-dot" aria-hidden="true" />}
                </button>
              );
            }),
            world,
          )}
        {world &&
          createPortal(
            deskHots.map((h) => {
              const b = engine.current?.deskSpot(h.key);
              if (!b) return null;
              return (
                <button
                  key={h.key}
                  type="button"
                  className="o-hot o-deskhot"
                  data-obj={h.key}
                  tabIndex={-1}
                  aria-label={h.label}
                  style={{ left: b.x, top: b.y, width: b.w, height: b.h, zIndex: b.z }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    opener.current = ev.currentTarget;
                    h.open();
                  }}
                >
                  <span className="o-hot-l" aria-hidden="true">
                    {h.hover}
                  </span>
                </button>
              );
            }),
            world,
          )}
        <div className="o-scrim" aria-hidden="true" />
        <div className="o-layers">
          {sub !== 'room' && (
            <Board
              pid={pid}
              sub={sub}
              id={id}
              dir={shortOf(agentsById[director])}
              go={goSub}
              escapeRef={escapeRef}
              nameOf={nameOf}
              resolve={resolve}
              onFollowUp={(r, agentId) => {
                setContext({ title: r.title, reportId: r.id });
                goSub('room');
                openThread(agentId, 'report');
              }}
            />
          )}
        </div>
        <div className="o-stagectl">
          {app.data?.status === 'running' && app.data.url && (
            <a
              className="o-ctl o-openapp"
              href={app.data.url}
              target="_blank"
              rel="noreferrer"
              title={app.data.port ? `Open the app (port ${app.data.port})` : 'Open the app'}
            >
              ▶ <span>Open app</span>
            </a>
          )}
          <button
            className="o-ctl"
            type="button"
            aria-pressed={listOpen}
            aria-controls="oList"
            onClick={() => setListOpen((v) => !v)}
          >
            ▤ <span>List</span>
          </button>
          <button
            className="o-ctl"
            type="button"
            id="oWideBtn"
            aria-pressed={wide}
            aria-label={wide ? 'Show the chat panel' : 'Hide the chat panel'}
            onClick={() => toggleWide(!wide)}
          >
            ⤢
          </button>
        </div>
        <ListMirror
          live={live}
          director={director}
          office={office}
          name={nameOf}
          hue={(a) => agentsById[a]?.look?.hue}
          onClose={() => setListOpen(false)}
          onPick={(a) => {
            setListOpen(false);
            clickActor(a);
          }}
        />
        {stream === 'reconnecting' && (
          <span className="o-ctl o-reconnect" role="status">
            Reconnecting…
          </span>
        )}
      </section>
      <aside className="o-panel" ref={panelRef} aria-label={`Chat with ${nameOf(thread)}`}>
        <Panel
          pid={pid}
          thread={thread}
          director={director}
          agents={panelAgents}
          teamName={teamName}
          actor={live.ids.includes(thread) ? deriveActor(live, thread) : undefined}
          asks={live.pending}
          context={context}
          clearContext={() => setContext(null)}
          open={(a) => openThread(a)}
          openReport={(rid) => goSub('report', rid)}
          answered={(askId) =>
            dispatch({
              id: 0,
              type: 'ask.answered',
              payload: { askId, answer: '' },
              at: new Date().toISOString(),
            } as StudioEvent)
          }
          onGrab={() => {
            officeEl()?.classList.toggle('drawer-up');
            setTimeout(() => engine.current?.fit(), 340);
          }}
        />
      </aside>
      <AccessSheet pid={pid} name={name} open={accessOpen} onClose={() => setAccessOpen(false)} />
      {project.data && (
        <PortraitSheet
          project={project.data}
          open={portraitOpen}
          onClose={() => setPortraitOpen(false)}
          onSaved={(p) => {
            setQueryData(keys.project(pid), p);
            void invalidate('projects');
          }}
        />
      )}
      <TimeSheet
        pid={pid}
        name={name}
        open={timeOpen}
        onClose={() => setTimeOpen(false)}
        agents={agentsById}
      />
      <DeskNoteSheet
        pid={pid}
        agentId={noteFor}
        nick={noteFor ? nickOf(noteFor) : ''}
        open={!!noteFor}
        onClose={() => setNoteFor(null)}
        onSeen={markSeen}
      />
      <PrinciplesSheet
        pid={pid}
        team={binderTeam ?? null}
        captain={binderCaptain ? nickOf(binderCaptain) : null}
        open={!!binderTeam}
        onClose={() => setBinderFor(null)}
        onTalk={() => {
          if (!binderTeam || !binderCaptain) return;
          setBinderFor(null);
          setContext({ title: `${binderTeam.name.replace(/^The /, '')} principles` });
          openThread(binderCaptain, 'chat');
        }}
      />
      <MailSheet
        pid={pid}
        hq={hq}
        hqId={boot.hqId}
        name={name}
        director={nickOf(director)}
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        onTalk={(m) => {
          setMailOpen(false);
          setContext({ title: m.subject });
          openThread(director, 'chat');
        }}
        goalName={goalName}
        onGoal={() => {
          setMailOpen(false);
          goSub('board');
        }}
      />
      <BringInSheet
        pid={pid}
        roster={roster}
        here={new Set(live.ids)}
        guests={(office.guests ?? []).filter((g) => agentsById[g.agentId])}
        director={nickOf(director)}
        open={bellOpen}
        onClose={() => setBellOpen(false)}
        onBrought={() => setBellOpen(false)}
      />
      <div className="sr-only" aria-live="polite">
        {said.polite}
      </div>
      <div className="sr-only" aria-live="assertive">
        {said.loud}
      </div>
    </div>
  );
}

/* the list mirror: same state, grouped; rows do what clicking the robot does (no "Around the office") */
function ListMirror({
  live,
  director,
  office,
  name,
  hue,
  onClose,
  onPick,
}: {
  live: Live;
  director: string;
  office: OfficeView;
  name: (id: string) => string;
  hue: (id: string) => string | undefined;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const actors = live.ids.map((a) => deriveActor(live, a));
  const awake = (ids: string[]) => actors.filter((a) => ids.includes(a.id) && a.session !== 'asleep');
  const groups: [string, typeof actors][] = [
    ['Director', actors.filter((a) => a.id === director)],
    ...office.teams.map((t) => [t.name, awake(t.members)] as [string, typeof actors]),
    ['Solo', awake(office.solo)],
    ['Off shift', actors.filter((a) => a.session === 'asleep' && a.id !== director)],
  ];
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled region (the prototype's list mirror)
    <div
      className="o-list"
      id="oList"
      role="region"
      aria-label="Office list — everyone and what they are doing"
    >
      <div className="o-lhead">
        <b>Everyone</b>
        <button type="button" className="o-ctl" aria-label="Close list" onClick={onClose}>
          ✕
        </button>
      </div>
      {groups
        .filter(([, list]) => list.length)
        .map(([title, list]) => (
          <div key={title}>
            <h3>{title}</h3>
            <ul>
              {list.map((a) => {
                const needs = a.kind === 'needs-input';
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`o-lrow${needs ? ' needs' : ''}`}
                      onClick={() => onPick(a.id)}
                    >
                      <span
                        className="o-lface"
                        style={{ background: hue(a.id) ? `var(--${hue(a.id)}, ${hue(a.id)})` : undefined }}
                        aria-hidden="true"
                      >
                        {name(a.id)[0]}
                      </span>
                      <span className="o-lt">
                        <b>{name(a.id)}</b>
                        <span className="o-lact">
                          {activityOf(a.kind).icon}{' '}
                          {needs ? 'Needs you' : a.session === 'asleep' ? 'Off shift' : a.label}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </div>
  );
}
