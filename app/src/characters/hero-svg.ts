/* ============================================================
   hero.js — Character system v4: little robot minions.
   THE way every screen draws a character (spec-cast §1 interface).

   Public (unchanged from v3):
     hero(agent, opts) → HTMLDivElement.hero
     heroSVG(agent, opts) → string (same markup; setPose etc. still work on it)
     setPose(el, pose, {seated, props, holding, moving}?)
     setFacing(el, facing, {dir, look}?)        animated screen-face turn (250ms)
     setLook(el, {x,y} | 'viewer' | null)       glowing eyes slide on the screen
     heroHeadAnchor(el) → {x, y} px inside el (antenna/gear top, for overlays)
     castOf(agent, mood, size)                  v2 shim
     POSES, FACINGS, BUILDS, HAIR, ACCESSORIES, HOLDINGS, ROLE_GEAR (= costume kits), HERO_SIZES,
     MOOD_TO_POSE, POSE_TEXT, MAT
   v5 look (independent of role): HATS, TOOLS, LOOK_SLOTS, lookSlot(id), hatDecal(hat),
     lookFromLegacy(agent), randomLook(prev), lookAnchors(look, px)
     agent.look = {hat, tool, body, antenna, face, hue, decal?} — absent → derived from
     the v4 fields (role gear, build, hair, accessory, hue).
   opts: size 'xs'|'sm'|'md'|'xl'|px · pose · facing 'side'|'three-quarter'|'front'
         dir 'right'|'left' · look · seated · props · holding
         'mug'|'envelope'|'paper'|'binder'|'pen'|'none' · role (override)
         captain · armband <hex> · ghost · label · moving

   The bot: a screen face (dark glass, big glowing eyes) on a rounded head
   shell, an antenna, a small chassis, mitten arms, and a hover base — no
   legs. Identity = hue (shell) + build (chassis silhouette) + "hair"
   (antenna style) + accessory (screen/head extra). Role = headgear + tool
   + chassis decal + badge.
     build   hero → squircle head, barrel chassis, jet hover
             sprout → orb head, tiny chassis, hover pad
             bruiser → box head, wide chassis, one wheel
             lanky → dome head on a stalk neck, tall chassis, hover ring
   Semantics for a legless bot:
     seated  = hovering low (rig drops 18 units, base hidden) behind a desk —
               the screen face always clears the desk top.
     walking = gliding: slight forward lean, arms trail, thruster brighter.
   Geometry: viewBox 0 0 120 160, ground y=152, centred on x=60.
   Coordinate spaces: head-local (shell ≈ r30), torso-local (40×42),
   hand-local (origin = hand centre, long axis up, kept upright).
   ============================================================ */
/* TS port (app/src/characters): same SVG strings + the same hero.css, typed.
   Differences from the prototype: hero state lives in a WeakMap (not el._hero),
   the role label is agent.role (no global roleName()), captainPip comes from emblem.ts. */
import { COLOR_NAMES, escapeAttr, HUES, hueHex, PALETTE, shade } from '../design/palette';
import { captainPipHTML } from './emblem-svg';

export const MAT = { metal: '#c9c3dd', steel: '#8e86ad', wood: '#b9773f', paper: '#fff6e9' };
export const HERO_INK = '#241a44';
const BOT_SCREEN = '#1c1636';
const BOT_GLOW = '#e8fcff';
const BOT_HALO = '#7fe7ff';

export const POSES = ['idle', 'walking', 'typing', 'writing', 'reading', 'carrying', 'talking', 'chilling', 'sleeping',
  'celebrating', 'needs-input', 'thinking', 'frustrated', 'waiting', 'pressing', 'waving', 'salute'] as const;
export type Pose = (typeof POSES)[number];
export const FACINGS = ['side', 'three-quarter', 'front'] as const;
export type Facing = (typeof FACINGS)[number];
export const BUILDS = ['hero', 'sprout', 'bruiser', 'lanky'];
export const HAIR = ['none', 'tuft', 'spikes', 'swoop', 'bob', 'bun', 'curl'];
export const ACCESSORIES = ['none', 'glasses', 'shades', 'monocle', 'mustache', 'bow', 'freckles', 'flower'];
export const HOLDINGS = ['mug', 'envelope', 'paper', 'binder', 'pen', 'none'] as const;
export type Holding = (typeof HOLDINGS)[number];
export const HERO_SIZES = { xs: 48, sm: 96, md: 160, xl: 360 };
export type HeroSize = keyof typeof HERO_SIZES | number;
export const MOOD_TO_POSE: Record<string, Pose> = { neutral: 'idle', idle: 'idle', working: 'typing', blocked: 'needs-input', celebrate: 'celebrating' };

/* per pose: screen mouth, eyes, whether the role tool shows, default hand-held
   item, rig-level desk prop, seated by default, fx overlay. Static key poses
   (arms, lean, look…) live in hero.css as custom properties on .pose-<name>. */
type PoseDef = { mouth: string; tool?: 1; desk?: string; hold?: string; seated?: 1; eyes?: string; fx?: string };
const POSE_DEF: Record<Pose, PoseDef> = {
  idle: { mouth: 'smile', tool: 1 },
  walking: { mouth: 'smile', tool: 1 },
  typing: { mouth: 'focus', desk: 'laptop', seated: 1 },
  writing: { mouth: 'tongue', desk: 'paper', hold: 'implement' },
  reading: { mouth: 'focus', hold: 'binder' },
  carrying: { mouth: 'smile', hold: 'stack' },
  talking: { mouth: 'talk', tool: 1 },
  chilling: { mouth: 'smile', hold: 'mug', seated: 1 },
  sleeping: { mouth: 'o', eyes: 'sleep', fx: 'z' },
  celebrating: { mouth: 'grin', eyes: 'happy', tool: 1, fx: 'spark' },
  'needs-input': { mouth: 'worried', tool: 1, fx: 'bang' },
  thinking: { mouth: 'flat', tool: 1, fx: 'think' },
  frustrated: { mouth: 'wavy', eyes: 'squeeze', tool: 1 },
  waiting: { mouth: 'flat' },
  pressing: { mouth: 'focus', tool: 1 },
  waving: { mouth: 'grin', tool: 1 },
  salute: { mouth: 'smile', tool: 1 },
};
export const POSE_TEXT: Record<Pose, string> = {
  idle: 'standing by', walking: 'on the move', typing: 'writing code', writing: 'writing', reading: 'reading',
  carrying: 'carrying paperwork', talking: 'talking', chilling: 'taking a break', sleeping: 'sleeping, off shift',
  celebrating: 'celebrating', 'needs-input': 'needs your input', thinking: 'thinking', frustrated: 'fixing a failure',
  waiting: 'waiting on a teammate', pressing: 'pressing the button', waving: 'waving', salute: 'saluting',
};

/* Builds → bot silhouettes. head: neck pivot = cy + bottom*k; torso = chassis box. */
type BuildDef = {
  head: { cx: number; cy: number; r: number };
  shape: keyof typeof SHELL;
  bottom: number;
  torso: { x: number; y: number; w: number; h: number };
  sh: number;
  base: string;
};
const BUILD_DEF: Record<string, BuildDef> = {
  hero: { head: { cx: 60, cy: 58, r: 30 }, shape: 'squircle', bottom: 28, torso: { x: 41, y: 88, w: 38, h: 34 }, sh: 95, base: 'jet' },
  sprout: { head: { cx: 60, cy: 66, r: 32 }, shape: 'orb', bottom: 30, torso: { x: 44, y: 99, w: 32, h: 22 }, sh: 104, base: 'pad' },
  bruiser: { head: { cx: 60, cy: 54, r: 29 }, shape: 'box', bottom: 26, torso: { x: 33, y: 82, w: 54, h: 38 }, sh: 90, base: 'wheel' },
  lanky: { head: { cx: 60, cy: 42, r: 27 }, shape: 'dome', bottom: 24, torso: { x: 46, y: 74, w: 28, h: 46 }, sh: 81, base: 'ring' },
};
/* head shells (head-local) and chassis outlines (torso-local 40×42) */
const SHELL = {
  squircle: 'M-32 -4 C-32 -24 -24 -28 0 -28 C24 -28 32 -24 32 -4 V6 C32 24 24 28 0 28 C-24 28 -32 24 -32 6Z',
  orb: 'M-30 0 C-30 -40 30 -40 30 0 C30 40 -30 40 -30 0Z',
  box: 'M-21 -26 H21 C29 -26 33 -22 33 -14 V14 C33 22 29 26 21 26 H-21 C-29 26 -33 22 -33 14 V-14 C-33 -22 -29 -26 -21 -26Z',
  dome: 'M-29 8 C-31 -22 -18 -31 0 -31 C18 -31 31 -22 29 8 C29 19 22 24 0 24 C-22 24 -29 19 -29 8Z',
};
const CHASSIS: Record<string, string> = {
  hero: 'M8 0 H32 C37 0 40 3 40 8 V26 C40 36 32 42 22 42 H18 C8 42 0 36 0 26 V8 C0 3 3 0 8 0Z',
  sprout: 'M7 0 H33 C38 0 40 3 40 8 C40 28 32 42 20 42 C8 42 0 28 0 8 C0 3 2 0 7 0Z',
  bruiser: 'M6 0 H34 C38 0 40 2 40 6 V34 C40 39 37 42 32 42 H8 C3 42 0 39 0 34 V6 C0 2 2 0 6 0Z',
  lanky: 'M11 0 H29 C33 0 35 3 35 7 L40 33 C40 39 36 42 31 42 H9 C4 42 0 39 0 33 L5 7 C5 3 7 0 11 0Z',
};

let _heroSeq = 0;

/* ---------- geometry helpers ---------- */
/* map an absolute path (M L C Q S T H V Z) from torso-local 40×42 to rig coords */
function _tp(d: string, sx: number, sy: number, tx: number, ty: number): string {
  let cmd = 'M', i = 0;
  return d.replace(/([MLCQSTHVZ])|(-?\d*\.?\d+)/g, (_m: string, c: string | undefined, n: string) => {
    if (c) { cmd = c; i = 0; return c; }
    const v = parseFloat(n);
    let out: number;
    if (cmd === 'H') out = v * sx + tx;
    else if (cmd === 'V') out = v * sy + ty;
    else out = (i % 2 === 0) ? v * sx + tx : v * sy + ty;
    i++;
    return String(+out.toFixed(2));
  });
}
const _r = (n: number): number => +n.toFixed(2);

/* ============================================================
   ROLE GEAR — {accent, look, top, outfit, headgear, tool, badge}
   outfit = a paint decal on the chassis (no clothes — it's a bot).
   ctx: {c, dark, light, accent, cloth, T(d), TC(x,y,r,attrs), MAT}
   headgear/tool/badge are authored in head-/hand-/badge-local coords.
   `top` = highest headgear point in head-local units (for the head anchor).
   ============================================================ */
