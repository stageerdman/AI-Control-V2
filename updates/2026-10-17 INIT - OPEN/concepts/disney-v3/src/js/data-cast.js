/* ============================================================
   data-cast.js — the one roster (spec-cast §4) + teams (spec-teams §3).
   Public: ROLES [{id,name}], roleById(), roleByName(), roleName(), roleUsage(),
           addRole(), renameRole(), deleteRole() → undo rec, restoreRole(rec),
           FUNNY_NAMES, TEAM_MAX, AGENT_KINDS, KIND_LABEL, KIND_ABOUT, kindOf(),
           AGENTS, agentById(), DIRECTOR (let), useOrchestrator(id), shortName(),
           systemAgents(), orchestrators(), agentsOfKind(k), isSystemAgent(), castOrder(),
           canDeleteAgent(a) → {ok, why}, deleteAgent(id) → undo rec, restoreAgent(rec),
           applyLook(agent, slot, value), setWholeLook(agent, look),
           TEAMS, teamById(), teamsOf(agentId), roleOn(team, agentId),
           memberOf(team, agentId), setCaptain(), addMember(), removeMember()
   Team membership is derived from TEAMS, never stored on the agent.
   ============================================================ */

/* ---- Roles are user-defined labels (v5). `agent.role` stores the role's NAME
   (display-safe everywhere); renameRole() rewrites it on every agent. A role is
   just a label + prompt context — it never drives the look (see agent.look). */
/* a role record stringifies to its name, so `${ROLES[i]}` / escapeHtml(role) read right */
const _roleRec = (id, name) => Object.defineProperty({ id, name }, 'toString', { value() { return this.name; } });
const ROLES = ['Frontend', 'Backend', 'Design', 'QA', 'Data', 'DevOps', 'Research', 'Writer', 'Release', 'Quality']
  .map(name => _roleRec('r-' + name.toLowerCase(), name));
const _norm1 = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 28);
const roleById = id => ROLES.find(r => r.id === id) || null;
const roleByName = name => { const n = _norm1(name).toLowerCase(); return ROLES.find(r => r.name.toLowerCase() === n) || null; };
/* name for a role id, role name, role record, or agent */
function roleName(x) {
  if (!x) return '';
  if (typeof x === 'object') return x.name && x.id && x.id.startsWith('r-') ? x.name : (x.role != null ? roleName(x.role) : x.name || '');
  return (roleById(x) || {}).name || String(x);
}
const roleUsage = id => { const r = roleById(id); return r ? AGENTS.filter(a => a.role === r.name) : []; };
/* create (or return the existing) role — case-insensitive dedupe */
function addRole(name) {
  const n = _norm1(name); if (!n) return null;
  const hit = roleByName(n); if (hit) return hit;
  let id = 'r-' + n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'r-role';
  while (roleById(id)) id += '-2';
  const r = _roleRec(id, n); ROLES.push(r); return r;
}
/* rename; agents carrying the old name follow. false if empty or taken */
function renameRole(id, name) {
  const r = roleById(id); const n = _norm1(name); if (!r || !n) return false;
  const clash = roleByName(n); if (clash && clash !== r) return false;
  AGENTS.forEach(a => { if (a.role === r.name) a.role = n; });
  r.name = n; return true;
}
/* delete; agents using it become role-less. Returns an undo record for restoreRole() */
function deleteRole(id) {
  const i = ROLES.findIndex(r => r.id === id); if (i < 0) return null;
  const [role] = ROLES.splice(i, 1);
  const agents = AGENTS.filter(a => a.role === role.name); agents.forEach(a => { a.role = ''; });
  return { role, index: i, agents };
}
function restoreRole(rec) {
  if (!rec || roleById(rec.role.id)) return;
  ROLES.splice(Math.min(rec.index, ROLES.length), 0, rec.role);
  rec.agents.forEach(a => { if (!a.role) a.role = rec.role.name; });
}

const FUNNY_NAMES = ['Major Refactor', 'Duchess Deploy', 'Inspector Edgecase', 'Count Cache', 'Lady Latency', 'Sergeant Syntax', 'Agent Async', 'Mister Merge', 'Princess Pixel', 'Baroness Byte'];

/* ---- Kinds (v5). Three system kinds are always present in the studio:
     setter        exactly one — sets up / adopts a project, first agent called
     orchestrator  one or more — the project's director; at least one must exist
     creator       exactly one — designs new agents/teams when an orchestrator asks
   Everyone else is kind 'agent'. System agents never join teams. */
