/* The studio's fixed visual vocabulary (mirrors the prototype's emblem.js / hero.js / core.js).
   The UI renders these ids; the Agent Creator may only pick from them. Pure data. */

export const EMBLEM_IDS = [
  'starship',
  'starbird',
  'cogcrest',
  'castle',
  'compass',
  'lantern',
  'ranger',
  'carpet',
  'rocket',
  'twinsuns',
  'orchard',
  'droneship',
  'gridfin',
  'rain',
  'flux',
  'ghost',
  'blades',
  'pizza',
] as const;

/** Team colours and agent hues share one palette. */
export const HUES = ['sun', 'coral', 'teal', 'sky', 'grape', 'mint', 'rose'] as const;

/** hat → the decal it implies (hero.js HATS). */
export const HAT_DECAL: Record<string, string> = {
  none: 'none',
  headphones: 'Frontend',
  goggles: 'Backend',
  beret: 'Design',
  detective: 'QA',
  headlamp: 'Data',
  hardhat: 'DevOps',
  mortarboard: 'Research',
  newsboy: 'Writer',
  captain: 'Release',
  helm: 'Quality',
  director: 'Director',
  inventor: 'Inventor',
};
export const TOOL_IDS = [
  'none',
  'stylus',
  'cog',
  'palette',
  'magnifier',
  'pickaxe',
  'wrench',
  'book',
  'quill',
  'flag',
  'broom',
  'megaphone',
  'clipboard',
  'blueprint',
  'baton',
] as const;
export const BODIES = ['hero', 'sprout', 'bruiser', 'lanky'] as const;
export const ANTENNAS = ['none', 'tuft', 'spikes', 'swoop', 'bob', 'bun', 'curl'] as const;
export const FACES = [
  'none',
  'glasses',
  'shades',
  'monocle',
  'mustache',
  'bow',
  'freckles',
  'flower',
] as const;

/** Gear that marks the studio crew (orchestrator, setter, creator) — regular agents never wear it. */
const CREW_ONLY_HATS = new Set(['director', 'inventor']);
const CREW_ONLY_TOOLS = new Set(['megaphone', 'clipboard', 'blueprint', 'baton']);

export const AGENT_HATS = Object.keys(HAT_DECAL).filter((h) => !CREW_ONLY_HATS.has(h)) as [
  string,
  ...string[],
];
export const AGENT_TOOLS = TOOL_IDS.filter((t) => !CREW_ONLY_TOOLS.has(t)) as unknown as [
  string,
  ...string[],
];
