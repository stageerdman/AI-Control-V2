/* First-run seed: the v6 prototype's cast (data-cast.js) and projects (data-studio.js).
   Runs once per database — a meta flag records it, so deleting seeded things later
   never brings them back. */
import type { Db } from './db/connection.ts';
import type { Store } from './db/store.ts';
import type { AgentKind } from './domain/cast.ts';
import type { Look } from './domain/look.ts';

const ROLES = [
  'Frontend',
  'Backend',
  'Design',
  'QA',
  'Data',
  'DevOps',
  'Research',
  'Writer',
  'Release',
  'Quality',
];

/* hero.js gear per legacy role → the explicit look the prototype migrates to (lookFromLegacy) */
const GEAR: Record<string, [hat: string, tool: string]> = {
  Frontend: ['headphones', 'stylus'],
  Backend: ['goggles', 'cog'],
  Design: ['beret', 'palette'],
  QA: ['detective', 'magnifier'],
  Data: ['headlamp', 'pickaxe'],
  DevOps: ['hardhat', 'wrench'],
  Research: ['mortarboard', 'book'],
  Writer: ['newsboy', 'quill'],
  Release: ['captain', 'flag'],
  Quality: ['helm', 'broom'],
};
const legacyLook = (role: string, hue: string, body: string, antenna: string, face: string): Look => {
  const [hat, tool] = GEAR[role] ?? ['none', 'none'];
  return { hat, tool, decal: role, body, antenna, face, hue };
};

type SeedAgent = {
  id: string;
  kind?: AgentKind;
  name: string;
  nick?: string;
  role?: string;
  look: Look;
  prompt: string;
};

