/* ============================================================
   office-theme.js — the Office's ART (spec-office §1). Pure drawing:
   knows what a couch looks like, never what an agent is doing.
   Swappable: another theme supplies the same functions + THEME anchors.

   Public (attached to THEME_OFFICE):
     art(ctx)               → SVG string, the dollhouse room (viewBox 0 -70 1600 1000)
                              ctx = { pods:[{id, team}] }  (team-coloured rugs)
     sync(svgRoot, ws)      → updates live bits: clock hand, whiteboard, dossier
                              thickness, outbox flag, poster grades, pennants
     desk(kind, o)          → SVG string of one desk (local coords, origin = seat)
     chair(hue, o)          → SVG string of the chair behind a seat
     couchFront()           → SVG string of the couch's front cushions (occludes sleepers)
     flag(team)             → SVG string of a pod's flag pole (emblem added by engine)
     glyph(name, hue)       → monitor screen content (32×26 box)
     deskSync(el, s)        → update a desk element: glyph, lamp, pile, jacket, stamp, tray
     door(open)             → toggle the door leaf
   Everything uses the character ink outline so the room and the cast match.
   ============================================================ */

const OT_INK = '#241a44';
const OT = {
  wall: '#f6e2c6', wallHi: '#fbeedb', wallLo: '#ecd0ad', stripe: '#f0d7b6',
  wains: '#93c4b0', wainsLo: '#7db29d', rail: '#b9773f', base: '#7a4b2c',
  floor: '#d9a46b', floorLo: '#c48a51', seam: '#b97d45', plank: '#e4b47c',
  wood: '#c98a50', woodLo: '#a96d3a', woodHi: '#e8b77f', metal: '#c9c3dd', steel: '#8e86ad',
  paper: '#fff6e9', glass: '#bfe6ff', screen: '#1d1638', bezel: '#3a2f5c',
  boss: '#ffe0a3', bossStripe: '#ffd27f', carpet: '#e9b38a',
};
const _o = (w = 3) => `stroke="${OT_INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
/* gentle one-point perspective for things on the floor: x drifts outward as y nears */
const _otP = (x, y) => 800 + (x - 800) * (0.9 + 0.1 * (y - 380) / 520);

/* ---------------------------------------------------------------- room */
function _otDefs() {
  return `<defs>
    <linearGradient id="otWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${OT.wallLo}"/><stop offset=".35" stop-color="${OT.wall}"/><stop offset="1" stop-color="${OT.wallHi}"/></linearGradient>
    <linearGradient id="otBoss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7cf86"/><stop offset="1" stop-color="${OT.boss}"/></linearGradient>
    <linearGradient id="otFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${OT.floorLo}"/><stop offset=".5" stop-color="${OT.floor}"/><stop offset="1" stop-color="#e2ad72"/></linearGradient>
    <linearGradient id="otSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4bb0"/><stop offset=".55" stop-color="#c77bb7"/><stop offset="1" stop-color="#ffb487"/></linearGradient>
    <radialGradient id="otPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3cf" stop-opacity=".55"/><stop offset="1" stop-color="#fff3cf" stop-opacity="0"/></radialGradient>
    <radialGradient id="otGlow" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff1c4" stop-opacity=".5"/><stop offset="1" stop-color="#fff1c4" stop-opacity="0"/></radialGradient>
    <linearGradient id="otBeam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd2a6" stop-opacity=".34"/><stop offset="1" stop-color="#ffd2a6" stop-opacity="0"/></linearGradient>
    <linearGradient id="otSpill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c2" stop-opacity=".85"/><stop offset="1" stop-color="#fff2c2" stop-opacity="0"/></linearGradient>
    <pattern id="otWallpaper" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="none"/><path d="M22 14 l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z" fill="${OT.stripe}"/></pattern>
    <pattern id="otBossPaper" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="18" height="36" fill="${OT.bossStripe}" opacity=".55"/></pattern>
    <pattern id="otKnit" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 5 L7 0 L14 5 M0 10 L7 5 L14 10" fill="none" stroke="#000" stroke-opacity=".07" stroke-width="2"/></pattern>
  </defs>`;
}

function _otShell() {
  /* ceiling slab + side cut edges + floor slab: the dollhouse box itself */
  const seams = [];
  for (let x = -40; x <= 1640; x += 64) {
    seams.push(`<path d="M${_otP(x, 380).toFixed(1)} 380 L${x} 900" stroke="${OT.seam}" stroke-width="2" opacity=".55"/>`);
  }
  const joints = [];
  [430, 492, 566, 652, 750, 860].forEach((y, i) => {
    for (let x = (i % 2) * 96 - 40; x < 1640; x += 192) {
      joints.push(`<path d="M${_otP(x, y).toFixed(1)} ${y} l0 ${8 + (y - 380) / 30}" stroke="${OT.seam}" stroke-width="1.6" opacity=".5"/>`);
    }
    joints.push(`<path d="M0 ${y} H1600" stroke="${OT.seam}" stroke-width="1.2" opacity=".18"/>`);
  });
  return `
  <!-- back wall -->
  <rect x="0" y="-40" width="1600" height="420" fill="url(#otWall)"/>
  <rect x="0" y="-40" width="1200" height="290" fill="url(#otWallpaper)" opacity=".7"/>
  <!-- wainscot -->
  <rect x="0" y="262" width="1200" height="118" fill="${OT.wains}"/>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<rect x="${14 + i * 132}" y="280" width="112" height="78" rx="6" fill="${OT.wainsLo}" opacity=".55"/>`).join('')}
  <rect x="0" y="252" width="1200" height="12" fill="${OT.rail}" ${_o(2.5)}/>
  <rect x="0" y="368" width="1600" height="14" fill="${OT.base}"/>
  <!-- floor -->
  <path d="M0 380 H1600 V900 H0Z" fill="url(#otFloor)"/>
  ${seams.join('')}${joints.join('')}
  <path d="M0 380 H1600" stroke="${OT_INK}" stroke-width="3"/>
  <!-- window light falling on the floor -->
  <path d="M1012 380 L1172 380 L1060 700 L820 700Z" fill="url(#otBeam)"/>
  <!-- lamp pools -->
  <ellipse cx="380" cy="560" rx="360" ry="120" fill="url(#otPool)"/>
  <ellipse cx="930" cy="560" rx="340" ry="110" fill="url(#otPool)"/>
  <ellipse cx="760" cy="800" rx="420" ry="110" fill="url(#otPool)" opacity=".8"/>
  <ellipse cx="1290" cy="790" rx="320" ry="100" fill="url(#otPool)" opacity=".8"/>`;
}

function _otCut() {
  /* cut edges drawn last so they frame everything */
  return `
  <path d="M-12 -70 H1612 V-36 H-12Z" fill="#4b3570"/>
  <path d="M-12 -46 H1612" stroke="#6a4c94" stroke-width="5"/>
  <path d="M-12 -40 H1612" stroke="${OT_INK}" stroke-width="3"/>
  <path d="M-12 -70 V930 H0 V-70Z" fill="#4b3570"/><path d="M1600 -70 V930 H1612 V-70Z" fill="#4b3570"/>
  <path d="M-12 900 H1612 V930 H-12Z" fill="#4b3570"/>
  <path d="M-12 904 H1612" stroke="#6a4c94" stroke-width="5"/>
  <path d="M0 -40 V900 M1600 -40 V900 M0 900 H1600" stroke="${OT_INK}" stroke-width="3" fill="none"/>
  ${[386, 932, 1400].map(x => `<g transform="translate(${x} -40)">
      <path d="M0 0 V34" stroke="${OT_INK}" stroke-width="2.5"/>
      <path d="M-30 58 C-30 34 30 34 30 58Z" fill="${PALETTE.sun}" ${_o()}/>
      <path d="M-16 44 C-10 40 -4 39 2 39" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5" fill="none"/>
      <ellipse cx="0" cy="60" rx="11" ry="5" fill="#fff7d6" ${_o(2)}/>
      <path d="M-28 60 L-120 330 H120 L28 60Z" fill="url(#otGlow)" opacity=".55"/>
    </g>`).join('')}`;
}

