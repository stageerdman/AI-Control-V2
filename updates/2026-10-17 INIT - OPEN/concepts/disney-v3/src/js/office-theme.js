/* ============================================================
   office-theme.js — the Office's ART (spec-office §1). Pure drawing:
   knows what a couch looks like, never what an agent is doing.
   Everything is placed from the floor plan (office-layout.js), so the room
   grows with the team. Calm by design: few objects, no labels you must read.

   Public (attached to THEME_OFFICE):
     art(plan, ctx)         → SVG string, the dollhouse room (viewBox 0 -70 W 1062)
                              ctx = { title, teams: {teamId: team} }
     sync(svgRoot, ws)      → live bits: whiteboard (ring, bars, list), health grades,
                              outbox flag
     desk(kind, o)          → SVG string of one desk (local coords, origin = seat)
     chair(hue)             → SVG string of the chair behind a seat
     couchFront(plan)       → SVG string of the couch's front cushions (occludes sleepers)
     glyph(name, hue)       → monitor screen content (32×26 box)
     deskSync(el, s)        → update a desk element: glyph, lamp, tray
     door(root, open)       → toggle the door leaf
   ============================================================ */

const OT_INK = '#241a44';
const OT = {
  wall: '#f6e2c6', wallHi: '#fbeedb', wallLo: '#ecd0ad', stripe: '#f0d7b6',
  wains: '#93c4b0', wainsLo: '#7db29d', rail: '#b9773f', base: '#7a4b2c',
  floor: '#d9a46b', floorLo: '#c48a51', seam: '#b97d45',
  wood: '#c98a50', woodLo: '#a96d3a', woodHi: '#e8b77f', metal: '#c9c3dd', steel: '#8e86ad',
  paper: '#fff6e9', glass: '#bfe6ff', screen: '#1d1638', bezel: '#3a2f5c',
  boss: '#ffe0a3', bossStripe: '#ffd27f', carpet: '#e9b38a',
};
const _o = (w = 3) => `stroke="${OT_INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/* gentle one-point perspective for things on the floor: x drifts outward as y nears */
let _otCX = 800;
const _otP = (x, y) => +(_otCX + (x - _otCX) * (0.9 + 0.1 * (y - 380) / 520)).toFixed(1);

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

function _otShell(plan) {
  const W = plan.W, wallR = W - 400;
  const seams = [];
  for (let x = -40; x <= W + 40; x += 64) seams.push(`<path d="M${_otP(x, 380)} 380 L${x} 900" stroke="${OT.seam}" stroke-width="2" opacity=".4"/>`);
  const pools = plan.pods.map(p => `<ellipse cx="${p.rug.x + p.rug.w / 2}" cy="${p.rug.y + p.rug.h / 2}" rx="${p.rug.w / 2 + 90}" ry="110" fill="url(#otPool)"/>`).join('');
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

function _otCut(plan) {
  const W = plan.W;
  return `
  <path d="M-12 -70 H${W + 12} V-36 H-12Z" fill="#4b3570"/>
  <path d="M-12 -46 H${W + 12}" stroke="#6a4c94" stroke-width="5"/>
  <path d="M-12 -40 H${W + 12}" stroke="${OT_INK}" stroke-width="3"/>
  <path d="M-12 -70 V930 H0 V-70Z" fill="#4b3570"/><path d="M${W} -70 V930 H${W + 12} V-70Z" fill="#4b3570"/>
  <path d="M-12 900 H${W + 12} V930 H-12Z" fill="#4b3570"/>
  <path d="M-12 904 H${W + 12}" stroke="#6a4c94" stroke-width="5"/>
  <path d="M0 -40 V900 M${W} -40 V900 M0 900 H${W}" stroke="${OT_INK}" stroke-width="3" fill="none"/>
  ${plan.lamps.map(x => `<g transform="translate(${x} -40)">
      <path d="M0 0 V34" stroke="${OT_INK}" stroke-width="2.5"/>
      <path d="M-30 58 C-30 34 30 34 30 58Z" fill="${PALETTE.sun}" ${_o()}/>
      <ellipse cx="0" cy="60" rx="11" ry="5" fill="#fff7d6" ${_o(2)}/>
      <path d="M-28 60 L-120 330 H120 L28 60Z" fill="url(#otGlow)" opacity=".5"/>
    </g>`).join('')}`;
}

/* door + a plain wall clock above it (decor — not interactive) */
function _otDoor() {
  const ticks = Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; const r1 = i % 3 ? 20 : 17;
    return `<path d="M${(Math.sin(a) * r1).toFixed(1)} ${(-Math.cos(a) * r1).toFixed(1)} L${(Math.sin(a) * 23).toFixed(1)} ${(-Math.cos(a) * 23).toFixed(1)}" stroke="${OT_INK}" stroke-width="${i % 3 ? 1.6 : 2.8}" stroke-linecap="round"/>`; }).join('');
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
    <g transform="translate(94 70)">
      <circle r="28" fill="${PALETTE.coral}" ${_o()}/><circle r="23" fill="#fffdf6" ${_o(2)}/>
      ${ticks}
      <path d="M0 3 L0 -15" stroke="${OT_INK}" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M0 3 L11 -4" stroke="${OT_INK}" stroke-width="3.4" stroke-linecap="round"/>
      <circle r="3" fill="${PALETTE.sun}" ${_o(1.6)}/>
    </g>
  </g>`;
}