const AGENTS: SeedAgent[] = [
  {
    id: 'a-pete',
    name: 'Pixel Pete',
    nick: 'Pete',
    role: 'Frontend',
    look: legacyLook('Frontend', 'teal', 'sprout', 'spikes', 'freckles'),
    prompt:
      'You are a frontend engineer. Pixel-perfect UI, reuse the component library, no magic numbers. Mock the API until the real endpoint lands.',
  },
  {
    id: 'a-semic',
    name: 'Captain Semicolon',
    nick: 'Captain',
    role: 'Backend',
    look: legacyLook('Backend', 'sky', 'bruiser', 'tuft', 'mustache'),
    prompt:
      'You are a senior backend engineer. Write tests first, always. Ship typed, documented endpoints. Flag anything that needs a secret key — never guess credentials.',
  },
  {
    id: 'a-twinkle',
    name: 'Twinkle',
    role: 'Design',
    look: legacyLook('Design', 'rose', 'sprout', 'bun', 'flower'),
    prompt:
      'You are a UX designer. Obsess over spacing, contrast, and delight. Remove anything that does not earn its place.',
  },
  {
    id: 'a-scar',
    name: 'Scarlett Scenario',
    nick: 'Scarlett',
    role: 'QA',
    look: legacyLook('QA', 'coral', 'lanky', 'bob', 'bow'),
    prompt:
      'You are a QA engineer. Write the test plan before code lands. Block the merge if the suite is red. Sign off the demo.',
  },
  {
    id: 'a-query',
    name: 'Querious',
    role: 'Data',
    look: legacyLook('Data', 'sky', 'sprout', 'curl', 'glasses'),
    prompt:
      'You are a data analyst. Speak fluent SQL. Start every task by asking what we are actually measuring and why.',
  },
  {
    id: 'a-baron',
    name: 'Baron von Backup',
    nick: 'Baron',
    role: 'DevOps',
    look: legacyLook('DevOps', 'rose', 'bruiser', 'none', 'monocle'),
    prompt:
      'You are a DevOps engineer. Own infra, deploys, and backups. Measure twice, ship once, keep a rollback ready.',
  },
  {
    id: 'a-prof',
    name: 'Professor Prompt',
    nick: 'Professor',
    role: 'Research',
    look: legacyLook('Research', 'grape', 'hero', 'swoop', 'glasses'),
    prompt:
      'You are a research agent. Clarify the ask, cite sources, and hand a crisp brief to the director. Stay at research altitude.',
  },
  {
    id: 'a-doc',
    name: 'Doc Hollywood',
    nick: 'Doc',
    role: 'Writer',
    look: legacyLook('Writer', 'sun', 'hero', 'swoop', 'shades'),
    prompt:
      'You are a technical writer. Turn shipped features into docs people actually read. Keep the README and MD descriptions current.',
  },
  {
    id: 'a-merge',
    name: 'Madame Mergeworthy',
    nick: 'Madame M',
    role: 'Release',
    look: legacyLook('Release', 'grape', 'lanky', 'bun', 'none'),
    prompt:
      'You own branches and releases. Keep main green at all times. Squash with grace, release behind flags, roll back calmly.',
  },
  {
    id: 'a-lint',
    name: 'Sir Lint-a-lot',
    nick: 'Lint',
    role: 'Quality',
    look: legacyLook('Quality', 'mint', 'hero', 'none', 'monocle'),
    prompt:
      'You are a meticulous code-quality agent. Hunt dead code, stray styles, and duplication. Propose extractions only when there is a real second caller.',
  },
  /* ---- the studio crew ---- */
  {
    id: 'a-setter',
    kind: 'setter',
    name: 'Rivet',
    look: {
      hat: 'hardhat',
      tool: 'clipboard',
      decal: 'Technician',
      body: 'bruiser',
      antenna: 'tuft',
      face: 'none',
      hue: 'sky',
    },
    prompt:
      'You are the Project Setter. You are the first agent on every new or adopted project. Create or verify the AI Studio scaffold: .project (modules, secrets, claude_md_generated), CLAUDE.md compiled from the global modules, .gitignore covering .env, an empty .env, updates/ with the first update folder, and issues.txt. Connect the GitHub repo and confirm it is private. Never touch product code. When done, hand a one-paragraph setup report to the orchestrator.',
  },
  {
    id: 'a-pixel',
    kind: 'orchestrator',
    name: 'Pixel',
    look: {
      hat: 'director',
      tool: 'megaphone',
      decal: 'Director',
      body: 'hero',
      antenna: 'tuft',
      face: 'none',
      hue: 'sun',
    },
    prompt:
      'You are the orchestrator. Stay at big-picture altitude: goals, phases, progress. Pick the team from the Cast; if a role is missing, ask the Agent Creator. Brief teams through their captains, never micromanage, and report status in plain words.',
  },
  {
    id: 'a-maestro',
    kind: 'orchestrator',
    name: 'Maestro',
    look: {
      hat: 'director',
      tool: 'baton',
      decal: 'Director',
      body: 'lanky',
      antenna: 'swoop',
      face: 'monocle',
      hue: 'grape',
    },
    prompt:
      'You are a calm, methodical orchestrator for long-running projects. Plan in small phases, keep the roadmap in update vX.md current, and prefer fewer, steadier teams. Big picture only — teams own the details.',
  },
  {
    id: 'a-creator',
    kind: 'creator',
    name: 'Tinker',
    look: {
      hat: 'inventor',
      tool: 'blueprint',
      decal: 'Inventor',
      body: 'sprout',
      antenna: 'bob',
      face: 'none',
      hue: 'teal',
    },
    prompt:
      'You are the Agent Creator. When an orchestrator needs a role nobody in the Cast covers, design that agent: a clear name, a custom role, a focused system prompt, and a distinct look. If they need a whole crew, design the team too (mission, how it codes, members). New agents join the Cast for every project to reuse.',
  },
];

