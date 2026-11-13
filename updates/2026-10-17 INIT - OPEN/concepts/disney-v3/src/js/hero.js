/* ============================================================
   hero.js — Character system v3 (spec-cast §1 + SYNTHESIS seam 1).
   THE way every screen draws a character.

   Public:
     hero(agent, opts) → HTMLDivElement.hero
     heroSVG(agent, opts) → string (same markup; setPose etc. still work on it)
     setPose(el, pose, {seated, props, holding}?)
     setFacing(el, facing, {dir, look}?)        animated head-first turn (250ms)
     setLook(el, {x,y} | 'viewer' | null)
     heroHeadAnchor(el) → {x, y} px inside el (crown point, for overlays)
     castOf(agent, mood, size)                  v2 shim
     POSES, FACINGS, BUILDS, HAIR, ACCESSORIES, ROLE_GEAR, HERO_SIZES,
     MOOD_TO_POSE, POSE_TEXT, MAT
   opts: size 'xs'|'sm'|'md'|'xl'|px · pose · facing 'side'|'three-quarter'|'front'
         dir 'right'|'left' · look · seated · props · holding
         'mug'|'envelope'|'paper'|'binder'|'pen'|'none' · role (override)
         captain · armband <hex> · ghost · label
   Geometry: viewBox 0 0 120 160, ground y=152, feet centred on x=60.
   Coordinate spaces: head-local (r normalised to 30), torso-local (40×42),
   hand-local (origin = hand centre, long axis up, kept upright).
   ============================================================ */

const MAT = { metal: '#c9c3dd', steel: '#8e86ad', wood: '#b9773f', paper: '#fff6e9' };
const HERO_INK = '#241a44';

const POSES = ['idle', 'walking', 'typing', 'writing', 'reading', 'carrying', 'talking', 'chilling', 'sleeping',
  'celebrating', 'needs-input', 'thinking', 'frustrated', 'waiting', 'pressing', 'waving', 'salute'];
const FACINGS = ['side', 'three-quarter', 'front'];
const BUILDS = ['hero', 'sprout', 'bruiser', 'lanky'];
const HAIR = ['none', 'tuft', 'spikes', 'swoop', 'bob', 'bun', 'curl'];
const ACCESSORIES = ['none', 'glasses', 'shades', 'monocle', 'mustache', 'bow', 'freckles', 'flower'];
const HOLDINGS = ['mug', 'envelope', 'paper', 'binder', 'pen', 'none'];
const HERO_SIZES = { xs: 48, sm: 96, md: 160, xl: 360 };
const MOOD_TO_POSE = { neutral: 'idle', idle: 'idle', working: 'typing', blocked: 'needs-input', celebrate: 'celebrating' };

/* per pose: mouth, eyes, whether the role tool shows, default hand-held item,
   rig-level desk prop, seated by default, fx overlay. Static key poses (arms,
   legs, lean…) live in hero.css as custom properties on .pose-<name>. */
