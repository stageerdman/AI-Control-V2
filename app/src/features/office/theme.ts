/* The Office's ART — the prototype's office-theme.js (spec-office §1), typed. Pure drawing: knows
   what a couch looks like, never what an agent is doing. Everything is placed from the floor plan
   (layout.ts), so the room grows with the team. Calm by design: few objects, no labels you must read.
   Added for U4: the Reports tray (spec-reports §1.1) — a filing cabinet with a letter tray on top;
   unread reports = 1–3 sheets in the tray, the top one with a coral tab.

     officeArt(plan, ctx) → SVG string, the dollhouse room (viewBox 0 -70 W 1062)
     syncArt(svgRoot, facts) → live bits: whiteboard (ring, bars, list), health grades, outbox flag,
                               sheets in the reports tray
     desk / chair / couchFront / glyph / deskSync / setDoor */
/* biome-ignore-all lint/style/useTemplate: ported art, kept close to the prototype */

import { escapeHtml, hueHex, PALETTE, shade } from '../../design/palette';
import { tileGlyph } from '../projects/tile';
import type { Plan, Pod } from './layout';
import { plaqueLines } from './portrait';

export type ArtTeam = { name: string; color: string };
export type DeskKind = 'pod' | 'hot' | 'boss';
export type DeskOpts = {
  hue?: string | null;
  accent?: string | null;
  item?: 'mug' | 'plant' | 'telescope' | 'binder' | 'tent' | null;
};
/** tray: the desk note (STUDIO LIFE) — 'new' glows until the viewer opens it. */
export type DeskState = { glyph: string; hue: string; tray?: null | 'note' | 'new' };
/** What the wall shows, straight from the backend's state. */
export type BoardFacts = {
  /** Overall % (the latest goal's progress). */
  overall: number;
  /** In-progress features (first 3 drawn). */
  now: { name: string; pct: number; blocked?: boolean }[];
  /** The task list (last 7 drawn). */
  tasks: { text: string; done: boolean }[];
  /** Nothing uncommitted → the outbox flag is up. */
  fresh: boolean;
  grades: { key: string; name: string; grade: string }[];
  unreadReports: number;
  /** The wall clock by the door is the work clock: its hands tick slowly while agents work (live runs). */
  live: number;
  /** STUDIO LIFE: new letters in the mailbox (0–3 envelopes peek out of the slot). */
  newMail: number;
  /** The project's portrait: display name, picture (full URL; null = its tile). */
  portrait: { name: string; image: string | null; tile: { g1: string; g2: string; glyph: string } } | null;
};

