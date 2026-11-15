/* The office floor plan from staffing — the prototype's office-layout.js (spec-office-config.md),
   typed, plus the Reports tray (spec-reports §1.1). Pure geometry: no DOM, no art, no story.

   officeLayout({teams, solo}) → Plan:
     W            room width (grows so pods never overflow; wide enough for the planning wall + tray)
     rows         seat y of each desk row (1 or 2)
     pods         one per team block (≤ 7 desks), solo agents share neutral blocks
     seats/home   seat geometry · agentId → its desk
     director · couch (3 seats) · lanes (back, mid) · gaps (where walkers cross)
     objects      door · clock · outbox · console · dossier (features) · whiteboard · health ·
                  reports (the tray) · safe   (the clock above the door = Agent time)
     windows · lamps
   The room is a dollhouse: wall y −40…380, floor 380…900, the right column (400 wide) is the
   Director's corner (top) + the couch (bottom). */

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number; stand?: Pt; label?: string };
export type Seat = { x: number; y: number; row: number; pod: string };
export type Pod = {
  id: string;
  teamId: string | null;
  row: number;
  rug: { x: number; y: number; w: number; h: number };
  seats: string[];
};
export type ObjectId =
  | 'door'
  | 'clock'
  | 'outbox'
  | 'console'
  | 'dossier'
  | 'whiteboard'
  | 'health'
  | 'reports'
  | 'safe'
  | 'portrait'
  | 'mailbox'
  | 'bell';
export type Plan = {
  W: number;
  rows: number[];
  pods: Pod[];
  seats: Record<string, Seat>;
  home: Record<string, string>;
  spare: string[];
  director: Pt;
  couch: Pt[];
  lanes: { back: number; mid: number };
  gaps: number[];
  objects: Record<ObjectId, Box>;
  windows: { x: number }[];
  lamps: number[];
};
export type LayoutConfig = {
  teams: { id: string; members: string[] }[];
  solo: string[];
  /** Free solo desks (no owner yet). */
  spare?: number;
  /** STUDIO LIFE: guests the user brought in — their own block of hot desks (seats `guest-N`). */
  guests?: string[];
};

const OL = { DX: 124, RUG: 140, GAP: 72, LEFT: 50, RIGHT: 440, MIN_W: 1600, STEP: 40, PER_POD: 7 };
/* the wall, left → right: door + ship corner end at 354; the planning wall (folder · whiteboard ·
   health = 776 wide) starts at ≥ 392; then a 56 gap, the 92-wide tray, and air before the glass. */
const WALL = { MIN_X: 392, PLANNING: 776, TRAY_GAP: 56, TRAY_W: 92, TRAY_AIR: 44 };
const TRAY_SPAN = WALL.TRAY_GAP + WALL.TRAY_W + WALL.TRAY_AIR;

type Block = { teamId: string | null; guest?: boolean; members: (string | null)[]; w: number };