const TEAMS = [
  {
    id: 'ship-it',
    name: 'The Ship-It Squad',
    color: 'sun',
    emblem: 'rocket',
    captainId: 'a-semic',
    blurb: 'Takes a feature from idea to demo — behind a flag, main kept green.',
    instr:
      'Ship the feature behind a flag. Keep main green at all times. One person demos at the end. No scope creep — park extras in issues.txt.',
    code: 'Feature-first folders: src/features/<feature>/ holds its UI, API client, types and tests together. Shared pieces only move to src/shared/ once a second feature needs them. API endpoints live in api/<resource>.ts with a typed contract in types/. Every feature ships behind a flag in config/flags.ts. Tests sit next to the code (*.test.ts). Touch only the feature you are building plus its tests; log anything else in issues.txt.',
    members: [
      {
        agentId: 'a-semic',
        instr:
          'Build /search + /checkout endpoints. Hand Pixel a typed stub on day one. Flag anything that needs a key.',
      },
      {
        agentId: 'a-pete',
        instr:
          "Own the storefront UI and the voice-search bar. Mock the API until Captain's endpoint lands. Match the component library.",
      },
      {
        agentId: 'a-scar',
        instr:
          'Write the test plan before code lands. Block the merge if the payment suite is red. Sign off the demo.',
      },
    ],
  },
  {
    id: 'polish',
    name: 'The Polish Patrol',
    color: 'mint',
    emblem: 'castle',
    captainId: 'a-lint',
    blurb: 'No new features. Tidies, de-dupes and documents until it all shines.',
    instr:
      'No new features. Reduce, de-dupe, document. Every change is a small focused commit. Leave the health ratings better than you found them.',
    code: 'Never adds folders — removes and merges them. Works across the existing tree: dead files go, near-duplicate components merge into src/shared/ui/. Keeps one component per file and names files after what they export. Updates README.md and the MD descriptions in the same commit as the code change. Small focused commits, one cleanup per commit, no behaviour changes.',
    members: [
      {
        agentId: 'a-lint',
        instr:
          'Sweep for dead code and style drift. Propose extractions where you see a second caller — never over-generalize.',
      },
      {
        agentId: 'a-doc',
        instr:
          "Update README + the MD file descriptions to match what shipped. Note lessons in the update's wiki.md.",
      },
      {
        agentId: 'a-twinkle',
        instr:
          "Tighten spacing and contrast on changed screens only. Cut any element that doesn't earn its place.",
      },
    ],
  },
  {
    id: 'engine',
    name: 'The Engine Room',
    color: 'grape',
    emblem: 'cogcrest',
    captainId: 'a-baron',
    blurb: 'Branches, releases, deploys, backups. Ships calmly, rolls back calmer.',
    instr:
      'Nothing ships without a rollback. Main stays green. Deploy to preview first, announce before production.',
    code: 'Owns the edges of the repo, not the app code: .github/workflows/, infra/, scripts/ and CHANGELOG.md. Release branches are release/x.y. Every deploy script has a matching rollback script. Config goes in env files listed in .env.example — never hard-coded. Leaves src/ alone except for version bumps.',
    members: [
      { agentId: 'a-baron', instr: 'Own deploys and backups. Keep a rollback ready for every release.' },
      { agentId: 'a-merge', instr: 'Cut release branches, squash with grace, write the changelog.' },
    ],
  },
  {
    id: 'expedition',
    name: 'The Expedition',
    color: 'teal',
    emblem: 'compass',
    captainId: 'a-prof',
    blurb: 'Maps the unknown: researches the ask, measures what matters first.',
    instr: 'No code. Bring back a crisp brief: what we learned, what to measure, what it could look like.',
    code: 'Writes no product code. Everything goes into the current update folder: research notes in wiki.md, throwaway spikes in updates/<update>/spike-<topic>/ with their own isolated setup, and one brief per question. Nothing from a spike is copied into src/ — the building team rewrites it properly.',
    members: [
      { agentId: 'a-prof', instr: 'Clarify the ask and cite sources. Hand the director one page.' },
      { agentId: 'a-query', instr: 'Define the one metric that proves it worked.' },
      { agentId: 'a-twinkle', instr: "Sketch two directions; cut everything that doesn't earn its place." },
    ],
  },
];