export const OT_INK = '#241a44';
const OT = {
  wall: '#f6e2c6',
  wallHi: '#fbeedb',
  wallLo: '#ecd0ad',
  stripe: '#f0d7b6',
  wains: '#93c4b0',
  wainsLo: '#7db29d',
  rail: '#b9773f',
  base: '#7a4b2c',
  floor: '#d9a46b',
  floorLo: '#c48a51',
  seam: '#b97d45',
  wood: '#c98a50',
  woodLo: '#a96d3a',
  woodHi: '#e8b77f',
  metal: '#c9c3dd',
  steel: '#8e86ad',
  paper: '#fff6e9',
  glass: '#bfe6ff',
  screen: '#1d1638',
  bezel: '#3a2f5c',
  boss: '#ffe0a3',
  bossStripe: '#ffd27f',
  carpet: '#e9b38a',
};
const _o = (w = 3): string =>
  `stroke="${OT_INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/* gentle one-point perspective for things on the floor: x drifts outward as y nears */
let _otCX = 800;
const _otP = (x: number, y: number): number =>
  +(_otCX + (x - _otCX) * (0.9 + (0.1 * (y - 380)) / 520)).toFixed(1);

/* ---------------------------------------------------------------- room */
function _otDefs() {
  return `<defs>
    <linearGradient id="otWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${OT.wallLo}"/><stop offset=".35" stop-color="${OT.wall}"/><stop offset="1" stop-color="${OT.wallHi}"/></linearGradient>
    <linearGradient id="otBoss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7cf86"/><stop offset="1" stop-color="${OT.boss}"/></linearGradient>
    <linearGradient id="otFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${OT.floorLo}"/><stop offset=".5" stop-color="${OT.floor}"/><stop offset="1" stop-color="#e2ad72"/></linearGradient>
    <linearGradient id="otSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4bb0"/><stop offset=".55" stop-color="#c77bb7"/><stop offset="1" stop-color="#ffb487"/></linearGradient>
    <radialGradient id="otPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3cf" stop-opacity=".5"/><stop offset="1" stop-color="#fff3cf" stop-opacity="0"/></radialGradient>
    <radialGradient id="otGlow" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff1c4" stop-opacity=".45"/><stop offset="1" stop-color="#fff1c4" stop-opacity="0"/></radialGradient>
    <linearGradient id="otSpill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c2" stop-opacity=".85"/><stop offset="1" stop-color="#fff2c2" stop-opacity="0"/></linearGradient>
    <pattern id="otBossPaper" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="18" height="36" fill="${OT.bossStripe}" opacity=".45"/></pattern>
    <pattern id="otKnit" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 5 L7 0 L14 5 M0 10 L7 5 L14 10" fill="none" stroke="#000" stroke-opacity=".06" stroke-width="2"/></pattern>
  </defs>`;
}

function _otShell(plan: Plan) {
  const W = plan.W,
    wallR = W - 400;
  const seams = [];
  for (let x = -40; x <= W + 40; x += 64)
    seams.push(
      `<path d="M${_otP(x, 380)} 380 L${x} 900" stroke="${OT.seam}" stroke-width="2" opacity=".4"/>`,
    );
  const pools = plan.pods
    .map(
      (p) =>
        `<ellipse cx="${p.rug.x + p.rug.w / 2}" cy="${p.rug.y + p.rug.h / 2}" rx="${p.rug.w / 2 + 90}" ry="110" fill="url(#otPool)"/>`,
    )
    .join('');
  return `
  <rect x="0" y="-40" width="${W}" height="420" fill="url(#otWall)"/>
  <rect x="0" y="262" width="${wallR}" height="118" fill="${OT.wains}"/>
  ${Array.from({ length: Math.ceil(wallR / 132) }, (_, i) => `<rect x="${14 + i * 132}" y="280" width="112" height="78" rx="6" fill="${OT.wainsLo}" opacity=".45"/>`).join('')}
  <rect x="0" y="252" width="${wallR}" height="12" fill="${OT.rail}" ${_o(2.5)}/>
  <rect x="0" y="368" width="${W}" height="14" fill="${OT.base}"/>
  <path d="M0 380 H${W} V900 H0Z" fill="url(#otFloor)"/>
  ${seams.join('')}
  <path d="M0 380 H${W}" stroke="${OT_INK}" stroke-width="3"/>
  ${pools}`;
}

function _otCut(plan: Plan) {
  const W = plan.W;
  return `
  <path d="M-12 -70 H${W + 12} V-36 H-12Z" fill="#4b3570"/>
  <path d="M-12 -46 H${W + 12}" stroke="#6a4c94" stroke-width="5"/>
  <path d="M-12 -40 H${W + 12}" stroke="${OT_INK}" stroke-width="3"/>
  <path d="M-12 -70 V930 H0 V-70Z" fill="#4b3570"/><path d="M${W} -70 V930 H${W + 12} V-70Z" fill="#4b3570"/>
  <path d="M-12 900 H${W + 12} V930 H-12Z" fill="#4b3570"/>
  <path d="M-12 904 H${W + 12}" stroke="#6a4c94" stroke-width="5"/>
  <path d="M0 -40 V900 M${W} -40 V900 M0 900 H${W}" stroke="${OT_INK}" stroke-width="3" fill="none"/>
  ${plan.lamps
    .map(
      (x) => `<g transform="translate(${x} -40)">
      <path d="M0 0 V34" stroke="${OT_INK}" stroke-width="2.5"/>
      <path d="M-30 58 C-30 34 30 34 30 58Z" fill="${PALETTE.sun}" ${_o()}/>
      <ellipse cx="0" cy="60" rx="11" ry="5" fill="#fff7d6" ${_o(2)}/>
      <path d="M-28 60 L-120 330 H120 L28 60Z" fill="url(#otGlow)" opacity=".5"/>
    </g>`,
    )
    .join('')}`;
}

/* door + the wall clock above it — the work clock (OFFICE): it opens Agent time; its hands tick while agents work */
function _otDoor() {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    const r1 = i % 3 ? 20 : 17;
    return `<path d="M${(Math.sin(a) * r1).toFixed(1)} ${(-Math.cos(a) * r1).toFixed(1)} L${(Math.sin(a) * 23).toFixed(1)} ${(-Math.cos(a) * 23).toFixed(1)}" stroke="${OT_INK}" stroke-width="${i % 3 ? 1.6 : 2.8}" stroke-linecap="round"/>`;
  }).join('');
  return `<g id="otDoor">
    <rect x="22" y="132" width="144" height="252" rx="4" fill="${OT.woodLo}" ${_o()}/>
    <rect x="34" y="144" width="120" height="236" fill="#3b2d5e"/>
    <g id="otDoorOpen" style="display:none">
      <path d="M34 144 H154 V380 H34Z" fill="#ffe9b0"/>
      <path d="M34 380 H154 L210 470 H-6Z" fill="url(#otSpill)"/>
      <path d="M34 144 L58 152 V372 L34 380Z" fill="${OT.wood}" ${_o(2.5)}/>
    </g>
    <g id="otDoorLeaf">
      <rect x="34" y="144" width="120" height="236" fill="${OT.wood}" ${_o(2.5)}/>
      <rect x="50" y="160" width="88" height="58" rx="5" fill="${OT.glass}" ${_o(2.5)}/>
      <path d="M62 170 L78 208 M84 168 L96 196" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>
      <rect x="50" y="236" width="88" height="56" rx="5" fill="none" stroke="${OT.woodLo}" stroke-width="3"/>
      <rect x="50" y="304" width="88" height="62" rx="5" fill="none" stroke="${OT.woodLo}" stroke-width="3"/>
      <circle cx="140" cy="272" r="6" fill="${PALETTE.sun}" ${_o(2)}/>
    </g>
    <g transform="translate(94 70)"><g id="otClock">
      <circle r="28" fill="${PALETTE.coral}" ${_o()}/><circle r="23" fill="#fffdf6" ${_o(2)}/>
      ${ticks}
      <path class="ot-hand-m" d="M0 3 L0 -15" stroke="${OT_INK}" stroke-width="3.4" stroke-linecap="round"/>
      <path class="ot-hand-h" d="M0 3 L11 -4" stroke="${OT_INK}" stroke-width="3.4" stroke-linecap="round"/>
      <circle r="3" fill="${PALETTE.sun}" ${_o(1.6)}/>
    </g></g>
  </g>`;
}

/* the ship corner (left wall): push box + deploy station */
function _otShip(plan: Plan) {
  const ob = plan.objects.outbox,
    co = plan.objects.console;
  return `<g id="otOutbox" transform="translate(${ob.x} ${ob.y})">
    <rect x="0" y="0" width="62" height="86" rx="8" fill="${PALETTE['sun-deep']}" ${_o()}/>
    <rect x="10" y="14" width="42" height="8" rx="4" fill="${OT_INK}"/>
    <rect x="9" y="36" width="44" height="18" rx="4" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="31" y="49" text-anchor="middle" font-size="11" font-weight="900" fill="${OT_INK}" font-family="ui-monospace,Menlo,monospace">main</text>
    <g id="outFlag" transform="translate(62 70)"><g class="ot-flag-arm"><path d="M0 0 V-46" stroke="${OT_INK}" stroke-width="4" stroke-linecap="round"/><path d="M0 -46 h20 l-5 8 5 8 h-20z" fill="${PALETTE.coral}" ${_o(2)}/></g></g>
  </g>
  <g id="otConsole" transform="translate(${co.x - 2} ${co.y + 2})">
    <path d="M10 92 L14 30 H58 L62 92Z" fill="${OT.metal}" ${_o()}/>
    <path d="M12 70 H60" stroke="${OT_INK}" stroke-width="2.5"/>
    <rect x="6" y="20" width="60" height="14" rx="5" fill="${OT.steel}" ${_o(2.5)}/>
    <g id="consoleBtn"><path d="M16 21 C16 -2 56 -2 56 21Z" fill="${PALETTE.coral}" ${_o(2.5)}/><path d="M24 10 C28 4 34 3 38 3" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".6"/></g>
    <rect x="18" y="42" width="36" height="16" rx="3" fill="${OT_INK}"/>
    <text x="36" y="54" text-anchor="middle" font-size="9.5" font-weight="900" fill="${PALETTE.sun}" letter-spacing=".08em">DEPLOY</text>
  </g>`;
}

/* the planning wall: features folder · whiteboard · health board */
function _otWhiteboard(plan: Plan) {
  const o = plan.objects.whiteboard,
    tx = o.x - 236;
  return `<g id="otWhiteboard" transform="translate(${tx} 0)">
    <rect x="236" y="44" width="528" height="264" rx="10" fill="${OT.metal}" ${_o()}/>
    <rect x="250" y="58" width="500" height="234" rx="4" fill="#fdfcf7" ${_o(2)}/>
    <circle cx="330" cy="172" r="50" fill="none" stroke="#ece8f5" stroke-width="12"/>
    <circle id="wbRing" cx="330" cy="172" r="50" fill="none" stroke="${PALETTE.coral}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 330 172)" stroke-dasharray="0 315"/>
    <text id="wbPct" x="330" y="182" text-anchor="middle" font-size="30" font-weight="900" fill="${OT_INK}">64%</text>
    <g id="wbBars"></g>
    <path d="M600 92 V270" stroke="#d9d4e8" stroke-width="2.5" stroke-dasharray="1 7" stroke-linecap="round"/>
    <g id="wbList"></g>
    <rect x="300" y="292" width="400" height="12" rx="3" fill="${OT.steel}" ${_o(2)}/>
    <rect x="330" y="284" width="34" height="9" rx="4" fill="${PALETTE.coral}" ${_o(1.8)}/><rect x="372" y="284" width="34" height="9" rx="4" fill="${PALETTE.sky}" ${_o(1.8)}/>
  </g>`;
}
/* the project's portrait (OFFICE): a wooden frame on a string, the picture (or the project's tile) inside, a brass
   name plaque under it. The inside + the name are filled by syncArt. Frame coords 0…80 × -16…118. */
function _otPortrait(plan: Plan) {
  const o = plan.objects.portrait;
  return `<g id="otPortrait" transform="translate(${o.x} ${o.y})">
    <path d="M12 2 L40 -14 L68 2" stroke="${OT_INK}" stroke-width="2" fill="none" stroke-linejoin="round"/>
    <circle cx="40" cy="-14" r="3.5" fill="${PALETTE.sun}" ${_o(1.6)}/>
    <rect x="0" y="0" width="80" height="80" rx="6" fill="${OT.wood}" ${_o()}/>
    <rect x="5" y="5" width="70" height="70" rx="3" fill="${OT.woodLo}"/>
    <clipPath id="otPortraitClip"><rect x="9" y="9" width="62" height="62" rx="2"/></clipPath>
    <g id="otPortraitPic" clip-path="url(#otPortraitClip)"></g>
    <rect x="9" y="9" width="62" height="62" rx="2" fill="none" ${_o(2)}/>
    <rect id="otPortraitPlate" x="0" y="92" width="80" height="20" rx="5" fill="#e7b75a" ${_o(2)}/>
    <text id="otPortraitName" text-anchor="middle" font-weight="900" fill="#4a2c10"></text>
  </g>`;
}
/* the portrait's inside: the picture, or the project's tile (gradient + glyph) */
export function portraitInner(p: BoardFacts['portrait']): string {
  if (!p) return '';
  if (p.image)
    return `<image href="${escapeHtml(p.image)}" x="9" y="9" width="62" height="62" preserveAspectRatio="xMidYMid slice"/>`;
  const c = (v: string) => (/^#[0-9a-f]{3,8}$/i.test(v) ? v : '#9b6cff');
  return `<defs><linearGradient id="otPortraitTile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c(p.tile.g1)}"/><stop offset="1" stop-color="${c(p.tile.g2)}"/></linearGradient></defs>
    <rect x="9" y="9" width="62" height="62" fill="url(#otPortraitTile)"/>
    <g transform="translate(19 19) scale(1.75)">${tileGlyph(p.tile.glyph)}</g>`;
}

function _otDossier(plan: Plan) {
  const o = plan.objects.dossier;
  return `<g id="otDossier" transform="translate(${o.x} ${o.y})">
    <path d="M6 8 H74 V108 H6Z" fill="${OT.paper}" ${_o(1.8)} transform="rotate(3 40 60)"/>
    <path d="M2 18 H30 L36 10 H78 V110 H2Z" fill="#e9bf7a" ${_o(2.5)}/>
    <path d="M2 28 H78" stroke="#c99a52" stroke-width="2"/>
    <rect x="12" y="50" width="56" height="22" rx="3" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="40" y="65" text-anchor="middle" font-size="10" font-weight="900" fill="${OT_INK}" letter-spacing=".04em">FEATURES</text>
    <circle cx="40" cy="-4" r="6" fill="${PALETTE.coral}" ${_o(2)}/>
  </g>`;
}
function _otHealth(plan: Plan) {
  const o = plan.objects.health;
  return `<g id="otHealth" transform="translate(${o.x} ${o.y})">
    <path d="M58 -12 V2" stroke="${OT_INK}" stroke-width="2.5"/><circle cx="58" cy="-14" r="4" fill="${PALETTE.coral}" ${_o(1.8)}/>
    <rect width="116" height="160" rx="8" fill="${OT.woodLo}" ${_o()}/>
    <rect x="8" y="8" width="100" height="144" rx="3" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="58" y="30" text-anchor="middle" font-size="11" font-weight="900" fill="${OT_INK}" letter-spacing=".12em">HEALTH</text>
    <g id="otGrades"></g>
  </g>`;
}

/* the Reports tray (spec-reports §1.1): a short filing cabinet standing on the floor, a wooden
   letter tray on top. Local coords 0…92 × 0…150 (bottom = the floor line). */
function _otReports(plan: Plan) {
  const o = plan.objects.reports;
  return `<g id="otReports" transform="translate(${o.x} ${o.y})">
    <ellipse cx="46" cy="150" rx="50" ry="6" fill="#000" opacity=".12"/>
    <rect x="4" y="40" width="84" height="106" rx="7" fill="${OT.metal}" ${_o()}/>
    <rect x="12" y="50" width="68" height="40" rx="4" fill="#ddd7ec" ${_o(2.2)}/>
    <rect x="12" y="98" width="68" height="40" rx="4" fill="#ddd7ec" ${_o(2.2)}/>
    <rect x="22" y="58" width="48" height="14" rx="2" fill="${OT.paper}" ${_o(1.6)}/>
    <text x="46" y="68.5" text-anchor="middle" font-size="8.5" font-weight="900" fill="${OT_INK}" letter-spacing=".08em">REPORTS</text>
    <rect x="36" y="78" width="20" height="5" rx="2.5" fill="${OT.steel}" ${_o(1.6)}/>
    <rect x="36" y="117" width="20" height="5" rx="2.5" fill="${OT.steel}" ${_o(1.6)}/>
    <rect x="10" y="144" width="12" height="6" rx="2" fill="${OT_INK}"/><rect x="70" y="144" width="12" height="6" rx="2" fill="${OT_INK}"/>
    <g id="trayPaper"></g>
    <path d="M6 40 L12 18 H80 L86 40Z" fill="${OT.wood}" ${_o(2.5)}/>
    <path d="M14 30 H78" stroke="${OT.woodLo}" stroke-width="2" opacity=".7"/>
  </g>`;
}
/* 0 unread: empty tray. 1–3+: up to 3 sheets, the top one with a small coral tab */
function _otSheets(unread: number) {
  const n = Math.max(0, Math.min(3, unread));
  const rot = [-3, 2.5, -1];
  return Array.from({ length: n }, (_, i) => {
    const top = i === n - 1;
    return `<g transform="translate(46 ${12 - i * 4}) rotate(${rot[i]})">
      ${top ? `<rect x="18" y="-16" width="9" height="12" rx="2" fill="${PALETTE.coral}" ${_o(1.6)}/>` : ''}
      <rect x="-30" y="-12" width="60" height="22" rx="2" fill="${OT.paper}" ${_o(1.8)}/>
      <path d="M-22 -5 H14 M-22 1 H6" stroke="#bdb5d6" stroke-width="2" stroke-linecap="round"/>
    </g>`;
  }).join('');
}

/* STUDIO LIFE: the letterbox (wall, above the outbox) — rounded steel, an ink slot; new mail = envelopes peeking
   out of the slot (#mailSlot, behind the slot's lip). HQ's office: a small cream plaque under the slot. */
function _otMailbox(plan: Plan, hq: boolean) {
  const o = plan.objects.mailbox;
  return `<g id="otMailbox" transform="translate(${o.x} ${o.y})">
    <rect x="30" y="86" width="12" height="10" fill="${OT.steel}" ${_o(2)}/>
    <rect x="4" y="8" width="64" height="80" rx="16" fill="${OT.metal}" ${_o()}/>
    <path d="M14 20 C20 14 30 13 40 13" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".6"/>
    <g id="mailSlot"></g>
    <rect x="13" y="32" width="46" height="9" rx="4.5" fill="${OT_INK}"/>
    ${
      hq
        ? `<rect id="mailHq" x="20" y="54" width="32" height="18" rx="4" fill="${OT.paper}" ${_o(1.8)}/><text x="36" y="67.5" text-anchor="middle" font-size="12" font-weight="900" fill="${OT_INK}" letter-spacing=".06em">HQ</text>`
        : ''
    }
  </g>`;
}
/* 0 new: nothing in the slot. 1–3+: up to 3 envelopes, the top one with a coral seal */
function _otEnvelopes(n0: number) {
  const n = Math.max(0, Math.min(3, n0));
  const at = [
    [36, -4],
    [26, 5],
    [46, -3],
  ];
  return Array.from({ length: n }, (_, i) => {
    const [x, r] = at[i];
    const top = i === n - 1;
    return `<g transform="translate(${x} 36) rotate(${r})">
      <rect x="-13" y="-16" width="26" height="18" rx="2" fill="${OT.paper}" ${_o(1.6)}/>
      <path d="M-13 -16 L0 -7 L13 -16" fill="none" stroke="#bdb5d6" stroke-width="1.6" stroke-linejoin="round"/>
      ${top ? `<circle cx="0" cy="-7" r="3.2" fill="${PALETTE.coral}" ${_o(1.2)}/>` : ''}
    </g>`;
  }).join('');
}
/* the bell on the door frame: a brass plate with a round sun button (wiggles once when rung) */
function _otBell(plan: Plan) {
  const o = plan.objects.bell;
  return `<g id="otBell" transform="translate(${o.x + o.w / 2} ${o.y + o.h / 2})"><g class="ot-bell">
    <rect x="-9" y="-13" width="18" height="26" rx="5" fill="#e7b75a" ${_o(2)}/>
    <circle cx="0" cy="0" r="5" fill="${PALETTE.sun}" ${_o(1.6)}/>
  </g></g>`;
}

function _otWindow(x0: number) {
  return `<g transform="translate(${x0 - 1004} 0)">
    <rect x="1030" y="96" width="140" height="166" rx="6" fill="${OT.wood}" ${_o()}/>
    <rect x="1040" y="108" width="120" height="142" fill="url(#otSky)" ${_o(2)}/>
    <circle cx="1130" cy="136" r="13" fill="#fff4d2"/><circle cx="1136" cy="131" r="11" fill="#d9a0c8" opacity=".95"/>
    <path d="M1040 250 V218 h14 v-14 h12 v18 h10 v-26 h18 v34 h12 v-20 h14 v12 h16 v-24 h14 V250Z" fill="#3b2d6e"/>
    <path d="M1100 108 V250 M1040 178 H1160" stroke="${OT.wood}" stroke-width="6"/>
    <path d="M1030 90 C1040 140 1022 200 1040 272 L1014 272 C1006 200 1018 140 1012 90Z" fill="${PALETTE.coral}" ${_o(2.5)}/>
    <path d="M1170 90 C1160 140 1178 200 1160 272 L1186 272 C1194 200 1182 140 1188 90Z" fill="${PALETTE.coral}" ${_o(2.5)}/>
    <rect x="1004" y="84" width="192" height="10" rx="5" fill="${OT.woodLo}" ${_o(2)}/>
    <rect x="1022" y="258" width="156" height="12" rx="3" fill="${OT.woodHi}" ${_o(2.5)}/>
  </g>`;
}

/* the Director's wall safe (= the project's Access) — frame coords 1342…1442 × 112…216 */
function _otSafe() {
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    return `<path d="M${(Math.sin(a) * 15).toFixed(1)} ${(-Math.cos(a) * 15).toFixed(1)} L${(Math.sin(a) * 19).toFixed(1)} ${(-Math.cos(a) * 19).toFixed(1)}" stroke="${OT_INK}" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
  return `<g id="otSafe" transform="translate(1342 112)">
    <rect x="-6" y="-6" width="112" height="116" rx="12" fill="${OT.woodLo}" ${_o()}/>
    <rect x="0" y="0" width="100" height="104" rx="9" fill="${OT.steel}" ${_o()}/>
    <rect x="9" y="9" width="82" height="86" rx="6" fill="${OT.metal}" ${_o(2.5)}/>
    <circle cx="11" cy="28" r="3" fill="${OT_INK}"/><circle cx="11" cy="76" r="3" fill="${OT_INK}"/>
    <g transform="translate(50 50)"><g id="safeDial"><circle r="24" fill="#efe9f7" ${_o(2.5)}/>${ticks}<circle r="11" fill="${OT.steel}" ${_o(2.5)}/><path d="M0 -11 V-5" stroke="${OT_INK}" stroke-width="3" stroke-linecap="round"/></g></g>
    <rect x="76" y="40" width="9" height="22" rx="4.5" fill="${PALETTE.sun}" ${_o(2)}/>
    <rect x="34" y="84" width="32" height="6" rx="3" fill="${OT_INK}" opacity=".35"/>
  </g>`;
}
/* the Director's glass corner: own wallpaper, the wall safe (Access),
   a plant. Drawn in v3's 1206…1600 frame and shifted to the room's right edge. */
