/* ============================================================
   archetype-gear.ts — Blair's finished look parts for the nine
   archetype agents (see ../design-cards.md). Same format as
   ROLE_GEAR in app/src/characters/hero-svg.ts, so each kit can be
   pasted in as-is:
     headgear → head-local (shell ≈ r30, screen y -15..19; hats sit above y -14)
     tool     → hand-local (origin = hand centre, long axis up)
     outfit   → chassis decal in torso-local 40×42 via x.T / x.TC
     badge    → badge-local (drawn on a 7-radius disc of the kit accent)
   Classes: .o / .o2 = ink outline; .h-fine / .h-trim drop at xs size.
   New motion hooks (optional CSS, parts look complete without them):
     .h-flame .h-float .h-balloon .h-bubble .h-rope .h-ribbon
   ============================================================ */
import type { Gear } from '../../../app/src/characters/hero-svg';
import { HERO_INK, MAT } from '../../../app/src/characters/hero-svg';
import { PALETTE, shade } from '../../../app/src/design/palette';

const O = 'class="o"', O2 = 'class="o2"';
const GLASS = '#e8fcff'; /* = BOT_GLOW, the screen-eye glow: the studio's "light" colour */
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

export const ARCHETYPE_GEAR: Record<string, Gear> = {
  /* 1 · Sola Simplex — the product visionary. No hat on purpose: the eraser is the whole costume. */
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

  /* 2 · Brisk Ignis — the daring engineer-founder. */
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

  /* 3 · Tally Starboard — the starship navigator. */
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

  /* 4 · Sable Quietstar — the space-opera knight-guardian. */
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

  /* 5 · Rivet Dash — the space-opera rogue. */
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

  /* 6 · Marigold Wishwell — the fairy-tale dreamer. */
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

  /* 7 · Calliope Ridewright — the theme-park dreamer. */
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

  /* 8 · Quillon Hollowbrook — the wizarding-school scholar. */
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

  /* 9 · Bramble Fizzwick — the potions-class experimenter. Tool only: wears the existing mortarboard. */
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

/** New hat ids → [label, kit] (append to HATS). */
export const ARCHETYPE_HATS: Record<string, [string, string]> = {
  visor: ['Launch visor', 'Moonshot'],
  starcrest: ['Star crest', 'Navigator'],
  hood: ['Warden\'s hood', 'Warden'],
  flightcap: ['Flight cap', 'Rogue'],
  crown: ['Little crown', 'Fable'],
  boater: ['Straw boater', 'Showman'],
  starhat: ['Star hat', 'Archivist'],
};
/** New tool ids → [label, kit] (append to TOOLS). */
export const ARCHETYPE_TOOLS: Record<string, [string, string]> = {
  eraser: ['Giant eraser', 'Visionary'],
  rocket: ['Toy rocket', 'Moonshot'],
  starcompass: ['Star compass', 'Navigator'],
  crystalstaff: ['Crystal staff', 'Warden'],
  grapple: ['Grappling hook', 'Rogue'],
  wand: ['Star wand', 'Fable'],
  balloon: ['Balloon', 'Showman'],
  scroll: ['Scroll', 'Archivist'],
  flask: ['Bubbling flask', 'Alchemist'],
};

/** The nine archetype agents' looks (agent.look). */
export const ARCHETYPE_LOOKS: Record<string, { hat: string; tool: string; body: string; antenna: string; face: string; hue: string; decal?: string }> = {
  'Sola Simplex': { hat: 'none', tool: 'eraser', body: 'lanky', antenna: 'none', face: 'none', hue: 'sky', decal: 'Visionary' },
  'Brisk Ignis': { hat: 'visor', tool: 'rocket', body: 'bruiser', antenna: 'spikes', face: 'none', hue: 'coral' },
  'Tally Starboard': { hat: 'starcrest', tool: 'starcompass', body: 'hero', antenna: 'bob', face: 'freckles', hue: 'teal' },
  'Sable Quietstar': { hat: 'hood', tool: 'crystalstaff', body: 'lanky', antenna: 'none', face: 'none', hue: 'grape' },
  'Rivet Dash': { hat: 'flightcap', tool: 'grapple', body: 'hero', antenna: 'swoop', face: 'shades', hue: 'sun' },
  'Marigold Wishwell': { hat: 'crown', tool: 'wand', body: 'sprout', antenna: 'bob', face: 'freckles', hue: 'rose' },
  'Calliope Ridewright': { hat: 'boater', tool: 'balloon', body: 'hero', antenna: 'none', face: 'mustache', hue: 'mint' },
  'Quillon Hollowbrook': { hat: 'starhat', tool: 'scroll', body: 'lanky', antenna: 'none', face: 'monocle', hue: 'grape' },
  'Bramble Fizzwick': { hat: 'mortarboard', tool: 'flask', body: 'sprout', antenna: 'bun', face: 'glasses', hue: 'mint' },
};