function _otDoor() {
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
      <rect x="64" y="176" width="60" height="24" rx="5" fill="${OT.paper}" ${_o(2)}/>
      <text x="94" y="193" text-anchor="middle" font-size="13" font-weight="900" fill="${OT_INK}">STUDIO</text>
    </g>
    <!-- "days since" sign -->
    <g transform="translate(28 66) rotate(-2)">
      <rect width="132" height="52" rx="6" fill="${OT.paper}" ${_o(2.5)}/>
      <text x="66" y="17" text-anchor="middle" font-size="9.5" font-weight="900" fill="${OT_INK}" letter-spacing=".04em">DAYS WITHOUT A</text>
      <text x="66" y="29" text-anchor="middle" font-size="9.5" font-weight="900" fill="${OT_INK}" letter-spacing=".04em">MERGE CONFLICT</text>
      <rect x="50" y="33" width="32" height="15" rx="3" fill="${OT_INK}"/>
      <text x="66" y="45" text-anchor="middle" font-size="13" font-weight="900" fill="${PALETTE.sun}">03</text>
    </g>
    <!-- welcome mat -->
    <path d="M${_otP(40, 388)} 388 H${_otP(150, 388)} L${_otP(162, 410)} 410 H${_otP(28, 410)}Z" fill="${PALETTE.coral}" ${_o(2.5)}/>
    <text x="95" y="404" text-anchor="middle" font-size="12" font-weight="900" fill="${OT.paper}" letter-spacing=".12em">HELLO</text>
    <!-- coat rack -->
    <g transform="translate(196 380)">
      <path d="M0 0 V-170" stroke="${OT.woodLo}" stroke-width="7" stroke-linecap="round"/><path d="M0 0 V-170" stroke="${OT_INK}" stroke-width="2" opacity=".0"/>
      <ellipse cx="0" cy="2" rx="20" ry="5" fill="${OT.woodLo}" ${_o(2)}/>
      <path d="M-16 -160 L16 -150 M16 -160 L-16 -150" stroke="${OT.woodLo}" stroke-width="5" stroke-linecap="round"/>
      <path d="M-22 -168 C-22 -184 4 -186 6 -170 L14 -166 L-30 -164Z" fill="${PALETTE.grape}" ${_o(2.5)}/>
      <path d="M12 -152 C30 -140 22 -96 14 -84 L4 -86 C10 -104 10 -132 2 -146Z" fill="${PALETTE.teal}" ${_o(2.5)}/>
    </g>
  </g>`;
}

function _otWhiteboard() {
  return `<g id="otWhiteboard">
    <rect x="236" y="44" width="528" height="264" rx="10" fill="${OT.metal}" ${_o()}/>
    <rect x="250" y="58" width="500" height="234" rx="4" fill="#fdfcf7" ${_o(2)}/>
    <path d="M262 70 L380 70" stroke="#e9e6f2" stroke-width="10" stroke-linecap="round" opacity=".7"/>
    <text x="268" y="92" font-size="21" font-weight="900" fill="${PALETTE.sky}" letter-spacing="-.01em">AURORA</text>
    <path d="M362 85 h22 m-8 -7 l8 7 -8 7" stroke="${PALETTE.sky}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text id="wbTarget" x="392" y="92" font-size="21" font-weight="900" fill="${PALETTE.sky}">v1.0</text>
    <!-- progress ring -->
    <circle cx="316" cy="178" r="44" fill="none" stroke="#ece8f5" stroke-width="11"/>
    <circle id="wbRing" cx="316" cy="178" r="44" fill="none" stroke="${PALETTE.coral}" stroke-width="11" stroke-linecap="round" transform="rotate(-90 316 178)" stroke-dasharray="0 277"/>
    <text id="wbPct" x="316" y="187" text-anchor="middle" font-size="26" font-weight="900" fill="${OT_INK}">64%</text>
    <g id="wbBars"></g>
    <path d="M568 108 V272" stroke="#d9d4e8" stroke-width="2.5" stroke-dasharray="1 7" stroke-linecap="round"/>
    <text x="584" y="104" font-size="12" font-weight="900" fill="${PALETTE.grape}" letter-spacing=".1em">NOW</text>
    <g id="wbList"></g>
    <!-- doodles: a rocket and a sticky -->
    <g transform="translate(270 248) rotate(-8)"><rect width="44" height="38" fill="${PALETTE.sun}" ${_o(2)}/><path d="M7 12 h28 M7 21 h22 M7 30 h26" stroke="${OT_INK}" stroke-width="2" stroke-linecap="round" opacity=".55"/></g>
    <g transform="translate(338 258) rotate(-6)"><path d="M0 0 C10 -6 24 -6 34 0 C24 6 10 6 0 0Z" fill="none" stroke="${PALETTE.coral}" stroke-width="3"/><circle cx="20" cy="0" r="3" fill="${PALETTE.coral}"/><path d="M0 0 L-10 -6 M0 0 L-10 6" stroke="${PALETTE.coral}" stroke-width="3" stroke-linecap="round"/><path d="M-14 0 h-14" stroke="${PALETTE.sun}" stroke-width="3" stroke-dasharray="3 5" stroke-linecap="round"/></g>
    <!-- marker tray -->
    <rect x="300" y="292" width="400" height="12" rx="3" fill="${OT.steel}" ${_o(2)}/>
    <rect x="330" y="284" width="34" height="9" rx="4" fill="${PALETTE.coral}" ${_o(1.8)}/><rect x="372" y="284" width="34" height="9" rx="4" fill="${PALETTE.sky}" ${_o(1.8)}/><rect x="414" y="284" width="34" height="9" rx="4" fill="${PALETTE.mint}" ${_o(1.8)}/>
    <rect x="620" y="282" width="40" height="12" rx="3" fill="#f1eef7" ${_o(1.8)}/>
    <!-- the dossier: a manila folder clipped to the top-right corner -->
    <g id="otDossier" transform="translate(694 38)">
      <g id="dosPages"></g>
      <path d="M2 22 H28 L34 14 H66 V100 H2Z" fill="#e9bf7a" ${_o(2.5)}/>
      <path d="M2 30 H66" stroke="#c99a52" stroke-width="2"/>
      <rect x="12" y="46" width="44" height="20" rx="3" fill="${OT.paper}" ${_o(1.8)}/>
      <text x="34" y="60" text-anchor="middle" font-size="10" font-weight="900" fill="${OT_INK}">FEATURES</text>
      <text id="dosCount" x="34" y="86" text-anchor="middle" font-size="11" font-weight="900" fill="#7a5322">7 ✓ · 4 ○</text>
      <!-- binder clip -->
      <path d="M18 0 H50 L46 18 H22Z" fill="${OT_INK}"/>
      <path d="M22 0 C22 -12 30 -14 30 -4 M46 0 C46 -12 38 -14 38 -4" fill="none" stroke="${OT.metal}" stroke-width="3" stroke-linecap="round"/>
    </g>
  </g>`;
}

function _otPoster() {
  return `<g id="otPoster" transform="translate(788 98)">
    <rect width="88" height="124" rx="4" fill="${OT.woodLo}" ${_o()}/>
    <rect x="7" y="7" width="74" height="110" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="44" y="22" text-anchor="middle" font-size="8.5" font-weight="900" fill="${OT_INK}" letter-spacing=".08em">HEALTH</text>
    <text x="44" y="32" text-anchor="middle" font-size="8.5" font-weight="900" fill="${OT_INK}" letter-spacing=".08em">CHECK</text>
    <g id="otGrades"></g>
  </g>`;
}

function _otClock() {
  const ticks = Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; const r1 = i % 3 ? 26 : 23;
    return `<path d="M${(Math.sin(a) * r1).toFixed(1)} ${(-Math.cos(a) * r1).toFixed(1)} L${(Math.sin(a) * 29).toFixed(1)} ${(-Math.cos(a) * 29).toFixed(1)}" stroke="${OT_INK}" stroke-width="${i % 3 ? 2 : 3.5}" stroke-linecap="round"/>`; }).join('');
  return `<g id="otClock" transform="translate(962 96)">
    <circle r="36" fill="${PALETTE.coral}" ${_o()}/>
    <circle r="30" fill="#fffdf6" ${_o(2)}/>
    <path id="clockArc" d="" fill="${PALETTE.mint}" opacity=".45"/>
    ${ticks}
    <g id="clockHand"><path d="M0 4 L0 -24" stroke="${OT_INK}" stroke-width="4" stroke-linecap="round"/><path d="M0 -24 l-4 7 h8z" fill="${OT_INK}"/></g>
    <circle r="4" fill="${PALETTE.sun}" ${_o(1.8)}/>
    <g transform="translate(0 52)"><rect x="-38" y="-12" width="76" height="22" rx="11" fill="${OT_INK}"/>
      <text id="clockLbl" y="4" text-anchor="middle" font-size="12" font-weight="900" fill="${OT.paper}">64% → v1.0</text></g>
  </g>`;
}

function _otWindow() {
  return `<g id="otWindow">
    <rect x="1030" y="96" width="140" height="166" rx="6" fill="${OT.wood}" ${_o()}/>
    <rect x="1040" y="108" width="120" height="142" fill="url(#otSky)" ${_o(2)}/>
    <circle cx="1130" cy="136" r="13" fill="#fff4d2"/><circle cx="1136" cy="131" r="11" fill="#d9a0c8" opacity=".95"/>
    <circle cx="1056" cy="124" r="2" fill="#fff"/><circle cx="1090" cy="118" r="1.6" fill="#fff"/><circle cx="1108" cy="150" r="1.4" fill="#fff"/>
    <path d="M1050 186 c6 -12 22 -12 26 -2 c8 -4 18 2 14 10 h-46 c-6 0 -2 -10 6 -8z" fill="#fff" opacity=".8"/>
    <path d="M1040 250 V218 h14 v-14 h12 v18 h10 v-26 h18 v34 h12 v-20 h14 v12 h16 v-24 h14 V250Z" fill="#3b2d6e"/>
    ${[[1044, 224], [1070, 210], [1098, 204], [1126, 218], [1148, 234]].map(([x, y]) => `<rect x="${x}" y="${y}" width="5" height="6" fill="${PALETTE.sun}" opacity=".9"/>`).join('')}
    <path d="M1100 108 V250 M1040 178 H1160" stroke="${OT.wood}" stroke-width="6"/>
    <path d="M1100 108 V250 M1040 178 H1160" stroke="${OT_INK}" stroke-width="1.5" opacity=".5"/>
    <!-- curtains -->
    <path d="M1030 90 C1040 140 1022 200 1040 272 L1014 272 C1006 200 1018 140 1012 90Z" fill="${PALETTE.coral}" ${_o(2.5)}/>
    <path d="M1170 90 C1160 140 1178 200 1160 272 L1186 272 C1194 200 1182 140 1188 90Z" fill="${PALETTE.coral}" ${_o(2.5)}/>
    <rect x="1004" y="84" width="192" height="10" rx="5" fill="${OT.woodLo}" ${_o(2)}/>
    <!-- sill + succulent -->
    <rect x="1022" y="258" width="156" height="12" rx="3" fill="${OT.woodHi}" ${_o(2.5)}/>
    <path d="M1132 258 h22 l-3 -16 h-16z" fill="${PALETTE.coral}" ${_o(2)}/>
    <path d="M1143 242 c-10 -6 -12 -16 -4 -20 c2 8 4 12 4 20 c0 -10 4 -18 10 -20 c4 8 0 16 -10 20" fill="${PALETTE.mint}" ${_o(2)}/>
  </g>`;
}

function _otPrinterOutbox() {
  return `<g id="otPrinter" transform="translate(798 292)">
    <rect x="0" y="40" width="90" height="66" rx="5" fill="${OT.wood}" ${_o()}/>
    <path d="M8 62 H82 M8 84 H82" stroke="${OT.woodLo}" stroke-width="2.5"/><circle cx="45" cy="56" r="3" fill="${OT_INK}"/><circle cx="45" cy="78" r="3" fill="${OT_INK}"/><circle cx="45" cy="100" r="3" fill="${OT_INK}"/>
    <rect x="6" y="10" width="78" height="32" rx="7" fill="${OT.metal}" ${_o(2.5)}/>
    <rect x="18" y="4" width="54" height="10" rx="2" fill="${OT.steel}" ${_o(2)}/>
    <path id="printerSheet" d="M24 -14 H66 V8 H24Z" fill="${OT.paper}" ${_o(2)}/>
    <path d="M30 -6 H58 M30 0 H52" stroke="${OT.steel}" stroke-width="2" stroke-linecap="round"/>
    <rect x="14" y="30" width="62" height="6" rx="2" fill="${OT_INK}" opacity=".6"/>
    <circle cx="74" cy="20" r="3.5" fill="${PALETTE.mint}"/>
    <g id="printerTray" style="display:none"><rect x="20" y="34" width="40" height="22" rx="2" fill="#e8c38c" ${_o(2)} transform="rotate(-4 40 45)"/><path d="M20 34 L40 46 L60 34" fill="none" ${_o(1.6)}/></g>
  </g>
  <g id="otOutbox" transform="translate(906 264)">
    <rect x="0" y="0" width="62" height="86" rx="8" fill="${PALETTE['sun-deep']}" ${_o()}/>
    <rect x="10" y="14" width="42" height="8" rx="4" fill="${OT_INK}"/>
    <rect x="9" y="36" width="44" height="18" rx="4" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="31" y="49" text-anchor="middle" font-size="11" font-weight="900" fill="${OT_INK}" font-family="ui-monospace,Menlo,monospace">main</text>
    <path d="M14 64 h34 M14 72 h24" stroke="${OT_INK}" stroke-width="2" stroke-linecap="round" opacity=".35"/>
    <g id="outFlag" transform="translate(62 70)"><g class="ot-flag-arm"><path d="M0 0 V-46" stroke="${OT_INK}" stroke-width="4" stroke-linecap="round"/><path d="M0 -46 h20 l-5 8 5 8 h-20z" fill="${PALETTE.coral}" ${_o(2)}/></g></g>
  </g>`;
}

function _otConsole() {
  return `<g id="otConsole" transform="translate(1080 320)">
    <path d="M10 92 L14 30 H58 L62 92Z" fill="${OT.metal}" ${_o()}/>
    <path d="M14 70 L58 70 L60 86 H12Z" fill="${PALETTE.sun}"/>
    ${[0, 1, 2, 3, 4].map(i => `<path d="M${14 + i * 10} 86 l8 -16 h5 l-8 16z" fill="${OT_INK}"/>`).join('')}
    <path d="M12 70 H60 M12 86 H60" stroke="${OT_INK}" stroke-width="2.5"/>
    <rect x="6" y="20" width="60" height="14" rx="5" fill="${OT.steel}" ${_o(2.5)}/>
    <g id="consoleBtn"><path d="M16 21 C16 -2 56 -2 56 21Z" fill="${PALETTE.coral}" ${_o(2.5)}/><path d="M24 10 C28 4 34 3 38 3" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".6"/></g>
    <rect x="18" y="40" width="36" height="16" rx="3" fill="${OT_INK}"/>
    <text x="36" y="52" text-anchor="middle" font-size="9.5" font-weight="900" fill="${PALETTE.sun}" letter-spacing=".08em">DEPLOY</text>
  </g>
  <!-- the rollback extinguisher, right where you'd want it -->
  <g transform="translate(1164 300)">
    <rect x="0" y="16" width="26" height="70" rx="11" fill="${PALETTE.coral}" ${_o(2.5)}/>
    <path d="M8 16 V6 H20 V16 M20 8 C32 8 34 18 32 30" fill="none" ${_o(2.5)}/>
    <rect x="-6" y="38" width="38" height="16" rx="3" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="13" y="50" text-anchor="middle" font-size="7.5" font-weight="900" fill="${OT_INK}">ROLLBACK</text>
  </g>`;
}

function _otBossOffice() {
  /* Pixel's glass corner office: own wallpaper, corkboard (3 cards = altitude),
     megaphone on a hook, glass side wall with half-open blinds */
  return `<g id="otBoss">
    <rect x="1206" y="-40" width="394" height="420" fill="url(#otBoss)"/>
    <rect x="1206" y="-40" width="394" height="420" fill="url(#otBossPaper)"/>
    <rect x="1206" y="252" width="394" height="12" fill="${OT.rail}" ${_o(2.5)}/>
    <rect x="1206" y="264" width="394" height="104" fill="#e6a85c" opacity=".55"/>
    <!-- office carpet -->
    <path d="M1206 380 H1600 V624 H${_otP(1240, 624)}Z" fill="${OT.carpet}"/>
    <path d="M1206 380 H1600 V624 H${_otP(1240, 624)}Z" fill="url(#otKnit)"/>
    <ellipse cx="1392" cy="560" rx="170" ry="44" fill="${PALETTE.sun}" opacity=".35"/>
    <!-- corkboard -->
    <g transform="translate(1286 112)">
      <rect width="180" height="108" rx="6" fill="${OT.woodLo}" ${_o()}/>
      <rect x="8" y="8" width="164" height="92" fill="#d9a066"/>
      ${[['v1.0', PALETTE.sun, 18, -4], ['VOICE', PALETTE.teal, 70, 3], ['PAY', PALETTE.sky, 122, -2]].map(([t, c, x, r]) => `<g transform="translate(${x} 22) rotate(${r})"><rect width="44" height="54" fill="${OT.paper}" ${_o(2)}/><rect width="44" height="10" fill="${c}"/><text x="22" y="36" text-anchor="middle" font-size="11" font-weight="900" fill="${OT_INK}">${t}</text><circle cx="22" cy="5" r="3.5" fill="${PALETTE.coral}" ${_o(1.5)}/></g>`).join('')}
      <text x="90" y="-8" text-anchor="middle" font-size="10" font-weight="900" fill="#7a4b10" letter-spacing=".14em">BIG PICTURE</text>
    </g>
    <!-- megaphone on a hook -->
    <g transform="translate(1530 150)">
      <path d="M0 0 c0 -10 10 -10 10 0" fill="none" stroke="${OT_INK}" stroke-width="3"/>
      <g transform="translate(6 8) rotate(24)"><path d="M-6 0 L26 -14 V22 L-6 8Z" fill="${PALETTE.sun}" ${_o(2.5)}/><rect x="-14" y="-1" width="10" height="10" rx="2" fill="${PALETTE.coral}" ${_o(2)}/><ellipse cx="26" cy="4" rx="5" ry="18" fill="${PALETTE['sun-deep']}" ${_o(2.5)}/></g>
    </g>
    <!-- trophy shelf -->
    <g transform="translate(1236 200)">
      <rect x="0" y="40" width="40" height="7" rx="2" fill="${OT.woodLo}" ${_o(2)}/>
      <path d="M8 40 h24 l-4 -6 h-16z M12 34 C4 18 6 8 20 8 C34 8 36 18 28 34Z" fill="${PALETTE.sun}" ${_o(2)}/>
      <path d="M17 18 l3 -4 3 4 -3 4z" fill="#fff" opacity=".8"/>
    </g>
    <!-- tall plant -->
    <g transform="translate(1566 600)">
      <path d="M-18 0 L-14 -36 H14 L18 0Z" fill="${PALETTE.grape}" ${_o(2.5)}/>
      ${[[-40, -120, -10], [30, -140, 14], [-20, -170, -4], [26, -96, 30], [-44, -80, -34]].map(([dx, dy, r]) => `<path d="M0 -36 Q${dx / 2} ${dy / 2} ${dx} ${dy}" stroke="#3f8a54" stroke-width="3" fill="none"/><ellipse cx="${dx}" cy="${dy}" rx="13" ry="24" transform="rotate(${r} ${dx} ${dy})" fill="#5fbf73" ${_o(2)}/>`).join('')}
    </g>
    <!-- glass side wall: frame, blinds, decal -->
    <path d="M1200 118 L1250 96 V630 L1200 384Z" fill="${OT.glass}" opacity=".42"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M1200 ${128 + i * 13} L1250 ${108 + i * 13}" stroke="#fff" stroke-width="5" opacity=".8"/><path d="M1200 ${131 + i * 13} L1250 ${111 + i * 13}" stroke="${OT.steel}" stroke-width="1.2" opacity=".6"/>`).join('')}
    <path d="M1206 330 L1244 300 M1214 380 L1244 356" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <path d="M1200 118 L1250 96 V630 L1200 384Z" fill="none" ${_o(3)}/>
    <path d="M1225 107 V507" stroke="${OT_INK}" stroke-width="2" opacity=".35"/>
    <g transform="translate(1225 240) skewY(-24)"><rect x="-21" y="-10" width="42" height="28" rx="4" fill="${PALETTE.sun}" ${_o(2)}/><text y="4" text-anchor="middle" font-size="8.5" font-weight="900" fill="${OT_INK}">PIXEL</text><text y="14" text-anchor="middle" font-size="6" font-weight="900" fill="${OT_INK}">DIRECTOR</text></g>
  </g>`;
}

function _otRug(r, hue, opts = {}) {
  const c = hueHex(hue); const y1 = r.y, y2 = r.y + r.h;
  const pts = `M${_otP(r.x, y1)} ${y1} H${_otP(r.x + r.w, y1)} L${_otP(r.x + r.w, y2)} ${y2} H${_otP(r.x, y2)}Z`;
  const inset = 14;
  const ipts = `M${_otP(r.x + inset, y1 + 10)} ${y1 + 10} H${_otP(r.x + r.w - inset, y1 + 10)} L${_otP(r.x + r.w - inset, y2 - 10)} ${y2 - 10} H${_otP(r.x + inset, y2 - 10)}Z`;
  return `<g class="ot-rug">
    <path d="${pts}" fill="${opts.neutral ? '#cbbfe4' : shade(c, 20)}" ${_o(2.5)}/>
    <path d="${ipts}" fill="none" stroke="${opts.neutral ? '#a99bd0' : shade(c, -18)}" stroke-width="4" stroke-dasharray="${opts.neutral ? '0' : '14 8'}"/>
    <path d="${pts}" fill="url(#otKnit)"/>
    ${opts.neutral ? '' : Array.from({ length: Math.floor(r.w / 26) }, (_, i) => `<path d="M${_otP(r.x + 10 + i * 26, y2)} ${y2} v8" stroke="${shade(c, -10)}" stroke-width="3" stroke-linecap="round"/>`).join('')}
  </g>`;
}

function _otLounge() {
  return `
  <!-- break nook rug + couch (back + seat; front cushions are a separate layer) -->
  <ellipse cx="200" cy="838" rx="200" ry="52" fill="${PALETTE.rose}" opacity=".45"/>
  <ellipse cx="200" cy="838" rx="176" ry="40" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 9" opacity=".6"/>
  <g id="otCouch">
    <path d="M44 732 C44 704 60 698 90 698 H310 C340 698 352 704 352 732 V790 H44Z" fill="${PALETTE.coral}" ${_o()}/>
    ${[90, 176, 262].map(x => `<rect x="${x - 36}" y="712" width="72" height="66" rx="16" fill="${shade(PALETTE.coral, 18)}" ${_o(2.5)}/>`).join('')}
    <rect x="22" y="740" width="44" height="84" rx="20" fill="${shade(PALETTE.coral, -10)}" ${_o()}/>
    <rect x="330" y="740" width="44" height="84" rx="20" fill="${shade(PALETTE.coral, -10)}" ${_o()}/>
    <!-- throw pillow -->
    <path d="M300 740 l26 -10 12 22 -24 12z" fill="${PALETTE.sun}" ${_o(2)}/>
    <!-- office cat asleep on the arm -->
    <g transform="translate(44 734)"><path d="M-16 6 C-18 -8 12 -12 18 2 C20 8 -14 12 -16 6Z" fill="#7d6aa8" ${_o(2)}/><circle cx="-12" cy="-1" r="7" fill="#7d6aa8" ${_o(2)}/><path d="M-17 -5 l-2 -7 6 4 M-9 -7 l2 -6 2 7" fill="#7d6aa8" ${_o(1.6)}/><path d="M-14 -1 q2 2 4 0" fill="none" ${_o(1.4)}/><path d="M16 4 c8 2 10 -6 4 -8" fill="none" stroke="#7d6aa8" stroke-width="4" stroke-linecap="round"/></g>
  </g>
  <!-- side lamp -->
  <g transform="translate(14 700)"><path d="M0 0 V-60" stroke="${OT_INK}" stroke-width="3"/><path d="M-16 -60 L16 -60 L10 -84 H-10Z" fill="${PALETTE.sun}" ${_o(2.5)}/><ellipse cx="0" cy="2" rx="12" ry="4" fill="${OT_INK}"/></g>
  <!-- coffee cart -->
  <g id="otCoffee" transform="translate(394 612)">
    <rect x="0" y="40" width="80" height="62" rx="6" fill="${PALETTE.teal}" ${_o()}/>
    <circle cx="14" cy="104" r="6" fill="${OT_INK}"/><circle cx="66" cy="104" r="6" fill="${OT_INK}"/>
    <rect x="8" y="54" width="64" height="8" rx="3" fill="${shade(PALETTE.teal, -24)}"/>
    <rect x="12" y="-6" width="46" height="48" rx="7" fill="${OT.steel}" ${_o(2.5)}/>
    <rect x="20" y="4" width="30" height="12" rx="3" fill="${OT_INK}"/><circle cx="28" cy="10" r="2" fill="${PALETTE.mint}"/><circle cx="36" cy="10" r="2" fill="${PALETTE.sun}"/>
    <rect x="26" y="26" width="14" height="10" rx="2" fill="${OT_INK}"/>
    <g class="ot-steam"><path d="M30 -10 c-6 -8 4 -12 -2 -22" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><path d="M40 -12 c-6 -8 4 -12 -2 -20" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/></g>
    <path d="M60 30 h12 v12 h-12z" fill="${OT.paper}" ${_o(1.8)}/><path d="M72 33 c5 0 5 6 0 6" fill="none" ${_o(1.6)}/>
    <rect x="4" y="66" width="72" height="18" rx="3" fill="${OT.paper}" ${_o(1.8)}/>
    <text x="40" y="79" text-anchor="middle" font-size="11" font-weight="900" fill="${OT_INK}" letter-spacing=".14em">FUEL</text>
  </g>
  <!-- beanbags (the nap pile overflow) -->
  ${THEME_OFFICE.beanbags.map((b, i) => { const c = [PALETTE.sky, PALETTE.sun, PALETTE.mint][i % 3]; return `<g transform="translate(${b.x} ${b.y})"><path d="M-52 4 C-60 -30 -36 -66 0 -66 C36 -66 60 -30 52 4Z" fill="${shade(c, -16)}" ${_o()}/><path d="M-30 -44 C-18 -54 2 -56 16 -50" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".35"/></g>`; }).join('')}
  <!-- the empty pod-C corner becomes a lounge: round rug, low table, board game -->
  <g id="otLoungeMid">
    <ellipse cx="760" cy="826" rx="236" ry="64" fill="${PALETTE.grape}" opacity=".32"/>
    <ellipse cx="760" cy="826" rx="212" ry="52" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round" opacity=".55"/>
    <g transform="translate(690 770) scale(.8)">
      <rect x="-70" y="0" width="140" height="18" rx="9" fill="${OT.woodHi}" ${_o(2.5)}/>
      <rect x="-60" y="18" width="8" height="18" fill="${OT.woodLo}" ${_o(2)}/><rect x="52" y="18" width="8" height="18" fill="${OT.woodLo}" ${_o(2)}/>
      <rect x="-40" y="-10" width="56" height="14" rx="2" fill="${PALETTE.sky}" ${_o(2)} transform="rotate(-4)"/>
      <circle cx="-26" cy="-4" r="3" fill="${PALETTE.coral}"/><circle cx="-12" cy="-8" r="3" fill="${PALETTE.sun}"/><circle cx="2" cy="-5" r="3" fill="${PALETTE.mint}"/>
      <path d="M30 -2 c0 -10 26 -10 26 0z" fill="${PALETTE.sun}" ${_o(2)}/>
      <circle cx="38" cy="-6" r="3" fill="${OT.woodLo}"/><circle cx="46" cy="-8" r="3" fill="${OT.woodLo}"/>
    </g>
    <!-- big monstera -->
    <g transform="translate(1004 884)">
      <path d="M-22 0 L-17 -40 H17 L22 0Z" fill="${OT.paper}" ${_o(2.5)}/><path d="M-19 -14 H19" stroke="${PALETTE.sky}" stroke-width="5"/>
      ${[[-50, -96, -30], [44, -100, 28], [-8, -130, 0], [-60, -60, -60], [56, -64, 60]].map(([dx, dy, r]) => `<path d="M0 -40 Q${dx / 2} ${dy / 2 - 10} ${dx} ${dy}" stroke="#2f7a46" stroke-width="3.5" fill="none"/><path d="M${dx} ${dy - 22} C${dx + 24} ${dy - 22} ${dx + 24} ${dy + 22} ${dx} ${dy + 22} C${dx - 24} ${dy + 22} ${dx - 24} ${dy - 22} ${dx} ${dy - 22}Z" transform="rotate(${r} ${dx} ${dy})" fill="#4fb36a" ${_o(2)}/><path d="M${dx} ${dy - 16} V${dy + 16}" transform="rotate(${r} ${dx} ${dy})" stroke="#2f7a46" stroke-width="2"/>`).join('')}
    </g>
  </g>
  <!-- back-left plant by the door -->
  <g transform="translate(222 404)">
    <path d="M-16 0 L-12 -30 H12 L16 0Z" fill="${PALETTE.coral}" ${_o(2.5)}/>
    ${[[-26, -76, -24], [22, -84, 22], [-4, -104, 0]].map(([dx, dy, r]) => `<path d="M0 -30 Q${dx / 2} ${dy / 2} ${dx} ${dy}" stroke="#3f8a54" stroke-width="3" fill="none"/><ellipse cx="${dx}" cy="${dy}" rx="11" ry="22" transform="rotate(${r} ${dx} ${dy})" fill="#5fbf73" ${_o(2)}/>`).join('')}
  </g>`;
}

/* a name plaque pinned to a rug's front edge — team membership in words */
function _otPlaque(cx, y, text, hue) {
  const w = Math.max(120, text.length * 11.5 + 30);
  return `<g transform="translate(${cx} ${y})"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="15" fill="${OT.paper}" ${_o(2.5)}/>
    <circle cx="${-w / 2 + 15}" cy="0" r="6" fill="${hueHex(hue)}" ${_o(2)}/>
    <text x="8" y="6" text-anchor="middle" font-size="17" font-weight="900" fill="${OT_INK}" letter-spacing=".02em">${escapeHtml(text)}</text></g>`;
}
/* the diorama sits on a plinth — the letterbox becomes the shelf it stands on */
function _otPlinth(title) {
  return `<g id="otPlinth">
    <path d="M-30 934 H1630 L1600 992 H0Z" fill="#6b4630" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-30 934 H1630 L1626 944 H-26Z" fill="#8a5a3c"/>
    <g transform="translate(800 963)"><rect x="-260" y="-17" width="520" height="34" rx="6" fill="#e7b75a" stroke="${OT_INK}" stroke-width="2.5"/>
      <rect x="-252" y="-11" width="504" height="22" rx="4" fill="none" stroke="#a87a26" stroke-width="1.5"/>
      <circle cx="-245" cy="0" r="3" fill="#a87a26"/><circle cx="245" cy="0" r="3" fill="#a87a26"/>
      <text y="6" text-anchor="middle" font-size="16" font-weight="900" fill="#4a2c10" letter-spacing=".16em">${escapeHtml(title.toUpperCase())} · THE OFFICE</text></g>
  </g>`;
}
/* beanbag front lip (drawn over whoever sits in it) */
function _otBeanFront(i) {
  const c = [PALETTE.sky, PALETTE.sun, PALETTE.mint][i % 3];
  return `<svg viewBox="-60 -40 120 70" width="120" height="70" style="left:-60px;top:-40px" aria-hidden="true" focusable="false">
    <path d="M-50 2 C-54 -14 -40 -24 -26 -18 C-14 -12 14 -12 26 -18 C40 -24 54 -14 50 2 C44 22 -44 22 -50 2Z" fill="${c}" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M-34 -6 C-20 -2 -4 -2 6 -4" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".4"/></svg>`;
}