function _otBossOffice(plan: Plan) {
  return `<g id="otBoss" transform="translate(${plan.W - 1600} 0)">
    <rect x="1206" y="-40" width="394" height="420" fill="url(#otBoss)"/>
    <rect x="1206" y="-40" width="394" height="420" fill="url(#otBossPaper)"/>
    <rect x="1206" y="252" width="394" height="12" fill="${OT.rail}" ${_o(2.5)}/>
    <rect x="1206" y="264" width="394" height="104" fill="#e6a85c" opacity=".5"/>
    <path d="M1206 380 H1600 V624 H1240Z" fill="${OT.carpet}"/>
    <path d="M1206 380 H1600 V624 H1240Z" fill="url(#otKnit)"/>
    ${_otSafe()}
    <g transform="translate(1566 600)">
      <path d="M-18 0 L-14 -36 H14 L18 0Z" fill="${PALETTE.grape}" ${_o(2.5)}/>
      ${[
        [-40, -120, -10],
        [30, -140, 14],
        [-20, -170, -4],
        [26, -96, 30],
        [-44, -80, -34],
      ]
        .map(
          ([dx, dy, r]) =>
            `<path d="M0 -36 Q${dx / 2} ${dy / 2} ${dx} ${dy}" stroke="#3f8a54" stroke-width="3" fill="none"/><ellipse cx="${dx}" cy="${dy}" rx="13" ry="24" transform="rotate(${r} ${dx} ${dy})" fill="#5fbf73" ${_o(2)}/>`,
        )
        .join('')}
    </g>
    <path d="M1200 118 L1250 96 V630 L1200 384Z" fill="${OT.glass}" opacity=".42"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M1200 ${128 + i * 13} L1250 ${108 + i * 13}" stroke="#fff" stroke-width="5" opacity=".8"/>`).join('')}
    <path d="M1200 118 L1250 96 V630 L1200 384Z" fill="none" ${_o(3)}/>
  </g>`;
}

function _otRug(r: Pod['rug'], hue: string, neutral: boolean) {
  const c = hueHex(hue);
  const y1 = r.y,
    y2 = r.y + r.h;
  const pts = `M${_otP(r.x, y1)} ${y1} H${_otP(r.x + r.w, y1)} L${_otP(r.x + r.w, y2)} ${y2} H${_otP(r.x, y2)}Z`;
  const i = 14;
  const ipts = `M${_otP(r.x + i, y1 + 10)} ${y1 + 10} H${_otP(r.x + r.w - i, y1 + 10)} L${_otP(r.x + r.w - i, y2 - 10)} ${y2 - 10} H${_otP(r.x + i, y2 - 10)}Z`;
  return `<g class="ot-rug">
    <path d="${pts}" fill="${neutral ? '#cbbfe4' : shade(c, 20)}" ${_o(2.5)}/>
    <path d="${ipts}" fill="none" stroke="${neutral ? '#a99bd0' : shade(c, -18)}" stroke-width="3" stroke-dasharray="${neutral ? '0' : '14 8'}" opacity=".7"/>
  </g>`;
}
/* a name plaque pinned to a rug's front edge — team membership in words */
function _otPlaque(cx: number, y: number, text: string, hue: string) {
  const w = Math.max(110, text.length * 10.5 + 34);
  return `<g class="ot-plaque" transform="translate(${cx} ${y})"><rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="14" fill="${OT.paper}" ${_o(2.5)}/>
    <circle cx="${-w / 2 + 15}" cy="0" r="5.5" fill="${hueHex(hue)}" ${_o(2)}/>
    <text x="8" y="5.5" text-anchor="middle" font-size="15" font-weight="900" fill="${OT_INK}">${escapeHtml(text)}</text></g>`;
}

/* the couch (bottom of the right column) */
function _otLounge(plan: Plan) {
  const dx = plan.W - 398;
  return `<g id="otLounge" transform="translate(${dx} 0)">
    <ellipse cx="176" cy="838" rx="200" ry="50" fill="${PALETTE.rose}" opacity=".4"/>
    <path d="M44 732 C44 704 60 698 90 698 H262 C292 698 308 704 308 732 V790 H44Z" fill="${PALETTE.coral}" ${_o()}/>
    ${[90, 176, 262].map((x) => `<rect x="${x - 36}" y="712" width="72" height="66" rx="16" fill="${shade(PALETTE.coral, 18)}" ${_o(2.5)}/>`).join('')}
    <rect x="22" y="740" width="44" height="84" rx="20" fill="${shade(PALETTE.coral, -10)}" ${_o()}/>
    <rect x="286" y="740" width="44" height="84" rx="20" fill="${shade(PALETTE.coral, -10)}" ${_o()}/>
  </g>`;
}
export function couchFront(plan: Plan) {
  const dx = plan.W - 398;
  return `<svg class="ot-couchfront-svg" viewBox="20 770 316 70" width="316" height="70" style="left:${20 + dx}px;top:770px" aria-hidden="true" focusable="false">
    <path d="M58 784 H296 C304 784 308 790 308 798 V820 H46 V798 C46 790 50 784 58 784Z" fill="${shade(PALETTE.coral, 8)}" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M133 786 V818 M219 786 V818" stroke="${shade(PALETTE.coral, -20)}" stroke-width="2.5"/>
    <rect x="22" y="784" width="44" height="44" rx="14" fill="${shade(PALETTE.coral, -10)}" stroke="${OT_INK}" stroke-width="3"/>
    <rect x="286" y="784" width="44" height="44" rx="14" fill="${shade(PALETTE.coral, -10)}" stroke="${OT_INK}" stroke-width="3"/>
  </svg>`;
}

/* the diorama sits on a plinth — the letterbox becomes the shelf it stands on */
function _otPlinth(plan: Plan, title: string) {
  const W = plan.W;
  return `<g id="otPlinth">
    <path d="M-30 934 H${W + 30} L${W} 992 H0Z" fill="#6b4630" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-30 934 H${W + 30} L${W + 26} 944 H-26Z" fill="#8a5a3c"/>
    <g transform="translate(${W / 2} 963)"><rect x="-200" y="-16" width="400" height="32" rx="6" fill="#e7b75a" stroke="${OT_INK}" stroke-width="2.5"/>
      <text id="otPlinthName" y="6" text-anchor="middle" font-size="15" font-weight="900" fill="#4a2c10" letter-spacing=".16em">${escapeHtml(title.toUpperCase())}</text></g>
  </g>`;
}

export function officeArt(
  plan: Plan,
  ctx: { title: string; teams: Record<string, ArtTeam>; hq?: boolean },
): string {
  _otCX = plan.W / 2;
  /* team pods get a rug + name plaque; solo desks stand on the bare floor */
  const rugs = plan.pods
    .filter((p) => p.teamId)
    .map((p) => {
      const team = ctx.teams[p.teamId as string];
      const name = team ? team.name.replace(/^The /, '') : 'Solo';
      const r = p.rug;
      return (
        _otRug(r, team ? team.color : 'grape', !team) +
        _otPlaque(r.x + r.w / 2, r.y + r.h, name, team ? team.color : '#a99bd0')
      );
    })
    .join('');
  return `<svg class="ot-art" viewBox="0 -70 ${plan.W} 1062" width="${plan.W}" height="1062" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
      font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    ${_otDefs()}
    ${_otShell(plan)}
    ${_otBossOffice(plan)}
    ${_otDoor()}
    ${_otShip(plan)}
    ${_otMailbox(plan, !!ctx.hq)}
    ${_otBell(plan)}
    ${_otPortrait(plan)}
    ${_otDossier(plan)}
    ${_otWhiteboard(plan)}
    ${_otHealth(plan)}
    ${_otReports(plan)}
    ${plan.windows.map((w) => _otWindow(w.x)).join('')}
    ${rugs}
    ${_otPlinth(plan, ctx.title || '')}
    ${_otLounge(plan)}
    ${_otCut(plan)}
  </svg>`;
}

/* ---------------------------------------------------------------- live bits */
const GRADE_COLOR: Record<string, string> = {
  A: PALETTE.mint,
  B: PALETTE.sun,
  C: PALETTE.coral,
  D: PALETTE.coral,
  F: PALETTE.coral,
};
const SHORT: Record<string, string> = { modularity: 'Modular', cleanliness: 'Clean', reusability: 'Reuse' };
export function syncArt(root: Element | null, ws: BoardFacts): void {
  if (!root) return;
  const $ = (id: string) => root.querySelector(`#${id}`);
  const set = (id: string, attr: string, v: string) => $(id)?.setAttribute(attr, v);
  const html = (id: string, v: string) => {
    const el = $(id);
    if (el && el.innerHTML !== v) el.innerHTML = v;
  };
  const pct = Math.max(0, Math.min(100, Math.round(ws.overall)));
  html('wbPct', `${pct}%`);
  set('wbRing', 'stroke-dasharray', `${((315 * pct) / 100).toFixed(1)} 315`);
  set('otClock', 'class', ws.live > 0 ? 'ticking' : '');
  if (ws.portrait) {
    html('otPortraitPic', portraitInner(ws.portrait));
    /* one or two lines on a plate as wide as the frame; a line of wide letters is squeezed to the plate */
    const { lines, size } = plaqueLines(ws.portrait.name);
    set('otPortraitPlate', 'height', lines.length > 1 ? '30' : '20');
    set('otPortraitName', 'font-size', String(size));
    html(
      'otPortraitName',
      lines
        .map((l, i) => {
          const y = lines.length > 1 ? 103.5 + i * 11 : 105.5;
          const fit = l.length * size * 0.62 > 72 ? ' textLength="72" lengthAdjust="spacingAndGlyphs"' : '';
          return `<tspan x="40" y="${y}"${fit}>${escapeHtml(l)}</tspan>`;
        })
        .join(''),
    );
    html('otPlinthName', escapeHtml(ws.portrait.name.toUpperCase()));
  }
  html(
    'wbBars',
    ws.now
      .slice(0, 3)
      .map((f, i) => {
        const y = 112 + i * 52;
        const w = (180 * f.pct) / 100;
        return `<text x="404" y="${y - 8}" font-size="13" font-weight="900" fill="${OT_INK}">${escapeHtml(f.name.split(' ')[0])}</text>
      <rect x="404" y="${y}" width="180" height="14" rx="7" fill="none" stroke="${OT_INK}" stroke-width="2"/>
      <rect x="406" y="${y + 2}" width="${Math.max(0, w - 4).toFixed(1)}" height="10" rx="5" fill="${f.blocked ? PALETTE.coral : PALETTE.teal}"/>`;
      })
      .join(''),
  );
  html(
    'wbList',
    ws.tasks
      .slice(-7)
      .map((k, i) => {
        const y = 104 + i * 24;
        const len = 56 + ((k.text.length * 7) % 56);
        return `<rect x="616" y="${y - 9}" width="12" height="12" rx="2" fill="none" stroke="${OT_INK}" stroke-width="2"/>
      ${k.done ? `<path d="M617 ${y - 3} l4 5 9 -12" stroke="${PALETTE.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <path d="M636 ${y - 3} h${len}" stroke="${k.done ? '#cfc9de' : OT_INK}" stroke-width="3" stroke-linecap="round" opacity="${k.done ? 1 : 0.6}"/>`;
      })
      .join(''),
  );
  set('outFlag', 'transform', `translate(62 70)${ws.fresh ? '' : ' rotate(90)'}`);
  html(
    'otGrades',
    ws.grades
      .map((it, i) => {
        const col = GRADE_COLOR[it.grade] ?? PALETTE.sun;
        const y = 58 + i * 34;
        return `<circle cx="30" cy="${y}" r="12" fill="${col}" stroke="${OT_INK}" stroke-width="2"/>
      <text x="30" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="900" fill="${OT_INK}">${escapeHtml(it.grade)}</text>
      <text x="50" y="${y + 4}" font-size="11" font-weight="900" fill="${OT_INK}">${escapeHtml(SHORT[it.key] || it.name)}</text>`;
      })
      .join(''),
  );
  html('trayPaper', _otSheets(ws.unreadReports));
  html('mailSlot', _otEnvelopes(ws.newMail));
}
export function setDoor(root: Element | null, open: boolean) {
  const o = root?.querySelector<SVGElement>('#otDoorOpen');
  const l = root?.querySelector<SVGElement>('#otDoorLeaf');
  if (o) o.style.display = open ? '' : 'none';
  if (l) l.style.display = open ? 'none' : '';
}

