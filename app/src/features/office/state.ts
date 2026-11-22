/* The office's live state, pure (tested): the backend's statuses + open asks → what each robot is
   doing in the scene (the prototype's ACTIVITY kinds), thread merging, the wall's facts.
   The scene (engine.ts) only renders what deriveActor() says; nothing here touches the DOM. */
import {
  apiUrl,
  type ChecklistItem,
  type Goal,
  type ProjectApp,
  type ProjectHealth,
  type StudioEvent,
  type TaskPerson,
} from '../../api';
import type { Pose } from '../../characters';
import type { AgentStatus, Feature, OfficeProgress, OfficeView, ThreadMessage, WorkTime } from './api';
import type { RebuildOffer } from './rebuild/api';
import type { BoardFacts } from './theme';

/** One row per activity kind (prototype office-engine.js ACTIVITY): pose, prop, monitor glyph. */
export const ACTIVITY = {
  reading: { icon: '📖', tag: 'Reading', pose: 'reading', holding: 'binder', glyph: 'read', seated: true },
  planning: { icon: '💭', tag: 'Planning', pose: 'thinking', glyph: 'caret', seated: true },
  coding: { icon: '⌨️', tag: 'Coding', pose: 'typing', glyph: 'code', seated: true },
  testing: { icon: '🧪', tag: 'Testing', pose: 'waiting', glyph: 'dots', seated: true },
  'needs-input': { icon: '❗', tag: 'Needs you', pose: 'needs-input', glyph: 'pause', seated: false },
  waiting: { icon: '⏳', tag: 'Waiting', pose: 'waiting', glyph: 'hourglass', seated: true },
  reviewing: { icon: '🔍', tag: 'Reviewing', pose: 'writing', holding: 'pen', glyph: 'diff', seated: true },
  idle: { icon: '☕', tag: 'Free', pose: 'chilling', holding: 'mug', glyph: 'emblem', seated: true },
  sleeping: { icon: '💤', tag: 'Off shift', pose: 'sleeping', glyph: 'off', seated: true },
  /* STUDIO LIFE: the director triaging the mail (he thinks at his desk; he doesn't walk) */
  mail: { icon: '✉', tag: 'Reading the mail', pose: 'thinking', glyph: 'read', seated: true },
} as const satisfies Record<
  string,
  { icon: string; tag: string; pose: Pose; holding?: string; glyph: string; seated: boolean }
>;
export type ActKind = keyof typeof ACTIVITY;
export type ActivityDef = (typeof ACTIVITY)[ActKind] & { holding?: string };
export const activityOf = (k: ActKind): ActivityDef => ACTIVITY[k];

/** asleep = no session on this project yet (never reported); idle = free; running = on a run. */
export type Session = 'asleep' | 'idle' | 'running';
export type Actor = { id: string; kind: ActKind; label: string; session: Session; runId?: string };
export type PendingAsk = {
  id: string;
  agentId: string;
  question: string;
  options: string[] | null;
  runId?: string;
};

export type Live = {
  director: string;
  /** Everyone in the office: the director first, then team members, then solo (office order). */
  ids: string[];
  /** Latest backend status per agent; null = never reported here (asleep). */
  status: Record<string, AgentStatus | null>;
  pending: PendingAsk[];
};

/* server activity kinds (runtime/stream.ts, crew) → the scene's */
const KIND: Record<string, ActKind> = {
  reading: 'reading',
  searching: 'reading',
  editing: 'coding',
  tool: 'coding',
  running: 'testing',
  writing: 'reviewing',
  reviewing: 'reviewing',
  thinking: 'planning',
  starting: 'planning',
  asking: 'needs-input',
  mail: 'mail',
};