const _otArt = function (ctx = {}) {
  const pods = (ctx.pods || []).map(p => {
    const pod = THEME_OFFICE.pods.find(q => q.id === p.id); const r = p.rug || (pod && pod.rug);
    return r ? _otRug(r, p.team ? p.team.color : 'grape') + _otPlaque(r.x + r.w / 2 - 27, r.y + r.h, p.team ? p.team.name.replace(/^The /, '') : '', p.team ? p.team.color : 'grape') : '';
  }).join('');
  return `<svg class="ot-art" viewBox="0 -70 1600 1062" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
      font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    ${_otDefs()}
    ${_otShell()}
    ${_otBossOffice()}
    ${_otDoor()}
    ${_otWhiteboard()}
    ${_otPoster()}
    ${_otClock()}
    ${_otWindow()}
    ${_otPrinterOutbox()}
    ${_otConsole()}
    ${pods}
    ${_otRug(THEME_OFFICE.hotRug, 'grape', { neutral: true })}
    ${_otPlaque(THEME_OFFICE.hotRug.x + THEME_OFFICE.hotRug.w / 2, THEME_OFFICE.hotRug.y + THEME_OFFICE.hotRug.h, 'Solo desks', '#a99bd0')}
    ${_otPlinth(ctx.title || '')}
    ${_otLounge()}
    ${_otCut()}
  </svg>`;
};