/* ---------------------------------------------------------------- furniture */
/* monitor glyphs, box 0..32 × 0..26 — abstract activity, never text */
export function glyph(name: string, hue?: string | null): string {
  const c = hueHex(hue || 'teal');
  switch (name) {
    case 'code':
      return [
        [3, 4, 14, PALETTE.grape],
        [6, 9, 18, PALETTE.teal],
        [6, 14, 11, PALETTE.sun],
        [9, 19, 15, PALETTE.rose],
      ]
        .map(
          ([x, y, w, col]) =>
            `<rect x="${x}" y="${y}" width="${w}" height="3" rx="1.5" fill="${col}" opacity=".9"/>`,
        )
        .join('');
    case 'read':
      return `<rect x="7" y="2" width="18" height="22" rx="1.5" fill="${OT.paper}"/>${[6, 10, 14, 18].map((y) => `<rect x="10" y="${y}" width="${y % 8 ? 12 : 9}" height="1.8" fill="#a9a2c4"/>`).join('')}`;
    case 'caret':
      return `<rect x="9" y="9" width="2.5" height="9" fill="${OT.paper}"/><rect x="14" y="12" width="9" height="2" rx="1" fill="#5b5280"/>`;
    case 'dots':
      return `<g class="g-dots">${[0, 1, 2, 3, 4].map((i) => `<circle class="g-dot" style="--i:${i}" cx="${5 + i * 5.5}" cy="13" r="2.2" fill="${i < 3 ? PALETTE.mint : '#5b5280'}"/>`).join('')}</g>`;
    case 'green':
      return `<path d="M9 13 l5 5 9 -10" stroke="${PALETTE.mint}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'red':
      return `<path d="M11 8 l10 10 m0 -10 l-10 10" stroke="${PALETTE.coral}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'pause':
      return `<rect x="10" y="6" width="4" height="14" rx="1" fill="${PALETTE.sun}"/><rect x="18" y="6" width="4" height="14" rx="1" fill="${PALETTE.sun}"/>`;
    case 'hourglass':
      return `<path d="M10 4 H22 L16 13 L22 22 H10 L16 13Z" fill="none" stroke="${PALETTE.sun}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case 'diff':
      return `<rect x="3" y="3" width="12" height="20" rx="1" fill="#3a2f5c"/><rect x="17" y="3" width="12" height="20" rx="1" fill="#3a2f5c"/>${[6, 10, 14, 18].map((y, i) => `<rect x="5" y="${y}" width="6" height="2" fill="${i === 1 ? PALETTE.coral : '#8e86ad'}"/><rect x="19" y="${y}" width="7" height="2" fill="${i === 2 ? PALETTE.mint : '#8e86ad'}"/>`).join('')}`;
    case 'emblem':
      return `<circle cx="16" cy="13" r="6" fill="${c}" opacity=".8"/><circle cx="16" cy="13" r="2.4" fill="${OT.screen}"/>`;
    case 'check':
      return `<path d="M8 13 l6 6 11 -12" stroke="${PALETTE.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'rocket':
      return `<path d="M16 3 C21 7 21 15 19 19 H13 C11 15 11 7 16 3Z" fill="${OT.paper}"/><circle cx="16" cy="11" r="2" fill="${PALETTE.sky}"/>`;
    default: /* 'off' */
      return `<path d="M3 3 L12 3 L4 14Z" fill="#fff" opacity=".07"/>`;
  }
}