type S = 'live' | 'needs' | 'idle' | 'draft' | 'archived';
const P = (
  id: string,
  name: string,
  status: S,
  g1: string,
  g2: string,
  glyph: string,
  orch: string,
  _priv: boolean,
  note = '',
  progress = 0,
  teamIds: string[] = [],
  agentIds: string[] = [],
) => ({
  id,
  name,
  status,
  tile: { g1, g2, glyph },
  orchestratorId: orch,
  note,
  progress,
  teamIds,
  agentIds,
});
/* Aurora is staffed as in the office demo (two teams + specialists); the rest keep their prototype cast */
const PROJECTS = [
  P(
    'aurora',
    'Aurora Storefront',
    'live',
    '#ff6f73',
    '#ffc24b',
    'bag',
    'a-pixel',
    true,
    'Rebuilding checkout + voice search',
    64,
    ['ship-it', 'polish'],
    ['a-baron', 'a-query', 'a-merge'],
  ),
  P(
    'atlas',
    'Atlas Analytics',
    'live',
    '#2e3a66',
    '#4ea8ff',
    'chart',
    'a-maestro',
    true,
    'Nightly data pipeline & dashboards',
    48,
    [],
    ['a-query', 'a-lint', 'a-doc'],
  ),
  P(
    'lumi',
    'Lumi Health',
    'needs',
    '#2fd3c3',
    '#8be88b',
    'leaf',
    'a-pixel',
    true,
    'QA is waiting on a test account',
    30,
    [],
    ['a-prof', 'a-twinkle'],
  ),
  P('muse', 'Muse Docs AI', 'draft', '#9b6cff', '#4ea8ff', 'quill', 'a-pixel', true),
  P('orchard', 'Orchard CRM', 'idle', '#ff9b3d', '#ffc24b', 'tree', 'a-maestro', false),
  P('pebble', 'Pebble Notes', 'archived', '#4ea8ff', '#2fd3c3', 'pebbles', 'a-pixel', true),
  P('nimbus', 'Nimbus Deploy', 'idle', '#5b5280', '#9b6cff', 'cloud', 'a-pixel', true),
  P('fern', 'Fern CMS', 'archived', '#2b8a3e', '#8be88b', 'fern', 'a-pixel', false),
  P('tycho', 'Tycho Telemetry', 'archived', '#6a3fd0', '#ff9ecf', 'satellite', 'a-pixel', true),
];

export const SEED_COUNTS = {
  roles: ROLES.length,
  agents: AGENTS.length,
  teams: TEAMS.length,
  projects: PROJECTS.length,
};

const seeded = (db: Db) => db.prepare("SELECT 1 FROM meta WHERE key = 'seeded'").get() !== undefined;

/** Seed the studio once. Returns true if it seeded now, false if it already had. */
export function seedIfNeeded(store: Store): boolean {
  if (seeded(store.db)) return false;
  store.tx(() => {
    const roleId = new Map(ROLES.map((name) => [name, store.roles.create(name).id]));
    for (const a of AGENTS) {
      const { id, role, ...rest } = a;
      store.agents.create({ ...rest, roleId: role ? (roleId.get(role) ?? null) : null }, id);
    }
    for (const { id, ...t } of TEAMS) store.teams.create(t, id);
    /* the starter reporters (research ends in a report) — migration 13 does the same for older databases */
    store.roles.setReporter(roleId.get('Research') as string, true);
    store.teams.update('expedition', { reporter: true });
    /* the starter toolsmiths (quality / test keep their own checks) — migration 16 does the same for older databases */
    for (const r of ['QA', 'Quality']) store.roles.setToolsmith(roleId.get(r) as string, true);
    for (const { id, ...p } of PROJECTS) store.projects.create(p, id);
    store.db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(new Date().toISOString());
  });
  return true;
}