/* ---------------------------------------------------------------- live bits */
const _GRADE = { A: ['excellent', PALETTE.mint], B: ['good', PALETTE.sun], C: ['needs care', PALETTE.coral] };
function _otSync(root, ws) {
  if (!root) return;
  const $ = id => root.querySelector('#' + id);
  const pct = ws.overall;
  /* clock: the hand IS progress */
  const a = pct * 3.6;
  $('clockHand').setAttribute('transform', `rotate(${a})`);
  const rad = (a - 90) * Math.PI / 180, large = a > 180 ? 1 : 0;
  $('clockArc').setAttribute('d', pct <= 0 ? '' : `M0 0 L0 -30 A30 30 0 ${large} 1 ${(Math.cos(rad) * 30).toFixed(2)} ${(Math.sin(rad) * 30).toFixed(2)}Z`);
  $('clockLbl').textContent = `${pct}% → ${ws.target}`;
  /* whiteboard */
  $('wbPct').textContent = pct + '%';
  $('wbTarget').textContent = ws.target;
  $('wbRing').setAttribute('stroke-dasharray', `${(277 * pct / 100).toFixed(1)} 277`);
  const now = ws.features.filter(f => f.status === 'now').slice(0, 3);
  $('wbBars').innerHTML = now.map((f, i) => {
    const y = 132 + i * 50; const w = 160 * f.pct / 100;
    const col = f.blocked ? PALETTE.coral : i === 0 ? PALETTE.teal : i === 1 ? PALETTE.sky : PALETTE.mint;
    return `<text x="382" y="${y - 8}" font-size="12.5" font-weight="900" fill="${OT_INK}">${escapeHtml(f.name.split(' ')[0])}${f.blocked ? ' !' : ''}</text>
      <rect x="382" y="${y}" width="164" height="14" rx="7" fill="none" stroke="${OT_INK}" stroke-width="2"/>
      <rect x="384" y="${y + 2}" width="${Math.max(0, w).toFixed(1)}" height="10" rx="5" fill="${col}"/>
      <path d="M${(384 + w).toFixed(1)} ${y + 3} l0 8" stroke="${OT_INK}" stroke-width="1.5" opacity=".4"/>`;
  }).join('');
  const items = ws.checklist.slice(-7);
  $('wbList').innerHTML = items.map((k, i) => {
    const y = 122 + i * 22; const len = 60 + ((k.text.length * 7) % 60);
    return `<rect x="584" y="${y - 9}" width="12" height="12" rx="2" fill="none" stroke="${OT_INK}" stroke-width="2"/>
      ${k.done ? `<path class="wb-tick" d="M585 ${y - 3} l4 5 9 -12" stroke="${PALETTE.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <path d="M604 ${y - 3} q${len / 4} -4 ${len / 2} 0 t${len / 2} 0" stroke="${k.done ? '#b8b2cc' : OT_INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity="${k.done ? .8 : .75}"/>
      ${k.done ? `<path d="M602 ${y - 3} h${len + 4}" stroke="#b8b2cc" stroke-width="2"/>` : ''}`;
  }).join('');
  /* dossier thickens as features ship */
  const shipped = ws.features.filter(f => f.status === 'shipped').length;
  const planned = ws.features.filter(f => f.status === 'planned').length;
  const pages = Math.min(6, Math.max(1, Math.round(shipped / 1.5)));
  $('dosPages').innerHTML = Array.from({ length: pages }, (_, i) => `<path d="M${6 + i * 2} ${26 - i * 3} H${62 + i * 1.5} V${96 - i * 1} H${6 + i * 2}Z" fill="${OT.paper}" stroke="${OT_INK}" stroke-width="1.6" transform="rotate(${(i % 2 ? 2 : -2)} 34 60)"/>`).join('');
  $('dosCount').textContent = `${shipped} ✓ · ${planned} ○`;
  /* outbox flag up = fresh pushes */
  $('outFlag').classList.toggle('up', !!ws.github.fresh);
  $('outFlag').setAttribute('transform', `translate(62 70)${ws.github.fresh ? '' : ' rotate(90)'}`);
  /* poster stamps: letter + word + colour */
  $('otGrades').innerHTML = Object.entries(ws.checkup.vitals).map(([k, g], i) => {
    const [word, col] = _GRADE[g] || _GRADE.B; const y = 50 + i * 24;
    return `<circle cx="22" cy="${y}" r="10" fill="${col}" stroke="${OT_INK}" stroke-width="2"/>
      <text x="22" y="${y + 4.5}" text-anchor="middle" font-size="13" font-weight="900" fill="${OT_INK}">${g}</text>
      <text x="37" y="${y - 1}" font-size="8" font-weight="900" fill="${OT_INK}">${k}</text>
      <text x="37" y="${y + 8}" font-size="6.5" font-weight="800" fill="#5b5280">${word}</text>`;
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
    case 'code': return `<g class="g-code">${[[3, 4, 14, PALETTE.grape], [6, 9, 18, PALETTE.teal], [6, 14, 11, PALETTE.sun], [9, 19, 15, PALETTE.rose], [3, 24, 8, PALETTE.sky]].map(([x, y, w, col], i) => `<rect class="g-line" style="--i:${i}" x="${x}" y="${y - 2}" width="${w}" height="3" rx="1.5" fill="${col}"/>`).join('')}</g>`;
    case 'read': return `<g class="g-read"><rect x="7" y="2" width="18" height="22" rx="1.5" fill="${OT.paper}"/>${[6, 10, 14, 18].map(y => `<rect x="10" y="${y}" width="${y % 8 ? 12 : 9}" height="1.8" fill="#a9a2c4"/>`).join('')}</g>`;
    case 'caret': return `<rect class="g-caret" x="9" y="9" width="2.5" height="9" fill="${OT.paper}"/><rect x="14" y="12" width="9" height="2" rx="1" fill="#5b5280"/>`;
    case 'dots': return `<g class="g-dots">${[0, 1, 2, 3, 4].map(i => `<circle class="g-dot" style="--i:${i}" cx="${5 + i * 5.5}" cy="13" r="2.2" fill="${i < 3 ? PALETTE.mint : '#5b5280'}"/>`).join('')}</g>`;
    case 'green': return `${[0, 1, 2, 3, 4].map(i => `<circle cx="${5 + i * 5.5}" cy="9" r="2.2" fill="${PALETTE.mint}"/>`).join('')}<path d="M10 17 l4 4 8 -8" stroke="${PALETTE.mint}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'red': return `${[0, 1, 2, 3, 4].map(i => `<circle cx="${5 + i * 5.5}" cy="9" r="2.2" fill="${i === 1 || i === 3 ? PALETTE.coral : PALETTE.mint}"/>`).join('')}<path d="M12 15 l7 7 m0 -7 l-7 7" stroke="${PALETTE.coral}" stroke-width="3" stroke-linecap="round"/>`;
    case 'pause': return `<rect x="10" y="6" width="4" height="14" rx="1" fill="${PALETTE.sun}"/><rect x="18" y="6" width="4" height="14" rx="1" fill="${PALETTE.sun}"/>`;
    case 'hourglass': return `<path d="M10 4 H22 L16 13 L22 22 H10 L16 13Z" fill="none" stroke="${PALETTE.sun}" stroke-width="2.2" stroke-linejoin="round"/><path d="M13 20 H19 L16 16Z" fill="${PALETTE.sun}"/>`;
    case 'diff': return `<rect x="3" y="3" width="12" height="20" rx="1" fill="#3a2f5c"/><rect x="17" y="3" width="12" height="20" rx="1" fill="#3a2f5c"/>${[6, 10, 14, 18].map((y, i) => `<rect x="5" y="${y}" width="${i === 1 ? 8 : 6}" height="2" fill="${i === 1 ? PALETTE.coral : '#8e86ad'}"/><rect x="19" y="${y}" width="${i === 2 ? 8 : 7}" height="2" fill="${i === 2 ? PALETTE.mint : '#8e86ad'}"/>`).join('')}`;
    case 'emblem': return `<circle class="g-saver" cx="12" cy="11" r="6" fill="${c}"/><circle class="g-saver" cx="12" cy="11" r="2.4" fill="${OT.screen}"/>`;
    case 'check': return `<path d="M8 13 l6 6 11 -12" stroke="${PALETTE.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'rocket': return `<path d="M16 3 C21 7 21 15 19 19 H13 C11 15 11 7 16 3Z" fill="${OT.paper}"/><circle cx="16" cy="11" r="2" fill="${PALETTE.sky}"/><path d="M14 20 L16 25 L18 20Z" fill="${PALETTE.sun}"/>`;
    case 'off': default: return `<path d="M3 3 L12 3 L4 14Z" fill="#fff" opacity=".07"/>`;
  }
}

/* desk kinds: 'pod' (team stripe), 'hot' (neutral), 'boss' (Pixel's).
   o = { hue (team hue), accent (owner hue), item ('mug'|'duck'|'cactus'|'photo'|'plant'|'telescope'), spare } */
function _otDesk(kind, o = {}) {
  const wide = kind === 'boss';
  const L = wide ? -86 : -58, R = wide ? 96 : 72;
  const top = wood => `<path d="M${L + 4} -28 H${R - 4} L${R} -18 H${L}Z" fill="${wood}" ${_o(2.5)}/>`;
  const stripe = kind === 'pod' ? `<rect x="${L}" y="-18" width="${R - L}" height="7" fill="${hueHex(o.hue)}" ${_o(2)}/>` : '';
  const frontC = kind === 'hot' ? '#d7c7ef' : kind === 'boss' ? OT.woodLo : OT.wood;
  const topC = kind === 'hot' ? '#efe6fb' : kind === 'boss' ? OT.wood : OT.woodHi;
  const items = {
    mug: `<g transform="translate(${L + 30} -28)"><rect x="-6" y="-12" width="12" height="12" rx="2" fill="${OT.paper}" ${_o(1.8)}/><path d="M6 -9 c5 0 5 6 0 6" fill="none" ${_o(1.6)}/><rect x="-6" y="-8" width="12" height="3" fill="${hueHex(o.accent)}"/></g>`,
    duck: `<g transform="translate(${L + 30} -28)"><path d="M-9 0 C-10 -8 -2 -10 2 -6 C4 -14 12 -12 10 -6 L14 -5 L10 -3 C10 0 4 2 -9 0Z" fill="${PALETTE.sun}" ${_o(1.8)}/><circle cx="6" cy="-9" r="1.2" fill="${OT_INK}"/></g>`,
    cactus: `<g transform="translate(${L + 30} -28)"><path d="M-7 0 L-6 -8 H6 L7 0Z" fill="${PALETTE.coral}" ${_o(1.8)}/><path d="M-3 -8 V-22 C-3 -26 3 -26 3 -22 V-8 M3 -16 h4 v-5" fill="#5fbf73" ${_o(1.8)}/></g>`,
    photo: `<g transform="translate(${L + 30} -28) rotate(-6)"><rect x="-8" y="-16" width="16" height="16" rx="1.5" fill="${OT.paper}" ${_o(1.8)}/><circle cx="-1" cy="-9" r="3" fill="${PALETTE.rose}"/><circle cx="3" cy="-7" r="3" fill="${PALETTE.sky}"/></g>`,
    plant: `<g transform="translate(${L + 30} -28)"><path d="M-7 0 L-6 -8 H6 L7 0Z" fill="${OT.paper}" ${_o(1.8)}/><path d="M0 -8 C-10 -14 -8 -22 -2 -20 C0 -16 0 -12 0 -8 C2 -16 8 -22 10 -16 C8 -12 4 -10 0 -8" fill="#5fbf73" ${_o(1.6)}/></g>`,
    telescope: `<g transform="translate(${L + 36} -28)"><path d="M-6 0 L0 -12 L6 0" fill="none" ${_o(2)}/><g transform="rotate(-24 0 -14)"><rect x="-16" y="-19" width="30" height="9" rx="2" fill="${PALETTE.sun}" ${_o(2)}/><rect x="12" y="-21" width="6" height="13" rx="1.5" fill="${PALETTE['sun-deep']}" ${_o(1.8)}/></g></g>`,
  };
  const monX = wide ? 40 : 42;
  return `<svg class="ot-desk-svg" viewBox="${L - 8} -112 ${R - L + 16} 150" width="${R - L + 16}" height="150" style="left:${L - 8}px;top:-112px" aria-hidden="true" focusable="false">
    <ellipse cx="${(L + R) / 2}" cy="26" rx="${(R - L) / 2 + 6}" ry="9" fill="#000" opacity=".14"/>
    <!-- monitor: stand, bezel, screen (glyph), sticky, test lamp -->
    <g class="d-mon">
      <rect x="${monX + 12}" y="-38" width="7" height="12" fill="${OT.steel}" ${_o(2)}/>
      <ellipse cx="${monX + 15.5}" cy="-28" rx="11" ry="3" fill="${OT.steel}" ${_o(2)}/>
      <rect x="${monX - 1}" y="-66" width="33" height="30" rx="4" fill="${OT.bezel}" ${_o(2.5)}/>
      <g class="d-screen" transform="translate(${monX + 3} -62) scale(.78)"><rect width="32" height="28" rx="2" fill="${OT.screen}"/><g class="d-glyph" transform="translate(0 1)"></g></g>
      <g class="d-sticky" transform="translate(${monX - 9} -70) rotate(-10)" style="display:none"><rect width="13" height="13" fill="${PALETTE.sun}" ${_o(1.5)}/><path d="M3 5 h7 M3 9 h5" stroke="${OT_INK}" stroke-width="1.3"/></g>
      <g class="d-star" transform="translate(${monX + 28} -68)" style="display:none"><path d="M0 -7 L2 -2 L7 -2 L3 1 L4.5 6.5 L0 3.5 L-4.5 6.5 L-3 1 L-7 -2 L-2 -2Z" fill="${PALETTE.sun}" ${_o(1.5)}/></g>
      <g class="d-lamp" transform="translate(${monX + 38} -54)" style="display:none"><rect x="-6" y="-10" width="12" height="22" rx="5" fill="${OT.bezel}" ${_o(2)}/><circle class="d-lamp-l" cx="0" cy="1" r="4.4" fill="#5b5280"/><text class="d-lamp-t" x="0" y="4" text-anchor="middle" font-size="7" font-weight="900" fill="${OT_INK}"></text></g>
    </g>
    ${top(topC)}
    <rect x="${L}" y="-18" width="${R - L}" height="${wide ? 46 : 42}" rx="3" fill="${frontC}" ${_o(2.5)}/>
    ${stripe}
    <rect x="${L + 10}" y="-3" width="${R - L - 20}" height="${wide ? 28 : 24}" rx="3" fill="none" stroke="${shade(frontC, -26)}" stroke-width="2" opacity=".6"/>
    <rect x="${(L + R) / 2 - 7}" y="4" width="14" height="4" rx="2" fill="${OT_INK}" opacity=".55"/>
    ${o.accent ? `<rect class="d-plate" x="${(L + R) / 2 - 15}" y="13" width="30" height="9" rx="2" fill="${hueHex(o.accent)}" ${_o(1.6)}/>` : ''}
    ${wide ? `<rect x="${(L + R) / 2 - 34}" y="10" width="68" height="14" rx="3" fill="${PALETTE.sun}" ${_o(2)}/><text x="${(L + R) / 2}" y="21" text-anchor="middle" font-size="9.5" font-weight="900" fill="${OT_INK}" letter-spacing=".12em" font-family="-apple-system,Segoe UI,Roboto,sans-serif">DIRECTOR</text>` : ''}
    <!-- keyboard + desk-top things (on the top surface, in front of the sitter) -->
    <g class="d-kbd"><path d="M-17 -26 H17 L19 -21 H-19Z" fill="#efe9f7" ${_o(1.6)}/><path d="M-13 -23.5 H13" stroke="#a9a2c4" stroke-width="1.6" stroke-dasharray="2 1.6"/></g>
    <g class="d-pile" transform="translate(${L + 10} -25)"></g>
    <g class="d-tray" transform="translate(${R - 22} -25)" style="display:none"><path d="M-12 0 L-10 -8 H10 L12 0Z" fill="${OT.steel}" ${_o(1.6)}/><rect class="d-env" x="-9" y="-12" width="18" height="10" rx="1" fill="#e8c38c" ${_o(1.5)} transform="rotate(-6)"/></g>
    ${o.spare ? '' : (items[o.item] || '')}
    ${o.spare ? `<g transform="translate(0 -28)"><path d="M-9 0 L-7 -12 H7 L9 0Z" fill="${PALETTE.sky}" ${_o(2)}/><path d="M0 -12 C-12 -20 -8 -30 -2 -28 C0 -22 0 -16 0 -12 C2 -22 8 -30 13 -24 C10 -18 4 -14 0 -12" fill="#5fbf73" ${_o(1.8)}/></g>` : ''}
    <g class="d-stamp" transform="translate(-6 -44) rotate(-10)" style="display:none"><rect x="-34" y="-11" width="68" height="22" rx="4" fill="#fff" fill-opacity=".9" stroke-width="3"/><text x="0" y="5" text-anchor="middle" font-size="13" font-weight="900" letter-spacing=".08em" font-family="-apple-system,Segoe UI,Roboto,sans-serif"></text></g>
  </svg>`;
}
/* chair behind the seat. o = { present } — empty chairs are pushed in with a jacket */
function _otChair(hue, o = {}) {
  const c = hueHex(hue || 'grape');
  return `<svg class="ot-chair-svg" viewBox="-36 -90 72 100" width="72" height="100" style="left:-36px;top:-90px" aria-hidden="true" focusable="false">
    <g class="c-in">
      <rect x="-26" y="-74" width="52" height="54" rx="16" fill="${shade(c, -30)}" ${_o(2.5)}/>
      <rect x="-19" y="-67" width="38" height="36" rx="11" fill="${shade(c, -8)}"/>
      <rect x="-4" y="-22" width="8" height="18" fill="${OT.steel}" ${_o(2)}/>
    </g>
    <g class="c-jacket">
      <path d="M-27 -60 C-27 -72 -14 -76 0 -76 C14 -76 27 -72 27 -60 L25 -40 L-25 -40Z" fill="${c}" ${_o(2.5)}/>
      <path d="M-27 -62 C-34 -50 -34 -34 -30 -22 L-21 -22 C-22 -34 -21 -46 -18 -56Z" fill="${shade(c, -18)}" ${_o(2.2)}/>
      <path d="M27 -62 C34 -50 34 -34 30 -22 L21 -22 C22 -34 21 -46 18 -56Z" fill="${shade(c, -18)}" ${_o(2.2)}/>
      <path d="M-9 -75 L0 -62 L9 -75" fill="${OT.paper}" ${_o(2)}/>
      <circle cx="0" cy="-54" r="2" fill="${OT_INK}"/><circle cx="0" cy="-46" r="2" fill="${OT_INK}"/>
    </g>
  </svg>`;
}
function _otCouchFront() {
  return `<svg class="ot-couchfront-svg" viewBox="20 770 360 70" width="360" height="70" style="left:20px;top:770px" aria-hidden="true" focusable="false">
    <path d="M58 784 H338 C346 784 350 790 350 798 V820 H46 V798 C46 790 50 784 58 784Z" fill="${shade(PALETTE.coral, 8)}" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M140 786 V818 M226 786 V818" stroke="${shade(PALETTE.coral, -20)}" stroke-width="2.5"/>
    <rect x="22" y="784" width="44" height="44" rx="14" fill="${shade(PALETTE.coral, -10)}" stroke="${OT_INK}" stroke-width="3"/>
    <rect x="330" y="784" width="44" height="44" rx="14" fill="${shade(PALETTE.coral, -10)}" stroke="${OT_INK}" stroke-width="3"/>
    <rect x="52" y="820" width="10" height="12" fill="${OT.woodLo}" stroke="${OT_INK}" stroke-width="2"/><rect x="334" y="820" width="10" height="12" fill="${OT.woodLo}" stroke="${OT_INK}" stroke-width="2"/>
  </svg>`;
}
function _otFlag(team) {
  const c = hueHex(team.color);
  return `<svg class="ot-flag-svg" viewBox="-10 -214 130 224" width="130" height="224" style="left:-10px;top:-214px" aria-hidden="true" focusable="false">
    <ellipse cx="0" cy="2" rx="14" ry="5" fill="${OT_INK}"/>
    <path d="M0 0 V-204" stroke="${OT_INK}" stroke-width="7" stroke-linecap="round"/><path d="M0 -2 V-202" stroke="${OT.metal}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="0" cy="-206" r="6" fill="${PALETTE.sun}" stroke="${OT_INK}" stroke-width="2.5"/>
    <path class="f-cloth" d="M3 -198 H110 L94 -156 L110 -114 H3Z" fill="${c}" stroke="${OT_INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M3 -191 H98" stroke="#fff" stroke-width="3" opacity=".35" stroke-linecap="round"/>
    <g class="f-stars"></g>
  </svg>`;
}

/* update one desk element in place */
function _otDeskSync(el, s) {
  if (!el) return;
  const g = el.querySelector('.d-glyph'); if (g && g.dataset.name !== s.glyph) { g.innerHTML = _otGlyph(s.glyph, s.hue); g.dataset.name = s.glyph; }
  const lamp = el.querySelector('.d-lamp');
  if (lamp) {
    lamp.style.display = s.lamp ? '' : 'none';
    const col = s.lamp === 'green' ? PALETTE.mint : s.lamp === 'red' ? PALETTE.coral : PALETTE.sun;
    lamp.querySelector('.d-lamp-l').setAttribute('fill', col);
    lamp.querySelector('.d-lamp-t').textContent = s.lamp === 'green' ? '✓' : s.lamp === 'red' ? '✕' : '';
    lamp.classList.toggle('blink', s.lamp === 'run');
  }
  const pile = el.querySelector('.d-pile');
  if (pile && pile.dataset.n !== String(s.pile)) {
    const n = Math.max(0, Math.min(9, s.pile | 0));
    pile.innerHTML = Array.from({ length: n }, (_, i) => `<rect x="${(i % 2 ? -1 : 1) * 1.2 - 10}" y="${-4 - i * 3.2}" width="22" height="4" rx="1" fill="${i % 3 === 2 ? '#f3e3c8' : OT.paper}" stroke="${OT_INK}" stroke-width="1.4" transform="rotate(${(i * 37 % 9) - 4} 1 ${-2 - i * 3.2})"/>`).join('');
    pile.dataset.n = String(s.pile);
  }
  const st = el.querySelector('.d-sticky'); if (st) st.style.display = s.sticky ? '' : 'none';
  const star = el.querySelector('.d-star'); if (star) star.style.display = s.star ? '' : 'none';
  const tray = el.querySelector('.d-tray'); if (tray) { tray.style.display = s.tray ? '' : 'none'; tray.classList.toggle('glow', s.tray === 'new'); }
  const stamp = el.querySelector('.d-stamp');
  if (stamp) {
    stamp.style.display = s.stamp ? '' : 'none';
    if (s.stamp) {
      const col = s.stamp === 'APPROVED' ? '#2b8a3e' : '#c26a00';
      stamp.querySelector('rect').setAttribute('stroke', col);
      const t = stamp.querySelector('text'); t.textContent = s.stamp; t.setAttribute('fill', col);
    }
  }
}

Object.assign(THEME_OFFICE, {
  art: _otArt, sync: _otSync, desk: _otDesk, chair: _otChair, couchFront: _otCouchFront,
  flag: _otFlag, glyph: _otGlyph, beanFront: _otBeanFront, deskSync: _otDeskSync, door: _otDoorState,
});