/* desk kinds: 'pod' (team stripe), 'hot' (neutral), 'boss' (the Director's).
   o = { hue (team hue), accent (owner hue), item ('mug'|'plant'|'telescope'|null) } */
export function desk(kind: DeskKind, o: DeskOpts = {}): string {
  const wide = kind === 'boss';
  const L = wide ? -86 : -58,
    R = wide ? 96 : 66;
  const frontC = kind === 'hot' ? '#d7c7ef' : kind === 'boss' ? OT.woodLo : OT.wood;
  const topC = kind === 'hot' ? '#efe6fb' : kind === 'boss' ? OT.wood : OT.woodHi;
  const stripe =
    kind === 'pod'
      ? `<rect x="${L}" y="-18" width="${R - L}" height="6" fill="${hueHex(o.hue)}" ${_o(2)}/>`
      : '';
  const items = {
    mug: `<g transform="translate(${L + 26} -28)"><rect x="-6" y="-12" width="12" height="12" rx="2" fill="${OT.paper}" ${_o(1.8)}/><path d="M6 -9 c5 0 5 6 0 6" fill="none" ${_o(1.6)}/><rect x="-6" y="-8" width="12" height="3" fill="${hueHex(o.accent)}"/></g>`,
    plant: `<g transform="translate(${L + 26} -28)"><path d="M-7 0 L-6 -8 H6 L7 0Z" fill="${OT.paper}" ${_o(1.8)}/><path d="M0 -8 C-10 -14 -8 -22 -2 -20 C0 -16 0 -12 0 -8 C2 -16 8 -22 10 -16 C8 -12 4 -10 0 -8" fill="#5fbf73" ${_o(1.6)}/></g>`,
    /* STUDIO LIFE: the captain's principles — two upright binders, the front one with a team-hue spine */
    binder: `<g transform="translate(${L + 26} -28)"><rect x="-12" y="-28" width="11" height="28" rx="2" fill="${OT.steel}" ${_o(1.6)}/><rect x="-3" y="-32" width="14" height="32" rx="2" fill="${OT.paper}" ${_o(1.8)}/><rect x="-3" y="-32" width="5" height="32" rx="1.5" fill="${hueHex(o.hue)}" ${_o(1.4)}/><circle cx="6" cy="-22" r="2" fill="none" stroke="${OT_INK}" stroke-width="1.4"/></g>`,
    /* a guest's desk: a small folded sun card, no text */
    tent: `<g transform="translate(${L + 26} -28)"><path d="M-10 0 L-2 -14 H2 L10 0Z" fill="${PALETTE.sun}" ${_o(1.8)}/><path d="M-2 -14 L1 0" stroke="${PALETTE['sun-deep']}" stroke-width="1.6"/></g>`,
    telescope: `<g transform="translate(${L + 36} -28)"><path d="M-6 0 L0 -12 L6 0" fill="none" ${_o(2)}/><g transform="rotate(-24 0 -14)"><rect x="-16" y="-19" width="30" height="9" rx="2" fill="${PALETTE.sun}" ${_o(2)}/></g></g>`,
  };
  const monX = wide ? 40 : 30;
  return `<svg class="ot-desk-svg" viewBox="${L - 8} -112 ${R - L + 16} 150" width="${R - L + 16}" height="150" style="left:${L - 8}px;top:-112px" aria-hidden="true" focusable="false">
    <ellipse cx="${(L + R) / 2}" cy="26" rx="${(R - L) / 2 + 6}" ry="9" fill="#000" opacity=".12"/>
    <g class="d-mon">
      <rect x="${monX + 12}" y="-38" width="7" height="12" fill="${OT.steel}" ${_o(2)}/>
      <ellipse cx="${monX + 15.5}" cy="-28" rx="11" ry="3" fill="${OT.steel}" ${_o(2)}/>
      <rect x="${monX - 1}" y="-66" width="33" height="30" rx="4" fill="${OT.bezel}" ${_o(2.5)}/>
      <g class="d-screen" transform="translate(${monX + 3} -62) scale(.78)"><rect width="32" height="28" rx="2" fill="${OT.screen}"/><g class="d-glyph" transform="translate(0 1)"></g></g>
    </g>
    <path d="M${L + 4} -28 H${R - 4} L${R} -18 H${L}Z" fill="${topC}" ${_o(2.5)}/>
    <rect x="${L}" y="-18" width="${R - L}" height="${wide ? 46 : 42}" rx="3" fill="${frontC}" ${_o(2.5)}/>
    ${stripe}
    <rect x="${L + 10}" y="-3" width="${R - L - 20}" height="${wide ? 28 : 24}" rx="3" fill="none" stroke="${shade(frontC, -26)}" stroke-width="2" opacity=".5"/>
    ${o.accent ? `<rect x="${(L + R) / 2 - 13}" y="13" width="26" height="8" rx="2" fill="${hueHex(o.accent)}" ${_o(1.6)}/>` : ''}
    <g class="d-kbd"><path d="M-17 -26 H17 L19 -21 H-19Z" fill="#efe9f7" ${_o(1.6)}/></g>
    <g class="d-tray" transform="translate(${R - 18} -25)" style="display:none"><g class="d-tray-in"><path d="M-12 0 L-10 -8 H10 L12 0Z" fill="${OT.steel}" ${_o(1.6)}/><rect x="-9" y="-12" width="18" height="10" rx="1" fill="#e8c38c" ${_o(1.5)} transform="rotate(-6)"/></g></g>
    ${o.item ? items[o.item] : ''}
  </svg>`;
}
/* chair behind the seat — always just a chair (no jackets, nothing body-shaped) */
export function chair(hue?: string | null): string {
  const c = hueHex(hue || 'grape');
  return `<svg class="ot-chair-svg" viewBox="-36 -90 72 100" width="72" height="100" style="left:-36px;top:-90px" aria-hidden="true" focusable="false">
    <g class="c-in">
      <rect x="-26" y="-74" width="52" height="54" rx="16" fill="${shade(c, -30)}" ${_o(2.5)}/>
      <rect x="-19" y="-67" width="38" height="36" rx="11" fill="${shade(c, -8)}"/>
      <rect x="-4" y="-22" width="8" height="18" fill="${OT.steel}" ${_o(2)}/>
    </g>
  </svg>`;
}

/* update one desk element in place */
export function deskSync(el: Element | null, s: DeskState) {
  if (!el) return;
  const g = el.querySelector<SVGGElement>('.d-glyph');
  if (g && g.dataset.name !== s.glyph) {
    g.innerHTML = glyph(s.glyph, s.hue);
    g.dataset.name = s.glyph;
  }
  const tray = el.querySelector<SVGGElement>('.d-tray');
  if (tray) {
    tray.style.display = s.tray ? '' : 'none';
    tray.classList.toggle('glow', s.tray === 'new');
  }
}