const POSE_DEF = {
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
const POSE_TEXT = {
  idle: 'standing by', walking: 'walking', typing: 'writing code', writing: 'writing', reading: 'reading',
  carrying: 'carrying paperwork', talking: 'talking', chilling: 'taking a break', sleeping: 'sleeping, off shift',
  celebrating: 'celebrating', 'needs-input': 'needs your input', thinking: 'thinking', frustrated: 'fixing a failure',
  waiting: 'waiting on a teammate', pressing: 'pressing the button', waving: 'waving', salute: 'saluting',
};

/* Builds — anchors per spec-cast §1.2 */
const BUILD_DEF = {
  hero: { head: { cx: 60, cy: 52, r: 30 }, torso: { x: 40, y: 82, w: 40, h: 42 }, legW: 12, sh: 89 },
  sprout: { head: { cx: 60, cy: 64, r: 32 }, torso: { x: 41, y: 94, w: 38, h: 32 }, legW: 12, sh: 100 },
  bruiser: { head: { cx: 60, cy: 48, r: 27 }, torso: { x: 32, y: 74, w: 56, h: 48 }, legW: 15, sh: 82 },
  lanky: { head: { cx: 60, cy: 38, r: 26 }, torso: { x: 44, y: 64, w: 32, h: 52 }, legW: 10, sh: 70 },
};

let _heroSeq = 0;

/* ---------- geometry helpers ---------- */
/* map an absolute path (M L C Q S T H V Z) from torso-local 40×42 to rig coords */
function _tp(d, sx, sy, tx, ty) {
  let cmd = 'M', i = 0;
  return d.replace(/([MLCQSTHVZ])|(-?\d*\.?\d+)/g, (m, c, n) => {
    if (c) { cmd = c; i = 0; return c; }
    const v = parseFloat(n);
    let out;
    if (cmd === 'H') out = v * sx + tx;
    else if (cmd === 'V') out = v * sy + ty;
    else out = (i % 2 === 0) ? v * sx + tx : v * sy + ty;
    i++;
    return +out.toFixed(2);
  });
}
const _r = n => +n.toFixed(2);

/* ============================================================
   ROLE GEAR — {accent, sleeve, legs, look, top, outfit, headgear, tool, badge}
   ctx: {c, dark, light, hairC, accent, cloth, T(d), TC(x,y,r,attrs), MAT}
   headgear/tool/badge are authored in head-/hand-/badge-local coords.
   `top` = highest headgear point in head-local units (for the head anchor).
   ============================================================ */
const O = 'class="o"', O2 = 'class="o2"';
const ROLE_GEAR = {
  Frontend: {
    accent: 'teal', sleeve: 'cloth', top: -42, look: 'headphones, hoodie, giant pencil',
    outfit: x => `<path ${O} fill="${x.cloth}" d="${x.T('M0 0 H40 V42 H0Z')}"/>
      <path ${O2} fill="${shade(x.cloth, 22)}" d="${x.T('M7 -1 C11 8 29 8 33 -1 L36 4 C30 13 10 13 4 4Z')}"/>
      <path class="o2 h-trim" fill="${shade(x.cloth, -14)}" d="${x.T('M9 27 H31 L28 37 H12Z')}"/>
      <path class="h-trim" stroke="${x.accent}" stroke-width="2.2" stroke-linecap="round" fill="none" d="${x.T('M16 8 L15 19 M24 8 L25 19')}"/>
      <g class="h-trim">${x.TC(15, 20, 1.8, `fill="${x.accent}"`)}${x.TC(25, 20, 1.8, `fill="${x.accent}"`)}</g>`,
    headgear: x => `<path d="M-31 0 C-33 -50 33 -50 31 0" fill="none" stroke="${HERO_INK}" stroke-width="10" stroke-linecap="round"/>
      <path d="M-31 0 C-33 -50 33 -50 31 0" fill="none" stroke="${x.accent}" stroke-width="5" stroke-linecap="round"/>
      <path class="h-fine" d="M-22 -28 C-14 -36 -4 -38 4 -38" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
      <rect ${O} x="-40" y="-12" width="14" height="25" rx="7" fill="${x.accent}"/>
      <rect ${O} x="26" y="-12" width="14" height="25" rx="7" fill="${x.accent}"/>
      <rect class="h-fine" x="-37" y="-7" width="4" height="14" rx="2" fill="#fff" opacity=".45"/>
      <rect class="h-fine" x="29" y="-7" width="4" height="14" rx="2" fill="#fff" opacity=".45"/>`,
    tool: x => `<g transform="rotate(8)"><path ${O} fill="${x.accent}" d="M-5 -36 H5 V5 H-5Z"/>
      <path class="h-fine" d="M-1.6 -35 V4" stroke="${shade(x.accent, -40)}" stroke-width="1.2"/>
      <path ${O} fill="${MAT.wood}" d="M-5 -36 L0 -49 L5 -36Z"/>
      <path fill="${HERO_INK}" d="M-1.8 -44.2 L0 -49 L1.8 -44.2Z"/>
      <rect ${O} x="-5" y="4" width="10" height="5" fill="${MAT.metal}"/>
      <rect ${O} x="-5" y="9" width="10" height="5" rx="2.5" fill="${PALETTE.rose}"/></g>`,
    badge: () => `<path d="M-2.2 -3 L-4.6 0 L-2.2 3 M2.2 -3 L4.6 0 L2.2 3 M0.9 -3.6 L-0.9 3.6" fill="none" stroke="${HERO_INK}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  Backend: {
    accent: 'sky', sleeve: 'skin', legs: 'cloth', top: -38, look: 'welding goggles, overalls, cog',
    outfit: x => `<path ${O} fill="${x.cloth}" d="${x.T('M-2 25 H42 V44 H-2Z')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M9 7 H31 V30 H9Z')}"/>
      <path ${O2} fill="${x.cloth}" d="${x.T('M3 -1 L9 -1 L13 9 L8 9Z M37 -1 L31 -1 L27 9 L32 9Z')}"/>
      <rect class="o2 h-trim" x="${_r(x.X(15))}" y="${_r(x.Y(13))}" width="${_r(10 * x.sx)}" height="${_r(8 * x.sy)}" rx="1.5" fill="${shade(x.cloth, -16)}"/>
      ${x.TC(10.5, 10, 2.2, `${O2} fill="${MAT.metal}"`)}${x.TC(29.5, 10, 2.2, `${O2} fill="${MAT.metal}"`)}`,
    headgear: x => `<path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${HERO_INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${MAT.steel}" stroke-width="4" stroke-linecap="round"/>
      <rect ${O} x="-4" y="-27" width="8" height="5" rx="2" fill="${MAT.steel}"/>
      <circle ${O} cx="-11" cy="-27" r="10" fill="${MAT.metal}"/><circle ${O} cx="11" cy="-27" r="10" fill="${MAT.metal}"/>
      <circle ${O2} cx="-11" cy="-27" r="6" fill="${shade(x.accent, -30)}"/><circle ${O2} cx="11" cy="-27" r="6" fill="${shade(x.accent, -30)}"/>
      <circle cx="-13" cy="-29.5" r="2" fill="#fff" opacity=".85"/><circle cx="9" cy="-29.5" r="2" fill="#fff" opacity=".85"/>`,
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
    accent: 'rose', sleeve: 'paper', top: -50, look: 'beret, painter\'s smock, palette and brush',
    outfit: x => `<path ${O} fill="${MAT.paper}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path ${O2} fill="${x.accent}" d="${x.T('M20 3 L12 -1 L12 8Z M20 3 L28 -1 L28 8Z')}"/>${x.TC(20, 3, 2.2, `${O2} fill="${shade(x.accent, -30)}"`)}
      <g class="h-trim">${x.TC(10, 22, 3, `fill="${PALETTE.sun}"`)}${x.TC(29, 30, 2.6, `fill="${PALETTE.teal}"`)}${x.TC(15, 35, 2.2, `fill="${PALETTE.coral}"`)}${x.TC(31, 17, 1.6, `fill="${PALETTE.sky}"`)}</g>
      <path class="o2 h-trim" fill="none" d="${x.T('M8 30 H30')}"/>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-29 -14 C-34 -34 -6 -46 16 -42 C36 -38 46 -26 41 -15 C36 -10 22 -12 8 -12 C-6 -12 -20 -8 -29 -14Z"/>
      <path class="h-fine" d="M-20 -30 C-10 -38 4 -40 12 -39" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".35"/>
      <path ${O} fill="${x.cloth}" d="M4 -43 C3 -49 9 -51 10 -46 Z"/>`,
    tool: x => `<path ${O} fill="${MAT.wood}" d="M7 -6 L14 -50 L18 -49 L11 -5Z"/>
      <path ${O} fill="${x.accent}" d="M14 -50 C13 -56 15 -60 17 -61 C19 -58 19 -53 18 -49Z"/>
      <path ${O} fill="${MAT.wood}" d="M-15 -30 C-18 -40 -8 -46 2 -44 C12 -42 15 -34 10 -28 C7 -25 3 -27 1 -24 C-1 -20 4 -17 1 -13 C-3 -9 -12 -14 -15 -30Z"/>
      <circle ${O2} cx="-2" cy="-31" r="2.8" fill="${shade(MAT.wood, -50)}"/>
      <circle cx="-9" cy="-35" r="3" fill="${PALETTE.coral}" class="o2"/><circle cx="0" cy="-40" r="3" fill="${PALETTE.sun}" class="o2"/>
      <circle cx="7" cy="-35" r="2.8" fill="${PALETTE.teal}" class="o2"/><circle cx="-9" cy="-26" r="2.6" fill="${PALETTE.sky}" class="o2"/>`,
    badge: () => `<path d="M0 -4.6 L3.4 -0.4 L1.4 4 H-1.4 L-3.4 -0.4Z" fill="${HERO_INK}"/><path d="M0 -1.6 V2.4" stroke="#fff" stroke-width="1"/>`,
  },
  QA: {
    accent: 'coral', sleeve: 'cloth', top: -38, look: 'deerstalker, trench collar, magnifier',
    outfit: x => `<path ${O} fill="${x.cloth}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path ${O2} fill="${shade(x.cloth, 26)}" d="${x.T('M6 -1 L20 15 L13 1Z M34 -1 L20 15 L27 1Z')}"/>
      <path ${O2} fill="${shade(x.cloth, -22)}" d="${x.T('M-2 26 H42 V31 H-2Z')}"/>
      <rect class="o2 h-trim" x="${_r(x.X(16))}" y="${_r(x.Y(25))}" width="${_r(8 * x.sx)}" height="${_r(7 * x.sy)}" rx="1" fill="${MAT.metal}"/>
      <g class="h-trim">${x.TC(20, 19, 1.5, `fill="${HERO_INK}"`)}${x.TC(20, 37, 1.5, `fill="${HERO_INK}"`)}</g>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-31 -14 C-36 -6 -34 6 -27 9 C-25 0 -25 -6 -26 -14Z"/>
      <path ${O} fill="${x.cloth}" d="M31 -14 C36 -6 34 6 27 9 C25 0 25 -6 26 -14Z"/>
      <path ${O} fill="${shade(x.cloth, -16)}" d="M-18 -15 C-30 -18 -40 -14 -43 -8 C-34 -6 -24 -8 -16 -10Z"/>
      <path ${O} fill="${shade(x.cloth, -16)}" d="M18 -15 C30 -18 40 -14 43 -8 C34 -6 24 -8 16 -10Z"/>
      <path ${O} fill="${x.cloth}" d="M-29 -11 C-31 -42 31 -42 29 -11 C18 -15 -18 -15 -29 -11Z"/>
      <path class="h-fine" d="M-20 -22 L20 -22 M-24 -16 L24 -16 M-8 -33 L-12 -13 M8 -33 L12 -13" stroke="${x.accent}" stroke-width="1.3" opacity=".7" fill="none"/>
      <path ${O2} fill="${x.accent}" d="M-6 -34 C-6 -40 6 -40 6 -34 C3 -36 -3 -36 -6 -34Z"/>`,
    tool: x => `<rect ${O} x="-3" y="-17" width="6" height="25" rx="3" fill="${MAT.wood}"/>
      <circle cx="0" cy="-30" r="12" fill="#fff" opacity=".28"/>
      <circle cx="0" cy="-30" r="12" fill="none" stroke="${HERO_INK}" stroke-width="8"/>
      <circle cx="0" cy="-30" r="12" fill="none" stroke="${MAT.metal}" stroke-width="4"/>
      <path d="M-6 -35 A7 7 0 0 1 1 -38" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
    badge: () => `<ellipse cx="0" cy="0.8" rx="2.6" ry="3.4" fill="${HERO_INK}"/><circle cx="0" cy="-3" r="1.6" fill="${HERO_INK}"/><path d="M-2.4 -1 L-4.6 -2 M2.4 -1 L4.6 -2 M-2.6 1.4 L-4.8 1.4 M2.6 1.4 L4.8 1.4 M-2.2 3.4 L-4 4.8 M2.2 3.4 L4 4.8" stroke="${HERO_INK}" stroke-width="1.1" stroke-linecap="round"/>`,
  },
  Data: {
    accent: 'mint', sleeve: 'skin', top: -37, look: 'miner\'s headlamp, vest with pockets, pickaxe',
    outfit: x => `<path ${O} fill="${x.cloth}" d="${x.T('M-2 0 L13 0 L19 30 L18 44 L-2 44Z')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M42 0 L27 0 L21 30 L22 44 L42 44Z')}"/>
      <path class="o2 h-trim" fill="${shade(x.cloth, -14)}" d="${x.T('M4 25 H13 V33 H4Z M27 25 H36 V33 H27Z')}"/>
      <path class="h-trim" fill="${x.accent}" d="${x.T('M4 25 H13 V27.5 H4Z M27 25 H36 V27.5 H27Z')}"/>`,
    headgear: x => `<path d="M40 -50 L10 -33 L13 -22 L48 -24Z" fill="${MAT.paper}" opacity=".3"/><path d="M26 -41 L10 -33 L13 -22 L30 -24Z" fill="${x.accent}" opacity=".45"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${HERO_INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M-30 -10 C-20 -26 20 -26 30 -10" fill="none" stroke="${x.cloth}" stroke-width="4" stroke-linecap="round"/>
      <rect ${O} x="-6" y="-35" width="16" height="15" rx="4" fill="${MAT.steel}"/>
      <circle ${O2} cx="6" cy="-27.5" r="5.6" fill="${MAT.paper}"/><circle cx="6" cy="-27.5" r="2.6" fill="${x.accent}"/>`,
    tool: x => `<rect ${O} x="-2.8" y="-38" width="5.6" height="46" rx="2.8" fill="${MAT.wood}"/>
      <path ${O} fill="${MAT.steel}" d="M-17 -33 C-10 -46 10 -46 17 -33 L13 -32 C7 -39 -7 -39 -13 -32Z"/>
      <rect ${O2} x="-4" y="-42" width="8" height="7" rx="1.5" fill="${MAT.metal}"/>
      <path class="h-fine" d="M-11 -37 C-6 -41 2 -42 6 -41" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>`,
    badge: () => `<path d="M-4.2 4 V0.5 H-2 V4Z M-1.1 4 V-1.6 H1.1 V4Z M2 4 V-4 H4.2 V4Z" fill="${HERO_INK}"/>`,
  },
  DevOps: {
    accent: 'sun-deep', sleeve: 'skin', top: -40, look: 'hard hat, hi-vis vest, wrench',
    outfit: x => `<path ${O} fill="${x.accent}" d="${x.T('M-2 0 L14 0 L20 16 L26 0 L42 0 V44 H-2Z')}"/>
      <path class="h-trim" fill="${PALETTE.sun}" d="${x.T('M-2 20 H42 V24 H-2Z M-2 31 H42 V35 H-2Z')}"/>
      <path class="o2" fill="none" d="${x.T('M20 16 V44')}"/>`,
    headgear: x => `<path ${O} fill="${x.accent}" d="M-27 -13 C-28 -46 28 -46 27 -13Z"/>
      <path ${O2} fill="${shade(x.accent, 22)}" d="M-4.5 -38 C-2 -40.5 2 -40.5 4.5 -38 L4.5 -14 L-4.5 -14Z"/>
      <path class="h-fine" d="M-18 -27 C-15 -33 -10 -36 -6 -37" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>
      <path ${O} fill="${shade(x.accent, -22)}" d="M-37 -14 C-37 -19 37 -19 37 -14 C37 -9 -37 -9 -37 -14Z"/>`,
    tool: () => `<rect ${O} x="-3.4" y="-27" width="6.8" height="34" rx="3" fill="${MAT.steel}"/>
      <path ${O} fill="${MAT.steel}" d="M-3.8 -46 L-3.8 -37 L3.8 -37 L3.8 -46 C10 -44 13 -37 10 -30 C8 -26 4 -25 3 -25 L-3 -25 C-4 -25 -8 -26 -10 -30 C-13 -37 -10 -44 -3.8 -46Z"/>
      <path class="h-fine" d="M-7 -40 C-6 -43 -5 -44 -4 -44.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>
      <circle ${O2} cx="0" cy="-12" r="1.6" fill="${HERO_INK}"/>`,
    badge: () => `<path d="M0 0 C-1 -3 -4.6 -3 -4.6 0 C-4.6 3 -1 3 0 0 C1 -3 4.6 -3 4.6 0 C4.6 3 1 3 0 0Z" fill="none" stroke="${HERO_INK}" stroke-width="1.5"/>`,
  },
  Research: {
    accent: 'grape', sleeve: 'cloth', elbow: true, top: -42, look: 'mortarboard, cardigan, open book',
    outfit: x => `<path ${O} fill="${shade(x.accent, -10)}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M-2 0 H15 L18 44 H-2Z')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M25 0 H42 V44 H22Z')}"/>
      <g class="h-trim">${x.TC(19.8, 14, 1.7, `${O2} fill="${MAT.paper}"`)}${x.TC(20.3, 23, 1.7, `${O2} fill="${MAT.paper}"`)}${x.TC(20.8, 32, 1.7, `${O2} fill="${MAT.paper}"`)}</g>`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-24 -14 C-25 -30 25 -30 24 -14 C12 -18 -12 -18 -24 -14Z"/>
      <path ${O} fill="${shade(x.cloth, -14)}" d="M-34 -30 L2 -42 L34 -30 L-2 -20Z"/>
      <path class="h-fine" d="M-26 -30 L2 -39" stroke="#fff" stroke-width="1.4" opacity=".35"/>
      <circle cx="0" cy="-31" r="2.4" fill="${PALETTE.sun}"/>
      <path d="M0 -31 L24 -28 L26 -14" fill="none" stroke="${HERO_INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M0 -31 L24 -28 L26 -14" fill="none" stroke="${PALETTE.sun}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path ${O2} fill="${PALETTE.sun}" d="M23 -16 H29 L30 -6 H22Z"/>`,
    tool: x => `<path ${O} fill="${x.cloth}" d="M-19 -42 C-11 -45 -3 -44 0 -40 C3 -44 11 -45 19 -42 L19 -6 C11 -9 3 -8 0 -5 C-3 -8 -11 -9 -19 -6Z"/>
      <path ${O2} fill="${MAT.paper}" d="M-17 -41 C-10 -43 -3 -42 0 -38 L0 -7 C-3 -11 -10 -11 -17 -8Z"/>
      <path ${O2} fill="${MAT.paper}" class="h-page" d="M17 -41 C10 -43 3 -42 0 -38 L0 -7 C3 -11 10 -11 17 -8Z"/>
      <path class="h-fine" d="M-14 -34 H-4 M-14 -29 H-4 M-14 -24 H-6 M-14 -19 H-4 M4 -34 H14 M4 -29 H14 M4 -24 H11 M4 -19 H14" stroke="${MAT.steel}" stroke-width="1.4" stroke-linecap="round"/>`,
    badge: () => `<circle cx="0" cy="-1.2" r="2.9" fill="${HERO_INK}"/><rect x="-1.5" y="1.6" width="3" height="2.8" rx=".6" fill="${HERO_INK}"/><circle cx="-0.9" cy="-2.1" r=".8" fill="#fff"/>`,
  },
  Writer: {
    accent: 'sun', sleeve: 'paper', top: -48, look: 'newsboy cap with a quill, waistcoat and scarf, giant quill',
    outfit: x => `<path ${O} fill="${MAT.paper}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M-2 0 L12 0 L20 22 L20 44 L-2 44Z')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M42 0 L28 0 L20 22 L20 44 L42 44Z')}"/>
      <g class="h-trim">${x.TC(20, 28, 1.6, `fill="${PALETTE.sun}" ${O2}`)}${x.TC(20, 36, 1.6, `fill="${PALETTE.sun}" ${O2}`)}</g>
      <path ${O2} fill="${x.accent}" d="${x.T('M5 -1 C10 6 30 6 35 -1 L35 5 C30 11 10 11 5 5Z')}"/>
      <path ${O2} fill="${x.accent}" d="${x.T('M10 6 L5 27 L12 25 L16 7Z')}"/>`,
    headgear: x => `<path ${O} fill="${MAT.paper}" d="M-25 -2 C-38 -18 -38 -38 -33 -50 C-28 -38 -22 -20 -25 -2Z"/>
      <path d="M-25 -4 C-30 -20 -32 -36 -33 -48" fill="none" stroke="${MAT.steel}" stroke-width="1.4"/>
      <path ${O} fill="${x.cloth}" d="M-30 -11 C-35 -34 -6 -44 12 -40 C30 -36 35 -22 30 -11 C14 -15 -14 -15 -30 -11Z"/>
      <path class="h-fine" d="M-14 -38 L-2 -14 M8 -40 L6 -14" stroke="${shade(x.cloth, -28)}" stroke-width="1.3" fill="none"/>
      <circle ${O2} cx="3" cy="-40" r="2.8" fill="${shade(x.cloth, -18)}"/>
      <path ${O} fill="${shade(x.cloth, -20)}" d="M12 -14 C26 -17 39 -14 43 -8 C34 -5 22 -7 10 -9Z"/>`,
    tool: () => `<path ${O} fill="${MAT.paper}" d="M2 -4 C-14 -16 -15 -40 3 -56 C12 -42 14 -18 2 -4Z"/>
      <path d="M2 -4 C3 -22 3 -38 3 -54" fill="none" stroke="${MAT.steel}" stroke-width="1.6"/>
      <path class="h-fine" d="M3 -44 L-6 -38 M3 -36 L-8 -29 M3 -28 L-7 -21 M3 -40 L10 -35 M3 -31 L11 -25 M3 -22 L9 -17" stroke="${MAT.steel}" stroke-width="1.1"/>
      <path ${O2} fill="${HERO_INK}" d="M0.4 -5 L4.4 -5 L2 8Z"/>`,
    badge: () => `<path d="M1.4 4.4 V-4.2 M3.6 4.4 V-4.2 M4.4 -4.2 H0 C-2.6 -4.2 -3.6 -2.8 -3.6 -1.2 C-3.6 0.6 -2.4 1.6 0 1.6 H1.4" fill="none" stroke="${HERO_INK}" stroke-width="1.4"/>`,
  },
  Release: {
    accent: 'grape', sleeve: 'cloth', cuff: true, legs: 'cloth', top: -42, look: 'captain\'s peaked cap, double-breasted coat, flag',
    outfit: x => `<path ${O} fill="${x.cloth}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path ${O2} fill="${shade(x.cloth, 24)}" d="${x.T('M8 -1 L20 12 L13 1Z M32 -1 L20 12 L27 1Z')}"/>
      ${[16, 25, 34].map(y => x.TC(12.5, y, 2.1, `${O2} fill="${PALETTE.sun}"`) + x.TC(27.5, y, 2.1, `${O2} fill="${PALETTE.sun}"`)).join('')}`,
    headgear: x => `<path ${O} fill="${x.cloth}" d="M-27 -20 L27 -20 L26 -10 C10 -13 -10 -13 -26 -10Z"/>
      <path ${O} fill="${MAT.paper}" d="M-34 -24 C-36 -35 -18 -42 0 -42 C18 -42 36 -35 34 -24 C24 -18 -24 -18 -34 -24Z"/>
      <path class="h-fine" d="M-24 -33 C-14 -38 4 -39 14 -37" fill="none" stroke="${MAT.metal}" stroke-width="1.6"/>
      <path ${O} fill="${HERO_INK}" d="M-6 -11 C8 -13 23 -11 32 -4 C21 -1 7 -3 -8 -6Z"/>
      <circle ${O2} cx="0" cy="-15" r="4.4" fill="${PALETTE.sun}"/>
      <path d="M0 -18 V-12 M-2.2 -13.6 C-1.4 -12 1.4 -12 2.2 -13.6 M-1.4 -17 H1.4" fill="none" stroke="${HERO_INK}" stroke-width="1" stroke-linecap="round"/>`,
    tool: () => `<rect ${O} x="-2.2" y="-46" width="4.4" height="54" rx="2.2" fill="${MAT.wood}"/>
      <circle ${O} cx="0" cy="-48" r="3.4" fill="${PALETTE.sun}"/>
      <path ${O} fill="${PALETTE.coral}" class="o h-flag" d="M2 -44 C10 -46 18 -40 28 -38 C18 -34 10 -30 2 -30Z"/>`,
    badge: () => `<path d="M-2.6 4.4 V-4.4" stroke="${HERO_INK}" stroke-width="1.4" stroke-linecap="round"/><path d="M-2 -4.2 L4.4 -2.2 L-2 0Z" fill="${HERO_INK}"/>`,
  },
  Quality: {
    accent: 'mint', sleeve: 'steel', top: -54, look: 'knight\'s helm with plume, tabard, broom-lance',
    outfit: x => `<path ${O} fill="${MAT.steel}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path class="h-fine" fill="none" stroke="${shade(MAT.steel, -26)}" stroke-width="1" d="${x.T('M0 8 H40 M0 16 H40 M0 24 H40 M0 32 H40')}"/>
      <path ${O} fill="${x.cloth}" d="${x.T('M7 -1 H33 L35 44 H5Z')}"/>
      <path class="h-trim" fill="${x.accent}" d="${x.T('M17.5 -1 H22.5 V44 H17.5Z')}"/>
      <path ${O2} fill="${MAT.metal}" d="${x.T('M5 25 H35 V29.5 H5Z')}"/>`,
    headgear: x => `<path ${O} fill="${x.accent}" d="M2 -36 C-6 -56 -30 -58 -40 -42 C-33 -46 -25 -45 -20 -38 C-26 -41 -32 -38 -35 -31 C-24 -42 -10 -40 -2 -33Z"/>
      <path ${O} fill="${MAT.metal}" d="M-31 -6 C-32 -46 32 -46 31 -6 C24 -11 14 -13 0 -13 C-14 -13 -24 -11 -31 -6Z"/>
      <path ${O} fill="${MAT.metal}" d="M-32 -9 L-25 -10 L-24 6 L-31 4Z M32 -9 L25 -10 L24 6 L31 4Z"/>
      <path ${O} fill="${MAT.steel}" d="M-22 -24 C-10 -33 20 -33 28 -22 L27 -16 C16 -24 -10 -24 -21 -18Z"/>
      <path class="h-fine" d="M-10 -24 V-20 M-2 -25 V-21 M6 -25 V-21 M14 -24 V-20" stroke="${HERO_INK}" stroke-width="1.6" stroke-linecap="round"/>
      <path class="h-fine" d="M-20 -33 C-14 -38 -6 -40 2 -40" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>
      <circle cx="-26" cy="-3" r="1.4" fill="${HERO_INK}" class="h-fine"/><circle cx="26" cy="-3" r="1.4" fill="${HERO_INK}" class="h-fine"/>`,
    tool: x => `<rect ${O} x="-2.6" y="-48" width="5.2" height="58" rx="2.6" fill="${MAT.wood}"/>
      <path ${O} fill="${MAT.paper}" d="M-9 -48 C-11 -58 -4 -66 0 -70 C4 -66 11 -58 9 -48 Z"/>
      <path class="h-fine" d="M-4 -50 L-2 -64 M0 -50 V-66 M4 -50 L2 -64" stroke="${MAT.wood}" stroke-width="1.2"/>
      <rect ${O2} x="-7" y="-51" width="14" height="5" rx="2" fill="${x.accent}"/>`,
    badge: () => `<path d="M0 -4.8 C0.6 -1.2 1.2 -0.6 4.8 0 C1.2 0.6 0.6 1.2 0 4.8 C-0.6 1.2 -1.2 0.6 -4.8 0 C-1.2 -0.6 -0.6 -1.2 0 -4.8Z" fill="${HERO_INK}"/>`,
  },
  Director: {
    accent: 'sun', sleeve: 'cloth', top: -48, look: 'director\'s cap, sash, megaphone',
    outfit: x => `<path ${O} fill="${x.cloth}" d="${x.T('M-2 0 H42 V44 H-2Z')}"/>
      <path ${O2} fill="${shade(x.cloth, 26)}" d="${x.T('M9 -1 L20 11 L14 0Z M31 -1 L20 11 L26 0Z')}"/>
      <path ${O} fill="${PALETTE.coral}" d="${x.T('M2 -1 L11 -1 L42 30 L42 40Z')}"/>
      <path class="h-trim" d="${x.T('M30 24 L31.4 27.6 L35 28 L32.2 30.4 L33 34 L30 32 L27 34 L27.8 30.4 L25 28 L28.6 27.6Z')}" fill="${PALETTE.sun}" stroke="${HERO_INK}" stroke-width="1"/>`,
    headgear: x => `<path ${O} fill="${shade(x.cloth, -26)}" d="M-21 -22 L-19 -44 C-7 -49 7 -49 19 -44 L21 -22Z"/>
      <path ${O2} fill="${PALETTE.sun}" d="M-21 -30 L21 -30 L21 -23 L-21 -23Z"/>
      <path ${O} fill="${shade(x.cloth, -12)}" d="M-30 -18 C-20 -27 22 -27 40 -16 C30 -11 -18 -12 -30 -18Z"/>
      <path class="h-fine" d="M-14 -42 C-8 -45 0 -46 6 -45" fill="none" stroke="#fff" stroke-width="1.6" opacity=".4"/>`,
    tool: () => `<rect ${O} x="-3.2" y="-12" width="6.4" height="16" rx="2" fill="${MAT.steel}"/>
      <path ${O} fill="${PALETTE.sun}" d="M-4.5 -10 L-14 -42 C-6 -46 6 -46 14 -42 L4.5 -10Z"/>
      <ellipse ${O} cx="0" cy="-42.5" rx="14" ry="4.2" fill="${shade(PALETTE.sun, -40)}"/>
      <path class="h-fine" d="M-7 -36 L-3 -14" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
    badge: () => `<path d="M0 -4.4 L4.4 3.6 H-4.4Z" fill="${HERO_INK}"/>`,
  },
};

/* ---------- hair (head-local; colour = shade(c,-45)) — {back, front} ---------- */
function _hair(name, hc) {
  const f = (d, extra = '') => `<path ${O} fill="${hc}" d="${d}" ${extra}/>`;
  const side = f('M-29 -6 C-32 -14 -28 -20 -24 -22 C-26 -14 -26 -8 -24 -2Z') + f('M29 -6 C32 -14 28 -20 24 -22 C26 -14 26 -8 24 -2Z');
  switch (name) {
    case 'tuft': return { back: '', front: side + f('M-4 -28 C-10 -40 2 -46 8 -38 C3 -40 0 -36 3 -29Z') + f('M2 -29 C6 -36 14 -36 14 -30 C10 -32 7 -31 6 -28Z') };
    case 'spikes': return { back: '', front: f('M-28 -10 L-27 -27 L-17 -22 L-12 -40 L-3 -27 L5 -44 L11 -27 L22 -36 L22 -21 L30 -22 L28 -10 C18 -20 -18 -20 -28 -10Z') };
    case 'swoop': return { back: '', front: f('M-29 -4 C-33 -28 -12 -38 6 -36 C22 -34 32 -22 30 -6 C26 -16 18 -21 6 -20 C10 -16 10 -12 8 -10 C-2 -18 -18 -14 -29 -4Z') + `<path class="h-fine" d="M-16 -26 C-6 -32 8 -32 18 -26" fill="none" stroke="${shade(hc, 40)}" stroke-width="1.6" stroke-linecap="round"/>` };
    case 'bob': return { back: f('M-34 14 C-38 -20 -22 -36 0 -36 C22 -36 38 -20 34 14 C30 18 24 18 22 14 L-22 14 C-24 18 -30 18 -34 14Z'),
      front: f('M-29 -2 C-30 -28 30 -28 29 -2 C24 -12 14 -14 4 -12 C-6 -14 -20 -14 -29 -2Z') + `<path class="h-fine" d="M-12 -24 C-4 -28 6 -28 14 -24" fill="none" stroke="${shade(hc, 40)}" stroke-width="1.6" stroke-linecap="round"/>` };
    case 'bun': return { back: `<circle ${O} cx="0" cy="-35" r="10" fill="${hc}"/><path ${O2} fill="${shade(hc, 30)}" d="M-7 -28 C-3 -26 3 -26 7 -28 L6 -25 C2 -23 -2 -23 -6 -25Z"/>`,
      front: side + f('M-28 -8 C-30 -28 30 -28 28 -8 C20 -18 6 -20 0 -18 C-8 -20 -20 -18 -28 -8Z') };
    case 'curl': return { back: '', front: side + [[-22, -18, 7], [-14, -26, 7.5], [-4, -30, 7.5], [7, -29, 7.5], [17, -24, 7], [24, -15, 6]].map(([x, y, r]) => `<circle ${O} cx="${x}" cy="${y}" r="${r}" fill="${hc}"/>`).join('') +
      `<path class="h-fine" d="M-15 -27 a3 3 0 1 1 3 3 M5 -30 a3 3 0 1 1 3 3" fill="none" stroke="${shade(hc, 40)}" stroke-width="1.3"/>` };
    default: return { back: '', front: '' };
  }
}

/* ---------- accessory (eye-line / cheek) — {near, far, face, fixed} ---------- */
function _acc(name, x) {
  const lens = (fill, sw = 2.4) => `<ellipse cx="0" cy="0" rx="10" ry="10.4" fill="${fill}" stroke="${HERO_INK}" stroke-width="${sw}"/>`;
  switch (name) {
    case 'glasses': return { near: lens('rgba(255,255,255,.14)'), far: lens('rgba(255,255,255,.14)'), face: `<path d="M-1.4 3 C-0.4 1.6 0.4 1.6 1.4 3" fill="none" stroke="${HERO_INK}" stroke-width="2.4"/><path d="M-21 2 L-29 -1" stroke="${HERO_INK}" stroke-width="2.4" stroke-linecap="round"/>` };
    case 'shades': return { near: `<rect x="-10.5" y="-7" width="21" height="14" rx="6" fill="${HERO_INK}" stroke="${HERO_INK}" stroke-width="2"/><path d="M-6 -3 L-1 -3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
      far: `<rect x="-10.5" y="-7" width="21" height="14" rx="6" fill="${HERO_INK}" stroke="${HERO_INK}" stroke-width="2"/><path d="M-6 -3 L-1 -3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
      face: `<path d="M-1 0 H1" stroke="${HERO_INK}" stroke-width="3"/>`, cover: true };
    case 'monocle': return { far: `<circle r="10.4" fill="rgba(255,255,255,.16)" stroke="${PALETTE.sun}" stroke-width="2.6"/><circle r="10.4" fill="none" stroke="${HERO_INK}" stroke-width="1" opacity=".8"/>`,
      face: `<path class="h-fine" d="M19 13 C20 20 16 26 12 30" fill="none" stroke="${PALETTE.sun}" stroke-width="1.4"/>` };
    case 'mustache': return { face: `<path ${O2} fill="${x.hairC}" d="M0 10 C-4 7 -10 7 -13 11 C-15 13 -14 16 -12 16 C-11 13 -6 13 0 13 C6 13 11 13 12 16 C14 16 15 13 13 11 C10 7 4 7 0 10Z"/>` };
    case 'freckles': { const dots = pts => pts.map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.3"/>`).join('');
      return { face: `<g fill="${x.dark}" opacity=".7">${dots([[-18, 10], [-14, 12.5], [-19, 14]])}<g class="h-acc-far">${dots([[14, 12.5], [18, 10], [19, 14]])}</g></g>` }; }
    case 'bow': { const bc = x.hueKey === 'coral' || x.hueKey === 'rose' ? PALETTE.sun : PALETTE.coral;
      return { fixed: `<g transform="translate(-24 -20) rotate(-20)"><path ${O2} fill="${bc}" d="M0 0 L-9 -6 L-9 6Z M0 0 L9 -6 L9 6Z"/><circle ${O2} r="3" fill="${shade(bc, -30)}"/></g>` }; }
    case 'flower': return { fixed: `<g transform="translate(-26 -14)">${[0, 72, 144, 216, 288].map(a => `<ellipse ${O2} rx="3.6" ry="5.6" fill="${MAT.paper}" transform="rotate(${a}) translate(0 -5)"/>`).join('')}<circle ${O2} r="3.2" fill="${PALETTE.sun}"/></g>` };
    default: return {};
  }
}