const AGENT_KINDS = ['agent', 'setter', 'orchestrator', 'creator'];
const KIND_LABEL = { agent: 'Agent', setter: 'Project Setter', orchestrator: 'Orchestrator', creator: 'Agent Creator' };
const KIND_ABOUT = {
  setter: 'Sets up every new or adopted project — scaffold, rules, GitHub — before anyone else arrives.',
  orchestrator: 'Runs a project at big-picture altitude. You pick one per project; it picks the team.',
  creator: 'When an orchestrator needs someone who doesn’t exist yet, designs the agent — or a whole team — and adds them to the Cast.',
};
const kindOf = a => (a && AGENT_KINDS.includes(a.kind)) ? a.kind : 'agent';

/* Canonical roster. Agents are SHARED DEFINITIONS: many projects can use the same
   agent and each project runs its own copy — no shared memory between projects.
   `look` = costume slots (hero.js LOOK_SLOTS); legacy hue/build/hair/accessory are
   kept in sync by applyLook() for older readers. `stats.projects` = projects using it. */
const AGENTS = [
  { id: 'a-pete', name: 'Pixel Pete', role: 'Frontend', hue: 'teal', build: 'sprout', hair: 'spikes', accessory: 'freckles', stats: { projects: 3, tokens: 1240000 },
    prompt: 'You are a frontend engineer. Pixel-perfect UI, reuse the component library, no magic numbers. Mock the API until the real endpoint lands.' },
  { id: 'a-semic', name: 'Captain Semicolon', role: 'Backend', hue: 'sky', build: 'bruiser', hair: 'tuft', accessory: 'mustache', stats: { projects: 3, tokens: 1870000 },
    prompt: 'You are a senior backend engineer. Write tests first, always. Ship typed, documented endpoints. Flag anything that needs a secret key — never guess credentials.' },
  { id: 'a-twinkle', name: 'Twinkle', role: 'Design', hue: 'rose', build: 'sprout', hair: 'bun', accessory: 'flower', stats: { projects: 2, tokens: 640000 },
    prompt: 'You are a UX designer. Obsess over spacing, contrast, and delight. Remove anything that does not earn its place.' },
  { id: 'a-scar', name: 'Scarlett Scenario', role: 'QA', hue: 'coral', build: 'lanky', hair: 'bob', accessory: 'bow', stats: { projects: 3, tokens: 910000 },
    prompt: 'You are a QA engineer. Write the test plan before code lands. Block the merge if the suite is red. Sign off the demo.' },
  { id: 'a-query', name: 'Querious', role: 'Data', hue: 'sky', build: 'sprout', hair: 'curl', accessory: 'glasses', stats: { projects: 1, tokens: 420000 },
    prompt: 'You are a data analyst. Speak fluent SQL. Start every task by asking what we are actually measuring and why.' },
  { id: 'a-baron', name: 'Baron von Backup', role: 'DevOps', hue: 'rose', build: 'bruiser', hair: 'none', accessory: 'monocle', stats: { projects: 2, tokens: 380000 },
    prompt: 'You are a DevOps engineer. Own infra, deploys, and backups. Measure twice, ship once, keep a rollback ready.' },
  { id: 'a-prof', name: 'Professor Prompt', role: 'Research', hue: 'grape', build: 'hero', hair: 'swoop', accessory: 'glasses', stats: { projects: 2, tokens: 1050000 },
    prompt: 'You are a research agent. Clarify the ask, cite sources, and hand a crisp brief to the director. Stay at research altitude.' },
  { id: 'a-doc', name: 'Doc Hollywood', role: 'Writer', hue: 'sun', build: 'hero', hair: 'swoop', accessory: 'shades', stats: { projects: 2, tokens: 560000 },
    prompt: 'You are a technical writer. Turn shipped features into docs people actually read. Keep the README and MD descriptions current.' },
  { id: 'a-merge', name: 'Madame Mergeworthy', role: 'Release', hue: 'grape', build: 'lanky', hair: 'bun', accessory: 'none', stats: { projects: 3, tokens: 290000 },
    prompt: 'You own branches and releases. Keep main green at all times. Squash with grace, release behind flags, roll back calmly.' },
  { id: 'a-lint', name: 'Sir Lint-a-lot', role: 'Quality', hue: 'mint', build: 'hero', hair: 'none', accessory: 'monocle', stats: { projects: 2, tokens: 710000 },
    prompt: 'You are a meticulous code-quality agent. Hunt dead code, stray styles, and duplication. Propose extractions only when there is a real second caller.' },
  /* ---- the studio crew (system agents) — kept after the regular ten so index-based
     readers (e.g. office demo padding AGENTS[i % 10]) still see regular agents ---- */
  { id: 'a-setter', kind: 'setter', name: 'Rivet', role: KIND_LABEL.setter, hue: 'sky', build: 'bruiser', hair: 'tuft', accessory: 'none', stats: { projects: 9, tokens: 230000 },
    look: { hat: 'hardhat', tool: 'clipboard', decal: 'Technician', body: 'bruiser', antenna: 'tuft', face: 'none', hue: 'sky' },
    prompt: 'You are the Project Setter. You are the first agent on every new or adopted project. Create or verify the AI Studio scaffold: .project (modules, secrets, claude_md_generated), CLAUDE.md compiled from the global modules, .gitignore covering .env, an empty .env, updates/ with the first update folder, and issues.txt. Connect the GitHub repo and confirm it is private. Never touch product code. When done, hand a one-paragraph setup report to the orchestrator.' },
  { id: 'a-pixel', kind: 'orchestrator', name: 'Pixel', role: KIND_LABEL.orchestrator, hue: 'sun', build: 'hero', hair: 'tuft', accessory: 'none', stats: { projects: 9, tokens: 2100000 },
    look: { hat: 'director', tool: 'megaphone', decal: 'Director', body: 'hero', antenna: 'tuft', face: 'none', hue: 'sun' },
    prompt: 'You are the orchestrator. Stay at big-picture altitude: goals, phases, progress. Pick the team from the Cast; if a role is missing, ask the Agent Creator. Brief teams through their captains, never micromanage, and report status in plain words.' },
  { id: 'a-maestro', kind: 'orchestrator', name: 'Maestro', role: KIND_LABEL.orchestrator, hue: 'grape', build: 'lanky', hair: 'swoop', accessory: 'monocle', stats: { projects: 0, tokens: 0 },
    look: { hat: 'director', tool: 'baton', decal: 'Director', body: 'lanky', antenna: 'swoop', face: 'monocle', hue: 'grape' },
    prompt: 'You are a calm, methodical orchestrator for long-running projects. Plan in small phases, keep the roadmap in update vX.md current, and prefer fewer, steadier teams. Big picture only — teams own the details.' },
  { id: 'a-creator', kind: 'creator', name: 'Tinker', role: KIND_LABEL.creator, hue: 'teal', build: 'sprout', hair: 'curl', accessory: 'none', stats: { projects: 4, tokens: 310000 },
    look: { hat: 'inventor', tool: 'blueprint', decal: 'Inventor', body: 'sprout', antenna: 'curl', face: 'none', hue: 'teal' },
    prompt: 'You are the Agent Creator. When an orchestrator needs a role nobody in the Cast covers, design that agent: a clear name, a custom role, a focused system prompt, and a distinct look. If they need a whole crew, design the team too (mission, how it codes, members). New agents join the Cast for every project to reuse.' },
];
/* migrate: every agent gets an explicit look derived from its old role gear,
   so it looks exactly as before (hero.js lookFromLegacy) */
