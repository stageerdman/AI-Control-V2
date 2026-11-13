/* ============================================================
   emblem.js — team emblem library (spec-teams §5). Original designs:
   homage to adventure genres, never copies of real insignia.
   Public: EMBLEMS [{id,name,silhouette,vibe,svg}], emblemById(id),
           emblem(team, size=48) → <span.emblem role=img>,
           emblemSVG(team, size) → string, captainPip(hue) → <span.captain-pip>
   Patch = cloth (currentColor) + thread (--team). Any of the 7 hues works.
   ============================================================ */
/* TS port (app/src/characters): same SVG strings + emblem.css, typed; captainPipHTML()
   is the string twin of captainPip() (hero.ts embeds it in the fx overlay). */
import { escapeAttr, hueHex } from '../design/palette';

export type EmblemDef = { id: string; name: string; silhouette: string; vibe: string; svg: string };
export const EMBLEMS: EmblemDef[] = [
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
  /* ---- v5 nods: original artwork that evokes, never a real logo or wordmark ---- */
  { id: 'orchard', name: "Rainbow Orchard", silhouette: "circle", vibe: "A whole striped fruit with a jaunty leaf — a wink at garage-born computers that wanted to be different. No bite taken.",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <g transform="translate(32 37) scale(.8) translate(-32 -36)">
      <path class="line" d="M32 22 C32 17 33 14 36 11" style="stroke-width:3"/>
      <path class="thread" d="M35 17 C36 11 42 8 47 9 C46 15 40 18 35 17Z"/>
      <path class="thread" d="M32.0 23.4 L28.5 21.4 L24.7 21.3 L21.6 22.6 L19.4 23.9 L17.7 25.2 L46.3 25.2 L44.6 23.9 L42.4 22.6 L39.3 21.3 L35.5 21.4Z"/>
      <path class="thread" style="opacity:.9" d="M16.4 26.4 L15.4 27.6 L14.6 28.8 L13.9 30.0 L13.5 31.2 L50.5 31.2 L50.1 30.0 L49.4 28.8 L48.6 27.6 L47.6 26.4Z"/>
      <path class="thread" style="opacity:.78" d="M13.2 32.4 L13.0 33.6 L13.0 34.8 L13.2 36.0 L13.5 37.2 L50.5 37.2 L50.8 36.0 L51.0 34.8 L51.0 33.6 L50.8 32.4Z"/>
      <path class="thread" style="opacity:.66" d="M13.9 38.4 L14.4 39.6 L15.1 40.8 L15.9 42.0 L16.9 43.2 L47.1 43.2 L48.1 42.0 L48.9 40.8 L49.6 39.6 L50.1 38.4Z"/>
      <path class="thread" style="opacity:.54" d="M18.0 44.4 L19.1 45.5 L20.3 46.5 L21.6 47.5 L23.1 48.6 L40.9 48.6 L42.4 47.5 L43.7 46.5 L44.9 45.5 L46.0 44.4Z"/>
      <path class="thread" style="opacity:.42" d="M25.1 49.8 L27.5 50.9 L30 51.6 L32 50.8 L34 51.6 L36.5 50.9 L38.9 49.8Z"/>
    </g>
    <path class="thread detail" d="M20 18 L20.9 20.1 L23 21 L20.9 21.9 L20 24 L19.1 21.9 L17 21 L19.1 20.1Z"/>` },
  { id: 'droneship', name: "Ocean Landing", silhouette: "circle", vibe: "A reusable booster settling onto a barge at sea, legs out, last puff of flame. For crews that bring their work back and fly it again.",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <path class="thread" d="M29.5 11 C29.5 10 30.5 9.5 32 9.5 C33.5 9.5 34.5 10 34.5 11 V38 H29.5Z"/>
    <path class="cutline" style="stroke-width:1.6" d="M29.5 15 H34.5 M29.5 31 H34.5"/>
    <path class="line" d="M29.5 36 L23 43 M34.5 36 L41 43" style="stroke-width:2.4"/>
    <path class="thread" d="M30 38.5 H34 L32 43.5Z"/>
    <path class="thread" d="M12 44 H52 L49 49 H15Z"/>
    <path class="cutline detail" d="M19 46.5 H24 M28 46.5 H36 M40 46.5 H45"/>
    <path class="line detail" d="M12 52.5 C15 50.5 18 50.5 21 52.5 C24 54.5 27 54.5 30 52.5 C33 50.5 36 50.5 39 52.5 C42 54.5 45 54.5 48 52.5" style="stroke-width:1.6"/>` },
  { id: 'gridfin', name: "Grid Fins", silhouette: "diamond", vibe: "A lattice steering fin, the kind that guides a falling stage home. Precise, unflappable, lands exactly where it said it would.",
    svg: `
    <path class="cloth" d="M32 2 L62 32 L32 62 L2 32Z" style="stroke:currentColor;stroke-width:3;stroke-linejoin:round"/>
    <path class="line" d="M32 6.5 L57.5 32 L32 57.5 L6.5 32Z"/>
    <path class="stitch" d="M32 11 L53 32 L32 53 L11 32Z"/>
    <path class="thread" d="M20 22 H44 V42 H20Z"/>
    <path class="cutline" style="stroke-width:2.2" d="M24.8 22 V42 M29.6 22 V42 M34.4 22 V42 M39.2 22 V42 M20 27 H44 M20 32 H44 M20 37 H44"/>
    <path class="thread" d="M29 42 H35 V48 H29Z"/>
    <path class="thread detail" d="M32 13.5 L33 16 L35.5 17 L33 18 L32 20.5 L31 18 L28.5 17 L31 16Z"/>` },
  { id: 'rain', name: "Digital Rain", silhouette: "rounded screen", vibe: "Falling columns of green code on a dark screen. For crews that see straight through the simulation to the bug underneath.",
    svg: `
    <rect class="cloth" x="4" y="6" width="56" height="52" rx="12"/>
    <rect class="line" x="7.5" y="9.5" width="49" height="45" rx="9"/>
    <rect class="stitch" x="11" y="13" width="42" height="38" rx="6.5"/>
    <path class="thread" d="M16 16 H20 V20 H16Z M16 22 H20 V26 H16Z M16 28 H20 V32 H16Z"/>
    <path class="thread" style="opacity:.5" d="M16 34 H20 V38 H16Z"/>
    <path class="thread" d="M25 24 H29 V28 H25Z M25 30 H29 V34 H25Z M25 36 H29 V40 H25Z M25 42 H29 V46 H25Z"/>
    <path class="thread" style="opacity:.5" d="M25 18 H29 V22 H25Z"/>
    <path class="thread" d="M34 16 H38 V20 H34Z M34 22 H38 V26 H34Z"/>
    <path class="thread" style="opacity:.5" d="M34 28 H38 V32 H34Z M34 40 H38 V44 H34Z"/>
    <path class="thread" d="M43 28 H47 V32 H43Z M43 34 H47 V38 H43Z M43 40 H47 V44 H43Z"/>
    <path class="thread" style="opacity:.5" d="M43 22 H47 V26 H43Z"/>
    <path class="cutline detail" d="M17 18 H19 M26 32 L28 32 M35 24 H37 M44 36 H46 M26 44 H28"/>` },
  { id: 'flux', name: "Flux Y", silhouette: "rounded square", vibe: "Three glowing tubes meeting in a Y with a spark at the heart — the gadget that makes time travel possible. Once you hit the right speed.",
    svg: `
    <rect class="cloth" x="4" y="4" width="56" height="56" rx="14"/>
    <rect class="line" x="7.5" y="7.5" width="49" height="49" rx="11"/>
    <rect class="stitch" x="11" y="11" width="42" height="42" rx="8"/>
    <path class="line" style="stroke-width:6" d="M32 34 L20 20 M32 34 L44 20 M32 34 V49"/>
    <path class="cutline" style="stroke-width:2" d="M32 34 L20 20 M32 34 L44 20 M32 34 V49"/>
    <circle class="thread" cx="19" cy="19" r="4.6"/><circle class="thread" cx="45" cy="19" r="4.6"/><circle class="thread" cx="32" cy="50" r="4.6"/>
    <circle class="cloth halo" cx="32" cy="33.5" r="6.5"/>
    <path class="thread" d="M33.5 27 L28 34.5 H32 L30.5 40 L36 32.5 H32Z"/>` },
  { id: 'ghost', name: "Arcade Ghost", silhouette: "rounded square", vibe: "A wobbly maze ghost chasing a trail of dots. Retro, relentless, never stops until the board is clear.",
    svg: `
    <rect class="cloth" x="4" y="4" width="56" height="56" rx="14"/>
    <rect class="line" x="7.5" y="7.5" width="49" height="49" rx="11"/>
    <rect class="stitch" x="11" y="11" width="42" height="42" rx="8"/>
    <path class="thread" d="M15 44 V30 C15 20 22 14 30 14 C38 14 45 20 45 30 V44 L41 40 L37 44 L33 40 L30 44 L27 40 L23 44 L19 40Z"/>
    <path class="cloth" d="M20.5 28 C20.5 24 26.5 24 26.5 28 C26.5 32 20.5 32 20.5 28Z M31.5 28 C31.5 24 37.5 24 37.5 28 C37.5 32 31.5 32 31.5 28Z"/>
    <circle class="thread" cx="25" cy="28.5" r="1.8"/><circle class="thread" cx="36" cy="28.5" r="1.8"/>
    <circle class="thread" cx="49.5" cy="22" r="2"/><circle class="thread" cx="49.5" cy="31" r="2"/><circle class="thread" cx="49.5" cy="40" r="3.4"/>
    <path class="cutline detail" d="M17 49.5 H43"/>` },
  { id: 'blades', name: "Crossed Blades", silhouette: "circle", vibe: "Two humming light-blades crossed over a starfield. Duelling ideas, settled with honour — for crews that review hard and ship together.",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <path class="cloth halo" style="stroke-width:5" d="M17 15 L41 43 M47 15 L23 43"/>
    <path class="line" style="stroke-width:5;stroke-linecap:round" d="M17 15 L39.5 41.3 M47 15 L24.5 41.3"/>
    <path class="cutline detail" style="stroke-width:1.4" d="M17 15 L39.5 41.3 M47 15 L24.5 41.3"/>
    <path class="thread" d="M38.2 39 L44.6 46.4 L41.6 49 L35.2 41.6Z M25.8 39 L19.4 46.4 L22.4 49 L28.8 41.6Z"/>
    <path class="cutline detail" d="M38.8 42.7 L40.6 41.1 M25.2 42.7 L23.4 41.1"/>
    <path class="thread detail" d="M32 49 L32.8 51 L35 51.8 L32.8 52.6 L32 54.6 L31.2 52.6 L29 51.8 L31.2 51Z M14 30 L14.6 31.4 L16 32 L14.6 32.6 L14 34 L13.4 32.6 L12 32 L13.4 31.4Z M50 30 L50.6 31.4 L52 32 L50.6 32.6 L50 34 L49.4 32.6 L48 32 L49.4 31.4Z"/>` },
  { id: 'pizza', name: "Pizza Planet", silhouette: "circle", vibe: "A pepperoni planet in a lazy orbit, a little rocket buzzing round it. Comfort food for crews who work late and dream big.",
    svg: `
    <circle class="cloth" cx="32" cy="32" r="30"/>
    <circle class="line" cx="32" cy="32" r="27"/>
    <circle class="stitch" cx="32" cy="32" r="23.5"/>
    <ellipse class="line" cx="32" cy="34" rx="23" ry="6.5" transform="rotate(-14 32 34)" style="stroke-width:2.2"/>
    <circle class="cloth halo" cx="32" cy="33" r="13"/>
    <circle class="thread" cx="32" cy="33" r="13"/>
    <circle class="cutline detail" cx="32" cy="33" r="10.4"/>
    <circle class="cloth" cx="26" cy="30.5" r="2.3"/><circle class="cloth" cx="31" cy="25.6" r="1.9"/><circle class="cloth" cx="38" cy="29" r="2.4"/>
    <circle class="cloth" cx="35.5" cy="38.5" r="2.1"/><circle class="cloth" cx="27.5" cy="38.8" r="1.7"/><circle class="cloth" cx="32.4" cy="33" r="1.4"/>
    <path class="cloth halo" style="fill:none;stroke-width:4" d="M10.7 39.3 A23 6.5 -14 0 0 30 40.4"/>
    <path class="line" style="stroke-width:2.2" d="M10.7 39.3 A23 6.5 -14 0 0 30 40.4"/>
    <path class="thread" d="M48 13 L49.2 15.8 L52 17 L49.2 18.2 L48 21 L46.8 18.2 L44 17 L46.8 15.8Z"/>` },
];
export const emblemById = (id?: string | null): EmblemDef => EMBLEMS.find(e => e.id === id) || EMBLEMS[0];
export const EMBLEM_SIZES = { xs: 16, sm: 24, md: 48, lg: 88, xl: 360 };
export type EmblemSize = keyof typeof EMBLEM_SIZES | number;
/** What an emblem needs from a team: its emblem id and colour (palette key or hex). */
export type EmblemTeam = { emblem?: string | null; color?: string | null };

export function emblemSVG(team: EmblemTeam | null | undefined, size: EmblemSize = 48, opts: { decorative?: boolean } = {}): string {
  const px = typeof size === 'number' ? size : (EMBLEM_SIZES[size] || 48);
  const e = emblemById(team?.emblem);
  const color = hueHex(team?.color);
  const label = opts.decorative ? ' aria-hidden="true"' : ` role="img" aria-label="${escapeAttr(e.name)} emblem"`;
  return `<span class="emblem${px <= 32 ? ' em-sm' : ''}"${label} style="--team:${color};width:${px}px;height:${px}px"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${e.svg}</svg></span>`;
}
export function emblem(team: EmblemTeam | null | undefined, size: EmblemSize = 48, opts: { decorative?: boolean } = {}): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = emblemSVG(team, size, opts);
  return t.content.firstElementChild as HTMLElement;
}

/* captain star pip for xs/sm heroes (spec-teams §2.4): 14px gold star in a
   20px ink circle with a 2px team-hue ring. hue = palette key or hex. */
const PIP_SVG = '<svg viewBox="-10 -10 20 20" focusable="false"><path d="M0 -7 L2.1 -2.3 L7 -2.2 L3.2 1.1 L4.4 6 L0 3.3 L-4.4 6 L-3.2 1.1 L-7 -2.2 L-2.1 -2.3Z"/></svg>';
/** The pip as markup — byte-identical to the prototype's captainPip(hue).outerHTML. */
export function captainPipHTML(hue: string): string {
  return `<span class="captain-pip" aria-hidden="true" style="--team: ${hueHex(hue)};">${PIP_SVG.replace('Z"/>', 'Z"></path>')}</span>`;
}
export function captainPip(hue: string): HTMLElement {
  const s = document.createElement('span');
  s.className = 'captain-pip'; s.setAttribute('aria-hidden', 'true');
  s.style.setProperty('--team', hueHex(hue));
  s.innerHTML = PIP_SVG;
  return s;
}
