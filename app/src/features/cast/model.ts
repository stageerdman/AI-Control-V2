/* Cast — pure rules (no DOM, no I/O), ported from the prototype's data-cast.js / cast.js / teams.js.
   Everything here is unit-tested (model.test.ts); components and the store only call into it. */
import type { Agent, AgentKind, Look, Member, Role, Team } from '../../api/types';
import { EMBLEMS, hatDecal, LOOK_SLOTS, type LookSlotId } from '../../characters';
import { HUES, type Hue } from '../../design/palette';

export const TEAM_MAX = 7;

export const KIND_LABEL: Record<AgentKind, string> = {
  agent: 'Agent',
  setter: 'Project Setter',
  orchestrator: 'Orchestrator',
  creator: 'Agent Creator',
};
export const KIND_ABOUT: Record<Exclude<AgentKind, 'agent'>, string> = {
  setter: 'Sets up every new or adopted project — scaffold, rules, GitHub — before anyone else arrives.',
  orchestrator: 'Runs a project at big-picture altitude. You pick one per project; it picks the team.',
  creator:
    'When an orchestrator needs someone who doesn’t exist yet, designs the agent — or a whole team — and adds them to the Cast.',
};

type HasKind = { kind: AgentKind };
export const isCrew = (a: HasKind) => a.kind !== 'agent';

/** Lineup order everywhere: studio crew first (setter, orchestrators, creator), then everyone else. */
export function castOrder<T extends HasKind>(agents: readonly T[]): T[] {
  const of = (k: AgentKind) => agents.filter((a) => a.kind === k);
  return [...of('setter'), ...of('orchestrator'), ...of('creator'), ...of('agent')];
}

/** The line under a name: crew → their kind; agents → their custom role (may be empty). */
export const roleText = (a: Pick<Agent, 'kind' | 'role' | 'roleId'>) =>
  isCrew(a) ? KIND_LABEL[a.kind] : (a.roleId && a.role) || 'No role yet';

/** Friendly short name for sentences ("Give Pete a job"). */
export const shortName = (a: Pick<Agent, 'name' | 'nick'>) => a.nick || a.name;

export const usedIn = (n: number) =>
  `Used in ${n} project${n === 1 ? '' : 's'} · each project runs its own copy — no shared memory.`;

/* ---------- look editing (in-game arrows + dice) ---------- */

/** Step one look slot (‹ = −1, › = +1), wrapping; the hat carries its decal. */
export function cycleLook(look: Look, slotId: LookSlotId, d: 1 | -1): Look {
  const sl = LOOK_SLOTS.find((s) => s.id === slotId);
  if (!sl) return look;
  const opts = sl.options;
  const i = Math.max(0, opts.indexOf(look[slotId]));
  const v = opts[(i + d + opts.length) % opts.length] as string;
  const next = { ...look, [slotId]: v };
  if (slotId === 'hat') next.decal = hatDecal(v);
  return next;
}

export const lookTag = (look: Look, slotId: LookSlotId) => {
  const sl = LOOK_SLOTS.find((s) => s.id === slotId);
  return sl ? `${sl.label}: ${sl.name(look[slotId])}` : '';
};

/** The hue the fewest agents wear (a new recruit's default). */
export function leastUsedHue(agents: readonly { look: Look }[]): Hue {
  const c = Object.fromEntries(HUES.map((h) => [h, 0])) as Record<Hue, number>;
  for (const a of agents) if (a.look.hue in c) c[a.look.hue as Hue]++;
  return HUES.reduce((m, h) => (c[h] < c[m] ? h : m), HUES[0]);
}

/* ---------- roles: pick an existing one or type a new name ---------- */

export const normRole = (s: string) =>
  String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 28);
export const roleByName = (roles: readonly Role[], name: string) => {
  const n = normRole(name).toLowerCase();
  return n ? (roles.find((r) => r.name.toLowerCase() === n) ?? null) : null;
};

export type RoleOption = { id: string; label: string; create?: boolean };
/** Combobox options for what's typed: matching roles, plus "Create “x”" when nothing matches exactly. */
export function roleOptions(roles: readonly Role[], typed: string): RoleOption[] {
  const q = typed.trim().toLowerCase();
  const out: RoleOption[] = roles
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    .map((r) => ({ id: r.id, label: r.name }));
  if (q && !roles.some((r) => r.name.toLowerCase() === q))
    out.push({ id: 'new', label: `Create “${typed.trim()}”`, create: true });
  return out;
}

/** What Enter means: the highlighted option, else an exact match, else "create". null = nothing. */
export function enterChoice(opts: readonly RoleOption[], act: number, typed: string): RoleOption | null {
  if (act >= 0 && opts[act]) return opts[act];
  const v = typed.trim().toLowerCase();
  return opts.find((o) => !o.create && o.label.toLowerCase() === v) ?? opts.find((o) => o.create) ?? null;
}

export const roleUse = (n: number) => (n ? `${n} agent${n === 1 ? '' : 's'}` : 'unused');

/* ---------- lineup layout: balanced rows, crew row(s) first, characters face inward ---------- */

export const SLOT_W = 168;
export const SLOT_GAP = 24;

export function lineupCols(width: number): number {
  const narrow = width < 560;
  const w = narrow ? 120 : SLOT_W;
  const gap = narrow ? 12 : SLOT_GAP;
  return Math.max(2, Math.min(6, Math.floor((width + gap) / (w + gap))));
}