/** What one robot shows, from its latest status and whether it has an open ask. */
export function deriveActor(live: Live, id: string): Actor {
  const s = live.status[id];
  const ask = live.pending.find((p) => p.agentId === id);
  const director = id === live.director;
  const runId = s?.runId;
  if (ask) return { id, kind: 'needs-input', label: 'Needs you', session: 'running', runId };
  if (!s) return director ? { id, kind: 'planning', label: 'Big picture', session: 'idle' } : sleeping(id);
  const label = s.activity?.label;
  switch (s.status) {
    case 'working': {
      const kind = KIND[s.activity?.kind ?? ''] ?? 'coding';
      return {
        id,
        kind: kind === 'needs-input' ? 'waiting' : kind,
        label: label || ACTIVITY[kind].tag,
        session: 'running',
        runId,
      };
    }
    case 'waiting':
      return { id, kind: 'waiting', label: label || 'Waiting', session: 'running', runId };
    case 'blocked':
      return { id, kind: 'waiting', label: label || 'Blocked', session: 'running', runId };
    default: /* idle · done */
      return director
        ? { id, kind: 'planning', label: 'Big picture', session: 'idle' }
        : {
            id,
            kind: 'idle',
            label: s.status === 'done' ? 'Done — free for the next thing' : 'Free',
            session: 'idle',
          };
  }
}
const sleeping = (id: string): Actor => ({ id, kind: 'sleeping', label: 'Off shift', session: 'asleep' });

export function initLive(office: OfficeView, asks: PendingAsk[] = []): Live {
  const ids = [office.director, ...office.teams.flatMap((t) => t.members), ...office.solo].filter(
    (id, i, a) => a.indexOf(id) === i,
  );
  const status: Record<string, AgentStatus | null> = {};
  /* never reported (no `since`) = no session here yet = asleep */
  for (const id of ids) status[id] = office.agents[id]?.since ? office.agents[id] : null;
  return { director: office.director, ids, status, pending: asks.filter((a) => ids.includes(a.agentId)) };
}

/** Apply one event from the project's stream. Unknown agents / types leave the state as it is. */
export function reduce(live: Live, ev: StudioEvent): Live {
  switch (ev.type) {
    case 'agent.status': {
      const p = ev.payload;
      if (!live.ids.includes(p.agentId)) return live;
      const { agentId: _, ...st } = p;
      return { ...live, status: { ...live.status, [p.agentId]: { ...st, since: ev.at } } };
    }
    case 'ask.opened': {
      const p = ev.payload;
      if (!live.ids.includes(p.agentId) || live.pending.some((a) => a.id === p.askId)) return live;
      const ask: PendingAsk = {
        id: p.askId,
        agentId: p.agentId,
        question: p.question,
        options: p.options ?? null,
        runId: p.runId,
      };
      return { ...live, pending: [...live.pending, ask] };
    }
    case 'ask.answered':
    case 'ask.withdrawn':
      return live.pending.some((a) => a.id === ev.payload.askId)
        ? { ...live, pending: live.pending.filter((a) => a.id !== ev.payload.askId) }
        : live;
    default:
      return live;
  }
}

/** Which actors look different between two states (the scene restyles only those). */
export function changedActors(a: Live, b: Live): string[] {
  return b.ids.filter((id) => {
    const x = deriveActor(a, id);
    const y = deriveActor(b, id);
    return x.kind !== y.kind || x.label !== y.label || x.session !== y.session;
  });
}

/* ------------------------------------------------------------ threads */
/** A `thread.message` event → the stored message shape. */
export function threadMessageOf(ev: StudioEvent<'thread.message'>): ThreadMessage {
  const p = ev.payload;
  return {
    id: p.messageId,
    from: p.from === 'user' ? 'user' : p.agentId,
    kind: p.kind,
    text: p.text,
    runId: p.runId ?? null,
    reportId: p.reportId ?? null,
    goalId: p.goalId ?? null,
    ...(p.rebuild ? { rebuild: p.rebuild as unknown as RebuildOffer } : {}),
    /* the line's own time, not the event's: an answered question keeps the time it was asked */
    at: p.at ?? ev.at,
  };
}
/** Merge one message into a thread: no duplicates (by id), oldest first. */
export function mergeMessage(list: ThreadMessage[], m: ThreadMessage): ThreadMessage[] {
  if (list.some((x) => x.id === m.id)) return list.map((x) => (x.id === m.id ? m : x));
  const out = [...list, m];
  return out.every((x, i) => i === 0 || out[i - 1].at <= x.at)
    ? out
    : out.slice().sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
}

/* ------------------------------------------------------------ the wall */
/** Goals that stopped partway (not finished, not dropped): they stay on the board until continued or dropped. */
export const resumable = (g: Goal): boolean => g.status === 'failed' || g.status === 'stopped';
export const stoppedGoals = (goals: Goal[]): Goal[] => goals.filter(resumable);