AGENTS.forEach(a => { if (!a.look) a.look = lookFromLegacy(a); a.kind = kindOf(a); });

const systemAgents = () => AGENTS.filter(a => kindOf(a) !== 'agent');
const orchestrators = () => AGENTS.filter(a => kindOf(a) === 'orchestrator');
const agentsOfKind = k => AGENTS.filter(a => kindOf(a) === k);
const isSystemAgent = a => kindOf(a) !== 'agent';
/* lineup order everywhere: studio crew first (setter, orchestrators, creator), then everyone else */
const castOrder = () => [...agentsOfKind('setter'), ...orchestrators(), ...agentsOfKind('creator'), ...agentsOfKind('agent')];

/* The director = the orchestrator of the project you are in. Back-compat:
   agentById('director' | 'pixel') and DIRECTOR resolve to it. Call
   useOrchestrator(PROJECTS[i].orchestrator) when opening a project. */
let DIRECTOR = AGENTS.find(a => a.id === 'a-pixel');
function useOrchestrator(id) {
  const a = AGENTS.find(x => x.id === id && kindOf(x) === 'orchestrator') || orchestrators()[0];
  if (a) DIRECTOR = a; return DIRECTOR;
}
const agentById = id => (id === 'director' || id === 'pixel') ? DIRECTOR : AGENTS.find(a => a.id === id);

