/* ============================================================
   data-studio.js — studio-wide data (no rendering).
   Public: CREDENTIALS, credById(), PROJECTS, projById(), tileGlyph(),
           BLUEPRINT_TREE, PRINCIPLES, FRESHNESS
   Secrets: only masked values ever live here (`val`). Never real keys.
   ============================================================ */

const CREDENTIALS = [
  { id: 'gh', name: 'GitHub', mark: 'GH', color: PALETTE.grape, val: 'ghp_••••7Qx2', serves: 'Clone, commit, push, open PRs', docs: true, instr: 'Use the ai-studio bot account; never force-push main.', used: 4 },
  { id: 'oai', name: 'OpenAI', mark: 'AI', color: PALETTE.teal, val: 'sk-••••a91', serves: 'LLM calls for agents & clarifier', docs: true, instr: '', used: 5 },
  { id: 'anthropic', name: 'Anthropic', mark: '✳', color: PALETTE.sun, val: 'sk-ant-••••9f', serves: 'Claude models for orchestrator + agents', docs: true, instr: '', used: 5 },
  { id: 'stripe', name: 'Stripe', mark: 'S', color: PALETTE.sky, val: 'sk_live_••••42', serves: 'Payments: checkout, refunds', docs: true, instr: 'Test key only outside production.', used: 1 },
  { id: 'figma', name: 'Figma', mark: 'Fi', color: PALETTE.coral, val: 'figd_••••cz', serves: 'Read design files & export assets', docs: true, instr: '', used: 2 },
  { id: 'pg', name: 'Postgres', mark: 'DB', color: PALETTE['sun-deep'], val: 'postgres://••••', serves: 'Primary app database', docs: false, instr: 'Read-replica for analytics agents.', used: 2 },
  { id: 'vercel', name: 'Vercel', mark: '▲', color: PALETTE.rose, val: '••••rllm', serves: 'Deploy previews & production', docs: true, instr: '', used: 2 },
  { id: 'resend', name: 'Resend', mark: '@', color: PALETTE.mint, val: 're_••••8k', serves: 'Transactional email', docs: true, instr: '', used: 0 },
];
const credById = id => CREDENTIALS.find(c => c.id === id);

/* Project logo glyphs (24×24, white strokes) */
function tileGlyph(kind) {
  const g = {
    bag: '<path d="M7 9h10l-1 11a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2L7 9Z" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0" fill="none" stroke="#fff" stroke-width="1.8"/>',
    chart: '<circle cx="7" cy="17" r="1.6" fill="#fff"/><circle cx="12" cy="11" r="1.6" fill="#fff"/><circle cx="17" cy="14" r="1.6" fill="#fff"/><path d="M7 17 12 11 17 14" stroke="#fff" stroke-width="1.4" fill="none"/>',
    leaf: '<path d="M12 6c5 1 6 7 2 10-4 3-8-1-6-6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M12 6c-4 2-4 8 0 10" stroke="#fff" stroke-width="1.6" fill="none"/>',
    quill: '<path d="M17 7C11 8 8 13 8 17l2-1c0-3 3-7 7-9Z" fill="#fff"/><path d="M8 17l-1 1" stroke="#fff" stroke-width="1.6"/>',
    tree: '<path d="M12 6v12" stroke="#fff" stroke-width="1.8"/><path d="M12 10c-3 0-4-2-4-2m4 2c3 0 4-2 4-2M12 14c-3 0-4-2-4-2m4 2c3 0 4-2 4-2" stroke="#fff" stroke-width="1.6" fill="none"/>',
    pebbles: '<ellipse cx="12" cy="17" rx="6" ry="2.4" fill="#fff" opacity=".9"/><ellipse cx="11" cy="13" rx="4" ry="2" fill="#fff" opacity=".7"/><ellipse cx="13" cy="9.5" rx="2.6" ry="1.5" fill="#fff"/>',
    cloud: '<path d="M8 16a3 3 0 0 1 .4-6A4 4 0 0 1 16 10a3 3 0 0 1 0 6Z" fill="#fff"/>',
    fern: '<path d="M12 18c0-6 3-9 6-10-1 4-3 6-6 6 0-4 2-6 2-6" stroke="#fff" stroke-width="1.5" fill="none"/>',
    satellite: '<rect x="10" y="10" width="4" height="4" rx="1" fill="#fff"/><path d="M7 7l3 3M14 14l3 3M6 12h2M16 12h2" stroke="#fff" stroke-width="1.6"/>',
  };
  return g[kind] || g.bag;
}

/* cast = AGENT ids (spec-cast §4) so cards render real heroes.
   orchestrator = the agent who runs the project (kind 'orchestrator').
   github = {connected, private}. Apps run locally — no online test URL. */