/* ---------- pose props ---------- */
function _implement(role, hold) {
  if (hold === 'pen') return `<g transform="rotate(28)"><rect ${O} x="-2.8" y="-16" width="5.6" height="24" rx="2.6" fill="${PALETTE.coral}"/><path ${O2} fill="${MAT.paper}" d="M-2.8 8 L2.8 8 L0 15Z"/><path fill="${PALETTE.coral}" d="M-1 12 L1 12 L0 15Z"/></g>`;
  if (role === 'Writer') return `<g transform="rotate(26)"><path ${O} fill="${MAT.paper}" d="M0 8 C-9 0 -10 -16 1 -27 C7 -17 8 -2 0 8Z"/><path d="M0 8 V-24" stroke="${MAT.steel}" stroke-width="1.2"/><path fill="${HERO_INK}" d="M-1.2 8 L1.2 8 L0 15Z"/></g>`;
  const body = role === 'Frontend' ? PALETTE.teal : PALETTE.sun;
  return `<g transform="rotate(28)"><rect ${O} x="-3" y="-17" width="6" height="25" fill="${body}"/><path ${O2} fill="${MAT.wood}" d="M-3 8 L3 8 L0 15Z"/><path fill="${HERO_INK}" d="M-1 12 L1 12 L0 15Z"/><rect ${O2} x="-3" y="-21" width="6" height="4" rx="1.5" fill="${PALETTE.rose}"/></g>`;
}
function _handProp(kind, x) {
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
    case 'pen': return _implement(x.role, 'pen');
    case 'implement': return _implement(x.role, null);
    default: return '';
  }
}
function _deskProp(kind, g) {
  const sy = g.sh, fx = g.torso.x;
  if (kind === 'laptop') {
    const y = sy + 14, l = fx + 12, rgt = fx + g.torso.w + 26;
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
function _px(size) { return typeof size === 'number' ? size : (HERO_SIZES[size] || HERO_SIZES.sm); }
function _sizeName(px) { return px < 64 ? 'xs' : px < 128 ? 'sm' : px < 260 ? 'md' : 'xl'; }
function _faceCls(f) { return f === 'front' ? 'face-front' : f === 'side' ? 'face-side' : 'face-3q'; }
function _norm(agent = {}, opts = {}) {
  const role = opts.ghost ? null : (opts.role || agent.role || null);
  return {
    name: agent.name || 'New agent', id: agent.id || '',
    hueKey: agent.hue || 'sun', build: BUILD_DEF[agent.build] ? agent.build : 'hero',
    hair: HAIR.includes(agent.hair) ? agent.hair : 'none',
    accessory: ACCESSORIES.includes(agent.accessory) ? agent.accessory : 'none',
    role: ROLE_GEAR[role] ? role : null, roleLabel: role || '',
  };
}
function _ctx(n) {
  const c = hueHex(n.hueKey); const g = BUILD_DEF[n.build]; const gear = n.role ? ROLE_GEAR[n.role] : null;
  const accent = gear ? hueHex(gear.accent) : c;
  const sx = g.torso.w / 40, sy = g.torso.h / 42;
  const X = v => v * sx + g.torso.x, Y = v => v * sy + g.torso.y;
  return {
    c, dark: shade(c, -26), light: shade(c, 22), hairC: shade(c, -45), hueKey: n.hueKey, role: n.role,
    accent, cloth: shade(accent, -70), MAT, g, gear, sx, sy, X, Y,
    T: d => _tp(d, sx, sy, g.torso.x, g.torso.y),
    TC: (cx, cy, r, attrs) => `<circle cx="${_r(X(cx))}" cy="${_r(Y(cy))}" r="${_r(r * (sx + sy) / 2)}" ${attrs}/>`,
  };
}
function _holdFor(pose, opts) {
  if (opts.holding && opts.holding !== 'none') return opts.holding;
  if (opts.holding === 'none' || opts.props === false) return null;
  return (POSE_DEF[pose] || {}).hold || null;
}
function _seatedFor(pose, opts) { return opts.seated != null ? !!opts.seated : !!(POSE_DEF[pose] || {}).seated; }

function _anchorY(x, seated) {
  const { head } = x.g; const k = head.r / 30;
  const top = Math.min(head.cy - head.r, head.cy + (x.gear ? x.gear.top : -30) * k);
  return top - 2 + (seated ? 18 : 0);
}

/* ============================================================
   Markup
   ============================================================ */
function _arm(side, x, n, o) {
  const g = x.g; const isF = side === 'f';
  const sx = isF ? g.torso.x + 6 : g.torso.x + g.torso.w - 6;
  const gear = x.gear || {};
  const sleeve = gear.sleeve === 'cloth' ? x.cloth : gear.sleeve === 'paper' ? MAT.paper : gear.sleeve === 'steel' ? MAT.steel : (isF ? x.c : x.dark);
  const sleeveB = isF ? sleeve : shade(sleeve, gear.sleeve && gear.sleeve !== 'skin' ? -14 : 0);
  const sc = isF ? sleeve : sleeveB;
  const band = isF && o.band ? `<rect x="-7.6" y="4" width="15.2" height="9" rx="2" fill="${o.band}" stroke="${HERO_INK}" stroke-width="1.8"/>
      <path transform="translate(0 8.5) scale(.75)" d="M0 -5 L1.5 -1.6 L5 -1.6 L2.2 0.7 L3.2 4.2 L0 2.2 L-3.2 4.2 L-2.2 0.7 L-5 -1.6 L-1.5 -1.6Z" fill="${PALETTE.sun}" stroke="${HERO_INK}" stroke-width="1.2"/>` : '';
  const deco = gear.elbow ? `<ellipse class="h-trim" cx="0" cy="2" rx="4" ry="3.4" fill="${shade(x.cloth, -22)}"/>`
    : gear.cuff ? `<rect class="h-trim" x="-5.6" y="8.5" width="11.2" height="2.6" fill="${PALETTE.sun}"/>` : '';
  const content = isF ? `<g class="h-prop">${o.hand}</g>` : `<g class="h-tool">${o.tool}</g>`;
  return `<g class="h-arm h-arm-${side}" transform="translate(${sx} ${g.sh})"><g class="h-sh">
    <g class="h-ua"><line class="h-limb-o" x1="0" y1="0" x2="0" y2="13"/><line class="h-limb" x1="0" y1="0" x2="0" y2="13" stroke="${sc}"/>${band}</g>
    <g class="h-el"><g class="h-fa"><line class="h-limb-o" x1="0" y1="0" x2="0" y2="13"/><circle r="5.5" fill="${sc}"/><line class="h-limb" x1="0" y1="0" x2="0" y2="13" stroke="${sc}"/>${deco}</g>
      <g class="h-hnd"><g class="h-hj"><g class="h-up">${content}</g><circle ${O} class="o h-hand" r="6.5" fill="${x.light}"/></g></g>
    </g></g></g>`;
}
function _legs(x) {
  const g = x.g; const hip = g.torso.y + g.torso.h - 8; const L = 146 - hip; const dx = _r(g.legW * 0.6);
  const legC = x.gear && x.gear.legs === 'cloth' ? x.cloth : x.dark;
  const leg = (cls, lx, col) => `<g class="h-leg ${cls}" transform="translate(${_r(lx)} ${hip})"><g class="h-lr">
    <line class="h-limb-o" x1="0" y1="0" x2="0" y2="${L}" style="stroke-width:calc(${g.legW}px + 2*var(--ol))"/>
    <line class="h-limb" x1="0" y1="0" x2="0" y2="${L}" stroke="${col}" style="stroke-width:${g.legW}px"/>
    <ellipse ${O} cx="3" cy="${L + 1.5}" rx="${_r(g.legW * 0.62 + 2)}" ry="5" fill="${HERO_INK}"/>
    <ellipse class="h-fine" cx="1" cy="${L - 0.5}" rx="3" ry="1.4" fill="#ffffff" opacity=".22"/></g></g>`;
  return `<g class="h-legs">${leg('h-leg-b', 60 + dx, shade(legC, -12))}${leg('h-leg-f', 60 - dx, legC)}</g>`;
}
function _torso(x, uid) {
  const g = x.g; const d = x.T('M13 0 H27 C35 0 40 5 40 13 V30 C40 37 35 42 28 42 H12 C5 42 0 37 0 30 V13 C0 5 5 0 13 0Z');
  const gear = x.gear; const chest = { x: _r(g.torso.x + g.torso.w * 0.66), y: _r(g.torso.y + g.torso.h * 0.36) };
  const badge = gear ? `<g class="h-badge" transform="translate(${chest.x} ${chest.y})"><g class="h-badge-in"><circle ${O2} r="7" fill="${x.accent}"/>${gear.badge(x)}</g></g>` : '';
  return `<g class="h-torso"><defs><clipPath id="hc${uid}"><path d="${d}"/></clipPath></defs>
    <path ${O} d="${d}" fill="${x.c}"/>
    <ellipse class="h-fine" cx="${_r(g.torso.x + g.torso.w * 0.38)}" cy="${_r(g.torso.y + g.torso.h * 0.6)}" rx="${_r(g.torso.w * 0.22)}" ry="${_r(g.torso.h * 0.24)}" fill="${x.light}" opacity=".45"/>
    <g class="h-outfit" clip-path="url(#hc${uid})">${gear ? gear.outfit(x) : ''}</g>
    <path class="o h-torso-line" d="${d}" fill="none"/>${badge}</g>`;
}
function _eye(side, x, acc) {
  const ex = side === 'near' ? -11 : 11;
  const extra = acc[side] || '';
  return `<g transform="translate(${ex} 4)"><g class="h-eye ${side}">
    <ellipse ${O2} class="o2 h-white" rx="7.4" ry="8.6" fill="#fff"/>
    <g class="h-glance"><g class="h-pupil"><ellipse rx="4.1" ry="4.8" fill="${HERO_INK}"/><circle class="h-catch" cx="-1.5" cy="-1.9" r="1.5" fill="#fff"/><circle class="h-fine" cx="1.5" cy="1.8" r=".7" fill="#fff" opacity=".7"/></g></g>
    <g transform="translate(0 -9.4)"><ellipse class="o2 h-lid" cx="0" cy="9.4" rx="8.2" ry="9.4" fill="${x.c}"/></g>
    <path class="h-shut h-shut-s" d="M-6.5 2 Q0 7.5 6.5 2"/><path class="h-shut h-shut-h" d="M-6.5 5 Q0 -3 6.5 5"/>
    <path class="h-shut h-shut-x" d="${side === 'near' ? 'M-5 -2.5 L4 2 L-5 6.5' : 'M5 -2.5 L-4 2 L5 6.5'}"/>
    ${extra}</g></g>`;
}
function _head(x, n, uid) {
  const { head } = x.g; const k = _r(head.r / 30);
  const hr = _hair(n.hair, x.hairC); const acc = _acc(n.accessory, x);
  const browC = x.hairC;
  const mouths = `<g class="h-mouths">
    <path class="h-mouth m-l" data-m="smile" d="M-7.5 13 Q0 21 7.5 13"/>
    <path class="h-mouth m-l" data-m="focus" d="M-5 15.5 Q0 18 5 15.5"/>
    <path class="h-mouth m-f" data-m="talkA" d="M-6 13 Q0 13.5 6 13 Q5.5 22 0 22 Q-5.5 22 -6 13Z"/>
    <path class="h-mouth m-l" data-m="talkB" d="M-4.5 15.5 Q0 18.5 4.5 15.5"/>
    <path class="h-mouth m-l" data-m="worried" d="M-6 18 Q0 13 6 18"/>
    <g class="h-mouth" data-m="grin"><path class="m-f" d="M-9.5 12 Q0 13.5 9.5 12 Q9 25 0 25 Q-9 25 -9.5 12Z"/><path d="M-4.5 21.5 Q0 18 4.5 21.5 Q2.5 24 0 24 Q-2.5 24 -4.5 21.5Z" fill="${PALETTE.coral}"/></g>
    <circle class="h-mouth m-f" data-m="o" cx="1" cy="17" r="2.8"/>
    <g class="h-mouth" data-m="tongue"><circle cx="3.6" cy="17" r="2.6" fill="${PALETTE.coral}" stroke="${HERO_INK}" stroke-width="1.2"/><path class="m-l" d="M-5 15.5 Q0 17 5 15.5"/></g>
    <path class="h-mouth m-l" data-m="flat" d="M-4.5 16 L4.5 16"/>
    <path class="h-mouth m-l" data-m="wavy" d="M-7 16 Q-3.5 13 0 16 Q3.5 19 7 16"/></g>`;
  const gearSVG = x.gear ? x.gear.headgear(x) : '';
  return `<g class="h-head" transform="translate(${head.cx} ${head.cy + head.r})"><g class="h-tilt"><g transform="translate(0 ${-head.r}) scale(${k})">
    <g class="h-hair-back">${hr.back}</g>
    <circle ${O} r="30" fill="${x.c}"/>
    <ellipse class="h-sheen" cx="-12" cy="-15" rx="10" ry="6.5" transform="rotate(-32 -12 -15)" fill="#fff" opacity=".28"/>
    <g class="h-hair">${hr.front}</g>
    <g class="h-face">
      <g transform="translate(-11 -10)"><rect class="h-brow near" x="-5" y="-1.7" width="10" height="3.4" rx="1.7" fill="${browC}"/></g>
      <g transform="translate(11 -10)"><rect class="h-brow far" x="-5" y="-1.7" width="10" height="3.4" rx="1.7" fill="${browC}"/></g>
      ${_eye('near', x, acc)}${_eye('far', x, acc)}
      <ellipse class="h-blush near" cx="-19" cy="13" rx="5.2" ry="3.2" fill="${PALETTE.rose}"/>
      <ellipse class="h-blush far" cx="19" cy="13" rx="5.2" ry="3.2" fill="${PALETTE.rose}"/>
      <ellipse class="h-nose" cx="1.5" cy="8.5" rx="2.6" ry="1.9" fill="${x.dark}" opacity=".55"/>
      <g class="h-acc-f">${acc.face || ''}</g>
      ${mouths}
    </g>
    <text class="h-q" x="0" y="12" text-anchor="middle">?</text>
    <g class="h-headgear">${gearSVG}</g>
    <g class="h-acc">${acc.fixed || ''}</g>
  </g></g></g>`;
}

function _classes(n, o) {
  const px = _px(o.size); const pose = POSES.includes(o.pose) ? o.pose : 'idle';
  const pd = POSE_DEF[pose]; const seated = _seatedFor(pose, o);
  const cls = ['hero', 'size-' + _sizeName(px), 'pose-' + pose, _faceCls(o.facing), o.dir === 'left' ? 'dir-l' : 'dir-r'];
  if (px < 64) cls.push('lod-xs');
  if (o.captain) cls.push('is-captain');
  if (seated) cls.push('seated');
  if (o.ghost) cls.push('ghost');
  if (pd.tool && n.role) cls.push('tool-on');
  if (o.moving) cls.push('moving');
  return { cls: cls.join(' '), px, pose, pd, seated };
}
function _label(n, pose) {
  const role = n.roleLabel || 'Agent';
  return `${n.name}, ${role}, ${POSE_TEXT[pose] || pose}`;
}
function _fx(o, px) {
  const pip = o.captain && px < 100 && typeof captainPip === 'function' ? captainPip(o.armband || PALETTE.sun).outerHTML : '';
  return `<div class="h-fx" aria-hidden="true"><span class="fx-pip">${pip}</span><span class="fx-bang">!</span>
    <span class="fx-z"><i>z</i><i>z</i><i>Z</i></span><span class="fx-spark"><i>✦</i><i>✦</i><i>✦</i></span><span class="fx-think"><i></i><i></i><i></i></span></div>`;
}

function heroSVG(agent, opts = {}) {
  const o = Object.assign({ size: 'sm', pose: 'idle', facing: 'three-quarter', dir: 'right', look: null, props: true }, opts);
  const n = _norm(agent, o); const x = _ctx(n); const uid = ++_heroSeq;
  const st = _classes(n, o);
  const pose = st.pose;
  const ol = st.px < 64 ? Math.max(4.5, 1.5 * 160 / st.px) : st.px >= 240 ? 2.5 : 3;
  const hold = _holdFor(pose, o);
  const showBand = (o.captain || o.armband) && st.px >= 100 ? (o.armband ? hueHex(o.armband) : PALETTE.sun) : null;
  const hand = hold ? _handProp(hold, x) : '';
  const desk = o.props === false ? '' : _deskProp(st.pd.desk, x.g);
  const tool = x.gear ? x.gear.tool(x) : '';
  const look = o.facing === 'front' ? { x: 0, y: 0 } : (o.look === 'viewer' ? { x: 0, y: 0 } : o.look);
  const lookCss = look ? `--lx:${look.x};--ly:${look.y};` : '';
  const ay = _anchorY(x, st.seated);
  const g = x.g; const hip = g.torso.y + g.torso.h - 8;
  const delay = -(Math.random() * 3.6).toFixed(2);
  const aria = o.label ? ` role="img" aria-label="${escapeAttr(_label(n, pose))}"` : ' aria-hidden="true"';
  const sr = o.label && (st.pd.fx === 'bang' || pose === 'sleeping') ? `<span class="sr-only">${pose === 'sleeping' ? 'sleeping' : 'needs your input'}</span>` : '';
  const shadowRing = `<ellipse class="h-cring" cx="60" cy="152" rx="29" ry="6.5" fill="none" stroke="${PALETTE.sun}" stroke-width="2"/>`;
  return `<div class="${st.cls}"${aria} data-hero="${uid}" data-name="${escapeAttr(n.name)}" data-id="${escapeAttr(n.id)}" data-hue="${n.hueKey}" data-build="${n.build}" data-hair="${n.hair}" data-acc="${n.accessory}" data-role="${escapeAttr(n.roleLabel)}" data-mouth="${st.pd.mouth}" data-eyes="${st.pd.eyes || 'open'}" data-hold="${hold || ''}"${o.armband ? ` data-band="${escapeAttr(o.armband)}"` : ''} style="--hpx:${st.px}px;width:${_r(st.px * 0.75)}px;height:${st.px}px;--ol:${_r(ol)}px;--hue:${x.c};--head-y:${_r(ay / 160 * 100)}%;--dl:${delay}s;${lookCss}">
  <svg viewBox="0 0 120 160" aria-hidden="true" focusable="false">
    <ellipse class="h-shadow" cx="60" cy="152" rx="26" ry="5"/>${shadowRing}
    <g class="h-flip"><g class="h-rig"><g class="h-body" style="transform-origin:60px ${hip}px">
      ${_arm('b', x, n, { tool })}
      ${_legs(x)}
      ${_torso(x, uid)}
      ${_head(x, n, uid)}
      <g class="h-desk">${desk}</g>
      ${_arm('f', x, n, { hand, band: showBand })}
    </g></g></g>
  </svg>${_fx(o, st.px)}${sr}</div>`;
}

function hero(agent, opts = {}) {
  const t = document.createElement('template');
  t.innerHTML = heroSVG(agent, opts).trim();
  const el = t.content.firstElementChild;
  el._hero = { agent, opts: Object.assign({ size: 'sm', pose: 'idle', facing: 'three-quarter', dir: 'right', props: true }, opts) };
  return el;
}

/* recover state for elements made from heroSVG strings */
function _state(el) {
  if (!el._hero) {
    const d = el.dataset;
    el._hero = {
      agent: { name: d.name, id: d.id, hue: d.hue, build: d.build, hair: d.hair, accessory: d.acc, role: d.role },
      opts: { size: parseFloat(el.style.getPropertyValue('--hpx')) || 96, pose: POSES.find(p => el.classList.contains('pose-' + p)) || 'idle',
        facing: el.classList.contains('face-front') ? 'front' : el.classList.contains('face-side') ? 'side' : 'three-quarter',
        dir: el.classList.contains('dir-l') ? 'left' : 'right', captain: el.classList.contains('is-captain'), ghost: el.classList.contains('ghost'),
        armband: d.band || null, props: true },
    };
  }
  return el._hero;
}

/* in-place pose swap: classes, mouth/eyes, hand prop, desk prop, fx — no re-render */
function setPose(el, pose, o = {}) {
  if (!el) return;
  const st = _state(el);
  const opts = st.opts;
  opts.pose = POSES.includes(pose) ? pose : 'idle';
  ['seated', 'props', 'holding', 'moving'].forEach(k => { if (k in o) opts[k] = o[k]; });
  const n = _norm(st.agent, opts); const x = _ctx(n);
  const pd = POSE_DEF[opts.pose]; const seated = _seatedFor(opts.pose, opts);
  POSES.forEach(p => el.classList.remove('pose-' + p));
  el.classList.add('pose-' + opts.pose);
  el.classList.toggle('seated', seated);
  el.classList.toggle('tool-on', !!(pd.tool && n.role));
  el.classList.toggle('moving', !!opts.moving);
  el.dataset.mouth = pd.mouth; el.dataset.eyes = pd.eyes || 'open';
  const hold = _holdFor(opts.pose, opts); el.dataset.hold = hold || '';
  const hp = el.querySelector('.h-prop'); if (hp) hp.innerHTML = hold ? _handProp(hold, x) : '';
  const dk = el.querySelector('.h-desk'); if (dk) dk.innerHTML = opts.props === false ? '' : _deskProp(pd.desk, x.g);
  el.style.setProperty('--head-y', _r(_anchorY(x, seated) / 160 * 100) + '%');
  if (el.getAttribute('role') === 'img') el.setAttribute('aria-label', _label(n, opts.pose));
  return el;
}

/* THE turn transition: head (face/eyes) turns in 250ms, arms follow 80ms later (CSS) */
function setFacing(el, facing, o = {}) {
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
function setLook(el, look) {
  if (!el) return;
  if (look == null) { el.style.removeProperty('--lx'); el.style.removeProperty('--ly'); return el; }
  const l = look === 'viewer' ? { x: 0, y: 0 } : look;
  el.style.setProperty('--lx', Math.max(-1, Math.min(1, l.x || 0)));
  el.style.setProperty('--ly', Math.max(-1, Math.min(1, l.y || 0)));
  return el;
}
function heroHeadAnchor(el) {
  const h = el.getBoundingClientRect().height || parseFloat(el.style.height);
  const pct = parseFloat(el.style.getPropertyValue('--head-y')) || 10;
  return { x: (el.getBoundingClientRect().width || parseFloat(el.style.width)) / 2, y: h * pct / 100 };
}

/* v2 shim */
function castOf(agent, mood, size) { return hero(agent, { size: size ? parseFloat(size) : 'sm', pose: MOOD_TO_POSE[mood] || 'idle' }); }