/* delete rules: setter/creator never; orchestrators down to one */
function canDeleteAgent(a) {
  const k = kindOf(a);
  if (k === 'setter') return { ok: false, why: 'Required — the studio always has exactly one Project Setter. It sets up every new project.' };
  if (k === 'creator') return { ok: false, why: 'Required — the studio always has exactly one Agent Creator. Orchestrators call it to design new agents.' };
  if (k === 'orchestrator' && orchestrators().length <= 1) return { ok: false, why: 'At least one orchestrator must exist — every project needs one to run it.' };
  return { ok: true, why: '' };
}
/* removes the agent (and its team seats). Returns an undo record for restoreAgent() */
function deleteAgent(id) {
  const a = AGENTS.find(x => x.id === id); if (!a || !canDeleteAgent(a).ok) return null;
  const index = AGENTS.indexOf(a); AGENTS.splice(index, 1);
  const seats = TEAMS.map(t => ({ t, cap: t.captain === id, r: removeMember(t, id) })).filter(s => s.r);
  if (DIRECTOR === a) useOrchestrator(null);
  return { agent: a, index, seats };
}
function restoreAgent(rec) {
  if (!rec || AGENTS.includes(rec.agent)) return;
  AGENTS.splice(Math.min(rec.index, AGENTS.length), 0, rec.agent);
  rec.seats.forEach(({ t, cap, r }) => { if (!memberOf(t, rec.agent.id)) { t.members.splice(r.index, 0, r.rec); if (cap) t.captain = rec.agent.id; } });
}

/* look editing: one slot at a time; keeps legacy mirror fields in sync */
const _LOOK_MIRROR = { body: 'build', antenna: 'hair', face: 'accessory', hue: 'hue' };
function applyLook(agent, slot, value) {
  if (!agent.look) agent.look = lookFromLegacy(agent);
  agent.look[slot] = value;
  if (slot === 'hat') agent.look.decal = hatDecal(value);
  if (_LOOK_MIRROR[slot]) agent[_LOOK_MIRROR[slot]] = value;
  return agent.look;
}
function setWholeLook(agent, look) {
  agent.look = Object.assign({}, look);
  Object.entries(_LOOK_MIRROR).forEach(([s, k]) => { agent[k] = agent.look[s]; });
  return agent.look;
}
/* Friendly short name for sentences ("Give Pete a job"). Never the first word blindly:
   "Sir Lint-a-lot" → "Lint", not "Sir". */
const AGENT_NICK = { 'a-pete': 'Pete', 'a-semic': 'Captain', 'a-lint': 'Lint', 'a-doc': 'Doc', 'a-baron': 'Baron', 'a-merge': 'Madame M', 'a-prof': 'Professor', 'a-scar': 'Scarlett', 'a-query': 'Querious', 'a-twinkle': 'Twinkle', 'a-pixel': 'Pixel' };
const shortName = a => (a.id === 'director' || a.id === 'pixel') ? shortName(DIRECTOR) : (a.nick || AGENT_NICK[a.id] || a.name);

/* Teams (spec-teams §3.1 shape, §3.2 assignments). Rules / jobs for Ship-It and
   Polish are the v2 text verbatim. */