const PROJECTS = [
  { id: 'aurora', name: 'Aurora Storefront', group: 'active', g1: '#ff6f73', g2: '#ffc24b', glyph: 'bag', status: 'live', agents: 9, pct: 64, orchestrator: 'a-pixel', github: { connected: true, private: true }, note: 'Rebuilding checkout + voice search', cast: ['a-scar', 'a-doc', 'a-pete', 'a-semic'], openable: true },
  { id: 'atlas', name: 'Atlas Analytics', group: 'active', g1: '#2e3a66', g2: '#4ea8ff', glyph: 'chart', status: 'live', agents: 3, pct: 48, orchestrator: 'a-pixel', github: { connected: true, private: true }, note: 'Nightly data pipeline & dashboards', cast: ['a-query', 'a-lint', 'a-doc'] },
  { id: 'lumi', name: 'Lumi Health', group: 'active', g1: '#2fd3c3', g2: '#8be88b', glyph: 'leaf', status: 'needs', agents: 2, pct: 30, orchestrator: 'a-pixel', github: { connected: true, private: true }, note: 'QA is waiting on a test account', cast: ['a-prof', 'a-twinkle'] },
  { id: 'muse', name: 'Muse Docs AI', group: 'db', g1: '#9b6cff', g2: '#4ea8ff', glyph: 'quill', tag: 'Draft', edited: 'edited 2d ago', orchestrator: 'a-pixel', github: { connected: true, private: true } },
  { id: 'orchard', name: 'Orchard CRM', group: 'db', g1: '#ff9b3d', g2: '#ffc24b', glyph: 'tree', tag: 'Idle', edited: 'edited 9d ago', orchestrator: 'a-pixel', github: { connected: true, private: false } },
  { id: 'pebble', name: 'Pebble Notes', group: 'db', g1: '#4ea8ff', g2: '#2fd3c3', glyph: 'pebbles', tag: 'Archived', edited: 'edited 3w ago', orchestrator: 'a-pixel', github: { connected: true, private: true } },
  { id: 'nimbus', name: 'Nimbus Deploy', group: 'db', g1: '#5b5280', g2: '#9b6cff', glyph: 'cloud', tag: 'Idle', edited: 'edited 5w ago', orchestrator: 'a-pixel', github: { connected: true, private: true } },
  { id: 'fern', name: 'Fern CMS', group: 'db', g1: '#2b8a3e', g2: '#8be88b', glyph: 'fern', tag: 'Archived', edited: 'edited 2mo ago', orchestrator: 'a-pixel', github: { connected: true, private: false } },
  { id: 'tycho', name: 'Tycho Telemetry', group: 'db', g1: '#6a3fd0', g2: '#ff9ecf', glyph: 'satellite', tag: 'Archived', edited: 'edited 3mo ago', orchestrator: 'a-pixel', github: { connected: true, private: true } },
];
const projById = id => PROJECTS.find(p => p.id === id);

const BLUEPRINT_TREE = [
  { path: 'my-project/', glyph: '📁', desc: 'The production itself — born from this starter kit', children: [
    { path: '.project', glyph: '📄', desc: 'Project marker — modules used, secrets, generated flag' },
    { path: 'CLAUDE.md', glyph: '📘', desc: 'Compiled rulebook, built from the global modules', md: true },
    { path: '.gitignore', glyph: '📄', desc: 'Always covers .env' },
    { path: '.env', glyph: '🔑', desc: 'This project\'s secrets — never committed' },
    { path: 'issues.txt', glyph: '📄', desc: 'Running list of known issues & TODOs' },
    { path: 'updates/', glyph: '📁', desc: 'One folder per update', children: [
      { path: '2026-10-17 NAME - OPEN/', glyph: '📁', desc: 'An in-progress update', children: [
        { path: 'update v1.md', glyph: '📘', desc: 'The version plan — goal, phased roadmap, live status', md: true },
        { path: 'wiki.md', glyph: '📘', desc: 'Durable decisions & lessons this update taught', md: true },
      ] },
    ] },
    { path: 'src/', glyph: '📁', desc: 'Source — per-ecosystem layout' },
  ] },
];
const PRINCIPLES = [
  { mod: 'Structure', color: 'teal', text: 'Modular by default: any piece understandable & fixable in isolation.' },
  { mod: 'Coding', color: 'sky', text: 'Keep it minimal — build only what\'s truly needed.' },
  { mod: 'Coding', color: 'sky', text: 'Test what matters; lock each phase with tests.' },
  { mod: 'UX', color: 'rose', text: 'Cut everything unnecessary — does this earn its place?' },
  { mod: 'UX', color: 'rose', text: 'Minimal visual system: one or two fonts, a small deliberate scale.' },
  { mod: 'Workflow', color: 'grape', text: 'Commit AND push after every change.' },
  { mod: 'Workflow', color: 'grape', text: 'Act as an orchestrator — decompose, fan out, synthesize.' },
  { mod: 'Project', color: 'sun', text: 'Voice-first. Show programs, not terminals. Secrets always masked.' },
];
const FRESHNESS = [
  { id: 'aurora', ok: true, note: 'rebuilt 2d ago' },
  { id: 'atlas', ok: true, note: 'rebuilt 5d ago' },
  { id: 'lumi', ok: false, note: 'UX module changed since last compile' },
  { id: 'muse', ok: false, note: '3 principles drifted' },
  { id: 'orchard', ok: true, note: 'rebuilt 3w ago' },
];