/* the ship corner (left wall): push box + deploy station */
function _otShip(plan) {
  const ob = plan.objects.outbox, co = plan.objects.console;
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
function _otWhiteboard(plan) {
  const o = plan.objects.whiteboard, tx = o.x - 236;
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
function _otDossier(plan) {
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
function _otHealth(plan) {
  const o = plan.objects.health;
  return `<g id="otHealth" transform="translate(${o.x} ${o.y})">
    <path d="M58 -12 V2" stroke="${OT_INK}" stroke-width="2.5"/><circle cx="58" cy="-14" r="4" fill="${PALETTE.coral}" ${_o(1.8)}/>
    <rect width="116" height="160" rx="8" fill="${OT.woodLo}" ${_o()}/>
    <rect x="8" y="8" width="100" height="144" rx="3" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="58" y="30" text-anchor="middle" font-size="11" font-weight="900" fill="${OT_INK}" letter-spacing=".12em">HEALTH</text>
    <g id="otGrades"></g>
  </g>`;
}

function _otWindow(x0) {
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

/* Pixel's glass corner: own wallpaper, one corkboard, a plant. Drawn in v3's
   1206…1600 frame and shifted to the room's right edge. */
function _otBossOffice(plan) {
  return `<g id="otBoss" transform="translate(${plan.W - 1600} 0)">
    <rect x="1206" y="-40" width="394" height="420" fill="url(#otBoss)"/>
    <rect x="1206" y="-40" width="394" height="420" fill="url(#otBossPaper)"/>
    <rect x="1206" y="252" width="394" height="12" fill="${OT.rail}" ${_o(2.5)}/>
    <rect x="1206" y="264" width="394" height="104" fill="#e6a85c" opacity=".5"/>
    <path d="M1206 380 H1600 V624 H1240Z" fill="${OT.carpet}"/>
    <path d="M1206 380 H1600 V624 H1240Z" fill="url(#otKnit)"/>
    <g transform="translate(1316 112)">
      <rect width="150" height="100" rx="6" fill="${OT.woodLo}" ${_o()}/>
      <rect x="8" y="8" width="134" height="84" fill="#d9a066"/>
      ${[[22, -4, PALETTE.sun], [84, 3, PALETTE.teal]].map(([x, r, c]) => `<g transform="translate(${x} 20) rotate(${r})"><rect width="44" height="54" fill="${OT.paper}" ${_o(2)}/><rect width="44" height="10" fill="${c}"/><circle cx="22" cy="5" r="3.5" fill="${PALETTE.coral}" ${_o(1.5)}/></g>`).join('')}
    </g>
    <g transform="translate(1566 600)">
      <path d="M-18 0 L-14 -36 H14 L18 0Z" fill="${PALETTE.grape}" ${_o(2.5)}/>
      ${[[-40, -120, -10], [30, -140, 14], [-20, -170, -4], [26, -96, 30], [-44, -80, -34]].map(([dx, dy, r]) => `<path d="M0 -36 Q${dx / 2} ${dy / 2} ${dx} ${dy}" stroke="#3f8a54" stroke-width="3" fill="none"/><ellipse cx="${dx}" cy="${dy}" rx="13" ry="24" transform="rotate(${r} ${dx} ${dy})" fill="#5fbf73" ${_o(2)}/>`).join('')}
    </g>
    <path d="M1200 118 L1250 96 V630 L1200 384Z" fill="${OT.glass}" opacity=".42"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M1200 ${128 + i * 13} L1250 ${108 + i * 13}" stroke="#fff" stroke-width="5" opacity=".8"/>`).join('')}
    <path d="M1200 118 L1250 96 V630 L1200 384Z" fill="none" ${_o(3)}/>
  </g>`;
}

function _otRug(r, hue, neutral) {
  const c = hueHex(hue); const y1 = r.y, y2 = r.y + r.h;
  const pts = `M${_otP(r.x, y1)} ${y1} H${_otP(r.x + r.w, y1)} L${_otP(r.x + r.w, y2)} ${y2} H${_otP(r.x, y2)}Z`;
  const i = 14;
  const ipts = `M${_otP(r.x + i, y1 + 10)} ${y1 + 10} H${_otP(r.x + r.w - i, y1 + 10)} L${_otP(r.x + r.w - i, y2 - 10)} ${y2 - 10} H${_otP(r.x + i, y2 - 10)}Z`;
  return `<g class="ot-rug">
    <path d="${pts}" fill="${neutral ? '#cbbfe4' : shade(c, 20)}" ${_o(2.5)}/>
    <path d="${ipts}" fill="none" stroke="${neutral ? '#a99bd0' : shade(c, -18)}" stroke-width="3" stroke-dasharray="${neutral ? '0' : '14 8'}" opacity=".7"/>
  </g>`;
}
/* a name plaque pinned to a rug's front edge — team membership in words */
function _otPlaque(cx, y, text, hue) {
  const w = Math.max(110, text.length * 10.5 + 34);
  return `<g class="ot-plaque" transform="translate(${cx} ${y})"><rect x="${-w / 2}" y="-14" width="${w}" height="28" rx="14" fill="${OT.paper}" ${_o(2.5)}/>
    <circle cx="${-w / 2 + 15}" cy="0" r="5.5" fill="${hueHex(hue)}" ${_o(2)}/>
    <text x="8" y="5.5" text-anchor="middle" font-size="15" font-weight="900" fill="${OT_INK}">${escapeHtml(text)}</text></g>`;
}

/* the couch (bottom of the right column) */
function _otLounge(plan) {
  const dx = plan.W - 398;
  return `<g id="otLounge" transform="translate(${dx} 0)">
    <ellipse cx="176" cy="838" rx="200" ry="50" fill="${PALETTE.rose}" opacity=".4"/>
    <path d="M44 732 C44 704 60 698 90 698 H262 C292 698 308 704 308 732 V790 H44Z" fill="${PALETTE.coral}" ${_o()}/>
    ${[90, 176, 262].map(x => `<rect x="${x - 36}" y="712" width="72" height="66" rx="16" fill="${shade(PALETTE.coral, 18)}" ${_o(2.5)}/>`).join('')}
    <rect x="22" y="740" width="44" height="84" rx="20" fill="${shade(PALETTE.coral, -10)}" ${_o()}/>
    <rect x="286" y="740" width="44" height="84" rx="20" fill="${shade(PALETTE.coral, -10)}" ${_o()}/>
  </g>`;
}
function _otCouchFront(plan) {
  const dx = plan.W - 398;
  return `<svg class="ot-couchfront-svg" viewBox="20 770 316 70" width="316" height="70" style="left:${20 + dx}px;top:770px" aria-hidden="true" focusable="false">
    <path d="M58 784 H296 C304 784 308 790 308 798 V820 H46 V798 C46 790 50 784 58 784Z" fill="${shade(PALETTE.coral, 8)}" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M133 786 V818 M219 786 V818" stroke="${shade(PALETTE.coral, -20)}" stroke-width="2.5"/>
    <rect x="22" y="784" width="44" height="44" rx="14" fill="${shade(PALETTE.coral, -10)}" stroke="${OT_INK}" stroke-width="3"/>
    <rect x="286" y="784" width="44" height="44" rx="14" fill="${shade(PALETTE.coral, -10)}" stroke="${OT_INK}" stroke-width="3"/>
  </svg>`;
}

/* the diorama sits on a plinth — the letterbox becomes the shelf it stands on */
function _otPlinth(plan, title) {
  const W = plan.W;
  return `<g id="otPlinth">
    <path d="M-30 934 H${W + 30} L${W} 992 H0Z" fill="#6b4630" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-30 934 H${W + 30} L${W + 26} 944 H-26Z" fill="#8a5a3c"/>
    <g transform="translate(${W / 2} 963)"><rect x="-200" y="-16" width="400" height="32" rx="6" fill="#e7b75a" stroke="${OT_INK}" stroke-width="2.5"/>
      <text y="6" text-anchor="middle" font-size="15" font-weight="900" fill="#4a2c10" letter-spacing=".16em">${escapeHtml(title.toUpperCase())}</text></g>
  </g>`;
}

const _otArt = function (plan, ctx = {}) {
  _otCX = plan.W / 2;
  /* team pods get a rug + name plaque; solo desks stand on the bare floor */
  const rugs = plan.pods.filter(p => p.teamId).map(p => {
    const team = ctx.teams[p.teamId];
    const name = team ? team.name.replace(/^The /, '') : 'Solo';
    const r = p.rug;
    return _otRug(r, team ? team.color : 'grape', !team) + _otPlaque(r.x + r.w / 2, r.y + r.h, name, team ? team.color : '#a99bd0');
  }).join('');
  return `<svg class="ot-art" viewBox="0 -70 ${plan.W} 1062" width="${plan.W}" height="1062" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
      font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    ${_otDefs()}
    ${_otShell(plan)}
    ${_otBossOffice(plan)}
    ${_otDoor()}
    ${_otShip(plan)}
    ${_otDossier(plan)}
    ${_otWhiteboard(plan)}
    ${_otHealth(plan)}
    ${plan.windows.map(w => _otWindow(w.x)).join('')}
    ${rugs}
    ${_otPlinth(plan, ctx.title || '')}
    ${_otLounge(plan)}
    ${_otCut(plan)}
  </svg>`;
};

/* ---------------------------------------------------------------- live bits */
const _GRADE = { A: ['Great', PALETTE.mint], B: ['Good', PALETTE.sun], C: ['Needs work', PALETTE.coral] };
function _otSync(root, ws) {
  if (!root) return;
  const $ = id => root.querySelector('#' + id);
  const pct = ws.overall;
  $('wbPct').textContent = pct + '%';
  $('wbRing').setAttribute('stroke-dasharray', `${(315 * pct / 100).toFixed(1)} 315`);
  const now = ws.features.filter(f => f.status === 'now').slice(0, 3);
  $('wbBars').innerHTML = now.map((f, i) => {
    const y = 112 + i * 52; const w = 180 * f.pct / 100;
    return `<text x="404" y="${y - 8}" font-size="13" font-weight="900" fill="${OT_INK}">${escapeHtml(f.name.split(' ')[0])}</text>
      <rect x="404" y="${y}" width="180" height="14" rx="7" fill="none" stroke="${OT_INK}" stroke-width="2"/>
      <rect x="406" y="${y + 2}" width="${Math.max(0, w - 4).toFixed(1)}" height="10" rx="5" fill="${f.blocked ? PALETTE.coral : PALETTE.teal}"/>`;
  }).join('');
  const items = ws.checklist.slice(-7);
  $('wbList').innerHTML = items.map((k, i) => {
    const y = 104 + i * 24; const len = 56 + ((k.text.length * 7) % 56);
    return `<rect x="616" y="${y - 9}" width="12" height="12" rx="2" fill="none" stroke="${OT_INK}" stroke-width="2"/>
      ${k.done ? `<path d="M617 ${y - 3} l4 5 9 -12" stroke="${PALETTE.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <path d="M636 ${y - 3} h${len}" stroke="${k.done ? '#cfc9de' : OT_INK}" stroke-width="3" stroke-linecap="round" opacity="${k.done ? 1 : .6}"/>`;
  }).join('');
  $('outFlag').setAttribute('transform', `translate(62 70)${ws.github.fresh ? '' : ' rotate(90)'}`);
  const short = { modularity: 'Modular', cleanliness: 'Clean', reusability: 'Reuse' };
  $('otGrades').innerHTML = ws.checkup.items.map((it, i) => {
    const col = (_GRADE[it.grade] || _GRADE.B)[1]; const y = 58 + i * 34;
    return `<circle cx="30" cy="${y}" r="12" fill="${col}" stroke="${OT_INK}" stroke-width="2"/>
      <text x="30" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="900" fill="${OT_INK}">${it.grade}</text>
      <text x="50" y="${y + 4}" font-size="11" font-weight="900" fill="${OT_INK}">${short[it.key] || it.name}</text>`;
  }).join('');
}
function _otDoorState(root, open) {
  if (!root) return;
  root.querySelector('#otDoorOpen').style.display = open ? '' : 'none';
  root.querySelector('#otDoorLeaf').style.display = open ? 'none' : '';
}

/* ---------------------------------------------------------------- furniture */
/* monitor glyphs, box 0..32 × 0..26 — abstract activity, never text */
function _otGlyph(name, hue) {
  const c = hueHex(hue || 'teal');
  switch (name) {
    case 'code': return [[3, 4, 14, PALETTE.grape], [6, 9, 18, PALETTE.teal], [6, 14, 11, PALETTE.sun], [9, 19, 15, PALETTE.rose]].map(([x, y, w, col]) => `<rect x="${x}" y="${y}" width="${w}" height="3" rx="1.5" fill="${col}" opacity=".9"/>`).join('');
    case 'read': return `<rect x="7" y="2" width="18" height="22" rx="1.5" fill="${OT.paper}"/>${[6, 10, 14, 18].map(y => `<rect x="10" y="${y}" width="${y % 8 ? 12 : 9}" height="1.8" fill="#a9a2c4"/>`).join('')}`;
    case 'caret': return `<rect x="9" y="9" width="2.5" height="9" fill="${OT.paper}"/><rect x="14" y="12" width="9" height="2" rx="1" fill="#5b5280"/>`;
    case 'dots': return `<g class="g-dots">${[0, 1, 2, 3, 4].map(i => `<circle class="g-dot" style="--i:${i}" cx="${5 + i * 5.5}" cy="13" r="2.2" fill="${i < 3 ? PALETTE.mint : '#5b5280'}"/>`).join('')}</g>`;
    case 'green': return `<path d="M9 13 l5 5 9 -10" stroke="${PALETTE.mint}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'red': return `<path d="M11 8 l10 10 m0 -10 l-10 10" stroke="${PALETTE.coral}" stroke-width="3.4" stroke-linecap="round"/>`;
    case 'pause': return `<rect x="10" y="6" width="4" height="14" rx="1" fill="${PALETTE.sun}"/><rect x="18" y="6" width="4" height="14" rx="1" fill="${PALETTE.sun}"/>`;
    case 'hourglass': return `<path d="M10 4 H22 L16 13 L22 22 H10 L16 13Z" fill="none" stroke="${PALETTE.sun}" stroke-width="2.2" stroke-linejoin="round"/>`;
    case 'diff': return `<rect x="3" y="3" width="12" height="20" rx="1" fill="#3a2f5c"/><rect x="17" y="3" width="12" height="20" rx="1" fill="#3a2f5c"/>${[6, 10, 14, 18].map((y, i) => `<rect x="5" y="${y}" width="6" height="2" fill="${i === 1 ? PALETTE.coral : '#8e86ad'}"/><rect x="19" y="${y}" width="7" height="2" fill="${i === 2 ? PALETTE.mint : '#8e86ad'}"/>`).join('')}`;
    case 'emblem': return `<circle cx="16" cy="13" r="6" fill="${c}" opacity=".8"/><circle cx="16" cy="13" r="2.4" fill="${OT.screen}"/>`;
    case 'check': return `<path d="M8 13 l6 6 11 -12" stroke="${PALETTE.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'rocket': return `<path d="M16 3 C21 7 21 15 19 19 H13 C11 15 11 7 16 3Z" fill="${OT.paper}"/><circle cx="16" cy="11" r="2" fill="${PALETTE.sky}"/>`;
    case 'off': default: return `<path d="M3 3 L12 3 L4 14Z" fill="#fff" opacity=".07"/>`;
  }
}

/* desk kinds: 'pod' (team stripe), 'hot' (neutral), 'boss' (Pixel's).
   o = { hue (team hue), accent (owner hue), item ('mug'|'plant'|'telescope'|null) } */
function _otDesk(kind, o = {}) {
  const wide = kind === 'boss';
  const L = wide ? -86 : -58, R = wide ? 96 : 66;
  const frontC = kind === 'hot' ? '#d7c7ef' : kind === 'boss' ? OT.woodLo : OT.wood;
  const topC = kind === 'hot' ? '#efe6fb' : kind === 'boss' ? OT.wood : OT.woodHi;
  const stripe = kind === 'pod' ? `<rect x="${L}" y="-18" width="${R - L}" height="6" fill="${hueHex(o.hue)}" ${_o(2)}/>` : '';
  const items = {
    mug: `<g transform="translate(${L + 26} -28)"><rect x="-6" y="-12" width="12" height="12" rx="2" fill="${OT.paper}" ${_o(1.8)}/><path d="M6 -9 c5 0 5 6 0 6" fill="none" ${_o(1.6)}/><rect x="-6" y="-8" width="12" height="3" fill="${hueHex(o.accent)}"/></g>`,
    plant: `<g transform="translate(${L + 26} -28)"><path d="M-7 0 L-6 -8 H6 L7 0Z" fill="${OT.paper}" ${_o(1.8)}/><path d="M0 -8 C-10 -14 -8 -22 -2 -20 C0 -16 0 -12 0 -8 C2 -16 8 -22 10 -16 C8 -12 4 -10 0 -8" fill="#5fbf73" ${_o(1.6)}/></g>`,
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
    <g class="d-tray" transform="translate(${R - 18} -25)" style="display:none"><path d="M-12 0 L-10 -8 H10 L12 0Z" fill="${OT.steel}" ${_o(1.6)}/><rect x="-9" y="-12" width="18" height="10" rx="1" fill="#e8c38c" ${_o(1.5)} transform="rotate(-6)"/></g>
    ${items[o.item] || ''}
  </svg>`;
}
/* chair behind the seat — always just a chair (no jackets, nothing body-shaped) */
function _otChair(hue) {
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
function _otDeskSync(el, s) {
  if (!el) return;
  const g = el.querySelector('.d-glyph'); if (g && g.dataset.name !== s.glyph) { g.innerHTML = _otGlyph(s.glyph, s.hue); g.dataset.name = s.glyph; }
  const tray = el.querySelector('.d-tray'); if (tray) { tray.style.display = s.tray ? '' : 'none'; tray.classList.toggle('glow', s.tray === 'new'); }
}

Object.assign(THEME_OFFICE, {
  art: _otArt, sync: _otSync, desk: _otDesk, chair: _otChair, couchFront: _otCouchFront,
  glyph: _otGlyph, deskSync: _otDeskSync, door: _otDoorState,
});