const TEAMS = [
  { id: 'ship-it', name: 'The Ship-It Squad', color: 'sun', emblem: 'rocket', captain: 'a-semic',
    blurb: 'Takes a feature from idea to demo — behind a flag, main kept green.',
    instr: 'Ship the feature behind a flag. Keep main green at all times. One person demos at the end. No scope creep — park extras in issues.txt.',
    code: 'Feature-first folders: src/features/<feature>/ holds its UI, API client, types and tests together. Shared pieces only move to src/shared/ once a second feature needs them. API endpoints live in api/<resource>.ts with a typed contract in types/. Every feature ships behind a flag in config/flags.ts. Tests sit next to the code (*.test.ts). Touch only the feature you are building plus its tests; log anything else in issues.txt.',
    members: [
      { agent: 'a-semic', instr: 'Build /search + /checkout endpoints. Hand Pixel a typed stub on day one. Flag anything that needs a key.' },
      { agent: 'a-pete', instr: 'Own the storefront UI and the voice-search bar. Mock the API until Captain\'s endpoint lands. Match the component library.' },
      { agent: 'a-scar', instr: 'Write the test plan before code lands. Block the merge if the payment suite is red. Sign off the demo.' },
    ] },
  { id: 'polish', name: 'The Polish Patrol', color: 'mint', emblem: 'castle', captain: 'a-lint',
    blurb: 'No new features. Tidies, de-dupes and documents until it all shines.',
    instr: 'No new features. Reduce, de-dupe, document. Every change is a small focused commit. Leave the health ratings better than you found them.',
    code: 'Never adds folders — removes and merges them. Works across the existing tree: dead files go, near-duplicate components merge into src/shared/ui/. Keeps one component per file and names files after what they export. Updates README.md and the MD descriptions in the same commit as the code change. Small focused commits, one cleanup per commit, no behaviour changes.',
    members: [
      { agent: 'a-lint', instr: 'Sweep for dead code and style drift. Propose extractions where you see a second caller — never over-generalize.' },
      { agent: 'a-doc', instr: 'Update README + the MD file descriptions to match what shipped. Note lessons in the update\'s wiki.md.' },
      { agent: 'a-twinkle', instr: 'Tighten spacing and contrast on changed screens only. Cut any element that doesn\'t earn its place.' },
    ] },
  { id: 'engine', name: 'The Engine Room', color: 'grape', emblem: 'cogcrest', captain: 'a-baron',
    blurb: 'Branches, releases, deploys, backups. Ships calmly, rolls back calmer.',
    instr: 'Nothing ships without a rollback. Main stays green. Deploy to preview first, announce before production.',
    code: 'Owns the edges of the repo, not the app code: .github/workflows/, infra/, scripts/ and CHANGELOG.md. Release branches are release/x.y. Every deploy script has a matching rollback script. Config goes in env files listed in .env.example — never hard-coded. Leaves src/ alone except for version bumps.',
    members: [
      { agent: 'a-baron', instr: 'Own deploys and backups. Keep a rollback ready for every release.' },
      { agent: 'a-merge', instr: 'Cut release branches, squash with grace, write the changelog.' },
    ] },
  { id: 'expedition', name: 'The Expedition', color: 'teal', emblem: 'compass', captain: 'a-prof',
    blurb: 'Maps the unknown: researches the ask, measures what matters first.',
    instr: 'No code. Bring back a crisp brief: what we learned, what to measure, what it could look like.',
    code: 'Writes no product code. Everything goes into the current update folder: research notes in wiki.md, throwaway spikes in updates/<update>/spike-<topic>/ with their own isolated setup, and one brief per question. Nothing from a spike is copied into src/ — the building team rewrites it properly.',
    members: [
      { agent: 'a-prof', instr: 'Clarify the ask and cite sources. Hand the director one page.' },
      { agent: 'a-query', instr: 'Define the one metric that proves it worked.' },
      { agent: 'a-twinkle', instr: 'Sketch two directions; cut everything that doesn\'t earn its place.' },
    ] },
];
const teamById = id => TEAMS.find(t => t.id === id);
const memberOf = (team, agentId) => team && team.members.find(m => m.agent === agentId);
const teamsOf = agentId => TEAMS.filter(t => memberOf(t, agentId));
/* an agent's role is defined once, on the agent — teams never override it */
function roleOn(team, agentId) { const a = agentById(agentId); return (a && a.role) || null; }

/* ---- team invariants (spec-teams §3.1): captain ∈ members, ≤6, no dupes ---- */
const TEAM_MAX = 7;
function setCaptain(team, agentId) {
  if (!memberOf(team, agentId)) return false;
  team.captain = agentId; return true;
}
function addMember(team, agentId, instr = '') {
  if (memberOf(team, agentId) || team.members.length >= TEAM_MAX || !agentById(agentId) || isSystemAgent(agentById(agentId))) return false;
  team.members.push({ agent: agentId, instr });
  if (!team.captain) team.captain = agentId;
  return true;
}
/* returns the removed member record (for Undo) or null */
function removeMember(team, agentId) {
  const i = team.members.findIndex(m => m.agent === agentId); if (i < 0) return null;
  const [rec] = team.members.splice(i, 1);
  if (team.captain === agentId) team.captain = team.members[0]?.agent ?? null;
  return { rec, index: i };
}
