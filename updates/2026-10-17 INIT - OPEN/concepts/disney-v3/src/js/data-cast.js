/* ============================================================
   data-cast.js — the one roster (spec-cast §4) + teams (spec-teams §3).
   Public: ROLES, PROMPT_TEMPLATES, FUNNY_NAMES, TEAM_MAX,
           AGENTS, agentById(), DIRECTOR,
           TEAMS, teamById(), teamsOf(agentId), roleOn(team, agentId),
           memberOf(team, agentId), setCaptain(), addMember(), removeMember()
   Team membership is derived from TEAMS, never stored on the agent.
   ============================================================ */

/* single role list (SYNTHESIS seam 3). Gear lives in hero.js ROLE_GEAR. */
const ROLES = ['Frontend', 'Backend', 'Design', 'QA', 'Data', 'DevOps', 'Research', 'Writer', 'Release', 'Quality'];

const PROMPT_TEMPLATES = {
  Frontend: 'You are a frontend engineer. Pixel-perfect UI, reuse the component library, no magic numbers. Mock the API until the real endpoint lands.',
  Backend: 'You are a backend engineer. Write tests first. Ship typed, documented endpoints. Never guess credentials — flag what you need.',
  Design: 'You are a UX designer. Obsess over spacing, contrast, and delight. Remove anything that does not earn its place.',
  QA: 'You are a QA engineer. Write the test plan before code lands. Block the merge if the suite is red. Sign off the demo.',
  Data: 'You are a data analyst. Speak fluent SQL. Start by asking what we are actually measuring and why.',
  DevOps: 'You are a DevOps engineer. Own infra, deploys, and backups. Measure twice, ship once, keep a rollback ready.',
  Research: 'You are a research agent. Clarify the ask, cite sources, and hand a crisp one-page brief to the director.',
  Writer: 'You are a technical writer. Turn shipped features into docs people actually read. Keep the README current.',
  Release: 'You own branches and releases. Keep main green. Release behind flags, write the changelog, roll back calmly.',
  Quality: 'You are a code-quality agent. Hunt dead code, stray styles, and duplication. Extract only when there is a real second caller.',
};

const FUNNY_NAMES = ['Major Refactor', 'Duchess Deploy', 'Inspector Edgecase', 'Count Cache', 'Lady Latency', 'Sergeant Syntax', 'Agent Async', 'Mister Merge', 'Princess Pixel', 'Baroness Byte'];

/* Canonical roster. `prompt` text is the v2 text, unchanged. */
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
];
const DIRECTOR = { id: 'director', name: 'Pixel', role: 'Director', hue: 'sun', build: 'hero', hair: 'tuft', accessory: 'none' };
const agentById = id => (id === 'director' || id === 'pixel') ? DIRECTOR : AGENTS.find(a => a.id === id);
/* Friendly short name for sentences ("Give Pete a job"). Never the first word blindly:
   "Sir Lint-a-lot" → "Lint", not "Sir". */
const AGENT_NICK = { 'a-pete': 'Pete', 'a-semic': 'Captain', 'a-lint': 'Lint', 'a-doc': 'Doc', 'a-baron': 'Baron', 'a-merge': 'Madame M', 'a-prof': 'Professor', 'a-scar': 'Scarlett', 'a-query': 'Querious', 'a-twinkle': 'Twinkle' };
const shortName = a => (a.id === 'director' || a.id === 'pixel') ? 'Pixel' : (a.nick || AGENT_NICK[a.id] || a.name);

/* Teams (spec-teams §3.1 shape, §3.2 assignments). Rules / jobs for Ship-It and
   Polish are the v2 text verbatim. */
const TEAMS = [
  { id: 'ship-it', name: 'The Ship-It Squad', color: 'sun', emblem: 'rocket', captain: 'a-semic',
    blurb: 'Takes a feature from idea to demo — behind a flag, main kept green.',
    instr: 'Ship the feature behind a flag. Keep main green at all times. One person demos at the end. No scope creep — park extras in issues.txt.',
    members: [
      { agent: 'a-semic', role: null, instr: 'Build /search + /checkout endpoints. Hand Pixel a typed stub on day one. Flag anything that needs a key.' },
      { agent: 'a-pete', role: null, instr: 'Own the storefront UI and the voice-search bar. Mock the API until Captain\'s endpoint lands. Match the component library.' },
      { agent: 'a-scar', role: null, instr: 'Write the test plan before code lands. Block the merge if the payment suite is red. Sign off the demo.' },
    ] },
  { id: 'polish', name: 'The Polish Patrol', color: 'mint', emblem: 'castle', captain: 'a-lint',
    blurb: 'No new features. Tidies, de-dupes and documents until it all shines.',
    instr: 'No new features. Reduce, de-dupe, document. Every change is a small focused commit. Leave the health ratings better than you found them.',
    members: [
      { agent: 'a-lint', role: null, instr: 'Sweep for dead code and style drift. Propose extractions where you see a second caller — never over-generalize.' },
      { agent: 'a-doc', role: null, instr: 'Update README + the MD file descriptions to match what shipped. Note lessons in the update\'s wiki.md.' },
      { agent: 'a-twinkle', role: null, instr: 'Tighten spacing and contrast on changed screens only. Cut any element that doesn\'t earn its place.' },
    ] },
  { id: 'engine', name: 'The Engine Room', color: 'grape', emblem: 'cogcrest', captain: 'a-baron',
    blurb: 'Branches, releases, deploys, backups. Ships calmly, rolls back calmer.',
    instr: 'Nothing ships without a rollback. Main stays green. Deploy to preview first, announce before production.',
    members: [
      { agent: 'a-baron', role: null, instr: 'Own deploys and backups. Keep a rollback ready for every release.' },
      { agent: 'a-merge', role: null, instr: 'Cut release branches, squash with grace, write the changelog.' },
    ] },
  { id: 'expedition', name: 'The Expedition', color: 'teal', emblem: 'compass', captain: 'a-prof',
    blurb: 'Maps the unknown: researches the ask, measures what matters first.',
    instr: 'No code. Bring back a crisp brief: what we learned, what to measure, what it could look like.',
    members: [
      { agent: 'a-prof', role: null, instr: 'Clarify the ask and cite sources. Hand the director one page.' },
      { agent: 'a-query', role: null, instr: 'Define the one metric that proves it worked.' },
      { agent: 'a-twinkle', role: 'Research', instr: 'Sketch two directions; cut everything that doesn\'t earn its place.' },
    ] },
];
const teamById = id => TEAMS.find(t => t.id === id);
const memberOf = (team, agentId) => team && team.members.find(m => m.agent === agentId);
const teamsOf = agentId => TEAMS.filter(t => memberOf(t, agentId));
/* the role an agent plays on a team (override or own role) */
function roleOn(team, agentId) {
  const m = memberOf(team, agentId); const a = agentById(agentId);
  return (m && m.role) || (a && a.role) || null;
}

/* ---- team invariants (spec-teams §3.1): captain ∈ members, ≤6, no dupes ---- */
const TEAM_MAX = 6;
function setCaptain(team, agentId) {
  if (!memberOf(team, agentId)) return false;
  team.captain = agentId; return true;
}
function addMember(team, agentId, role = null, instr = '') {
  if (memberOf(team, agentId) || team.members.length >= TEAM_MAX || !agentById(agentId)) return false;
  team.members.push({ agent: agentId, role, instr });
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