/** The tasks the whiteboard lists: every running or stopped goal's items, else the newest goal's (oldest first). */
export function boardTasks(
  goals: Goal[],
): { id: string; text: string; done: boolean; status: string; item: ChecklistItem }[] {
  const open = goals.filter((g) => g.status === 'running' || resumable(g));
  const shown = open.length ? open : goals.slice(0, 1);
  return shown
    .slice()
    .reverse()
    .flatMap((g) =>
      g.items.map((i) => ({ id: i.id, text: i.text, done: i.status === 'done', status: i.status, item: i })),
    );
}
/** The big number: the project's overall progress (server: features shipped / total, else the
    current goal's %), labelled by its target ("to v1.0") — never by a goal's text. Falls back to
    the newest goal's % for an older server. */
export function boardProgress(
  goals: Goal[],
  prog?: OfficeProgress | null,
): { pct: number; target: string | null; shipped: string | null; aria: string } {
  const g = goals.find((x) => x.status === 'running') ?? goals[0];
  const pct = Math.round(prog ? prog.pct : (g?.pct ?? 0));
  const target = prog?.target?.trim() || null;
  /* a follow-up goal on a new feature lowers the % (100 → 50): say so calmly, it's expected */
  const added =
    !!prog && prog.shipped > 0 && prog.shipped < prog.total && g?.status === 'running' && !!g.featureId;
  const shipped =
    prog && prog.total > 0
      ? `${added ? 'New work added · ' : ''}${prog.shipped} of ${prog.total} features shipped`
      : null;
  return { pct, target, shipped, aria: target ? `${pct}% to ${target}` : `${pct}% done` };
}

/** A whiteboard task card, as the user reads it (design/whiteboard-task-card.md): one status mark,
    the people on it (now, or who finished it), one status word only when it adds something, and for a
    stopped task the plain message with the raw note kept as details. Falls back gracefully for an
    older server without `workingNow` / `finishedBy` / `problem`. */
export type CardMark = 'todo' | 'active' | 'done' | 'failed' | 'stopped';
export type TaskCardView = {
  mark: CardMark;
  people: { id: string; name: string; look?: TaskPerson['look'] }[];
  status: string | null;
  tone: 'sun' | null;
  problem: { message: string; details: string | null } | null;
  /** Screen-reader lead-in ("Done, finished by Pete:"). */
  sr: string;
};
const FALLBACK_PROBLEM = { failed: 'Something went wrong.', cancelled: 'Stopped.' } as const;

export function taskCard(i: ChecklistItem, nameOf: (id: string) => string): TaskCardView {
  const names = (ps: { name: string }[]) =>
    ps.length > 2 ? `${ps[0].name} and ${ps.length - 1} others` : ps.map((p) => p.name).join(' and ');
  if (i.status === 'done') {
    const by =
      i.finishedBy ?? (i.finishedBy === undefined ? { id: i.agentId, name: nameOf(i.agentId) } : null);
    const people = by ? [by] : [];
    return {
      mark: 'done',
      people,
      status: null,
      tone: null,
      problem: null,
      sr: by ? `Done, finished by ${by.name}:` : 'Done:',
    };
  }
  if (i.status === 'failed' || i.status === 'cancelled') {
    const message = i.problem?.message ?? FALLBACK_PROBLEM[i.status];
    const details = (i.problem ? i.problem.details : i.note)?.trim() || null;
    return {
      mark: i.status === 'failed' ? 'failed' : 'stopped',
      people: [],
      status: null,
      tone: null,
      problem: { message, details },
      sr: `Stopped: ${message}`,
    };
  }
  if (i.status === 'todo')
    return { mark: 'todo', people: [], status: null, tone: null, problem: null, sr: 'To do:' };
  const people: TaskCardView['people'] = i.workingNow ?? [{ id: holderOf(i), name: nameOf(holderOf(i)) }];
  const back = (i.sendBacks ?? 0) > 0;
  const [status, tone]: [string | null, 'sun' | null] =
    i.stage === 'review'
      ? ['reviewing', null]
      : i.stage === 'merge'
        ? ['merging', null]
        : back
          ? [`sent back ${i.sendBacks}×`, 'sun']
          : [null, null];
  const who = people.length ? `, ${names(people)}${status ? ` ${status}` : ' working'}` : '';
  return { mark: 'active', people, status, tone, problem: null, sr: `In progress${who}:` };
}