export type LineupRow<T> = { items: T[]; crew: boolean };
/** Crew rows of `cols`, then the rest in balanced rows (11 → 6 + 5). */
export function lineupRows<T>(crew: readonly T[], rest: readonly T[], cols: number): LineupRow<T>[] {
  const rows: LineupRow<T>[] = [];
  for (let i = 0; i < crew.length; i += cols) rows.push({ items: crew.slice(i, i + cols), crew: true });
  const n = rest.length;
  const r = Math.ceil(n / cols);
  const per = r ? Math.ceil(n / r) : 0;
  for (let i = 0; i < r; i++) rows.push({ items: rest.slice(i * per, i * per + per), crew: false });
  return rows;
}

/** Middle of a row faces front; the others turn three-quarter toward the middle. */
export function inwardFacing(
  i: number,
  k: number,
): { facing: 'front' | 'three-quarter'; dir: 'right' | 'left' } {
  const mid = (k - 1) / 2;
  return { facing: i === mid ? 'front' : 'three-quarter', dir: i < mid ? 'right' : 'left' };
}

/* ---------- teams ---------- */

/** Captain first, then member order. */
export function orderedMembers(t: Pick<Team, 'members' | 'captainId'>): Member[] {
  const cap = t.members.find((m) => m.agentId === t.captainId);
  return cap ? [cap, ...t.members.filter((m) => m !== cap)] : t.members.slice();
}

/** "Captain Sir Lint-a-lot", but never "Captain Captain Semicolon". */
export function capLine(name: string | undefined) {
  const n = name || 'none yet';
  return /^captain\b/i.test(n) ? n : `Captain ${n}`;
}

/** Formation slots [x % of stage width, y = steps back]; 6th/7th = back row between the front side pairs. */
export const SQ_SLOTS: readonly [number, number][] = [
  [0, 0],
  [-22, 4],
  [22, 4],
  [-40, 8],
  [40, 8],
  [-31, 20],
  [31, 20],
];
export function stageDims(W: number, H: number) {
  const cap = Math.round(Math.max(150, Math.min(H * 0.46, W * 0.36, 330)));
  return { W, H, cap, crew: Math.round(cap * 0.62) };
}
/** Where member #i stands (i = 0 is the captain), in px inside the formation box. */
export function formationSpot(i: number, W: number, cap: number, crew: number) {
  const [x, y] = SQ_SLOTS[i] ?? [0, 0];
  const step = y === 0 ? 0 : y <= 4 ? 1 : y <= 8 ? 2 : 3;
  const px = i === 0 ? cap : Math.round(crew * 0.94 ** (step - 1));
  return {
    x,
    step,
    back: step === 3,
    px,
    left: Math.round(W / 2 + (x / 100) * W - px * 0.375),
    bottom: Math.round((y / 100) * W * 0.5),
    z: 10 - step,
  };
}

/** Roll-call group: captain front & centre, others in a shallow V (px offsets). */
export const ROW_OFFS = [0, -76, 76, -128, 128, -102, 102] as const;
export const rowStep = (i: number) => (i === 0 ? 0 : i <= 2 ? 1 : i <= 4 ? 2 : 3);

/** A new team's defaults: the first unused colour and emblem. */
export function newTeamLook(teams: readonly Pick<Team, 'color' | 'emblem'>[]) {
  const usedE = new Set(teams.map((t) => t.emblem));
  const usedH = new Set(teams.map((t) => t.color));
  return {
    color: HUES.find((h) => !usedH.has(h)) ?? 'coral',
    emblem: (EMBLEMS.find((e) => !usedE.has(e.id)) ?? EMBLEMS[0]).id,
  };
}

/* optimistic roster edits — the server's rules (domain/teams.ts), so the stage moves before the reply */
type Roster = Pick<Team, 'members' | 'captainId'>;
export function addLocal<T extends Roster>(t: T, agentId: string, instr = '', at?: number): T {
  if (t.members.some((m) => m.agentId === agentId) || t.members.length >= TEAM_MAX) return t;
  const members = [...t.members];
  members.splice(at ?? members.length, 0, { agentId, instr });
  return { ...t, members, captainId: t.captainId ?? agentId };
}
export function removeLocal<T extends Roster>(t: T, agentId: string) {
  const index = t.members.findIndex((m) => m.agentId === agentId);
  if (index < 0) return null;
  const members = t.members.filter((_, i) => i !== index);
  const wasCaptain = t.captainId === agentId;
  const team: T = { ...t, members, captainId: wasCaptain ? (members[0]?.agentId ?? null) : t.captainId };
  return { team, index, member: t.members[index] as Member, wasCaptain };
}
export const captainLocal = <T extends Roster>(t: T, agentId: string): T =>
  t.members.some((m) => m.agentId === agentId) ? { ...t, captainId: agentId } : t;
export const jobLocal = <T extends Roster>(t: T, agentId: string, instr: string): T => ({
  ...t,
  members: t.members.map((m) => (m.agentId === agentId ? { ...m, instr } : m)),
});

/** Who can join a crew: non-crew cast members not already on it, in lineup order. */
export const candidates = <A extends HasKind & { id: string }>(agents: readonly A[], t: Roster) =>
  castOrder(agents).filter((a) => !isCrew(a) && !t.members.some((m) => m.agentId === a.id));
