/* ============================================================
   emblem.js — team emblem library (spec-teams §5). Original designs:
   homage to adventure genres, never copies of real insignia.
   Public: EMBLEMS [{id,name,silhouette,vibe,svg}], emblemById(id),
           emblem(team, size=48) → <span.emblem role=img>,
           emblemSVG(team, size) → string, captainPip(hue) → <span.captain-pip>
   Patch = cloth (currentColor) + thread (--team). Any of the 7 hues works.
   ============================================================ */
const EMBLEMS = [
  { id: 'starship', name: "Warp Chevrons", silhouette: "oval", vibe: "Starship bridge-crew insignia: twin up-chevrons climbing toward a guiding star. \"Engage.\" For crews that push forward fast.",
    svg: `
    <ellipse class="cloth" cx="32" cy="32" rx="27" ry="30"/>
    <ellipse class="line" cx="32" cy="32" rx="24" ry="27"/>
    <ellipse class="stitch" cx="32" cy="32" rx="20.5" ry="23.5"/>
    <path class="thread" d="M32 12 L46 30 L39 30 L32 21 L25 30 L18 30Z"/>
    <path class="thread" d="M32 26 L46 44 L39 44 L32 35 L25 44 L18 44Z"/>
    <path class="thread detail" d="M32 47.5 L33.2 50.3 L36 51.5 L33.2 52.7 L32 55.5 L30.8 52.7 L28 51.5 L30.8 50.3Z"/>` },
  { id: 'starbird', name: "Phoenix Rising", silhouette: "circle", vibe: "Rebel-starbird spirit: an angular firebird with swept wings and a split tail. Scrappy, hopeful, rises again after a red build.",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <path class="thread" d="M30 27 L14 17 L19 26 L11.5 30 L20 33.5 L15 40.5 L30 38.5Z M34 27 L50 17 L45 26 L52.5 30 L44 33.5 L49 40.5 L34 38.5Z"/>
    <path class="thread" d="M32 19 L35 24 L34.5 41 L32 45 L29.5 41 L29 24Z"/>
    <path class="thread" d="M32 13 A3.5 3.5 0 1 1 31.9 13Z M35 15 L38.5 16.5 L35 18Z"/>
    <path class="thread" d="M32 41 L25.5 54 L32 49.5 L38.5 54Z"/>` },
  { id: 'cogcrest', name: "Iron Cog", silhouette: "10-tooth cog", vibe: "Imperial engine-room crest: a toothed gear ring around a bolted hex core. Disciplined, mechanical, runs the machine.",
    svg: `
    <path class="cloth" d="M26.6 6.6 L28.6 2.2 L35.4 2.2 L37.4 6.6 L42.6 8.2 L46.8 5.9 L52.3 9.9 L51.3 14.6 L54.5 19.0 L59.3 19.6 L61.4 26.0 L57.9 29.3 L57.9 34.7 L61.4 38.0 L59.3 44.4 L54.5 45.0 L51.3 49.4 L52.3 54.1 L46.8 58.1 L42.6 55.8 L37.4 57.4 L35.4 61.8 L28.6 61.8 L26.6 57.4 L21.4 55.8 L17.2 58.1 L11.7 54.1 L12.7 49.4 L9.5 45.0 L4.7 44.4 L2.6 38.0 L6.1 34.7 L6.1 29.3 L2.6 26.0 L4.7 19.6 L9.5 19.0 L12.7 14.6 L11.7 9.9 L17.2 5.9 L21.4 8.2Z"/>
    <circle class="line" cx="32" cy="32" r="22"/>
    <path class="line detail" style="stroke-width:1.4" d="M26.6 6.6 L28.6 2.2 L35.4 2.2 L37.4 6.6 L42.6 8.2 L46.8 5.9 L52.3 9.9 L51.3 14.6 L54.5 19.0 L59.3 19.6 L61.4 26.0 L57.9 29.3 L57.9 34.7 L61.4 38.0 L59.3 44.4 L54.5 45.0 L51.3 49.4 L52.3 54.1 L46.8 58.1 L42.6 55.8 L37.4 57.4 L35.4 61.8 L28.6 61.8 L26.6 57.4 L21.4 55.8 L17.2 58.1 L11.7 54.1 L12.7 49.4 L9.5 45.0 L4.7 44.4 L2.6 38.0 L6.1 34.7 L6.1 29.3 L2.6 26.0 L4.7 19.6 L9.5 19.0 L12.7 14.6 L11.7 9.9 L17.2 5.9 L21.4 8.2Z"/>
    <circle class="stitch" cx="32" cy="32" r="18.5"/>
    <path class="thread" d="M32 20 L42.4 26 L42.4 38 L32 44 L21.6 38 L21.6 26Z"/>
    <circle class="cloth" cx="32" cy="32" r="5"/>
    <path class="cutline detail" d="M32 20 V27 M42.4 38 L36.3 34.5 M21.6 38 L27.7 34.5"/>` },
  { id: 'castle', name: "Enchanted Keep", silhouette: "heater shield", vibe: "Fairytale-kingdom crest: three-spired castle with an arched gate and a wishing star. Guardians of a tidy realm.",
    svg: `
    <path class="cloth" d="M7 7 H57 V30 C57 46 46 56 32 61 C18 56 7 46 7 30Z"/>
    <path class="line" d="M10.5 10.5 H53.5 V30 C53.5 44 44 52.5 32 57.3 C20 52.5 10.5 44 10.5 30Z"/>
    <path class="stitch" d="M14 14 H50 V30 C50 41.5 42 48.5 32 53.2 C22 48.5 14 41.5 14 30Z"/>
    <path class="thread" d="M20 37 H44 V44 Q32 50 20 44Z M20 37 V30 H25 V37Z M39 37 V30 H44 V37Z M28 37 V26 H36 V37Z"/>
    <path class="thread" d="M19 30 L22.5 23 L26 30Z M38 30 L41.5 23 L45 30Z M27 26 L32 17 L37 26Z"/>
    <path class="cloth" d="M29.5 47 V42.5 Q32 39.5 34.5 42.5 V47Z"/>
    <path class="thread detail" d="M45 15.5 L46 18 L48.5 19 L46 20 L45 22.5 L44 20 L41.5 19 L44 18Z"/>` },
  { id: 'compass', name: "Treasure Compass", silhouette: "circle", vibe: "Treasure-map adventure: an eight-point compass rose with shaded points. Explorers, researchers, \"X marks the spot\".",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <path class="thread" d="M18 18 L32 28 L46 18 L36 32 L46 46 L32 36 L18 46 L28 32Z"/>
    <path class="cloth halo" d="M32 10 L36 28 L54 32 L36 36 L32 54 L28 36 L10 32 L28 28Z"/>
    <path class="thread" d="M32 10 L36 28 L54 32 L36 36 L32 54 L28 36 L10 32 L28 28Z"/>
    <path class="cloth detail" d="M32 10 L32 32 L28 28Z M54 32 L32 32 L36 28Z M32 54 L32 32 L36 36Z M10 32 L32 32 L28 36Z"/>
    <circle class="cloth" cx="32" cy="32" r="2.6"/>` },
  { id: 'lantern', name: "Wishing Lantern", silhouette: "arched badge", vibe: "Floating-lantern festival: a glowing lantern with an inner flame and light rays. Lights up dark corners; night shift.",
    svg: `
    <path class="cloth" d="M9 59 V29 A23 23 0 0 1 55 29 V59Z"/>
    <path class="line" d="M12.5 55.5 V29 A19.5 19.5 0 0 1 51.5 29 V55.5Z"/>
    <path class="stitch" d="M16 52 V29 A16 16 0 0 1 48 29 V52Z"/>
    <path class="line" d="M29.5 19.5 Q32 15 34.5 19.5"/>
    <path class="thread" d="M27 23 L29 19 H35 L37 23Z M25 24 H39 L41 40 Q32 44 23 40Z M27 42 H37 L35 46 H29Z"/>
    <path class="cloth" d="M32 27 C35.5 31 35.5 35 32 38.5 C28.5 35 28.5 31 32 27Z"/>
    <path class="thread detail" d="M32 32 C33.6 34 33.4 36 32 37.2 C30.6 36 30.4 34 32 32Z"/>
    <path class="line detail" d="M19.5 30 L16 29 M19.5 36 L16 37 M44.5 30 L48 29 M44.5 36 L48 37"/>` },
  { id: 'ranger', name: "Ranger Wings", silhouette: "winged roundel", vibe: "Space-ranger wings: feathered pilot wings around a ringed planet. \"To the next galaxy.\" Bold, heroic, a little toy-box.",
    svg: `
    <path class="cloth" d="M22 21 L1 16 L5.5 25 L0.5 28.5 L6.5 33.5 L2.5 38 L22 41Z M42 21 L63 16 L58.5 25 L63.5 28.5 L57.5 33.5 L61.5 38 L42 41Z"/>
    <path class="thread" d="M22 24.5 L7 21 L10 26.5 L6 29 L11 33 L8 36 L22 37.5Z M42 24.5 L57 21 L54 26.5 L58 29 L53 33 L56 36 L42 37.5Z"/>
    <path class="cutline detail" d="M10 26.5 L21 29 M11 33 L21 33.5 M54 26.5 L43 29 M53 33 L43 33.5"/>
    <circle class="cloth" cx="32" cy="31" r="16.5"/>
    <circle class="line" cx="32" cy="31" r="13.5"/>
    <ellipse class="line" cx="32" cy="31" rx="10" ry="3.6" transform="rotate(-20 32 31)" style="stroke-width:2"/>
    <circle class="thread" cx="32" cy="31" r="5.5"/>
    <path class="cloth halo" d="M22.6 34.4 A10 3.6 -20 0 0 41.4 27.6" style="fill:none;stroke-width:4"/>
    <path class="line" d="M22.6 34.4 A10 3.6 -20 0 0 41.4 27.6" style="stroke-width:2"/>` },
  { id: 'carpet', name: "Moon & Carpet", silhouette: "circle", vibe: "Desert-night magic: a crescent moon and a star over a flying carpet with tassels. Clever, quick, a whole new world of shortcuts.",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <circle class="thread" cx="29" cy="22" r="9"/>
    <circle class="cloth" cx="33.5" cy="18.5" r="7.8"/>
    <path class="thread detail" d="M44 21 L45 23.5 L47.5 24.5 L45 25.5 L44 28 L43 25.5 L40.5 24.5 L43 23.5Z"/>
    <path class="thread" d="M14 40 C20 36 26 42 32 38 C38 34 44 40 50 36 L50 44 C44 48 38 42 32 46 C26 50 20 44 14 48Z"/>
    <path class="cutline detail" d="M17 44.2 C22 41.2 27 45.2 32 42.2 C37 39.2 42 43.2 47 40.2"/>
    <path class="line" d="M14 40 L11 38.5 M14 48 L11 49.5 M50 36 L53 34.5 M50 44 L53 45.5" style="stroke-width:1.6"/>` },
  { id: 'rocket', name: "Moonshot", silhouette: "octagon", vibe: "Retro moonshot: a finned rocket punching through an orbit ring with an exhaust flame. Launch crews and shippers.",
    svg: `
    <path class="cloth" d="M20 3 H44 L61 20 V44 L44 61 H20 L3 44 V20Z"/>
    <path class="line" d="M21.5 6.5 H42.5 L57.5 21.5 V42.5 L42.5 57.5 H21.5 L6.5 42.5 V21.5Z"/>
    <path class="stitch" d="M23 10 H41 L54 23 V41 L41 54 H23 L10 41 V23Z"/>
    <ellipse class="line" cx="32" cy="34" rx="18" ry="5.5" transform="rotate(-18 32 34)" style="stroke-width:2"/>
    <path class="cloth halo" d="M32 12 C38 18 39 28 37 40 H27 C25 28 26 18 32 12Z M27 33 L21 42 L27 41Z M37 33 L43 42 L37 41Z"/>
    <path class="thread" d="M32 12 C38 18 39 28 37 40 H27 C25 28 26 18 32 12Z M27 33 L21 42 L27 41Z M37 33 L43 42 L37 41Z"/>
    <circle class="cloth" cx="32" cy="25" r="3.3"/>
    <path class="thread" d="M28.5 42 H35.5 L32 50.5Z"/>
    <path class="cloth halo detail" d="M15.5 39.4 A18 5.5 -18 0 0 21 43" style="fill:none;stroke-width:4"/>` },
  { id: 'twinsuns', name: "Twin Suns", silhouette: "hexagon", vibe: "Desert-planet horizon: two suns setting over rolling dunes. Restless, far-from-home heroes about to leave the farm.",
    svg: `
    <path class="cloth" d="M17 5 H47 L61.5 32 L47 59 H17 L2.5 32Z" style="stroke-width:3;stroke:currentColor;stroke-linejoin:round"/>
    <path class="line" d="M18.8 8.5 H45.2 L57.6 32 L45.2 55.5 H18.8 L6.4 32Z"/>
    <path class="stitch" d="M20.6 12 H43.4 L54 32 L43.4 52 H20.6 L10 32Z"/>
    <circle class="thread" cx="26" cy="27" r="6.5"/>
    <circle class="thread" cx="40.5" cy="21.5" r="4"/>
    <path class="thread" d="M13 41 C20 35.5 27 38 33 40.5 C39 43 45 37 51 38.5 L45.5 48.5 H18.5Z"/>
    <path class="cutline detail" d="M19 45.5 C26 42.5 34 46.5 44 43.5"/>` },
];
const emblemById = id => EMBLEMS.find(e => e.id === id) || EMBLEMS[0];
const EMBLEM_SIZES = { xs: 16, sm: 24, md: 48, lg: 88, xl: 360 };

function emblemSVG(team, size = 48, opts = {}) {
  const px = typeof size === 'number' ? size : (EMBLEM_SIZES[size] || 48);
  const e = emblemById(team && team.emblem);
  const color = hueHex(team && team.color);
  const label = opts.decorative ? ' aria-hidden="true"' : ` role="img" aria-label="${escapeAttr(e.name)} emblem"`;
  return `<span class="emblem${px <= 32 ? ' em-sm' : ''}"${label} style="--team:${color};width:${px}px;height:${px}px"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${e.svg}</svg></span>`;
}
function emblem(team, size = 48, opts = {}) {
  const t = document.createElement('template');
  t.innerHTML = emblemSVG(team, size, opts);
  return t.content.firstElementChild;
}

/* captain star pip for xs/sm heroes (spec-teams §2.4): 14px gold star in a
   20px ink circle with a 2px team-hue ring. hue = palette key or hex. */
function captainPip(hue) {
  const s = document.createElement('span');
  s.className = 'captain-pip'; s.setAttribute('aria-hidden', 'true');
  s.style.setProperty('--team', hueHex(hue));
  s.innerHTML = '<svg viewBox="-10 -10 20 20" focusable="false"><path d="M0 -7 L2.1 -2.3 L7 -2.2 L3.2 1.1 L4.4 6 L0 3.3 L-4.4 6 L-3.2 1.1 L-7 -2.2 L-2.1 -2.3Z"/></svg>';
  return s;
}