export function officeLayout(cfg: LayoutConfig): Plan {
  const blocks: Block[] = [];
  for (const t of cfg.teams ?? [])
    for (let i = 0; i < t.members.length; i += OL.PER_POD)
      blocks.push({ teamId: t.id, members: t.members.slice(i, i + OL.PER_POD), w: 0 });
  const solo: (string | null)[] = [...(cfg.solo ?? []), ...Array(cfg.spare ?? 0).fill(null)];
  for (let i = 0; i < solo.length; i += OL.PER_POD)
    blocks.push({ teamId: null, members: solo.slice(i, i + OL.PER_POD), w: 0 });
  const guests = cfg.guests ?? [];
  for (let i = 0; i < guests.length; i += OL.PER_POD)
    blocks.push({ teamId: null, guest: true, members: guests.slice(i, i + OL.PER_POD), w: 0 });
  for (const b of blocks) b.w = (b.members.length - 1) * OL.DX + OL.RUG;

  /* pack into ≤ 2 rows; widen the room until it fits */
  const pack = (W: number): Block[][] | null => {
    const avail = W - OL.RIGHT - OL.LEFT;
    const rows: Block[][] = [[]];
    let used = 0;
    for (const b of blocks) {
      const last = rows[rows.length - 1];
      const need = (last.length ? OL.GAP : 0) + b.w;
      if (used + need > avail && last.length) {
        rows.push([]);
        used = 0;
      }
      const cur = rows[rows.length - 1];
      cur.push(b);
      used += (cur.length > 1 ? OL.GAP : 0) + b.w;
      if (b.w > avail) return null;
    }
    return rows.length <= 2 ? rows : null;
  };
  /* the wall needs room for the planning wall + the tray before the Director's glass (W − 400) */
  const minW = Math.max(OL.MIN_W, WALL.MIN_X + WALL.PLANNING + TRAY_SPAN + 400);
  let W = Math.ceil(minW / OL.STEP) * OL.STEP;
  let rows = pack(W);
  while (!rows && W < 6000) {
    W += OL.STEP;
    rows = pack(W);
  }
  rows = rows ?? [blocks];
  const rowW = (r: Block[]) => r.reduce((s, b, i) => s + b.w + (i ? OL.GAP : 0), 0);
  /* 3+ pods that happen to fit one row still use both rows — fills the floor evenly */
  if (rows.length === 1 && blocks.length >= 3) rows.push(rows[0].splice(Math.ceil(blocks.length / 2)));

  const rowY = rows.length === 1 ? [604] : [530, 794];
  const plan: Plan = {
    W,
    rows: rowY,
    pods: [],
    seats: {},
    home: {},
    spare: [],
    director: { x: W - 208, y: 512 },
    couch: [
      { x: W - 308, y: 798 },
      { x: W - 222, y: 798 },
      { x: W - 136, y: 798 },
    ],
    lanes: { back: 432, mid: 664 },
    gaps: [],
    objects: {} as Plan['objects'],
    windows: [],
    lamps: [],
  };
  const areaL = OL.LEFT;
  const areaR = W - OL.RIGHT;
  const count: Record<string, number> = {};
  rows.forEach((r, ri) => {
    let x = areaL + (areaR - areaL - rowW(r)) / 2;
    for (const b of r) {
      const key = b.teamId ?? (b.guest ? 'guest' : 'solo');
      count[key] = count[key] ?? 0;
      const y = rowY[ri];
      const pod: Pod = {
        id: `${key}@${plan.pods.length}`,
        teamId: b.teamId,
        row: ri,
        rug: { x, y: y - 72, w: b.w, h: 136 },
        seats: [],
      };
      b.members.forEach((agentId, i) => {
        count[key] += 1;
        const sid = `${key}-${count[key]}`;
        plan.seats[sid] = { x: x + OL.RUG / 2 + i * OL.DX, y, row: ri, pod: pod.id };
        if (agentId) plan.home[agentId] = sid;
        else plan.spare.push(sid);
        pod.seats.push(sid);
      });
      plan.pods.push(pod);
      x += b.w + OL.GAP;
    }
  });

  /* crossing columns: left edge, every gap between row-0 rugs, the right column's edge */
  if (rows.length > 1) {
    const r0 = plan.pods.filter((p) => p.row === 0).sort((a, b) => a.rug.x - b.rug.x);
    plan.gaps = [30];
    r0.forEach((p, i) => {
      const n = r0[i + 1];
      if (n) plan.gaps.push((p.rug.x + p.rug.w + n.rug.x) / 2);
    });
    plan.gaps.push(W - OL.RIGHT + 24);
  }

  /* the wall: door + ship corner on the LEFT, planning wall centred over the pods, the tray after it */
  const center = (areaL + areaR) / 2;
  const gx = Math.max(WALL.MIN_X, Math.min(center - 388, W - 400 - WALL.PLANNING - TRAY_SPAN));
  const hx = gx + 104 + 528 + 28;
  const rx = hx + 116 + WALL.TRAY_GAP;
  plan.objects = {
    door: { x: 26, y: 136, w: 136, h: 250, stand: { x: 96, y: 414 }, label: 'Leave office' },
    /* the wall clock = the work clock: opens Agent time (no label under it — it's a clock) */
    clock: { x: 64, y: 40, w: 60, h: 60 },
    outbox: { x: 196, y: 262, w: 62, h: 86, stand: { x: 227, y: 424 } },
    console: { x: 282, y: 318, w: 72, h: 96, stand: { x: 318, y: 430 } },
    /* the project's portrait (OFFICE): its picture framed, name plaque under — left of the features folder */
    portrait: { x: gx - 104, y: 74, w: 80, h: 124 },
    dossier: { x: gx, y: 96, w: 80, h: 112, label: 'Features' },
    whiteboard: {
      x: gx + 104,
      y: 44,
      w: 528,
      h: 264,
      stand: { x: gx + 104 + 300, y: 416 },
      label: 'Whiteboard',
    },
    health: { x: hx, y: 76, w: 116, h: 160, label: 'Health check' },
    reports: { x: rx, y: 236, w: 92, h: 150, stand: { x: rx + 46, y: 424 }, label: 'Reports' },
    /* the Director's wall: the project's safe (Access) */
    safe: { x: W - 258, y: 112, w: 100, h: 104, label: 'Access' },
    /* STUDIO LIFE: the letterbox above the outbox (no stand: nobody walks to it), the bell on the door frame */
    mailbox: { x: 190, y: 128, w: 72, h: 96, label: 'Mail' },
    bell: { x: 164, y: 216, w: 30, h: 48, label: 'Bring someone in' },
  };
  /* windows only where there's room after the tray (a narrow room drops them first) */
  for (let x = rx + WALL.TRAY_W + 40; x + 180 <= W - 440 && plan.windows.length < 2; x += 260)
    plan.windows.push({ x });
  const nl = Math.max(3, Math.round(W / 520));
  for (let i = 0; i < nl; i++) plan.lamps.push(Math.round((W * (i + 0.5)) / nl));
  return plan;
}

/** The seat whose desk carries a team's principles binder: the captain's, else the team's first seat. */
export function binderSeat(plan: Plan, teamId: string, captain: string | null): string | null {
  const pods = plan.pods.filter((p) => p.teamId === teamId);
  if (!pods.length) return null;
  const c = captain ? plan.home[captain] : undefined;
  if (c && pods.some((p) => p.seats.includes(c))) return c;
  return pods[0].seats[0] ?? null;
}

/* where the desk's paper (right, under the monitor) and the binder (left item slot) sit, in desk units (theme.desk) */
const SPOT = { note: { x: 33, y: -44, w: 30, h: 26 }, binder: { x: -48, y: -64, w: 32, h: 40 } };
/** The hit box of a desk item in world coordinates (desks are drawn at the seat, scaled by depth). */
export function deskSpot(plan: Plan, seat: string, which: 'note' | 'binder'): Box | null {
  const s = plan.seats[seat];
  if (!s) return null;
  const k = depth(s.y);
  const b = SPOT[which];
  return { x: s.x + b.x * k, y: s.y + b.y * k, w: b.w * k, h: b.h * k };
}

/** Actor/desk depth scale (spec-office §1.1): nearer the front = a touch bigger. */
export const depth = (y: number): number => 0.82 + (0.36 * (y - 380)) / 520;