const O = 'class="o"', O2 = 'class="o2"';
/* helpers for the archetype kits (Visionary … Alchemist) */
const GLASS = BOT_GLOW; /* the screen-eye glow: the studio's "light" colour */
const STRAW = shade(PALETTE.sun, 28);
const star4 = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} C${cx + r * .14} ${cy - r * .26} ${cx + r * .26} ${cy - r * .14} ${cx + r} ${cy} C${cx + r * .26} ${cy + r * .14} ${cx + r * .14} ${cy + r * .26} ${cx} ${cy + r} C${cx - r * .14} ${cy + r * .26} ${cx - r * .26} ${cy + r * .14} ${cx - r} ${cy} C${cx - r * .26} ${cy - r * .14} ${cx - r * .14} ${cy - r * .26} ${cx} ${cy - r}Z`;
const star5 = (cx: number, cy: number, r: number) => {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * .46 : r;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${p.join(' L')}Z`;
};
/** Drawing context handed to every costume part (see _ctx). */
export type Ctx = {
  c: string; dark: string; light: string; hueKey: string; build: string; toolId: string;
  MAT: typeof MAT; g: BuildDef; sx: number; sy: number;
  X: (v: number) => number; Y: (v: number) => number;
  T: (d: string) => string; TC: (cx: number, cy: number, r: number, attrs: string) => string;
  hx: Ctx; tx: Ctx; dx: Ctx; accent: string; cloth: string; gear: Gear | null;
};
export type Gear = {
  accent: string; top: number; look: string;
  outfit?: (x: Ctx) => string; headgear?: (x: Ctx) => string; tool?: (x: Ctx) => string; badge?: (x: Ctx) => string;
};
export const ROLE_GEAR: Record<string, Gear> = {
  Frontend: {
    accent: 'teal', top: -42, look: 'headphones, giant stylus',
    outfit: x => `<path ${O2} fill="${x.accent}" d="${x.T('M-2 29 H42 V36 H-2Z')}"/>
      <g class="h-trim">${x.TC(9, 10, 1.8, `fill="${x.accent}"`)}${x.TC(9, 17, 1.8, `fill="${PALETTE.sun}"`)}</g>`,
    headgear: x => `<path d="M-31 0 C-33 -50 33 -50 31 0" fill="none" stroke="${HERO_INK}" stroke-width="10" stroke-linecap="round"/>
      <path d="M-31 0 C-33 -50 33 -50 31 0" fill="none" stroke="${x.accent}" stroke-width="5" stroke-linecap="round"/>
      <path class="h-fine" d="M-22 -28 C-14 -36 -4 -38 4 -38" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
      <rect ${O} x="-41" y="-12" width="14" height="25" rx="7" fill="${x.accent}"/>
      <rect ${O} x="27" y="-12" width="14" height="25" rx="7" fill="${x.accent}"/>
      <rect class="h-fine" x="-38" y="-7" width="4" height="14" rx="2" fill="#fff" opacity=".45"/>
      <rect class="h-fine" x="30" y="-7" width="4" height="14" rx="2" fill="#fff" opacity=".45"/>`,
    tool: x => `<g transform="rotate(8)"><path ${O} fill="${x.accent}" d="M-5 -36 H5 V5 H-5Z"/>
      <path class="h-fine" d="M-1.6 -35 V4" stroke="${shade(x.accent, -40)}" stroke-width="1.2"/>
      <path ${O} fill="${MAT.wood}" d="M-5 -36 L0 -49 L5 -36Z"/>
      <path fill="${HERO_INK}" d="M-1.8 -44.2 L0 -49 L1.8 -44.2Z"/>
      <rect ${O} x="-5" y="4" width="10" height="5" fill="${MAT.metal}"/>
      <rect ${O} x="-5" y="9" width="10" height="5" rx="2.5" fill="${PALETTE.rose}"/></g>`,
    badge: () => `<path d="M-2.2 -3 L-4.6 0 L-2.2 3 M2.2 -3 L4.6 0 L2.2 3 M0.9 -3.6 L-0.9 3.6" fill="none" stroke="${HERO_INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  Backend: {
    accent: 'sky', top: -40, look: 'welding goggles, big cog',
    outfit: x => `<path ${O2} fill="${MAT.steel}" d="${x.T('M-2 28 H42 V36 H-2Z')}"/>
      <g class="h-trim">${[6, 16, 26, 34].map(v => x.TC(v, 32, 1.3, `fill="${MAT.metal}"`)).join('')}</g>`,
    headgear: x => `<path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${HERO_INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${MAT.steel}" stroke-width="4" stroke-linecap="round"/>
      <rect ${O} x="-4" y="-27" width="8" height="5" rx="2" fill="${MAT.steel}"/>
      <circle ${O} cx="-11" cy="-28" r="10" fill="${MAT.metal}"/><circle ${O} cx="11" cy="-28" r="10" fill="${MAT.metal}"/>
      <circle ${O2} cx="-11" cy="-28" r="6" fill="${shade(x.accent, -30)}"/><circle ${O2} cx="11" cy="-28" r="6" fill="${shade(x.accent, -30)}"/>
      <circle cx="-13" cy="-30.5" r="2" fill="#fff" opacity=".85"/><circle cx="9" cy="-30.5" r="2" fill="#fff" opacity=".85"/>`,
    tool: () => {
      let d = ''; const cx = 0, cy = -21, ro = 18, ri = 13.5, n = 8;
      for (let i = 0; i < n * 4; i++) {
        const a = (i / (n * 4)) * Math.PI * 2 - Math.PI / 2; const rr = (i % 4 < 2) ? ro : ri;
        d += (i ? 'L' : 'M') + _r(cx + Math.cos(a) * rr) + ' ' + _r(cy + Math.sin(a) * rr) + ' ';
      }
      return `<path ${O} fill="${MAT.steel}" d="${d}Z"/><circle ${O2} cx="0" cy="-21" r="9" fill="${MAT.metal}"/>
        <circle ${O2} cx="0" cy="-21" r="4" fill="${HERO_INK}"/><path class="h-fine" d="M-9 -30 A12 12 0 0 1 2 -33" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>`;
    },
    badge: () => `<circle cx="0" cy="0" r="2.6" fill="none" stroke="${HERO_INK}" stroke-width="1.5"/><path d="M0 -4.6 V-3 M0 3 V4.6 M-4.6 0 H-3 M3 0 H4.6 M-3.2 -3.2 L-2.2 -2.2 M2.2 2.2 L3.2 3.2 M3.2 -3.2 L2.2 -2.2 M-2.2 2.2 L-3.2 3.2" stroke="${HERO_INK}" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  Design: {
    accent: 'rose', top: -50, look: 'beret, paint palette and brush',
    outfit: x => `<g class="h-trim">${x.TC(9, 24, 3.4, `fill="${PALETTE.sun}"`)}${x.TC(30, 31, 2.8, `fill="${PALETTE.teal}"`)}${x.TC(15, 34, 2.2, `fill="${PALETTE.coral}"`)}${x.TC(32, 11, 1.8, `fill="${PALETTE.sky}"`)}</g>`,
    headgear: x => `<path ${O} fill="${x.accent}" d="M-29 -14 C-34 -34 -6 -46 16 -42 C36 -38 46 -26 41 -15 C36 -10 22 -12 8 -12 C-6 -12 -20 -8 -29 -14Z"/>
      <path class="h-fine" d="M-20 -30 C-10 -38 4 -40 12 -39" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".45"/>
      <path ${O} fill="${x.accent}" d="M4 -43 C3 -49 9 -51 10 -46 Z"/>`,
    tool: x => `<path ${O} fill="${MAT.wood}" d="M7 -6 L14 -50 L18 -49 L11 -5Z"/>
      <path ${O} fill="${x.accent}" d="M14 -50 C13 -56 15 -60 17 -61 C19 -58 19 -53 18 -49Z"/>
      <path ${O} fill="${MAT.wood}" d="M-15 -30 C-18 -40 -8 -46 2 -44 C12 -42 15 -34 10 -28 C7 -25 3 -27 1 -24 C-1 -20 4 -17 1 -13 C-3 -9 -12 -14 -15 -30Z"/>
      <circle ${O2} cx="-2" cy="-31" r="2.8" fill="${shade(MAT.wood, -50)}"/>
      <circle cx="-9" cy="-35" r="3" fill="${PALETTE.coral}" class="o2"/><circle cx="0" cy="-40" r="3" fill="${PALETTE.sun}" class="o2"/>
      <circle cx="7" cy="-35" r="2.8" fill="${PALETTE.teal}" class="o2"/><circle cx="-9" cy="-26" r="2.6" fill="${PALETTE.sky}" class="o2"/>`,
    badge: () => `<path d="M0 -4.6 L3.4 -0.4 L1.4 4 H-1.4 L-3.4 -0.4Z" fill="${HERO_INK}"/><path d="M0 -1.6 V2.4" stroke="#fff" stroke-width="1"/>`,
  },
  QA: {
    accent: 'coral', top: -38, look: 'detective cap, magnifier',
    outfit: x => `<path ${O2} fill="${x.cloth}" d="${x.T('M-2 28 H42 V35 H-2Z')}"/>
      <rect class="o2 h-trim" x="${_r(x.X(16))}" y="${_r(x.Y(27.5))}" width="${_r(8 * x.sx)}" height="${_r(8 * x.sy)}" rx="1" fill="${MAT.metal}"/>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-31 -14 C-36 -6 -34 6 -27 9 C-25 0 -25 -6 -26 -14Z"/>
      <path ${O} fill="${x.cloth}" d="M31 -14 C36 -6 34 6 27 9 C25 0 25 -6 26 -14Z"/>
      <path ${O} fill="${shade(x.cloth, -16)}" d="M-18 -15 C-30 -18 -40 -14 -43 -8 C-34 -6 -24 -8 -16 -10Z"/>
      <path ${O} fill="${shade(x.cloth, -16)}" d="M18 -15 C30 -18 40 -14 43 -8 C34 -6 24 -8 16 -10Z"/>
      <path ${O} fill="${x.cloth}" d="M-29 -11 C-31 -42 31 -42 29 -11 C18 -15 -18 -15 -29 -11Z"/>
      <path class="h-fine" d="M-20 -22 L20 -22 M-24 -16 L24 -16 M-8 -33 L-12 -13 M8 -33 L12 -13" stroke="${x.accent}" stroke-width="1.3" opacity=".7" fill="none"/>
      <path ${O2} fill="${x.accent}" d="M-6 -34 C-6 -40 6 -40 6 -34 C3 -36 -3 -36 -6 -34Z"/>`,
    tool: () => `<rect ${O} x="-3" y="-17" width="6" height="25" rx="3" fill="${MAT.wood}"/>
      <circle cx="0" cy="-30" r="12" fill="#fff" opacity=".28"/>
      <circle cx="0" cy="-30" r="12" fill="none" stroke="${HERO_INK}" stroke-width="8"/>
      <circle cx="0" cy="-30" r="12" fill="none" stroke="${MAT.metal}" stroke-width="4"/>
      <path d="M-6 -35 A7 7 0 0 1 1 -38" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
    badge: () => `<ellipse cx="0" cy="0.8" rx="2.6" ry="3.4" fill="${HERO_INK}"/><circle cx="0" cy="-3" r="1.6" fill="${HERO_INK}"/><path d="M-2.4 -1 L-4.6 -2 M2.4 -1 L4.6 -2 M-2.6 1.4 L-4.8 1.4 M2.6 1.4 L4.8 1.4 M-2.2 3.4 L-4 4.8 M2.2 3.4 L4 4.8" stroke="${HERO_INK}" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  Data: {
    accent: 'mint', top: -37, look: 'miner\'s headlamp, pickaxe',
    outfit: x => `<g class="h-trim"><path ${O2} fill="${BOT_SCREEN}" d="${x.T('M5 20 H17 V34 H5Z')}"/>
      <path fill="${x.accent}" d="${x.T('M7 30 H9 V32 H7Z M10 26 H12 V32 H10Z M13 23 H15 V32 H13Z')}"/></g>`,
    headgear: x => `<path d="M40 -50 L10 -33 L13 -22 L48 -24Z" fill="${MAT.paper}" opacity=".3"/><path d="M26 -41 L10 -33 L13 -22 L30 -24Z" fill="${x.accent}" opacity=".45"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${HERO_INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${x.cloth}" stroke-width="4" stroke-linecap="round"/>
      <rect ${O} x="-6" y="-35" width="16" height="15" rx="4" fill="${MAT.steel}"/>
      <circle ${O2} cx="6" cy="-27.5" r="5.6" fill="${MAT.paper}"/><circle cx="6" cy="-27.5" r="2.6" fill="${x.accent}"/>`,
    tool: () => `<rect ${O} x="-2.8" y="-38" width="5.6" height="46" rx="2.8" fill="${MAT.wood}"/>
      <path ${O} fill="${MAT.steel}" d="M-17 -33 C-10 -46 10 -46 17 -33 L13 -32 C7 -39 -7 -39 -13 -32Z"/>
      <rect ${O2} x="-4" y="-42" width="8" height="7" rx="1.5" fill="${MAT.metal}"/>
      <path class="h-fine" d="M-11 -37 C-6 -41 2 -42 6 -41" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>`,
    badge: () => `<path d="M-4.2 4 V0.5 H-2 V4Z M-1.1 4 V-1.6 H1.1 V4Z M2 4 V-4 H4.2 V4Z" fill="${HERO_INK}"/>`,
  },
  DevOps: {
    accent: 'sun-deep', top: -42, look: 'hard hat, hi-vis stripes, wrench',
    outfit: x => `<path ${O2} fill="${x.accent}" d="${x.T('M-2 22 H42 V38 H-2Z')}"/>
      <path class="h-trim" fill="${PALETTE.sun}" d="${x.T('M-2 26 H42 V29 H-2Z M-2 32 H42 V35 H-2Z')}"/>`,
    headgear: x => `<path ${O} fill="${x.accent}" d="M-27 -15 C-28 -48 28 -48 27 -15Z"/>
      <path ${O2} fill="${shade(x.accent, 22)}" d="M-4.5 -40 C-2 -42.5 2 -42.5 4.5 -40 L4.5 -16 L-4.5 -16Z"/>
      <path class="h-fine" d="M-18 -29 C-15 -35 -10 -38 -6 -39" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
      <path ${O} fill="${shade(x.accent, -22)}" d="M-37 -16 C-37 -21 37 -21 37 -16 C37 -11 -37 -11 -37 -16Z"/>`,
    tool: () => `<rect ${O} x="-3.4" y="-27" width="6.8" height="34" rx="3" fill="${MAT.steel}"/>
      <path ${O} fill="${MAT.steel}" d="M-3.8 -46 L-3.8 -37 L3.8 -37 L3.8 -46 C10 -44 13 -37 10 -30 C8 -26 4 -25 3 -25 L-3 -25 C-4 -25 -8 -26 -10 -30 C-13 -37 -10 -44 -3.8 -46Z"/>
      <path class="h-fine" d="M-7 -40 C-6 -43 -5 -44 -4 -44.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>
      <circle ${O2} cx="0" cy="-12" r="1.6" fill="${HERO_INK}"/>`,
    badge: () => `<path d="M0 0 C-1 -3 -4.6 -3 -4.6 0 C-4.6 3 -1 3 0 0 C1 -3 4.6 -3 4.6 0 C4.6 3 1 3 0 0Z" fill="none" stroke="${HERO_INK}" stroke-width="1.5"/>`,
  },
  Research: {
    accent: 'grape', top: -42, look: 'mortarboard, open book',
    outfit: x => `<path ${O2} fill="${x.accent}" d="${x.T('M-2 30 H42 V36 H-2Z')}"/>
      <g class="h-trim">${x.TC(9, 12, 1.7, `${O2} fill="${MAT.paper}"`)}${x.TC(9, 20, 1.7, `${O2} fill="${MAT.paper}"`)}</g>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-24 -15 C-25 -31 25 -31 24 -15 C12 -19 -12 -19 -24 -15Z"/>
      <path ${O} fill="${shade(x.cloth, -14)}" d="M-34 -31 L2 -43 L34 -31 L-2 -21Z"/>
      <path class="h-fine" d="M-26 -31 L2 -40" stroke="#fff" stroke-width="1.4" opacity=".35"/>
      <circle cx="0" cy="-32" r="2.4" fill="${PALETTE.sun}"/>
      <path d="M0 -32 L24 -29 L26 -15" fill="none" stroke="${HERO_INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M0 -32 L24 -29 L26 -15" fill="none" stroke="${PALETTE.sun}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path ${O2} fill="${PALETTE.sun}" d="M23 -17 H29 L30 -7 H22Z"/>`,
    tool: x => `<path ${O} fill="${x.cloth}" d="M-19 -42 C-11 -45 -3 -44 0 -40 C3 -44 11 -45 19 -42 L19 -6 C11 -9 3 -8 0 -5 C-3 -8 -11 -9 -19 -6Z"/>
      <path ${O2} fill="${MAT.paper}" d="M-17 -41 C-10 -43 -3 -42 0 -38 L0 -7 C-3 -11 -10 -11 -17 -8Z"/>
      <path ${O2} fill="${MAT.paper}" class="h-page" d="M17 -41 C10 -43 3 -42 0 -38 L0 -7 C3 -11 10 -11 17 -8Z"/>
      <path class="h-fine" d="M-14 -34 H-4 M-14 -29 H-4 M-14 -24 H-6 M-14 -19 H-4 M4 -34 H14 M4 -29 H14 M4 -24 H11 M4 -19 H14" stroke="${MAT.steel}" stroke-width="1.4" stroke-linecap="round"/>`,
    badge: () => `<circle cx="0" cy="-1.2" r="2.9" fill="${HERO_INK}"/><rect x="-1.5" y="1.6" width="3" height="2.8" rx=".6" fill="${HERO_INK}"/><circle cx="-0.9" cy="-2.1" r=".8" fill="#fff"/>`,
  },
  Writer: {
    accent: 'sun', top: -50, look: 'newsboy cap with a quill, giant quill',
    outfit: x => `<path ${O2} fill="${x.accent}" d="${x.T('M2 -1 C10 6 30 6 38 -1 L38 6 C30 12 10 12 2 6Z')}"/>
      <path ${O2} fill="${x.accent}" d="${x.T('M9 7 L5 24 L12 22 L15 8Z')}"/>`,
    headgear: x => `<path ${O} fill="${MAT.paper}" d="M-25 -4 C-38 -20 -38 -40 -33 -52 C-28 -40 -22 -22 -25 -4Z"/>
      <path d="M-25 -6 C-30 -22 -32 -38 -33 -50" fill="none" stroke="${MAT.steel}" stroke-width="1.4"/>
      <path ${O} fill="${x.cloth}" d="M-30 -13 C-35 -36 -6 -46 12 -42 C30 -38 35 -24 30 -13 C14 -17 -14 -17 -30 -13Z"/>
      <path class="h-fine" d="M-14 -40 L-2 -16 M8 -42 L6 -16" stroke="${shade(x.cloth, -28)}" stroke-width="1.3" fill="none"/>
      <circle ${O2} cx="3" cy="-42" r="2.8" fill="${shade(x.cloth, -18)}"/>
      <path ${O} fill="${shade(x.cloth, -20)}" d="M12 -16 C26 -19 39 -16 43 -11 C34 -9 22 -10 10 -11Z"/>`,
    tool: () => `<path ${O} fill="${MAT.paper}" d="M2 -4 C-14 -16 -15 -40 3 -56 C12 -42 14 -18 2 -4Z"/>
      <path d="M2 -4 C3 -22 3 -38 3 -54" fill="none" stroke="${MAT.steel}" stroke-width="1.6"/>
      <path class="h-fine" d="M3 -44 L-6 -38 M3 -36 L-8 -29 M3 -28 L-7 -21 M3 -40 L10 -35 M3 -31 L11 -25 M3 -22 L9 -17" stroke="${MAT.steel}" stroke-width="1.1"/>
      <path ${O2} fill="${HERO_INK}" d="M0.4 -5 L4.4 -5 L2 8Z"/>`,
    badge: () => `<path d="M1.4 4.4 V-4.2 M3.6 4.4 V-4.2 M4.4 -4.2 H0 C-2.6 -4.2 -3.6 -2.8 -3.6 -1.2 C-3.6 0.6 -2.4 1.6 0 1.6 H1.4" fill="none" stroke="${HERO_INK}" stroke-width="1.4"/>`,
  },
  Release: {
    accent: 'grape', top: -44, look: 'captain\'s peaked cap, flag',
    outfit: x => `<g class="h-trim">${[10, 20, 30].map(y => x.TC(9, y, 2, `${O2} fill="${PALETTE.sun}"`)).join('')}</g>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-27 -22 L27 -22 L26 -13 C10 -16 -10 -16 -26 -13Z"/>
      <path ${O} fill="${MAT.paper}" d="M-34 -26 C-36 -37 -18 -44 0 -44 C18 -44 36 -37 34 -26 C24 -20 -24 -20 -34 -26Z"/>
      <path class="h-fine" d="M-24 -35 C-14 -40 4 -41 14 -39" fill="none" stroke="${MAT.metal}" stroke-width="1.6"/>
      <path ${O} fill="${HERO_INK}" d="M-6 -14 C8 -16 22 -14 30 -9 C20 -7 7 -8 -8 -10Z"/>
      <circle ${O2} cx="0" cy="-18" r="4.4" fill="${PALETTE.sun}"/>
      <path d="M0 -21 V-15 M-2.2 -16.6 C-1.4 -15 1.4 -15 2.2 -16.6 M-1.4 -20 H1.4" fill="none" stroke="${HERO_INK}" stroke-width="1" stroke-linecap="round"/>`,
    tool: () => `<rect ${O} x="-2.2" y="-46" width="4.4" height="54" rx="2.2" fill="${MAT.wood}"/>
      <circle ${O} cx="0" cy="-48" r="3.4" fill="${PALETTE.sun}"/>
      <path ${O} fill="${PALETTE.coral}" class="o h-flag" d="M2 -44 C10 -46 18 -40 28 -38 C18 -34 10 -30 2 -30Z"/>`,
    badge: () => `<path d="M-2.6 4.4 V-4.4" stroke="${HERO_INK}" stroke-width="1.4" stroke-linecap="round"/><path d="M-2 -4.2 L4.4 -2.2 L-2 0Z" fill="${HERO_INK}"/>`,
  },
  Quality: {
    accent: 'mint', top: -56, look: 'knight\'s helm with plume, broom-lance',
    outfit: x => `<path class="h-fine" fill="none" stroke="${x.dark}" stroke-width="1.2" d="${x.T('M0 12 H40 M0 22 H40')}"/>
      <path ${O2} fill="${x.accent}" d="${x.T('M16 -1 H24 V44 H16Z')}"/>`,
    headgear: x => `<path ${O} fill="${x.accent}" d="M2 -38 C-6 -58 -30 -60 -40 -44 C-33 -48 -25 -47 -20 -40 C-26 -43 -32 -40 -35 -33 C-24 -44 -10 -42 -2 -35Z"/>
      <path ${O} fill="${MAT.metal}" d="M-31 -10 C-32 -48 32 -48 31 -10 C24 -15 14 -16 0 -16 C-14 -16 -24 -15 -31 -10Z"/>
      <path ${O} fill="${MAT.steel}" d="M-22 -27 C-10 -36 20 -36 28 -25 L27 -19 C16 -27 -10 -27 -21 -21Z"/>
      <path class="h-fine" d="M-10 -27 V-23 M-2 -28 V-24 M6 -28 V-24 M14 -27 V-23" stroke="${HERO_INK}" stroke-width="1.6" stroke-linecap="round"/>
      <path class="h-fine" d="M-20 -36 C-14 -41 -6 -43 2 -43" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
    tool: x => `<rect ${O} x="-2.6" y="-48" width="5.2" height="58" rx="2.6" fill="${MAT.wood}"/>
      <path ${O} fill="${MAT.paper}" d="M-9 -48 C-11 -58 -4 -66 0 -70 C4 -66 11 -58 9 -48 Z"/>
      <path class="h-fine" d="M-4 -50 L-2 -64 M0 -50 V-66 M4 -50 L2 -64" stroke="${MAT.wood}" stroke-width="1.2"/>
      <rect ${O2} x="-7" y="-51" width="14" height="5" rx="2" fill="${x.accent}"/>`,
    badge: () => `<path d="M0 -4.8 C0.6 -1.2 1.2 -0.6 4.8 0 C1.2 0.6 0.6 1.2 0 4.8 C-0.6 1.2 -1.2 0.6 -4.8 0 C-1.2 -0.6 -0.6 -1.2 0 -4.8Z" fill="${HERO_INK}"/>`,
  },
  Director: {
    accent: 'sun', top: -50, look: 'director\'s cap, megaphone',
    outfit: x => `<path ${O2} fill="${PALETTE.coral}" d="${x.T('M-2 4 L8 -2 L44 30 L40 40Z')}"/>`,
    headgear: x => `<path ${O} fill="${shade(x.cloth, -26)}" d="M-21 -24 L-19 -46 C-7 -51 7 -51 19 -46 L21 -24Z"/>
      <path ${O2} fill="${PALETTE.sun}" d="M-21 -32 L21 -32 L21 -25 L-21 -25Z"/>
      <path ${O} fill="${shade(x.cloth, -12)}" d="M-30 -20 C-20 -29 22 -29 40 -18 C30 -13 -18 -14 -30 -20Z"/>
      <path class="h-fine" d="M-14 -44 C-8 -47 0 -48 6 -47" fill="none" stroke="#fff" stroke-width="1.6" opacity=".4"/>`,
    tool: () => `<rect ${O} x="-3.2" y="-12" width="6.4" height="16" rx="2" fill="${MAT.steel}"/>
      <path ${O} fill="${PALETTE.sun}" d="M-4.5 -10 L-14 -42 C-6 -46 6 -46 14 -42 L4.5 -10Z"/>
      <ellipse ${O} cx="0" cy="-42.5" rx="14" ry="4.2" fill="${shade(PALETTE.sun, -40)}"/>
      <path class="h-fine" d="M-7 -36 L-3 -14" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
    badge: () => `<path d="M0 -4.4 L4.4 3.6 H-4.4Z" fill="${HERO_INK}"/>`,
  },
  /* v5 system-crew kits (not roles): technician belt + clipboard, inventor loupe + blueprint, conductor baton */
  Technician: {
    accent: 'sun-deep', top: 0, look: 'tool belt, clipboard',
    outfit: x => `<path ${O2} fill="${MAT.wood}" d="${x.T('M-2 26 H42 V33 H-2Z')}"/>
      <path ${O2} fill="${shade(MAT.wood, -28)}" d="${x.T('M4 30 H13 V40 C13 41 12 42 11 42 H6 C5 42 4 41 4 40Z M27 30 H36 V39 H27Z')}"/>
      <path class="o2 h-trim" fill="${PALETTE.sun}" d="${x.T('M16.5 25 H23.5 V34 H16.5Z')}"/>`,
    tool: x => `<g transform="rotate(-8)"><rect ${O} x="-13" y="-44" width="26" height="36" rx="3.5" fill="${MAT.wood}"/>
      <rect ${O2} x="-10" y="-40" width="20" height="29" rx="1.5" fill="${MAT.paper}"/>
      <rect ${O} x="-6.5" y="-48" width="13" height="8" rx="2.5" fill="${MAT.steel}"/>
      <path class="h-fine" d="M-3 -32 H7 M-3 -25.5 H7 M-3 -19 H4" stroke="${MAT.steel}" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M-8 -32.5 L-6.6 -31 L-4.6 -34 M-8 -26 L-6.6 -24.5 L-4.6 -27.5" fill="none" stroke="${x.accent}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    badge: () => `<circle cx="1.6" cy="-1.6" r="2.4" fill="none" stroke="${HERO_INK}" stroke-width="1.5"/><path d="M-0.2 0.2 L-3.6 3.6" stroke="${HERO_INK}" stroke-width="2" stroke-linecap="round"/>`,
  },
  Inventor: {
    accent: 'teal', top: -48, look: 'inventor\'s loupe headband, blueprint',
    outfit: x => `<path ${O2} fill="${MAT.paper}" d="${x.T('M23 9 H36 V23 C36 24 35 25 34 25 H25 C24 25 23 24 23 23Z')}"/>
      <g class="h-trim"><rect x="${_r(x.X(25.5))}" y="${_r(x.Y(4))}" width="${_r(2.6 * x.sx)}" height="${_r(8 * x.sy)}" rx="1" fill="${PALETTE.coral}"/>
      <rect x="${_r(x.X(30))}" y="${_r(x.Y(5.5))}" width="${_r(2.6 * x.sx)}" height="${_r(6.5 * x.sy)}" rx="1" fill="${PALETTE.sky}"/></g>`,
    headgear: x => `<path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${HERO_INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${x.cloth}" stroke-width="4" stroke-linecap="round"/>
      <path d="M21 -17 L19 -30" stroke="${HERO_INK}" stroke-width="5" stroke-linecap="round"/><path d="M21 -17 L19 -30" stroke="${MAT.steel}" stroke-width="2.2" stroke-linecap="round"/>
      <circle ${O} cx="17" cy="-37" r="10" fill="${MAT.metal}"/>
      <circle ${O2} cx="17" cy="-37" r="6.2" fill="${x.accent}" opacity=".85"/>
      <circle cx="15" cy="-39.4" r="2.2" fill="#fff" opacity=".85"/>
      <circle ${O} cx="-13" cy="-30" r="6.4" fill="${MAT.paper}"/>
      <rect ${O2} x="-16.4" y="-25" width="6.8" height="4.6" rx="1.4" fill="${MAT.steel}"/>
      <path class="h-fine" d="M-15.5 -30.5 L-14 -33 L-12 -29 L-10.5 -31.5" fill="none" stroke="${PALETTE.sun}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    tool: () => `<g transform="rotate(8)"><path ${O} fill="${PALETTE.sky}" d="M3 -44 H24 V-12 H3Z"/>
      <path class="h-fine" d="M7 -38 H20 M7 -32 H20 M7 -26 H20 M7 -20 H20 M11 -42 V-14 M17 -42 V-14" stroke="#fff" stroke-width="1" opacity=".55"/>
      <path class="h-fine" d="M8 -36 L14 -30 L19 -36" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" opacity=".9"/>
      <rect ${O} x="-5" y="-48" width="10" height="44" rx="5" fill="${shade(PALETTE.sky, -18)}"/>
      <ellipse ${O2} cx="0" cy="-47" rx="5" ry="2.4" fill="${shade(PALETTE.sky, 30)}"/></g>`,
    badge: () => `<path d="M0 -4.6 C2.8 -4.6 4 -2.4 4 -0.8 C4 1 2.4 1.8 2.2 3 H-2.2 C-2.4 1.8 -4 1 -4 -0.8 C-4 -2.4 -2.8 -4.6 0 -4.6Z" fill="${HERO_INK}"/><path d="M-1.6 4.6 H1.6" stroke="${HERO_INK}" stroke-width="1.3" stroke-linecap="round"/>`,
  },
  Conductor: {
    accent: 'grape', top: 0, look: 'conductor\'s baton',
    tool: () => `<g transform="rotate(16)"><rect ${O} x="-1.8" y="-50" width="3.6" height="46" rx="1.8" fill="${MAT.paper}"/>
      <ellipse ${O} cx="0" cy="-5" rx="3.8" ry="5.6" fill="${MAT.wood}"/></g>
      <g class="h-fine"><path d="M14 -46 V-36" stroke="${PALETTE.sun}" stroke-width="1.6"/><ellipse cx="11.6" cy="-36" rx="3" ry="2.2" fill="${PALETTE.sun}"/></g>`,
  },

  /* ---- archetype kits (Blair, 2026-11-15) — keys are the server's role ids ---- */
  /* Sola Simplex — the product visionary. No hat on purpose: the eraser is the whole costume. */
  Visionary: {
    accent: 'sky', top: 0, look: 'nothing on the head; one giant eraser',
    outfit: x => `<g class="h-trim">${x.TC(9, 12, 2.2, `${O2} fill="${x.accent}"`)}</g>`,
    tool: x => `<g transform="rotate(-10)">
      <path ${O} fill="${PALETTE.rose}" d="M-14 -35 C-14 -43 -8 -47 0 -47 H11 C13 -47 14 -46 14 -44 V-8 C14 -6 13 -5 11 -5 H-11 C-13 -5 -14 -6 -14 -8Z"/>
      <path class="h-fine" d="M-9 -40 C-7 -43 -4 -44 -1 -44" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>
      <rect ${O2} x="-14" y="-27" width="28" height="13" fill="${x.accent}"/>
      <path class="h-fine" d="M-10 -20.5 H10" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>
      <g class="h-fine" fill="${PALETTE.rose}"><circle cx="-19" cy="-46" r="1.6"/><circle cx="-22" cy="-40" r="1.2"/><circle cx="-16" cy="-52" r="1"/></g></g>`,
    badge: () => `<path d="M-3.6 0 H3.6" stroke="${HERO_INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  },
  /* Brisk Ignis — the daring engineer-founder. */
  Moonshot: {
    accent: 'coral', top: -52, look: 'launch visor with a tail fin, toy rocket',
    outfit: x => `<path ${O2} fill="${x.accent}" d="${x.T('M4 30 L20 22 L36 30 V35 L20 27 L4 35Z')}"/>`,
    headgear: x => `<path ${O} fill="${x.accent}" d="M4 -37 C10 -48 20 -53 25 -51 C23 -44 19 -38 14 -33Z"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${HERO_INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${MAT.steel}" stroke-width="4" stroke-linecap="round"/>
      <path ${O} fill="${MAT.metal}" d="M-27 -21 C-23 -43 23 -43 27 -21 C16 -27 -16 -27 -27 -21Z"/>
      <path ${O2} fill="${shade(PALETTE.sky, -24)}" d="M-20 -25 C-16 -37 16 -37 20 -25 C12 -28 -12 -28 -20 -25Z"/>
      <path class="h-fine" d="M-12 -31 C-8 -34 -2 -35 3 -35" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`,
    tool: x => `<g transform="rotate(14)">
      <path class="h-flame" fill="${PALETTE['sun-deep']}" d="M-5 -14 C-6 -7 -2 -3 0 1 C2 -3 6 -7 5 -14Z"/>
      <path fill="${PALETTE.sun}" d="M-2.6 -14 C-3 -10 -1 -7 0 -5 C1 -7 3 -10 2.6 -14Z"/>
      <path ${O} fill="${x.accent}" d="M-7 -26 L-14 -12 L-7 -15Z M7 -26 L14 -12 L7 -15Z"/>
      <path ${O} fill="${MAT.paper}" d="M0 -56 C8 -48 9 -34 7 -15 H-7 C-9 -34 -8 -48 0 -56Z"/>
      <path ${O2} fill="${x.accent}" d="M0 -56 C4.6 -51.4 6.6 -46.6 7.4 -42 H-7.4 C-6.6 -46.6 -4.6 -51.4 0 -56Z"/>
      <circle ${O2} cx="0" cy="-32" r="3.8" fill="${PALETTE.sky}"/>
      <circle class="h-fine" cx="-1.2" cy="-33.2" r="1.2" fill="#fff" opacity=".85"/>
      <rect ${O2} x="-4.4" y="-16" width="8.8" height="4" rx="1" fill="${MAT.steel}"/></g>`,
    badge: () => `<path d="M0 -4.6 L3.4 2.2 L0 0.6 L-3.4 2.2Z" fill="${HERO_INK}"/><circle cx="0" cy="3.8" r="1" fill="${HERO_INK}"/>`,
  },
  /* Tally Starboard — the starship navigator. */
  Navigator: {
    accent: 'teal', top: -46, look: 'star-crest headband, brass star compass',
    outfit: x => `<g class="h-trim"><path class="h-fine" d="${x.T('M8 10 L15 18 L11 26')}" fill="none" stroke="${PALETTE.sun}" stroke-width="1.2"/>
      ${x.TC(8, 10, 1.9, `fill="${PALETTE.sun}"`)}${x.TC(15, 18, 1.5, `fill="${PALETTE.sun}"`)}${x.TC(11, 26, 1.7, `fill="${PALETTE.sun}"`)}</g>`,
    headgear: x => `<path d="M-31 -13 C-20 -22 20 -22 31 -13" fill="none" stroke="${HERO_INK}" stroke-width="9" stroke-linecap="round"/>
      <path d="M-31 -13 C-20 -22 20 -22 31 -13" fill="none" stroke="${x.accent}" stroke-width="4.6" stroke-linecap="round"/>
      <path ${O} fill="${PALETTE.sun}" d="${star4(0, -32, 16)}"/>
      <circle ${O2} cx="0" cy="-32" r="3.8" fill="${GLASS}"/>
      <path class="h-fine" d="M-1.6 -41 C-1 -38 -0.6 -36.6 0 -35.6" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`,
    tool: x => `<rect ${O} x="-2.8" y="-17" width="5.6" height="24" rx="2.8" fill="${MAT.wood}"/>
      <circle cx="0" cy="-31" r="13" fill="none" stroke="${HERO_INK}" stroke-width="8"/>
      <circle cx="0" cy="-31" r="13" fill="none" stroke="${PALETTE.sun}" stroke-width="4"/>
      <ellipse class="h-fine" cx="0" cy="-31" rx="13" ry="4.6" fill="none" stroke="${shade(PALETTE.sun, -40)}" stroke-width="1.4" transform="rotate(-24 0 -31)"/>
      <path ${O2} fill="${GLASS}" d="${star4(0, -31, 6.4)}"/>
      <circle ${O2} cx="10.6" cy="-38.6" r="3.2" fill="${x.accent}"/>`,
    badge: () => `<circle r="2.2" fill="${HERO_INK}"/><ellipse rx="4.6" ry="1.8" fill="none" stroke="${HERO_INK}" stroke-width="1.2" transform="rotate(-20)"/>`,
  },
  /* Sable Quietstar — the space-opera knight-guardian. */
  Warden: {
    accent: 'grape', top: -52, look: 'soft pointed hood, staff with a floating crystal',
    outfit: x => `<path ${O2} fill="${x.cloth}" d="${x.T('M4 -1 L20 18 L36 -1 L30 -1 L20 11 L10 -1Z')}"/>`,
    headgear: x => `<path ${O} fill="${x.cloth}" fill-rule="evenodd" d="M-35 16 C-38 -14 -22 -38 2 -44 C10 -46 18 -48 24 -52 C24 -44 30 -36 34 -22 C38 -8 37 6 35 16 Z M-27 14 C-28 -10 -18 -21 0 -21 C18 -21 28 -10 27 14 Z"/>
      <path class="h-fine" d="M-31 8 C-32 -12 -20 -26 0 -27" fill="none" stroke="${x.accent}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
      <path class="h-fine" d="M6 -41 C12 -43 17 -45 21 -48" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".3"/>`,
    tool: x => `<rect ${O} x="-2.6" y="-50" width="5.2" height="60" rx="2.6" fill="${MAT.wood}"/>
      <path d="M-1 -49 C-9 -54 -10 -64 -5 -71 M1 -49 C9 -54 10 -64 5 -71" fill="none" stroke="${HERO_INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-1 -49 C-9 -54 -10 -64 -5 -71 M1 -49 C9 -54 10 -64 5 -71" fill="none" stroke="${MAT.steel}" stroke-width="2.2" stroke-linecap="round"/>
      <g class="h-float"><circle cx="0" cy="-62" r="10" fill="${GLASS}" opacity=".3"/>
      <path ${O2} fill="${shade(x.accent, 40)}" d="M0 -72 L5.4 -62 L0 -52 L-5.4 -62Z"/>
      <path class="h-fine" d="M-1.6 -66 L0 -69" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/></g>`,
    badge: () => `<circle cy="-1.4" r="2.2" fill="${HERO_INK}"/><path d="M-1.3 -0.4 L-2.2 4.2 H2.2 L1.3 -0.4Z" fill="${HERO_INK}"/>`,
  },
  /* Rivet Dash — the space-opera rogue. */
  Rogue: {
    accent: 'sun', top: -44, look: 'tilted aviator cap, one flap up; grappling hook',
    outfit: x => `<path ${O2} fill="${MAT.wood}" d="${x.T('M32 -2 L42 4 L2 44 L-4 36Z')}"/>`,
    headgear: x => `<g transform="rotate(-8)">
      <path ${O} fill="${MAT.wood}" d="M-29 -14 C-34 -4 -33 8 -27 12 C-24 4 -24 -4 -25 -13Z"/>
      <path ${O} fill="${MAT.wood}" d="M27 -15 C33 -22 39 -30 38 -37 C32 -32 27 -25 23 -18Z"/>
      <path ${O} fill="${MAT.wood}" d="M-29 -12 C-31 -40 29 -40 29 -12 C18 -16 -18 -16 -29 -12Z"/>
      <path d="M-27 -13 C-16 -17 16 -17 27 -13" fill="none" stroke="${MAT.paper}" stroke-width="3" stroke-linecap="round"/>
      <path class="h-fine" d="M-18 -30 C-12 -35 -4 -37 2 -37" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>
      <circle ${O2} cx="-8" cy="-26" r="4.6" fill="${x.accent}"/>
      <path d="${star4(-8, -26, 3)}" fill="${HERO_INK}"/></g>`,
    tool: () => `<path class="h-rope" d="M0 -14 C14 -14 18 0 8 5 C0 9 -7 3 -3 -4" fill="none" stroke="${HERO_INK}" stroke-width="5.4" stroke-linecap="round"/>
      <path class="h-rope" d="M0 -14 C14 -14 18 0 8 5 C0 9 -7 3 -3 -4" fill="none" stroke="${MAT.wood}" stroke-width="2.6" stroke-linecap="round"/>
      <rect ${O} x="-2.4" y="-42" width="4.8" height="30" rx="2.4" fill="${MAT.steel}"/>
      <path d="M0 -40 C-11 -40 -13 -49 -8 -54 M0 -40 C11 -40 13 -49 8 -54 M0 -40 V-56" fill="none" stroke="${HERO_INK}" stroke-width="6" stroke-linecap="round"/>
      <path d="M0 -40 C-11 -40 -13 -49 -8 -54 M0 -40 C11 -40 13 -49 8 -54 M0 -40 V-56" fill="none" stroke="${MAT.metal}" stroke-width="2.8" stroke-linecap="round"/>`,
    badge: () => `<path d="M-3.4 3.4 L3.4 -3.4 M-0.6 -3.8 H3.8 V0.6" fill="none" stroke="${HERO_INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  /* Marigold Wishwell — the fairy-tale dreamer. */
  Fable: {
    accent: 'rose', top: -48, look: 'tilted little crown, star wand with a ribbon',
    outfit: () => `<path ${O2} fill="${MAT.paper}" d="M-1 -1 H41 V2 Q36 9 31 2 Q26 9 20 2 Q14 9 9 2 Q4 9 -1 2Z"/>`,
    headgear: () => `<g transform="translate(5 -27) rotate(12)">
      <path ${O} fill="${PALETTE.sun}" d="M-16 4 L-18 -12 L-8 -4 L0 -16 L8 -4 L18 -12 L16 4Z"/>
      <circle ${O2} cx="-18" cy="-12" r="2.6" fill="${MAT.paper}"/><circle ${O2} cx="0" cy="-16" r="2.8" fill="${MAT.paper}"/><circle ${O2} cx="18" cy="-12" r="2.6" fill="${MAT.paper}"/>
      <circle ${O2} cx="0" cy="-1" r="3.2" fill="${PALETTE.teal}"/>
      <path class="h-fine" d="M-12 1 H-5 M5 1 H12" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".6"/></g>`,
    tool: x => `<g transform="rotate(10)">
      <path class="h-ribbon" d="M1 -34 C10 -31 4 -22 13 -17 C18 -14 16 -8 20 -6" fill="none" stroke="${HERO_INK}" stroke-width="4.6" stroke-linecap="round"/>
      <path class="h-ribbon" d="M1 -34 C10 -31 4 -22 13 -17 C18 -14 16 -8 20 -6" fill="none" stroke="${x.accent}" stroke-width="2.2" stroke-linecap="round"/>
      <rect ${O} x="-2" y="-36" width="4" height="44" rx="2" fill="${MAT.paper}"/>
      <path ${O} fill="${PALETTE.sun}" d="${star5(0, -46, 13)}"/>
      <path class="h-fine" d="M-4 -51 L-1.6 -54" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>
      <g class="h-fine" fill="${GLASS}"><path d="${star4(-14, -58, 3.4)}"/><path d="${star4(13, -62, 2.6)}"/></g></g>`,
    badge: () => `<path d="M0 3.8 C-5 0.4 -4.6 -4 -1.8 -4 C-0.8 -4 0 -3.2 0 -2.4 C0 -3.2 0.8 -4 1.8 -4 C4.6 -4 5 0.4 0 3.8Z" fill="${HERO_INK}"/>`,
  },
  /* Calliope Ridewright — the theme-park dreamer. */
  Showman: {
    accent: 'coral', top: -44, look: 'jaunty straw boater, one big balloon',
    outfit: x => `<path ${O2} fill="${x.accent}" d="${x.T('M6 -1 H11 V44 H6Z M17.5 -1 H22.5 V44 H17.5Z M29 -1 H34 V44 H29Z')}"/>`,
    headgear: x => `<g transform="rotate(-7)">
      <ellipse ${O} cx="0" cy="-21" rx="37" ry="5.4" fill="${STRAW}"/>
      <path ${O} fill="${STRAW}" d="M-20 -21 L-19 -40 C-10 -43 10 -43 19 -40 L20 -21 C10 -19 -10 -19 -20 -21Z"/>
      <path ${O2} fill="${x.accent}" d="M-19.6 -31 C-10 -33 10 -33 19.6 -31 L19.9 -23.4 C10 -21.6 -10 -21.6 -19.9 -23.4Z"/>
      <path class="h-fine" d="M-19.6 -27.4 C-10 -29.2 10 -29.2 19.6 -27.4" fill="none" stroke="${MAT.paper}" stroke-width="1.6"/>
      <path class="h-fine" d="M-14 -38 C-6 -40.4 4 -40.6 10 -40" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></g>`,
    tool: x => `<path class="h-balloon-string" d="M0 -4 C4 -14 -4 -24 1 -34 C3 -38 3 -40 3 -41" fill="none" stroke="${MAT.steel}" stroke-width="1.4" stroke-linecap="round"/>
      <g class="h-balloon"><path ${O2} fill="${x.accent}" d="M1 -42 L3 -45.6 L5 -42Z"/>
      <ellipse ${O} cx="3" cy="-58" rx="11.6" ry="13.4" fill="${x.accent}"/>
      <path d="M-3 -64 C-2 -67 0 -68.6 2 -69" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/></g>`,
    badge: () => `<path d="M-4.4 -2.6 H4.4 V-0.8 C3.4 -0.8 3.4 0.8 4.4 0.8 V2.6 H-4.4 V0.8 C-3.4 0.8 -3.4 -0.8 -4.4 -0.8Z" fill="${HERO_INK}"/>`,
  },
  /* Quillon Hollowbrook — the wizarding-school scholar. */
  Archivist: {
    accent: 'grape', top: -68, look: 'tall drooping star hat, unrolling scroll',
    outfit: x => `<path ${O2} fill="${x.cloth}" d="${x.T('M-2 32 H42 V38 H-2Z')}"/>
      <g class="h-trim">${x.TC(8, 8, 1.4, `fill="${PALETTE.sun}"`)}${x.TC(14, 13, 1.1, `fill="${PALETTE.sun}"`)}${x.TC(9, 19, 1.2, `fill="${PALETTE.sun}"`)}</g>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-36 -16 C-36 -23 36 -23 36 -16 C36 -10 -36 -10 -36 -16Z"/>
      <path ${O} fill="${x.cloth}" d="M-21 -19 C-16 -34 -8 -51 4 -62 C10 -67 18 -65 23 -59 C17 -61 13 -59 11 -55 C9 -43 14 -30 21 -19 C10 -21 -10 -21 -21 -19Z"/>
      <path d="M-19.6 -22.6 C-8 -25 8 -25 19.6 -22.6" fill="none" stroke="${HERO_INK}" stroke-width="6.4" stroke-linecap="round"/>
      <path d="M-19.6 -22.6 C-8 -25 8 -25 19.6 -22.6" fill="none" stroke="${PALETTE.sun}" stroke-width="3.2" stroke-linecap="round"/>
      <path ${O2} fill="${PALETTE.sun}" d="${star4(23, -59, 5.4)}"/>
      <g class="h-fine" fill="${GLASS}"><circle cx="-6" cy="-38" r="1.4"/><circle cx="2" cy="-46" r="1"/><circle cx="-10" cy="-30" r="0.9"/></g>`,
    tool: () => `<path ${O2} fill="${MAT.paper}" d="M3 -42 C15 -42 19 -36 17 -26 C15 -16 21 -10 25 -6 H9 C5 -14 3 -20 3 -26Z"/>
      <path class="h-fine" d="M7 -36 H14 M7 -31 H15 M7 -26 H13 M9 -21 H16" stroke="${MAT.steel}" stroke-width="1.2" stroke-linecap="round"/>
      <circle ${O2} cx="17" cy="-9.4" r="3" fill="${PALETTE.coral}"/>
      <rect ${O} x="-4.4" y="-46" width="8.8" height="42" rx="4.4" fill="${MAT.paper}"/>
      <ellipse ${O2} cx="0" cy="-46" rx="6" ry="2.6" fill="${MAT.wood}"/>
      <ellipse ${O2} cx="0" cy="-4.6" rx="6" ry="2.6" fill="${MAT.wood}"/>
      <path class="h-fine" d="M-1.6 -40 V-12" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    badge: () => `<path d="M1.6 -4.4 C-3.4 -3.8 -4.6 2.4 -0.6 4.2 C2 5.2 4 3.8 4.6 2.4 C1 3 -1.4 -1 1.6 -4.4Z" fill="${HERO_INK}"/>`,
  },
  /* Bramble Fizzwick — the potions-class experimenter. Tool only: wears the existing mortarboard. */
  Alchemist: {
    accent: 'mint', top: 0, look: 'bubbling round flask',
    tool: x => `<rect ${O} x="-4" y="-46" width="8" height="14" fill="${GLASS}"/>
      <circle ${O} cx="0" cy="-22" r="13" fill="${GLASS}"/>
      <path fill="${x.accent}" d="M-12.4 -18 A13 13 0 0 0 12.4 -18Z"/>
      <path class="o2" fill="none" d="M-12.4 -18 Q0 -20 12.4 -18"/>
      <path class="h-fine" d="M-8 -29 A9 9 0 0 1 -2 -32" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>
      <rect ${O2} x="-5.4" y="-51" width="10.8" height="6.4" rx="2" fill="${MAT.wood}"/>
      <g class="h-bubble"><circle ${O2} cx="4" cy="-58" r="2.6" fill="${shade(x.accent, 30)}"/><circle ${O2} cx="-3" cy="-64" r="1.7" fill="${shade(x.accent, 30)}"/></g>
      <circle cx="3" cy="-14" r="1.6" fill="#fff" opacity=".7"/><circle cx="-4" cy="-12" r="1.1" fill="#fff" opacity=".7"/>`,
    badge: () => `<path d="M-1.6 -4.4 H1.6 V-1.4 L4.2 3.6 C4.4 4.2 4 4.6 3.4 4.6 H-3.4 C-4 4.6 -4.4 4.2 -4.2 3.6 L-1.6 -1.4Z" fill="${HERO_INK}"/>`,
  },
};

/* ============================================================
   LOOK (v5) — the costume is independent of the role.
   agent.look = {hat, tool, body, antenna, face, hue, decal?}
   hat/tool/decal pick a kit's headgear/tool/chassis decal; body = build;
   antenna = "hair"; face = accessory. LOOK_SLOTS drives the in-game editor.
   ============================================================ */
export const HATS: Record<string, [string, string?]> = {
  none: ['No hat'], headphones: ['Headphones', 'Frontend'], goggles: ['Welding goggles', 'Backend'], beret: ['Beret', 'Design'],
  detective: ['Detective cap', 'QA'], headlamp: ['Headlamp', 'Data'], hardhat: ['Hard hat', 'DevOps'], mortarboard: ['Mortarboard', 'Research'],
  newsboy: ['Newsboy cap', 'Writer'], captain: ['Captain\'s cap', 'Release'], helm: ['Knight\'s helm', 'Quality'],
  director: ['Director\'s cap', 'Director'], inventor: ['Inventor\'s loupe', 'Inventor'],
  visor: ['Launch visor', 'Moonshot'], starcrest: ['Star crest', 'Navigator'], hood: ['Warden\'s hood', 'Warden'],
  flightcap: ['Flight cap', 'Rogue'], crown: ['Little crown', 'Fable'], boater: ['Straw boater', 'Showman'], starhat: ['Star hat', 'Archivist'],
};
export const TOOLS: Record<string, [string, string?]> = {
  none: ['Empty hands'], stylus: ['Giant stylus', 'Frontend'], cog: ['Big cog', 'Backend'], palette: ['Paint palette', 'Design'],
  magnifier: ['Magnifier', 'QA'], pickaxe: ['Pickaxe', 'Data'], wrench: ['Wrench', 'DevOps'], book: ['Open book', 'Research'],
  quill: ['Quill', 'Writer'], flag: ['Flag', 'Release'], broom: ['Broom-lance', 'Quality'], megaphone: ['Megaphone', 'Director'],
  clipboard: ['Clipboard', 'Technician'], blueprint: ['Blueprint', 'Inventor'], baton: ['Baton', 'Conductor'],
  eraser: ['Giant eraser', 'Visionary'], rocket: ['Toy rocket', 'Moonshot'], starcompass: ['Star compass', 'Navigator'],
  crystalstaff: ['Crystal staff', 'Warden'], grapple: ['Grappling hook', 'Rogue'], wand: ['Star wand', 'Fable'],
  balloon: ['Balloon', 'Showman'], scroll: ['Scroll', 'Archivist'], flask: ['Bubbling flask', 'Alchemist'],
};
const BODY_NAMES: Record<string, string> = { hero: 'Classic', sprout: 'Mini', bruiser: 'Chunky', lanky: 'Tall' };
const ANTENNA_NAMES: Record<string, string> = { none: 'Classic', tuft: 'Bulb', spikes: 'Twin', swoop: 'Swoop', bob: 'Big ears', bun: 'Dome', curl: 'Spring' };
const FACE_NAMES: Record<string, string> = { none: 'Plain', glasses: 'Glasses', shades: 'Shades', monocle: 'Monocle', mustache: 'Mustache', bow: 'Bow', freckles: 'Freckles', flower: 'Flower' };
/* top → bottom = the order the editor's arrows stand next to the bot */
export type LookSlotId = 'antenna' | 'hat' | 'face' | 'body' | 'tool' | 'hue';
export type LookSlot = { id: LookSlotId; label: string; options: readonly string[]; name: (v: string) => string };
export const LOOK_SLOTS: LookSlot[] = [
  { id: 'antenna', label: 'Antenna', options: HAIR, name: v => ANTENNA_NAMES[v] || v },
  { id: 'hat', label: 'Hat', options: Object.keys(HATS), name: v => (HATS[v] || [v])[0] },
  { id: 'face', label: 'Face', options: ACCESSORIES, name: v => FACE_NAMES[v] || v },
  { id: 'body', label: 'Body', options: BUILDS, name: v => BODY_NAMES[v] || v },
  { id: 'tool', label: 'Tool', options: Object.keys(TOOLS), name: v => (TOOLS[v] || [v])[0] },
  { id: 'hue', label: 'Colour', options: HUES, name: v => (COLOR_NAMES as Record<string, string>)[v] || v },
];
export const lookSlot = (id: LookSlotId): LookSlot => LOOK_SLOTS.find(s => s.id === id) as LookSlot;
export const hatDecal = (hat: string): string => (HATS[hat] && HATS[hat][1]) || 'none';
const _ROLE_HAT: Record<string, string> = Object.fromEntries(Object.entries(HATS).filter(([, v]) => v[1]).map(([k, v]) => [v[1], k]));
const _ROLE_TOOL: Record<string, string> = Object.fromEntries(Object.entries(TOOLS).filter(([, v]) => v[1]).map(([k, v]) => [v[1], k]));
/* v4 agents (role-driven gear) → explicit look that renders identically */
/** agent.look = {hat, tool, body, antenna, face, hue, decal?} — the server's Look. */
export type Look = { hat: string; tool: string; body: string; antenna: string; face: string; hue: string; decal?: string };
/** Anything with a name + look (a server Agent fits); v4 legacy fields still render. */
export type HeroAgent = {
  id?: string; name?: string; role?: string; look?: Partial<Look> | null;
  hue?: string; build?: string; hair?: string; accessory?: string;
};
export function lookFromLegacy(a: HeroAgent = {}): Look {
  const r = a.role && ROLE_GEAR[String(a.role)] ? String(a.role) : null;
  return { hat: (r && _ROLE_HAT[r]) || 'none', tool: (r && _ROLE_TOOL[r]) || 'none', decal: r || 'none',
    body: BUILD_DEF[a.build as string] ? (a.build as string) : 'hero', antenna: HAIR.includes(a.hair as string) ? (a.hair as string) : 'none',
    face: ACCESSORIES.includes(a.accessory as string) ? (a.accessory as string) : 'none', hue: a.hue || 'sun' };
}
/* a fresh random costume (looks only — never the name). Hats/tools are rarely empty. */
export function randomLook(prev?: Partial<Look> | null): Look {
  const pick = (list: readonly string[], avoid?: string) => { const l = list.length > 1 ? list.filter(v => v !== avoid) : list; return l[Math.floor(Math.random() * l.length)]; };
  const geared = (l: string[]) => l.filter(v => v !== 'none');
  const p: Partial<Look> = prev || {};
  const hat = Math.random() < 0.12 ? 'none' : pick(geared(Object.keys(HATS)), p.hat);
  return { hat, tool: Math.random() < 0.1 ? 'none' : pick(geared(Object.keys(TOOLS)), p.tool), decal: hatDecal(hat),
    body: pick(BUILDS, p.body), antenna: pick(HAIR, p.antenna), face: Math.random() < 0.35 ? 'none' : pick(ACCESSORIES, p.face), hue: pick(HUES, p.hue) };
}
/* where each slot sits on the bot, as px from the top of a hero of height px
   (the editor stands its arrows at these heights; spaced ≥ gap apart) */
export function lookAnchors(look: Partial<Look> | null, px: number, gap = 38): Record<LookSlotId, number> {
  const g = BUILD_DEF[(look && look.body) as string] || BUILD_DEF.hero; const k = g.head.r / 30; const s = px / 160;
  const ant = look && look.antenna && HAIR.includes(look.antenna) ? look.antenna : 'none';
  const ys = ([
    ['antenna', g.head.cy + (ANT_TOP[ant] + 4) * k], ['hat', g.head.cy - 24 * k], ['face', g.head.cy + 3 * k],
    ['body', g.torso.y + g.torso.h * 0.42], ['tool', g.sh + 24], ['hue', Math.max(g.torso.y + g.torso.h + 12, 140)],
  ] as [LookSlotId, number][]).map(([id, y]): [LookSlotId, number] => [id, y * s]);
  for (let i = 1; i < ys.length; i++) ys[i][1] = Math.max(ys[i][1], ys[i - 1][1] + gap);
  const over = ys[ys.length - 1][1] - (px - 6);
  if (over > 0) for (let i = ys.length - 1; i >= 0; i--) { const lim = i === ys.length - 1 ? px - 6 : ys[i + 1][1] - gap; ys[i][1] = Math.min(ys[i][1], lim); }
  return Object.fromEntries(ys.map(([id, y]) => [id, Math.round(y)])) as Record<LookSlotId, number>;
}

/* ---------- "hair" = antenna style (head-local, drawn behind the shell) ---------- */
const ANT_TOP: Record<string, number> = { none: -48, tuft: -50, spikes: -47, swoop: -46, bob: -40, bun: -42, curl: -52 };
function _antenna(name: string, x: Ctx): string {
  const stalk = (d: string) => `<path class="h-ant" d="${d}" fill="none" stroke="${HERO_INK}" stroke-width="5" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="${MAT.steel}" stroke-width="2.2" stroke-linecap="round"/>`;
  const ball = (cx: number, cy: number, r = 4.6) => `<circle class="o h-bulb" cx="${cx}" cy="${cy}" r="${r}" fill="${x.light}"/>
    <circle class="h-fine" cx="${_r(cx - r * .32)}" cy="${_r(cy - r * .32)}" r="${_r(r * .32)}" fill="#fff" opacity=".8"/>`;
  const ears = (big?: boolean) => big
    ? `<g>${[-1, 1].map(s => `<path ${O} fill="${MAT.metal}" d="M${s * 29} -6 C${s * 44} -14 ${s * 46} 10 ${s * 31} 8Z"/><circle ${O2} cx="${s * 36}" cy="1" r="2.4" fill="${x.light}"/>`).join('')}</g>`
    : `<rect ${O} x="-36" y="-8" width="9" height="16" rx="4" fill="${MAT.steel}"/><rect ${O} x="27" y="-8" width="9" height="16" rx="4" fill="${MAT.steel}"/>`;
  switch (name) {
    case 'tuft': return ears() + stalk('M0 -26 L5 -42') + `<circle class="h-fine" cx="6" cy="-45" r="8" fill="${x.light}" opacity=".3"/>` + ball(6, -45, 5.4);
    case 'spikes': return ears() + stalk('M-8 -25 L-14 -40 M8 -25 L14 -40') + ball(-14, -42, 4) + ball(14, -42, 4);
    case 'swoop': return ears() + stalk('M0 -26 C0 -42 14 -48 18 -38') + ball(18, -37, 4.4);
    case 'bob': return ears(true) + stalk('M0 -26 V-34') + ball(0, -36, 3.6);
    case 'bun': return ears() + `<path ${O} fill="${x.dark}" d="M-11 -24 C-11 -38 11 -38 11 -24Z"/>` + ball(0, -37, 3.6);
    case 'curl': return ears() + stalk('M0 -26 L-5 -30 L5 -34 L-5 -38 L5 -42 L0 -45') + ball(0, -48, 4.4);
    default: return ears() + stalk('M0 -26 V-41') + ball(0, -44, 4.6);
  }
}

/* ---------- accessory (screen or shell extra) — {near, far, face, fixed} ---------- */
type Acc = { near?: string; far?: string; face?: string; fixed?: string };
function _acc(name: string, x: Ctx): Acc {
  const ring = (c: string, w = 2.2) => `<ellipse rx="9.6" ry="10.6" fill="none" stroke="${c}" stroke-width="${w}"/>`;
  switch (name) {
    case 'glasses': return { near: ring(MAT.metal), far: ring(MAT.metal), face: `<path d="M-1.4 1 H1.4" stroke="${MAT.metal}" stroke-width="2.2"/>` };
    case 'shades': return { face: `<path class="h-shades" d="M-21 -7 H21 C21 4 17 8 11 8 C6 8 3 4 0 2 C-3 4 -6 8 -11 8 C-17 8 -21 4 -21 -7Z" fill="${HERO_INK}" opacity=".62"/>
      <path d="M-17 -4 L-9 -4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>` };
    case 'monocle': return { far: `${ring(PALETTE.sun, 2.4)}`, face: `<path class="h-fine" d="M19 11 C20 15 19 17 17 19" fill="none" stroke="${PALETTE.sun}" stroke-width="1.4"/>` };
    case 'mustache': return { face: `<path fill="${BOT_GLOW}" opacity=".9" d="M0 9 C-3 7 -8 7 -10 10 C-11 12 -10 13.5 -9 13.5 C-8 11.5 -4 11.5 0 11.5 C4 11.5 8 11.5 9 13.5 C10 13.5 11 12 10 10 C8 7 3 7 0 9Z"/>` };
    case 'freckles': { const dots = (pts: number[][]) => pts.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.1"/>`).join('');
      return { face: `<g fill="${PALETTE.rose}" opacity=".8">${dots([[-19, 8], [-16, 10.5], [-19.5, 12]])}<g class="h-acc-far">${dots([[16, 10.5], [19, 8], [19.5, 12]])}</g></g>` }; }
    case 'bow': { const bc = x.hueKey === 'coral' || x.hueKey === 'rose' ? PALETTE.sun : PALETTE.coral;
      return { fixed: `<g transform="translate(-22 -24) rotate(-20)"><path ${O2} fill="${bc}" d="M0 0 L-9 -6 L-9 6Z M0 0 L9 -6 L9 6Z"/><circle ${O2} r="3" fill="${shade(bc, -30)}"/></g>` }; }
    case 'flower': return { fixed: `<g transform="translate(-24 -20)">${[0, 72, 144, 216, 288].map(a => `<ellipse ${O2} rx="3.6" ry="5.6" fill="${MAT.paper}" transform="rotate(${a}) translate(0 -5)"/>`).join('')}<circle ${O2} r="3.2" fill="${PALETTE.sun}"/></g>` };
    default: return {};
  }
}

/* ---------- pose props ---------- */
function _implement(tool: string, hold: string | null): string {
  if (hold === 'pen') return `<g transform="rotate(28)"><rect ${O} x="-2.8" y="-16" width="5.6" height="24" rx="2.6" fill="${PALETTE.coral}"/><path ${O2} fill="${MAT.paper}" d="M-2.8 8 L2.8 8 L0 15Z"/><path fill="${PALETTE.coral}" d="M-1 12 L1 12 L0 15Z"/></g>`;
  if (tool === 'quill') return `<g transform="rotate(26)"><path ${O} fill="${MAT.paper}" d="M0 8 C-9 0 -10 -16 1 -27 C7 -17 8 -2 0 8Z"/><path d="M0 8 V-24" stroke="${MAT.steel}" stroke-width="1.2"/><path fill="${HERO_INK}" d="M-1.2 8 L1.2 8 L0 15Z"/></g>`;
  const body = tool === 'stylus' ? PALETTE.teal : PALETTE.sun;
  return `<g transform="rotate(28)"><rect ${O} x="-3" y="-17" width="6" height="25" fill="${body}"/><path ${O2} fill="${MAT.wood}" d="M-3 8 L3 8 L0 15Z"/><path fill="${HERO_INK}" d="M-1 12 L1 12 L0 15Z"/><rect ${O2} x="-3" y="-21" width="6" height="4" rx="1.5" fill="${PALETTE.rose}"/></g>`;
}
function _handProp(kind: string, x: Ctx): string {
  switch (kind) {
    case 'mug': return `<g transform="translate(5 -5)"><path ${O} d="M7 -9 C14 -9 14 1 7 1" fill="none"/><path ${O} fill="${MAT.paper}" d="M-8 -13 H8 V0 C8 4 5 5 0 5 C-5 5 -8 4 -8 0Z"/>
      <path class="h-trim" fill="${x.accent}" d="M-8 -8 H8 V-4 H-8Z"/>
      <g class="h-steam"><path d="M-3 -17 C-6 -21 0 -23 -3 -28" /><path d="M3 -17 C0 -21 6 -23 3 -28"/></g></g>`;
    case 'binder': return `<g transform="translate(6 -4)"><path ${O} fill="${shade(x.cloth, 10)}" d="M-20 -30 L0 -27 L20 -30 L20 0 L0 3 L-20 0Z"/>
      <path ${O2} fill="${MAT.paper}" d="M-18 -28 L0 -25 L0 1 L-18 -2Z"/><path ${O2} fill="${MAT.paper}" class="h-page" d="M18 -28 L0 -25 L0 1 L18 -2Z"/>
      <path class="h-fine" d="M-15 -21 L-3 -19 M-15 -15 L-3 -13 M-15 -9 L-6 -7.5 M3 -19 L15 -21 M3 -13 L15 -15 M3 -7.5 L12 -9" stroke="${MAT.steel}" stroke-width="1.4" stroke-linecap="round"/></g>`;
    case 'stack': return `<g class="h-stack" transform="translate(8 -6)"><rect ${O2} x="-19" y="-10" width="36" height="10" rx="1.5" fill="${MAT.paper}" transform="rotate(-3)"/>
      <rect ${O2} x="-17" y="-19" width="36" height="10" rx="1.5" fill="${shade(MAT.paper, -14)}" transform="rotate(4)"/>
      <rect ${O2} x="-18" y="-28" width="36" height="10" rx="1.5" fill="${MAT.paper}" transform="rotate(-2)"/>
      <path ${O2} fill="${HERO_INK}" d="M-4 -33 H4 L3 -26 H-3Z"/><path d="M-2.5 -33 C-2.5 -37 2.5 -37 2.5 -33" fill="none" stroke="${MAT.metal}" stroke-width="1.6"/></g>`;
    case 'envelope': return `<g transform="translate(8 -8) rotate(-4)"><rect ${O} x="-17" y="-14" width="34" height="22" rx="2" fill="#e8c38c"/>
      <path class="o2" fill="none" d="M-17 -14 L0 -2 L17 -14"/><rect class="h-trim" x="-11" y="1" width="16" height="4.5" rx="1" fill="${MAT.paper}"/></g>`;
    case 'paper': return `<g transform="translate(6 -6) rotate(-6)"><path ${O2} fill="${MAT.paper}" d="M-11 -28 H6 L11 -23 V2 H-11Z"/><path class="o2" fill="${shade(MAT.paper, -20)}" d="M6 -28 V-23 H11Z"/>
      <path class="h-fine" d="M-7 -20 H6 M-7 -14 H7 M-7 -8 H4" stroke="${MAT.steel}" stroke-width="1.3" stroke-linecap="round"/></g>`;
    case 'pen': return _implement(x.toolId, 'pen');
    case 'implement': return _implement(x.toolId, null);
    default: return '';
  }
}
function _deskProp(kind: string | undefined, g: BuildDef): string {
  const sy = g.sh, fx = g.torso.x;
  if (kind === 'laptop') {
    const y = sy + 16, l = fx + 10, rgt = fx + g.torso.w + 26;
    return `<path ${O} fill="${MAT.metal}" d="M${l} ${y} L${rgt} ${y} L${rgt - 5} ${y + 6} L${l + 4} ${y + 6}Z"/>
      <path ${O} fill="${MAT.steel}" d="M${rgt - 9} ${y - 33} L${rgt} ${y - 30} L${rgt + 1} ${y} L${rgt - 8} ${y}Z"/>
      <path d="M${rgt - 9.5} ${y - 31} L${rgt - 8.5} ${y - 2}" stroke="${PALETTE.teal}" stroke-width="1.6" opacity=".9"/>
      <circle cx="${rgt - 4}" cy="${y - 16}" r="2" fill="${MAT.paper}" opacity=".85"/>`;
  }
  if (kind === 'paper') {
    const y = sy + 18, l = fx + 10, rgt = fx + g.torso.w + 22;
    return `<path ${O2} fill="${MAT.paper}" d="M${l + 4} ${y} L${rgt} ${y} L${rgt - 3} ${y + 9} L${l} ${y + 9}Z"/>
      <path class="h-fine" d="M${l + 8} ${y + 3} H${rgt - 8} M${l + 6} ${y + 6} H${rgt - 14}" stroke="${MAT.steel}" stroke-width="1.2"/>`;
  }
  return '';
}

/* ---------- state helpers ---------- */
/** hero() options — see the header comment. */
export type HeroOpts = {
  size?: HeroSize; pose?: Pose | string; facing?: Facing; dir?: 'right' | 'left';
  look?: { x: number; y: number } | 'viewer' | null; seated?: boolean; props?: boolean;
  holding?: Holding | string | null; role?: string; captain?: boolean; armband?: string | null;
  ghost?: boolean; label?: boolean; moving?: boolean;
};
type Norm = {
  name: string; id: string; look: Look; hueKey: string; build: string; hair: string; accessory: string;
  hatKit: string | null; toolKit: string | null; decalKit: string | null; roleLabel: string;
};
function _px(size?: HeroSize): number { return typeof size === 'number' ? size : (HERO_SIZES[size as keyof typeof HERO_SIZES] || HERO_SIZES.sm); }
function _sizeName(px: number) { return px < 64 ? 'xs' : px < 128 ? 'sm' : px < 260 ? 'md' : 'xl'; }
function _faceCls(f?: string) { return f === 'front' ? 'face-front' : f === 'side' ? 'face-side' : 'face-3q'; }
function _norm(agent: HeroAgent = {}, opts: HeroOpts = {}): Norm {
  /* look: explicit agent.look wins; else derived from v4 fields; opts.role re-dresses (legacy) */
  const base: Look = agent.look ? Object.assign(lookFromLegacy(agent), agent.look) : lookFromLegacy(agent);
  if (opts.role && ROLE_GEAR[opts.role] && !opts.ghost) Object.assign(base, { hat: _ROLE_HAT[opts.role] || 'none', tool: _ROLE_TOOL[opts.role] || 'none', decal: opts.role });
  const L: Look = Object.assign({}, base);
  if (!HATS[L.hat]) L.hat = 'none'; if (!TOOLS[L.tool]) L.tool = 'none';
  if (L.decal == null) L.decal = hatDecal(L.hat);
  if (!ROLE_GEAR[L.decal]) L.decal = 'none';
  if (opts.ghost) Object.assign(L, { hat: 'none', tool: 'none', decal: 'none' });
  const roleLabel = opts.ghost ? '' : (opts.role || agent.role || '');
  return {
    name: agent.name || 'New agent', id: agent.id || '', look: L,
    hueKey: L.hue || 'sun', build: BUILD_DEF[L.body] ? L.body : 'hero',
    hair: HAIR.includes(L.antenna) ? L.antenna : 'none',
    accessory: ACCESSORIES.includes(L.face) ? L.face : 'none',
    hatKit: HATS[L.hat][1] || null, toolKit: TOOLS[L.tool][1] || null, decalKit: L.decal !== 'none' ? L.decal : null,
    roleLabel: String(roleLabel),
  };
}
function _ctx(n: Norm): Ctx {
  const c = hueHex(n.hueKey); const g = BUILD_DEF[n.build];
  const sx = g.torso.w / 40, sy = g.torso.h / 42;
  const X = (v: number) => v * sx + g.torso.x, Y = (v: number) => v * sy + g.torso.y;
  const x = {
    c, dark: shade(c, -30), light: shade(c, 40), hueKey: n.hueKey, build: n.build, toolId: n.look.tool,
    MAT, g, sx, sy, X, Y,
    T: (d: string) => _tp(d, sx, sy, g.torso.x, g.torso.y),
    TC: (cx: number, cy: number, r: number, attrs: string) => `<circle cx="${_r(X(cx))}" cy="${_r(Y(cy))}" r="${_r(r * (sx + sy) / 2)}" ${attrs}/>`,
  } as Ctx;
  /* each costume part reads its own kit's accent */
  const part = (kit: string | null): Ctx => { const gear = kit ? ROLE_GEAR[kit] : null; const accent = gear ? hueHex(gear.accent) : c; return Object.assign({}, x, { gear, accent, cloth: shade(accent, -70) }); };
  x.hx = part(n.hatKit); x.tx = part(n.toolKit); x.dx = part(n.decalKit);
  x.accent = x.dx.accent; x.cloth = x.dx.cloth; x.gear = x.dx.gear;
  return x;
}
function _holdFor(pose: Pose, opts: HeroOpts): string | null {
  if (opts.holding && opts.holding !== 'none') return opts.holding;
  if (opts.holding === 'none' || opts.props === false) return null;
  return (POSE_DEF[pose] || {}).hold || null;
}
function _seatedFor(pose: Pose, opts: HeroOpts): boolean { return opts.seated != null ? !!opts.seated : !!(POSE_DEF[pose] || {}).seated; }

function _anchorY(x: Ctx, n: Norm, seated: boolean): number {
  const { head } = x.g; const k = head.r / 30;
  const hg = x.hx.gear; const gearTop = hg && hg.headgear ? hg.top - 2 : 0;
  const top = head.cy + Math.min(-30, ANT_TOP[n.hair] || -48, gearTop) * k;
  return top - 2 + (seated ? 18 : 0);
}

/* ============================================================
   Markup
   ============================================================ */
/* mitten arm: two short steel segments + elbow bolt + hue mitten */
function _arm(side: 'f' | 'b', x: Ctx, o: { hand?: string; tool?: string }): string {
  const g = x.g; const isF = side === 'f';
  const sx = isF ? g.torso.x + 2 : g.torso.x + g.torso.w - 2;
  const sc = isF ? x.dark : shade(x.dark, -16);
  const content = isF ? `<g class="h-prop">${o.hand}</g>` : `<g class="h-tool">${o.tool}</g>`;
  return `<g class="h-arm h-arm-${side}" transform="translate(${sx} ${g.sh})"><g class="h-sh">
    <g class="h-ua"><line class="h-limb-o" x1="0" y1="0" x2="0" y2="11"/><line class="h-limb" x1="0" y1="0" x2="0" y2="11" stroke="${sc}"/></g>
    <g class="h-el"><g class="h-fa"><line class="h-limb-o" x1="0" y1="0" x2="0" y2="11"/><line class="h-limb" x1="0" y1="0" x2="0" y2="11" stroke="${sc}"/></g>
      <g class="h-hnd"><g class="h-hj"><g class="h-up">${content}</g><circle class="o h-hand" r="6.2" fill="${x.light}"/><path class="h-fine" d="M-3 -2.6 A4 4 0 0 1 1 -4.2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></g></g>
    </g><circle class="o2 h-joint" r="4.2" fill="${MAT.steel}"/></g></g>`;
}
/* hover base (kept in .h-legs so the class contract holds) */
function _legs(x: Ctx): string {
  const g = x.g; const by = g.torso.y + g.torso.h; const cx = 60;
  const glow = (cy: number, rx: number, ry: number) => `<g class="h-glow" style="transform-origin:${cx}px ${cy}px"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${x.light}" opacity=".45"/>
    <ellipse cx="${cx}" cy="${_r(cy - ry * .2)}" rx="${_r(rx * .5)}" ry="${_r(ry * .55)}" fill="#fff" opacity=".85"/></g>`;
  let base = '';
  switch (g.base) {
    case 'wheel': {
      const wy = 139;
      base = `<path ${O} fill="${MAT.steel}" d="M${cx - 8} ${by - 3} H${cx + 8} L${cx + 5} ${wy} H${cx - 5}Z"/>
        <circle ${O} cx="${cx}" cy="${wy}" r="12" fill="${HERO_INK}"/>
        <g class="h-spokes" style="transform-origin:${cx}px ${wy}px"><circle cx="${cx}" cy="${wy}" r="6.5" fill="${MAT.metal}"/>
          <path d="M${cx - 6} ${wy} H${cx + 6} M${cx} ${wy - 6} V${wy + 6}" stroke="${MAT.steel}" stroke-width="1.8"/></g>
        <circle cx="${cx}" cy="${wy}" r="2.2" fill="${x.light}"/>`;
      break;
    }
    case 'pad':
      base = glow(by + 12, 10, 5) + `<ellipse ${O} cx="${cx}" cy="${by + 3}" rx="12" ry="4.4" fill="${MAT.steel}"/>
        <ellipse cx="${cx}" cy="${by + 3.6}" rx="6" ry="1.8" fill="${x.light}"/>`;
      break;
    case 'ring':
      base = glow(by + 14, 12, 5) + `<ellipse cx="${cx}" cy="${by + 6}" rx="14" ry="4.6" fill="none" stroke="${HERO_INK}" stroke-width="7"/>
        <ellipse cx="${cx}" cy="${by + 6}" rx="14" ry="4.6" fill="none" stroke="${x.light}" stroke-width="3"/>`;
      break;
    default: /* jet */
      base = glow(by + 14, 9, 6) + `<path ${O} fill="${MAT.steel}" d="M${cx - 10} ${by - 3} H${cx + 10} L${cx + 7} ${by + 7} H${cx - 7}Z"/>
        <path d="M${cx - 5} ${by + 7} H${cx + 5}" stroke="${x.light}" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return `<g class="h-legs h-base">${base}</g>`;
}
function _torso(x: Ctx, uid: number, band: string | null): string {
  const g = x.g; const d = x.T(CHASSIS[x.build]);
  const gear = x.dx.gear; const s = _r(Math.min(1, Math.min(g.torso.w, g.torso.h) / 32));
  const chest = { x: _r(g.torso.x + g.torso.w * 0.62), y: _r(g.torso.y + g.torso.h * 0.4) };
  const badge = gear && gear.badge ? `<g class="h-badge" transform="translate(${chest.x} ${chest.y}) scale(${s})"><g class="h-badge-in"><circle ${O2} r="7" fill="${x.dx.accent}"/>${gear.badge(x.dx)}</g></g>` : '';
  const star = 'M0 -5 L1.5 -1.6 L5 -1.6 L2.2 0.7 L3.2 4.2 L0 2.2 L-3.2 4.2 L-2.2 0.7 L-5 -1.6 L-1.5 -1.6Z';
  const bandSVG = band ? `<path class="o2" fill="${band}" d="${x.T('M-2 31 H42 V38 H-2Z')}"/>` : '';
  const bandStar = band ? `<g class="h-capstar" transform="translate(${_r(x.X(10))} ${_r(x.Y(34.5))}) scale(${_r(1.15 * s)})"><circle r="6.4" fill="${band}" stroke="${HERO_INK}" stroke-width="1.8"/><path d="${star}" fill="${PALETTE.sun}" stroke="${HERO_INK}" stroke-width="1.1"/></g>` : '';
  return `<g class="h-torso"><defs><clipPath id="hc${uid}"><path d="${d}"/></clipPath></defs>
    <path ${O} d="${d}" fill="${x.c}"/>
    <g clip-path="url(#hc${uid})">
      <ellipse class="h-fine" cx="${_r(g.torso.x + g.torso.w * 0.3)}" cy="${_r(g.torso.y + g.torso.h * 0.3)}" rx="${_r(g.torso.w * 0.2)}" ry="${_r(g.torso.h * 0.22)}" fill="#fff" opacity=".22"/>
      <path d="${x.T('M-2 34 H42 V44 H-2Z')}" fill="${x.dark}" opacity=".35"/>
      <g class="h-outfit">${gear && gear.outfit ? gear.outfit(x.dx) : ''}</g>${bandSVG}
    </g>
    <path class="o h-torso-line" d="${d}" fill="none"/>${badge}${bandStar}</g>`;
}
function _neck(x: Ctx): string {
  const g = x.g; const k = g.head.r / 30; const top = g.head.cy + g.bottom * k - 4; const bot = g.torso.y + 3;
  return `<g class="h-neck"><rect ${O} x="54" y="${_r(top)}" width="12" height="${_r(bot - top)}" rx="4" fill="${MAT.steel}"/>
    <rect class="h-fine" x="56.5" y="${_r(top + 2)}" width="2.4" height="${_r(Math.max(1, bot - top - 4))}" rx="1.2" fill="#fff" opacity=".35"/></g>`;
}
function _eye(side: 'near' | 'far', acc: Acc): string {
  const ex = side === 'near' ? -10 : 10;
  return `<g transform="translate(${ex} 2)"><g class="h-eye ${side}">
    <g class="h-glance"><g class="h-pupil">
      <ellipse class="h-white" rx="9" ry="10.6" fill="${BOT_HALO}" opacity=".26"/>
      <rect class="h-orb" x="-5.6" y="-7.6" width="11.2" height="15.2" rx="5.6" fill="${BOT_GLOW}"/>
      <circle class="h-catch" cx="-1.9" cy="-3.6" r="1.7" fill="#fff"/>
    </g></g>
    <g transform="translate(0 -11)"><rect class="h-lid" x="-11" y="0" width="22" height="22.5" fill="${BOT_SCREEN}"/></g>
    <path class="h-shut h-shut-s" d="M-5.5 1 Q0 5 5.5 1"/><path class="h-shut h-shut-h" d="M-5.5 3 Q0 -5 5.5 3"/>
    <path class="h-shut h-shut-x" d="${side === 'near' ? 'M-5 -4 L4 0.5 L-5 5' : 'M5 -4 L-4 0.5 L5 5'}"/>
    ${acc[side] || ''}</g></g>`;
}
function _head(x: Ctx, n: Norm): string {
  const { head } = x.g; const k = _r(head.r / 30);
  const acc = _acc(n.accessory, x);
  const mouths = `<g class="h-mouths" transform="translate(0 13.2) scale(.5) translate(0 -17)">
    <path class="h-mouth m-l" data-m="smile" d="M-7.5 13 Q0 21 7.5 13"/>
    <path class="h-mouth m-l" data-m="focus" d="M-5 15.5 Q0 18 5 15.5"/>
    <path class="h-mouth m-f" data-m="talkA" d="M-6 13 Q0 13.5 6 13 Q5.5 22 0 22 Q-5.5 22 -6 13Z"/>
    <path class="h-mouth m-l" data-m="talkB" d="M-4.5 15.5 Q0 18.5 4.5 15.5"/>
    <path class="h-mouth m-l" data-m="worried" d="M-6 19 Q0 13 6 19"/>
    <g class="h-mouth" data-m="grin"><path class="m-f" d="M-9.5 12 Q0 13.5 9.5 12 Q9 25 0 25 Q-9 25 -9.5 12Z"/><path d="M-4.5 21.5 Q0 18 4.5 21.5 Q2.5 24 0 24 Q-2.5 24 -4.5 21.5Z" fill="${PALETTE.coral}"/></g>
    <circle class="h-mouth m-f" data-m="o" cx="1" cy="17" r="2.8"/>
    <g class="h-mouth" data-m="tongue"><circle cx="3.6" cy="18" r="2.8" fill="${PALETTE.coral}"/><path class="m-l" d="M-5 15.5 Q0 17 5 15.5"/></g>
    <path class="h-mouth m-l" data-m="flat" d="M-4.5 16 L4.5 16"/>
    <path class="h-mouth m-l" data-m="wavy" d="M-7 16 Q-3.5 13 0 16 Q3.5 19 7 16"/></g>`;
  const hg = x.hx.gear; const gearSVG = hg && hg.headgear ? hg.headgear(x.hx) : '';
  return `<g class="h-head" transform="translate(${head.cx} ${_r(head.cy + x.g.bottom * k)})"><g class="h-tilt"><g transform="translate(0 ${_r(-x.g.bottom * k)}) scale(${k})">
    <g class="h-hair-back">${_antenna(n.hair, x)}</g>
    <path class="o h-shell" d="${SHELL[x.g.shape]}" fill="${x.c}"/>
    <ellipse class="h-sheen" cx="-15" cy="-19" rx="9" ry="5" transform="rotate(-28 -15 -19)" fill="#fff" opacity=".32"/>
    <g class="h-hair"></g>
    <g class="h-face">
      <rect class="o2 h-screen" x="-23" y="-15" width="46" height="34" rx="13" fill="${BOT_SCREEN}"/>
      <path class="h-fine h-glare" d="M-17 -9 C-14 -12 -9 -12.5 -5 -12.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".22"/>
      <g transform="translate(-10 -9.5)"><rect class="h-brow near" x="-4.5" y="-1.2" width="9" height="2.4" rx="1.2" fill="${BOT_GLOW}"/></g>
      <g transform="translate(10 -9.5)"><rect class="h-brow far" x="-4.5" y="-1.2" width="9" height="2.4" rx="1.2" fill="${BOT_GLOW}"/></g>
      ${_eye('near', acc)}${_eye('far', acc)}
      <ellipse class="h-blush near" cx="-17.5" cy="12" rx="3.4" ry="2" fill="${PALETTE.rose}"/>
      <ellipse class="h-blush far" cx="17.5" cy="12" rx="3.4" ry="2" fill="${PALETTE.rose}"/>
      <g class="h-acc-f">${acc.face || ''}</g>
      ${mouths}
    </g>
    <text class="h-q" x="0" y="11" text-anchor="middle">+</text>
    <g class="h-headgear" transform="translate(0 0)">${gearSVG}</g>
    <g class="h-acc">${acc.fixed || ''}</g>
  </g></g></g>`;
}

function _isPose(p: unknown): p is Pose { return (POSES as readonly unknown[]).includes(p); }
function _classes(n: Norm, o: HeroOpts) {
  const px = _px(o.size); const pose: Pose = _isPose(o.pose) ? o.pose : 'idle';
  const pd = POSE_DEF[pose]; const seated = _seatedFor(pose, o);
  const cls = ['hero', 'bot', 'b-' + n.build, 'size-' + _sizeName(px), 'pose-' + pose, _faceCls(o.facing), o.dir === 'left' ? 'dir-l' : 'dir-r'];
  if (px < 64) cls.push('lod-xs');
  if (o.captain) cls.push('is-captain');
  if (seated) cls.push('seated');
  if (o.ghost) cls.push('ghost');
  if (pd.tool && n.toolKit) cls.push('tool-on');
  if (o.moving) cls.push('moving');
  return { cls: cls.join(' '), px, pose, pd, seated };
}
function _label(n: Norm, pose: Pose): string {
  const role = n.roleLabel || 'Agent';
  return `${n.name}, ${role}, ${POSE_TEXT[pose] || pose}`;
}
function _fx(o: HeroOpts, px: number): string {
  const pip = o.captain && px < 100 ? captainPipHTML(o.armband || PALETTE.sun) : '';
  return `<div class="h-fx" aria-hidden="true"><span class="fx-pip">${pip}</span><span class="fx-bang">!</span>
    <span class="fx-z"><i>z</i><i>z</i><i>Z</i></span><span class="fx-spark"><i>✦</i><i>✦</i><i>✦</i></span><span class="fx-think"><i></i><i></i><i></i></span></div>`;
}

export function heroSVG(agent: HeroAgent | null | undefined, opts: HeroOpts = {}): string {
  const o: HeroOpts = Object.assign({ size: 'sm', pose: 'idle', facing: 'three-quarter', dir: 'right', look: null, props: true }, opts);
  const n = _norm(agent || {}, o); const x = _ctx(n); const uid = ++_heroSeq;
  const st = _classes(n, o);
  const pose = st.pose;
  const ol = st.px < 64 ? Math.max(4.5, 1.5 * 160 / st.px) : st.px >= 240 ? 2.5 : 3;
  const hold = _holdFor(pose, o);
  const showBand = (o.captain || o.armband) && st.px >= 100 ? (o.armband ? hueHex(o.armband) : PALETTE.sun) : null;
  const hand = hold ? _handProp(hold, x) : '';
  const desk = o.props === false ? '' : _deskProp(st.pd.desk, x.g);
  const tg = x.tx.gear; const tool = tg && tg.tool ? tg.tool(x.tx) : '';
  const look = o.facing === 'front' ? { x: 0, y: 0 } : (o.look === 'viewer' ? { x: 0, y: 0 } : o.look);
  const lookCss = look ? `--lx:${look.x};--ly:${look.y};` : '';
  const ay = _anchorY(x, n, st.seated);
  const g = x.g; const pivot = g.torso.y + g.torso.h;
  const delay = -Number((Math.random() * 4).toFixed(2));
  const aria = o.label ? ` role="img" aria-label="${escapeAttr(_label(n, pose))}"` : ' aria-hidden="true"';
  const sr = o.label && (st.pd.fx === 'bang' || pose === 'sleeping') ? `<span class="sr-only">${pose === 'sleeping' ? 'sleeping' : 'needs your input'}</span>` : '';
  const shadowRing = `<ellipse class="h-cring" cx="60" cy="152" rx="27" ry="6" fill="none" stroke="${PALETTE.sun}" stroke-width="2"/>`;
  return `<div class="${st.cls}"${aria} data-hero="${uid}" data-name="${escapeAttr(n.name)}" data-id="${escapeAttr(n.id)}" data-hue="${n.hueKey}" data-build="${n.build}" data-hair="${n.hair}" data-acc="${n.accessory}" data-look="${escapeAttr(JSON.stringify(n.look))}" data-role="${escapeAttr(n.roleLabel)}" data-mouth="${st.pd.mouth}" data-eyes="${st.pd.eyes || 'open'}" data-hold="${hold || ''}"${o.armband ? ` data-band="${escapeAttr(o.armband)}"` : ''} style="--hpx:${st.px}px;width:${_r(st.px * 0.75)}px;height:${st.px}px;--ol:${_r(ol)}px;--hue:${x.c};--head-y:${_r(ay / 160 * 100)}%;--dl:${delay}s;${lookCss}">
  <svg viewBox="0 0 120 160" aria-hidden="true" focusable="false">
    <ellipse class="h-shadow" cx="60" cy="152" rx="${g.base === 'wheel' ? 22 : 18}" ry="4.5"/>${shadowRing}
    <g class="h-flip"><g class="h-rig"><g class="h-body" style="transform-origin:60px ${pivot}px">
      ${_legs(x)}
      ${_arm('b', x, { tool })}
      ${_neck(x)}
      ${_torso(x, uid, showBand)}
      ${_head(x, n)}
      <g class="h-desk">${desk}</g>
      ${_arm('f', x, { hand })}
    </g></g></g>
  </svg>${_fx(o, st.px)}${sr}</div>`;
}

type HeroState = { agent: HeroAgent; opts: HeroOpts };
const _states = new WeakMap<Element, HeroState>();

/** Imperative: a ready .hero element (the office engine builds many of these). */
export function hero(agent: HeroAgent | null | undefined, opts: HeroOpts = {}): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = heroSVG(agent, opts).trim();
  const el = t.content.firstElementChild as HTMLElement;
  _states.set(el, { agent: agent || {}, opts: Object.assign({ size: 'sm', pose: 'idle', facing: 'three-quarter', dir: 'right', props: true }, opts) });
  return el;
}

/* recover state for elements made from heroSVG strings */
function _state(el: HTMLElement): HeroState {
  let st = _states.get(el);
  if (!st) {
    const d = el.dataset;
    st = {
      agent: { name: d.name, id: d.id, hue: d.hue, build: d.build, hair: d.hair, accessory: d.acc, role: d.role, look: (() => { try { return JSON.parse(d.look || 'null'); } catch (_) { return null; } })() || undefined },
      opts: { size: parseFloat(el.style.getPropertyValue('--hpx')) || 96, pose: POSES.find(p => el.classList.contains(`pose-${p}`)) || 'idle',
        facing: el.classList.contains('face-front') ? 'front' : el.classList.contains('face-side') ? 'side' : 'three-quarter',
        dir: el.classList.contains('dir-l') ? 'left' : 'right', captain: el.classList.contains('is-captain'), ghost: el.classList.contains('ghost'),
        armband: d.band || null, props: true },
    };
    _states.set(el, st);
  }
  return st;
}

/* in-place pose swap: classes, screen face, hand prop, desk prop, fx — no re-render */
export type PoseOpts = { seated?: boolean; props?: boolean; holding?: HeroOpts['holding']; moving?: boolean };
export function setPose(el: HTMLElement | null | undefined, pose: Pose | string, o: PoseOpts = {}): HTMLElement | undefined {
  if (!el) return;
  const st = _state(el);
  const opts = st.opts;
  const p: Pose = _isPose(pose) ? pose : 'idle';
  opts.pose = p;
  (['seated', 'props', 'holding', 'moving'] as const).forEach(k => { if (k in o) (opts as Record<string, unknown>)[k] = o[k]; });
  const n = _norm(st.agent, opts); const x = _ctx(n);
  const pd = POSE_DEF[p]; const seated = _seatedFor(p, opts);
  POSES.forEach(q => { el.classList.remove('pose-' + q); });
  el.classList.add(`pose-${p}`);
  el.classList.toggle('seated', seated);
  el.classList.toggle('tool-on', !!(pd.tool && n.toolKit));
  el.classList.toggle('moving', !!opts.moving);
  el.dataset.mouth = pd.mouth; el.dataset.eyes = pd.eyes || 'open';
  const hold = _holdFor(p, opts); el.dataset.hold = hold || '';
  const hp = el.querySelector('.h-prop'); if (hp) hp.innerHTML = hold ? _handProp(hold, x) : '';
  const dk = el.querySelector('.h-desk'); if (dk) dk.innerHTML = opts.props === false ? '' : _deskProp(pd.desk, x.g);
  el.style.setProperty('--head-y', _r(_anchorY(x, n, seated) / 160 * 100) + '%');
  if (el.getAttribute('role') === 'img') el.setAttribute('aria-label', _label(n, p));
  return el;
}

/* THE turn transition: the screen face slides/turns in 250ms, arms follow 80ms later (CSS) */
export type FacingOpts = { dir?: 'right' | 'left'; look?: HeroOpts['look'] };
export function setFacing(el: HTMLElement | null | undefined, facing: Facing, o: FacingOpts = {}): HTMLElement | undefined {
  if (!el) return;
  const st = _state(el);
  st.opts.facing = facing;
  el.classList.remove('face-front', 'face-3q', 'face-side');
  el.classList.add(_faceCls(facing));
  if (o.dir) { st.opts.dir = o.dir; el.classList.toggle('dir-l', o.dir === 'left'); el.classList.toggle('dir-r', o.dir !== 'left'); }
  if (facing === 'front') setLook(el, 'viewer');
  else if ('look' in o) setLook(el, o.look);
  else setLook(el, null);
  return el;
}
export function setLook(el: HTMLElement | null | undefined, look: HeroOpts['look'] | undefined): HTMLElement | undefined {
  if (!el) return;
  if (look == null) { el.style.removeProperty('--lx'); el.style.removeProperty('--ly'); return el; }
  const l = look === 'viewer' ? { x: 0, y: 0 } : look;
  el.style.setProperty('--lx', String(Math.max(-1, Math.min(1, l.x || 0))));
  el.style.setProperty('--ly', String(Math.max(-1, Math.min(1, l.y || 0))));
  return el;
}
export function heroHeadAnchor(el: HTMLElement): { x: number; y: number } {
  const h = el.getBoundingClientRect().height || parseFloat(el.style.height);
  const pct = parseFloat(el.style.getPropertyValue('--head-y')) || 10;
  return { x: (el.getBoundingClientRect().width || parseFloat(el.style.width)) / 2, y: h * pct / 100 };
}

/* v2 shim */
export function castOf(agent: HeroAgent, mood: string, size?: string | number): HTMLElement { return hero(agent, { size: size ? parseFloat(String(size)) : 'sm', pose: MOOD_TO_POSE[mood] || 'idle' }); }

/** Tests only: restart the clip-path id sequence so snapshots are stable. */
export function _resetHeroSeq(): void { _heroSeq = 0; }