/** Who has the item now: the reviewer while in review, else its builder. */
export const holderOf = (i: ChecklistItem): string =>
  i.stage === 'review' && i.gates?.[i.gateIndex ?? 0] ? i.gates[i.gateIndex ?? 0].reviewer : i.agentId;

const KIND_WORD: Record<string, string> = {
  quality: 'quality',
  'user-test': 'user test',
  'crash-test': 'crash test',
  security: 'security',
  review: 'review',
};
export const gateKindWord = (k: string) => KIND_WORD[k] ?? k;

/** The hover line of a running task: what kind of review it's in, or what the reviewer said.
    (A stopped task's raw note lives behind its Details toggle, never in a hover.) */
export function taskHover(i: ChecklistItem, nameOf: (id: string) => string): string | null {
  if (i.status !== 'running') return null;
  if (i.stage === 'review') {
    const g = i.gates?.[i.gateIndex ?? 0];
    return g ? `${nameOf(g.reviewer)} is reviewing (${gateKindWord(g.kind)})` : null;
  }
  if ((i.sendBacks ?? 0) > 0 && i.notes) {
    const last = i.reviews?.filter((r) => r.verdict === 'changes').at(-1);
    const who = last ? nameOf(last.reviewer) : 'The reviewer';
    const n = i.notes.length > 120 ? `${i.notes.slice(0, 119)}…` : i.notes;
    return `${who}: “${n}”`;
  }
  return null;
}
export const nowFeatures = (features: Feature[]) =>
  features.filter((f) => f.status === 'now').sort((a, b) => a.order - b.order);

export const ASPECTS = [
  ['modularity', 'Modularity'],
  ['cleanliness', 'Cleanliness'],
  ['reusability', 'Reusability'],
] as const;

export function boardFacts(d: {
  goals?: Goal[];
  features?: Feature[];
  health?: ProjectHealth;
  unreadReports?: number;
  newMail?: number;
  progress?: OfficeProgress | null;
  time?: WorkTime | null;
  /** The project as the portrait shows it (name, picture, tile). */
  project?: {
    name: string;
    imageUrl?: string | null;
    tile: { g1: string; g2: string; glyph: string };
  } | null;
}): BoardFacts {
  const latest = d.health?.latest;
  return {
    overall: boardProgress(d.goals ?? [], d.progress).pct,
    now: nowFeatures(d.features ?? []).map((f) => ({ name: f.name, pct: f.pct ?? 0 })),
    tasks: boardTasks(d.goals ?? []),
    fresh: d.health?.git ? d.health.git.clean !== false : true,
    grades: latest ? ASPECTS.map(([key, name]) => ({ key, name, grade: latest[key].grade })) : [],
    unreadReports: d.unreadReports ?? 0,
    newMail: d.newMail ?? 0,
    live: d.time?.live ?? 0,
    portrait: d.project
      ? { name: d.project.name, image: apiUrl(d.project.imageUrl), tile: d.project.tile }
      : null,
  };
}

/** The health card's App row, from the server's view (url + port are the server's — never assumed).
    A CLI that ends with exit 0 "ran and finished" (its output shown); only a nonzero exit is a problem. */
export function appView(a: ProjectApp): {
  label: string;
  tone: 'ok' | 'bad' | null;
  url: string | null;
  port: number | null;
  showLog: boolean;
  action: 'Stop' | 'Start' | 'Run again';
} {
  const port = a.port ?? null;
  if (a.status === 'running')
    return { label: 'running', tone: 'ok', url: a.url ?? null, port, showLog: false, action: 'Stop' };
  if (a.status === 'exited' && a.exitCode === 0)
    return {
      label: 'ran and finished',
      tone: 'ok',
      url: null,
      port: null,
      showLog: true,
      action: 'Run again',
    };
  if (a.status === 'exited')
    return {
      label: `failed${a.exitCode != null ? ` (exit ${a.exitCode})` : ''}`,
      tone: 'bad',
      url: null,
      port: null,
      showLog: true,
      action: 'Start',
    };
  return {
    label: a.command ? 'not running' : 'no run command yet',
    tone: null,
    url: null,
    port: null,
    showLog: false,
    action: 'Start',
  };
}
