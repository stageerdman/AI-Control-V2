/* ============================================================
   data-office.js — the workspace's live state (spec-office §7), built from a
   small declarative OFFICE CONFIG (spec-office-config.md).
   Public: OFFICE_CONFIGS, OFFICE_CONFIG (the one in use), WS, THEME_OFFICE,
           SIM_SCRIPT (Act 1, Aurora only), SIM_AMBIENT (Act 2 material),
           wsAgent(id), wsOnProject(), wsFeature(id), wsTeamIds(), wsCaptain(teamId),
           wsTok(n), wsDemoSize(),
           wsAg(id)        the roster entry behind an office actor ('pixel' = the
                           project's orchestrator, PROJECTS[i].orchestrator → a-pixel)
           wsPagerOffices() the pager: offices that need you, minus visited asks (PAGER.seen)
           wsPagerVisited(projectId) you went there and left — its asks are seen
           wsUse(projectId) swap WS to that project's office (Aurora demo, or a fresh
                           office built from PROJECTS[i].office); state kept per project
   Separation: config = who sits where (layout derives the floor plan) ·
               WS = state · engine moves actors · theme draws.
   Secrets: asks reference credential ids only; values never appear.
   ============================================================ */

/* ---------- configs: what an AI writes when it sets up a project ---------- */
const OFFICE_CONFIGS = {
  /* the Aurora story (default, ?demo=size6) */
  size6: {
    project: 'aurora', director: 'pixel',
    teams: [
      { id: 'ship-it', members: ['a-pete', 'a-semic', 'a-scar'] },
      { id: 'polish', members: ['a-lint', 'a-twinkle', 'a-doc'] },
    ],
    solo: ['a-baron', 'a-query', 'a-merge'],
    spare: 1,                    /* one free desk: where the Agent Creator assembles a new bot */
  },
  size2: {
    project: 'aurora', director: 'pixel',
    teams: [{ id: 'ship-it', members: ['a-pete', 'a-semic'] }],
    solo: [],
  },
  size12: {
    project: 'aurora', director: 'pixel',
    teams: [
      { id: 'ship-it', members: ['a-pete', 'a-semic', 'a-scar'] },
      { id: 'polish', members: ['a-lint', 'a-twinkle', 'a-doc'] },
      { id: 'engine', members: ['a-baron', 'a-merge', 'gen:1'] },
    ],
    solo: ['a-query', 'a-prof', 'gen:2'],
  },
  size20: {
    project: 'aurora', director: 'pixel',
    teams: [
      { id: 'ship-it', members: ['a-pete', 'a-semic', 'a-scar', 'gen:1'] },
      { id: 'polish', members: ['a-lint', 'a-twinkle', 'a-doc'] },
      { id: 'engine', members: ['a-baron', 'a-merge', 'gen:2'] },
      { id: 'expedition', members: ['a-prof', 'a-query', 'gen:3', 'gen:4'] },
      { id: 'night-shift', name: 'The Night Shift', color: 'coral', emblem: 'lantern', members: ['gen:5', 'gen:6', 'gen:7', 'gen:8'] },
    ],
    solo: ['gen:9', 'gen:10'],
  },
};
function wsDemoSize() { const m = /[?&]demo=[^&#]*?size(\d+)/.exec(location.search); return m && OFFICE_CONFIGS['size' + m[1]] ? 'size' + m[1] : 'size6'; }

/* generated extras for the bigger demos: real roster entries so every screen can draw them */
function _wsGen(i) {
  const id = 'g-' + i;
  if (!agentById(id)) {
    const base = AGENTS[i % 10]; const name = FUNNY_NAMES[(i - 1) % FUNNY_NAMES.length];
    AGENTS.push({ id, name, nick: name.split(' ').slice(-1)[0], role: ROLES[(i * 3) % ROLES.length], hue: HUES[(i * 2 + 1) % HUES.length],
      build: base.build, hair: base.hair, accessory: base.accessory, stats: { projects: 1, tokens: 0 }, prompt: '' });
  }
  return id;
}
/* resolve 'gen:N' ids and inline team definitions into the roster */
function _wsResolve(cfg) {
  const res = id => { const m = /^gen:(\d+)$/.exec(id); return m ? _wsGen(+m[1]) : id; };
  const teams = cfg.teams.map(t => {
    const members = t.members.map(res);
    if (!teamById(t.id)) TEAMS.push({ id: t.id, name: t.name || t.id, color: t.color || 'grape', emblem: t.emblem || 'starship', captain: members[0], blurb: '', instr: '', code: '', members: members.map(agent => ({ agent, instr: '' })) });
    return { id: t.id, members, captain: t.captain };
  });
  return Object.assign({}, cfg, { teams, solo: (cfg.solo || []).map(res) });
}

const OFFICE_CONFIG = _wsResolve(OFFICE_CONFIGS[wsDemoSize()]);

/* ---------- Aurora's story state (per agent; anything not here gets a calm default) ---------- */
const _AURORA = {
  'a-pete': { activity: { kind: 'coding', label: 'Writing VoiceBar.tsx', detail: 'Wiring the voice bar into the header — about 70% there', target: 'VoiceBar.tsx', featureId: 'voice' },
    tokens: 182000, tasksDone: 9, reach: ['gh', 'figma', 'vercel'],
    brief: { left: 'The results dropdown and a no-mic fallback. Maybe 20 minutes.', changed: ['VoiceBar.tsx', 'Header.tsx', 'useSpeech.ts'] } },
  'a-semic': { activity: { kind: 'reading', label: 'Reading checkout.ts', detail: 'Reading checkout.ts before adding payment intents', target: 'checkout.ts', featureId: 'checkout' },
    tokens: 241000, tasksDone: 11, reach: ['gh', 'pg'],
    brief: { left: 'Payment intents, then refunds. Scarlett\'s suite decides when it\'s done.', changed: ['checkout.ts', 'intents.ts', 'search.ts'] } },
  'a-scar': { activity: { kind: 'planning', label: 'Planning tests', detail: 'Drafting the payment test plan — 48 cases so far', target: 'refund.test.ts', featureId: 'checkout' },
    tokens: 96000, tasksDone: 7, reach: ['gh'], locked: ['stripe'],
    brief: { left: 'Run the 48-case payment suite and sign off the demo.', changed: ['refund.test.ts', 'checkout.test.ts'] } },
  'a-lint': { activity: { kind: 'reading', label: 'Sweeping /components', detail: 'Sweeping /components for dead code and style drift', target: 'components/', featureId: 'cleanup' },
    tokens: 71000, tasksDone: 6, reach: ['gh'],
    brief: { left: 'Two folders to sweep, then the card merge with Twinkle.', changed: ['Card.tsx', 'legacy-grid.css (deleted)'] } },
  'a-twinkle': { activity: { kind: 'coding', label: 'Tidying Card.tsx', detail: 'Tightening spacing on the product cards', target: 'Card.tsx', featureId: 'cleanup' },
    tokens: 64000, tasksDone: 5, reach: ['figma'],
    brief: { left: 'Merge the three card twins into one <Card>, then contrast checks.', changed: ['Card.tsx', 'tokens.css'] } },
  'a-doc': { activity: { kind: 'idle', label: 'Free', detail: 'Free! Last thing I did: the README for the cart component', target: null, featureId: null },
    tokens: 38000, tasksDone: 3, reach: ['gh'],
    brief: { left: 'Nothing right now — docs follow what ships.', changed: ['README.md', 'cart/README.md'] } },
  'a-baron': { activity: { kind: 'idle', label: 'Free', detail: 'Feet up. Preview pipeline is green and a rollback is ready', target: null, featureId: null },
    tokens: 41000, tasksDone: 2, reach: ['vercel', 'gh'],
    brief: { left: 'Ready to ship a fresh local build whenever the Director says.', changed: ['vercel.json'] } },
  'a-query': { seat: null, at: 'couch-1', activity: { kind: 'sleeping', label: 'Off shift', detail: 'Cast on Aurora, no running session', target: null, featureId: 'multicur' },
    tokens: 15000, tasksDone: 1, reach: [], locked: ['pg'],
    brief: { left: 'Rates provider research for Multi-currency.', changed: ['rates-notes.md'] } },
  'a-merge': { seat: null, at: 'door', onProject: false, activity: { kind: 'arriving', label: 'Just joined', detail: 'Here to cut the release branch', target: null, featureId: 'voice' },
    tokens: 0, tasksDone: 0, reach: ['gh'],
    brief: { left: 'Review PRs and cut the release branch.', changed: ['CHANGELOG.md'] } },
};
/* generic demo agents: a calm spread of work (the ambient loop takes it from there) */
const _WS_DEFAULT_WORK = [
  ['coding', 'Writing PriceTag.tsx', 'PriceTag.tsx', 'voice'], ['reading', 'Reading orders.ts', 'orders.ts', 'checkout'],
  ['coding', 'Writing useCart.ts', 'useCart.ts', 'checkout'], ['planning', 'Planning the next step', null, 'cleanup'],
  ['coding', 'Writing Results.tsx', 'Results.tsx', 'voice'], ['testing', 'Running the test suite', null, 'cleanup'],
];
function _wsAgents(cfg, plan, story, fresh) {
  const out = []; let i = 0;
  const add = (id, teamId) => {
    const s = (story && story[id]) || (fresh ? { activity: { kind: 'reading', label: 'Reading the brief', detail: 'Reading the project brief and CLAUDE.md', target: 'CLAUDE.md', featureId: null },
      tokens: 0, tasksDone: 0, reach: ['gh'], brief: { left: 'Getting to know the codebase, then whatever the Director plans first.', changed: [] } } : {});
    const w = _WS_DEFAULT_WORK[i++ % _WS_DEFAULT_WORK.length];
    const home = plan.home[id];
    out.push({
      id, teamId, home, seat: 'seat' in s ? s.seat : home, at: s.at || home, onProject: s.onProject !== false,
      activity: s.activity || { kind: w[0], label: w[1], detail: w[1], target: w[2], featureId: w[3] },
      session: s.activity ? ({ sleeping: 'asleep', idle: 'idle' }[s.activity.kind] || 'running') : 'running',
      tokens: { total: s.tokens != null ? s.tokens : 20000 + (i * 37000) % 160000 }, tasksDone: s.tasksDone != null ? s.tasksDone : 1 + i % 6,
      reach: s.reach || ['gh'], locked: s.locked || [], unread: 0,
      brief: s.brief || { left: 'Finishing ' + (w[2] || 'this task') + ', then whatever the Director hands me.', changed: w[2] ? [w[2]] : [] },
    });
  };
  cfg.teams.forEach(t => t.members.forEach(id => add(id, t.id)));
  cfg.solo.forEach(id => add(id, null));
  /* the Agent Creator: a studio visitor, never on the project — comes in through the door when needed */
  out.push({ id: 'a-creator', teamId: null, home: null, seat: null, at: 'door', onProject: false, visitor: true,
    activity: { kind: 'idle', label: 'Agent Creator', detail: 'Designs new agents when the Director needs one', target: null, featureId: null },
    session: 'idle', tokens: { total: 0 }, tasksDone: 0, reach: [], locked: [], unread: 0, brief: { left: '', changed: [] } });
  return out;
}

const OFFICE_PLAN = officeLayout(OFFICE_CONFIG);

/* ---------- the Director = this project's chosen orchestrator (contract v5) ----------
   Actor id stays 'pixel' inside the office; the agent behind it comes from
   PROJECTS[i].orchestrator. Falls back to Pixel (a-pixel / legacy DIRECTOR). */
const _WS_LOCAL_AG = {};   /* stand-ins when a roster entry hasn't landed yet */
function wsDirectorAg() {
  const p = projById((typeof OM !== 'undefined' && OM.project) || OFFICE_CONFIG.project) || {};
  const demo = /[?&]demo=[^&#]*?orch(\d)/.exec(location.search);
  if (demo && typeof orchestrators === 'function') { const o = orchestrators()[+demo[1] - 1]; if (o) return o; }
  return (p.orchestrator && agentById(p.orchestrator)) || agentById('a-pixel') || agentById('director');
}
/* the Agent Creator stand-in until the shared roster has a-creator (contract v5) */
function _wsCreatorStandIn() {
  if (agentById('a-creator') || _WS_LOCAL_AG['a-creator']) return;
  const base = agentById('a-prof') || AGENTS[0];
  _WS_LOCAL_AG['a-creator'] = Object.assign({}, base, { id: 'a-creator', name: 'Agent Creator', nick: 'Creator', role: 'Agent Creator', kind: 'creator', hue: 'grape' });
}
function wsAg(id) {
  if (id === 'pixel' || id === 'director') return wsDirectorAg();
  return agentById(id) || _WS_LOCAL_AG[id];
}
/* a role is a user-defined label now (contract v5): id → name, or a free name */
function wsRole(ag) {
  if (!ag) return '';
  if (ag.kind === 'orchestrator' || ag.id === 'director') return 'Orchestrator';
  if (typeof roleName === 'function') { try { const n = roleName(ag.role); if (n) return n; } catch (e) { } }
  const r = Array.isArray(typeof ROLES !== 'undefined' ? ROLES : null) ? ROLES.find(x => x && typeof x === 'object' && x.id === ag.role) : null;
  return r ? r.name : (typeof ag.role === 'string' ? ag.role : '');
}
/* GitHub + how the app runs: from the project (contract), with calm defaults */
function _wsGithub(projectId) {
  const g = (projById(projectId || OFFICE_CONFIG.project) || {}).github;
  const o = typeof g === 'object' && g ? g : { connected: g !== false, private: true };
  return { connected: o.connected !== false, private: o.private !== false, pushedAgo: '4 min ago', branch: 'voice-search', fresh: true };
}
_wsCreatorStandIn();
const WS = {
  project: OFFICE_CONFIG.project, story: wsDemoSize() === 'size6' ? 'aurora' : 'demo',
  config: OFFICE_CONFIG, overall: 64, target: 'v1.0',
  grants: { gh: true, oai: true, anthropic: true, stripe: false, figma: true, vercel: true, pg: false, resend: false },
  github: _wsGithub(),
  /* apps run on this computer — never an online test URL */
  run: { where: '~/dev/aurora', cmd: 'npm run app', built: '1h ago' },
  /* the health board: grade + what's good + what to fix, in plain words */
  checkup: { when: '2h ago', items: [
    { key: 'modularity', name: 'Modularity', grade: 'B', good: 'Screens, data and styles live in their own modules. Most files do one job.', fix: 'checkout.ts and search.ts each do two jobs — split them so each can be fixed on its own.' },
    { key: 'cleanliness', name: 'Cleanliness', grade: 'A', good: 'No lint warnings, tests green, no dead code left behind.', fix: 'Nothing to fix. Keep it this way.' },
    { key: 'reusability', name: 'Reusability', grade: 'C', good: 'Buttons and inputs all come from one shared kit.', fix: 'Three card components are near-copies of each other. Merge them into one Card.' },
  ] },

  office: { demo: { t: 0 } },

  director: { id: 'pixel', seat: 'director', at: 'director', home: 'director', onProject: true,
    activity: { kind: 'planning', label: 'Big picture', short: 'Big picture', detail: 'Keeping Voice search and Checkout on track for v1.0', target: null, featureId: null },
    session: 'running', tokens: { total: 58000 }, tasksDone: 0 },

  /* per-project actors. teamId null = solo. home = the desk the layout gave them,
     seat = desk they use now (null = none yet), at = where they are now. */
  agents: _wsAgents(OFFICE_CONFIG, OFFICE_PLAN, wsDemoSize() === 'size6' ? _AURORA : null),

  /* per-agent chat. msg: {id, from:'user'|agentId|'pixel', kind:'text'|'ask'|'summary', text, at, askId?} */
  threads: {
    pixel: [
      { id: 'm1', from: 'pixel', kind: 'text', text: 'Morning! Aurora is 64% to v1.0. The Ship-It Squad is on Voice search and Checkout; the Polish Patrol is tidying cards. Tap anyone in the office to hear from them — or ask me anything.', at: 0 },
    ],
  },

  /* who talked to whom (kept for the record; the scene shows only "…" bubbles) */
  comms: [],

  /* asks waiting on the user. Act 1 pushes Scarlett's (t=23) and Twinkle's (t=74). */
  pending: [],

  checklist: [
    { id: 'k1', featureId: 'voice', text: 'Voice: mic button in header', assignees: ['a-pete'], done: true },
    { id: 'k2', featureId: 'voice', text: 'Voice: /search stub', assignees: ['a-semic'], done: true },
    { id: 'k3', featureId: 'voice', text: 'Voice: wire results dropdown', assignees: ['a-pete'], done: false },
    { id: 'k4', featureId: 'checkout', text: 'Checkout: payment intents', assignees: ['a-semic'], done: false },
    { id: 'k5', featureId: 'checkout', text: 'Checkout: payment test suite', assignees: ['a-scar'], done: false },
    { id: 'k6', featureId: 'cleanup', text: 'Cleanup: merge 3 card twins', assignees: ['a-lint', 'a-twinkle'], done: false },
  ],

  /* description + vision are one plain text block each */
  features: [
    { id: 'voice', name: 'Voice search', status: 'now', order: 1, pct: 72, owner: 'a-pete', blocked: false,
      description: 'A mic button in the header turns speech into a product search. Results drop down live as you talk, and it falls back to typing with one tap.',
      vision: 'Finding a product feels like asking a shop assistant. It works on a noisy bus — no repeat-yourself loops.' },
    { id: 'checkout', name: 'Checkout + payments', status: 'now', order: 2, pct: 48, owner: 'ship-it', blocked: false,
      description: 'One-page checkout with saved addresses. Stripe payment intents, with refunds from the order page. The payment suite must be green before merge.',
      vision: 'Paying takes under 30 seconds, with no surprise fees on the last step.' },
    { id: 'cleanup', name: 'Cleanup pass', status: 'now', order: 3, pct: 55, owner: 'polish', blocked: false,
      description: 'Merge the three near-duplicate card components and delete the dead styles left from the old grid.',
      vision: 'Every screen uses the same Card.' },
    { id: 'multicur', name: 'Multi-currency', status: 'planned', order: 1, pct: 0, owner: 'a-query', blocked: false,
      description: 'Shoppers see prices in their local currency. Rates refresh hourly from the provider. Crypto checkout option.',
      vision: 'Feels native — no “converted from USD” footnotes. Checkout charges in the shown currency, so there are no surprises.' },
    { id: 'recs', name: 'Recommendations', status: 'planned', order: 2, pct: 0, owner: null, blocked: false,
      description: '“You might also like” on product pages.', vision: 'Helpful, never pushy.' },
    { id: 'reviews', name: 'Reviews', status: 'planned', order: 3, pct: 0, owner: null, blocked: false,
      description: 'Verified-buyer reviews with photos.', vision: 'Trustworthy at a glance.' },
    { id: 'receipts', name: 'Email receipts', status: 'planned', order: 4, pct: 0, owner: null, blocked: false,
      description: 'A tidy receipt email after every order (via Resend).', vision: 'Looks like the store, not a bank statement.' },
    ...[['grid', 'Product grid'], ['cart', 'Cart'], ['filters', 'Search filters'], ['auth', 'Auth / login'], ['cdn', 'Image CDN'], ['wishlist', 'Wishlist'], ['orders', 'Order history']]
      .map(([id, name], i) => ({ id, name, status: 'shipped', order: i + 1, pct: 100, owner: null, blocked: false,
        description: `${name} is live for every shopper.`, vision: 'Quiet, fast, obvious.' })),
  ],
};

const wsAgent = id => (id === 'pixel' || id === 'director') ? WS.director : WS.agents.find(a => a.id === id);
/* ---------- the pager: one page per OFFICE that needs you (v6) ----------
   Sources: every office's pending asks (the one in WS + the ones kept in
   _WS_STORE), and projects with no office state yet but status 'needs'
   (their note is the ask). An ask you already went to see — you opened that
   office and left without answering — is in PAGER.seen and stays quiet; a
   NEW ask brings the office back. Entry: { projectId, asks:[{id, agentId?, short}] } */
const PAGER = { seen: {} };
const _pgKey = (pid, askId) => pid + ':' + askId;
function wsPendingFor(pid) {
  if (WS.project === pid) return WS.pending;
  const st = _WS_STORE[pid]; if (st) return st.ws.pending || [];
  const p = projById(pid);
  return p && p.status === 'needs' ? [{ id: 'needs', short: p.note || 'Needs you' }] : [];
}
function wsPagerOffices() {
  /* Aurora + offices built from a config own their asks; other projects page only via status 'needs' */
  return PROJECTS.filter(p => p.id === 'aurora' || p.office || p.status === 'needs').map(p => {
    const pid = p.id;
    const asks = wsPendingFor(pid).filter(a => !PAGER.seen[_pgKey(pid, a.id)]);
    return asks.length ? { projectId: pid, asks } : null;
  }).filter(Boolean);
}
/* you opened that office and left: everything it was asking is seen */
function wsPagerVisited(pid) { wsPendingFor(pid).forEach(a => { PAGER.seen[_pgKey(pid, a.id)] = true; }); }
const wsOnProject = () => WS.agents.filter(a => a.onProject);
const wsFeature = id => WS.features.find(f => f.id === id);
/* teams in the office, in config order */
function wsTeamIds() { return WS.config.teams.map(t => t.id); }
/* the captain on THIS project: config captain, else the team's captain if present, else first member */
function wsCaptain(teamId) {
  const t = WS.config.teams.find(x => x.id === teamId); if (!t) return null;
  const tt = teamById(teamId);
  return t.captain || (tt && t.members.includes(tt.captain) ? tt.captain : t.members[0]);
}
function wsTok(n) { return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/0$/, '') + 'M' : Math.round(n / 1000) + 'k'; }

/* ---------- theme anchors: everything comes from the plan ---------- */
const THEME_OFFICE = {
  id: 'office', plan: OFFICE_PLAN, floorY: [380, 900],
  /* actor depth scale (spec-office §1.1) */
  depth: y => 0.82 + 0.36 * (y - 380) / 520,
};

/* ---------- Act 1 — the ~78s Aurora story (spec-office §6) ----------
   Walking is rare and always purposeful: deploy, update the plan, arrive,
   wake, clock off. Talk and hand-offs happen at the desk. */
const SIM_SCRIPT = [
  { t: 0, do: 'open' },
  { t: 3, actor: 'a-pete', do: 'commit', n: 2 },
  { t: 6, actor: 'a-semic', do: 'activity', kind: 'coding', label: 'Writing intents.ts', detail: 'Adding Stripe payment intents to /checkout', target: 'intents.ts' },
  { t: 8, actor: 'a-lint', do: 'talk', to: 'a-twinkle', lines: ['These 3 cards are twins.', 'Merge them into `<Card>`!', 'On it.'] },
  { t: 13, actor: 'a-semic', do: 'handoff', to: 'a-scar', artifact: 'PR #41' },
  { t: 17, actor: 'a-scar', do: 'tests', result: 'red', failing: 2, shout: { to: 'a-semic', text: '2 fails in `refund.test`' } },
  { t: 21, actor: 'a-semic', do: 'commit', n: 1 },
  { t: 23, actor: 'a-scar', do: 'ask', ask: { id: 'ask-scar', agentId: 'a-scar', type: 'access', want: 'stripe', short: 'Stripe test key',
    q: 'I need Stripe access to run the payment suite — <b>test mode only</b>. Without it I can\'t verify checkout.', ctx: 'Blocking: Checkout + payments · 48%', featureId: 'checkout' } },
  { t: 26, actor: 'a-doc', do: 'clockOff' },
  { t: 30, actor: 'a-twinkle', do: 'tests', result: 'green', check: 'k6' },
  { t: 34, actor: 'a-pete', do: 'tests', result: 'green', check: 'k3', feature: 'voice', pct: 100 },
  { t: 37, actor: 'pixel', do: 'talk', to: 'a-baron', lines: ['Voice is green. Preview it?', 'Rollback’s ready. Launching.'] },
  { t: 41, actor: 'a-baron', do: 'deploy' },
  { t: 46, do: 'ship', feature: 'voice', actor: 'a-pete' },
  { t: 52, actor: 'pixel', do: 'whiteboard', addCheck: { featureId: 'multicur', text: 'Multi-currency: rate provider', assignees: ['a-query'] } },
  { t: 55, actor: 'a-merge', do: 'arrive', kind: 'reading', label: 'Reading release notes', target: 'CHANGELOG.md' },
  { t: 59, actor: 'pixel', do: 'wake', target: 'a-query', kind: 'reading', label: 'Reading rates API docs', file: 'rates API docs' },
  /* nobody on the cast knows currencies → the Agent Creator builds one at the free desk */
  { t: 62, actor: 'a-creator', do: 'create', id: 'a-penny', name: 'Penny Exchange', nick: 'Penny', role: 'Currency specialist', hue: 'rose', base: 'a-query',
    featureId: 'multicur', first: 'Reading the Multi-currency brief', target: 'multicur.md', left: 'Pick the rates provider with Querious, then wire prices.',
    prompt: 'You are a currency specialist. Prices, rates and rounding rules; never float maths for money.' },
  { t: 67, actor: 'a-lint', do: 'handoff', to: 'a-merge', artifact: 'PR #42', review: 'APPROVED' },
  { t: 74, actor: 'a-twinkle', do: 'ask', ask: { id: 'ask-twinkle', agentId: 'a-twinkle', type: 'decision', short: 'Cart button copy',
    q: 'Cart button copy — which reads better?', ctx: 'Not blocking — a quick call', options: ['Add to bag', 'Add to cart'], featureId: 'cleanup' } },
];
const SIM_ACT1_END = 78;

/* ---------- Act 2 — ambient loop material (30s cycle, nobody walks) ---------- */
const SIM_AMBIENT = {
  cycle: 30,
  talks: [2, 2, 3, 2],
  files: { coding: ['PriceTag.tsx', 'useCart.ts', 'Results.tsx', 'refund.ts', 'Card.tsx', 'tokens.css'], reading: ['orders.ts', 'README.md', 'stripe docs', 'Card.tsx', 'schema.sql'] },
};

/* ---------- one office per project ----------
   Aurora is the scripted demo (the state above). A project that carries its own
   office config (PROJECTS[i].office — spec-office-config.md shape, e.g. from the
   New / Adopt flow) gets a fresh, calm office built from it: its own teams and
   desks, a greeting from its orchestrator, an empty whiteboard and features
   folder, no story — just the ambient loop. Projects without a config keep
   showing the Aurora demo. Each office's state is kept while you're away. */
const _WS_STORE = {};
function wsOfficeKey(projectId) { const p = projById(projectId); return p && p.office && p.id !== 'aurora' ? p.id : 'aurora'; }
function wsUse(projectId) {
  const key = wsOfficeKey(projectId);
  if (WS.project === key) return;
  _WS_STORE[WS.project] = { ws: Object.assign({}, WS), plan: THEME_OFFICE.plan };
  const st = _WS_STORE[key] || _wsFresh(projById(key));
  Object.keys(WS).forEach(k => delete WS[k]);
  Object.assign(WS, st.ws);
  THEME_OFFICE.plan = st.plan;
}
/* The Cast can change while you're away (an agent deleted, or restored with Undo).
   Before an office is shown, park actors whose agent no longer exists and bring back
   any that were restored — never mutate the original config, so Undo round-trips. */
function wsPrune() {
  const ok = id => { const a = agentById(id); return !!a && a.id === id; };
  if (!WS._config0) WS._config0 = WS.config;
  WS._gone = WS._gone || [];
  WS._gone = WS._gone.filter(r => { if (ok(r.id)) { WS.agents.push(r); return false; } return true; });
  WS.agents = WS.agents.filter(r => { if (r.visitor || ok(r.id)) return true; WS._gone.push(r); return false; });
  const c0 = WS._config0;
  WS.config = Object.assign({}, c0, {
    teams: (c0.teams || []).map(t => Object.assign({}, t, { members: (t.members || []).filter(ok) })),
    solo: (c0.solo || []).filter(ok) });
  if (Array.isArray(WS.pending)) WS.pending = WS.pending.filter(q => !q.agentId || ok(q.agentId));
}
function _wsFresh(p) {
  const cfg = _wsResolve(Object.assign({ teams: [], solo: [] }, p.office, { project: p.id, spare: p.office.spare != null ? p.office.spare : 1 }));
  const plan = officeLayout(cfg);
  const dir = (p.orchestrator && agentById(p.orchestrator)) || agentById('a-pixel') || agentById('director');
  const nick = dir.nick || dir.name.split(' ')[0];
  const crew = cfg.teams.map(t => (teamById(t.id) || {}).name).filter(Boolean);
  const g = _wsGithub(p.id);
  const ws = {
    project: p.id, story: 'fresh', config: cfg, overall: p.pct || 0, target: 'v0.1',
    grants: { gh: true, anthropic: true },
    github: Object.assign(g, { pushedAgo: 'just now', branch: 'main', fresh: false }),
    run: { where: p.folder || '~/dev/' + p.id, cmd: 'npm run app', built: 'not yet' },
    checkup: { when: 'not yet', items: [] },
    office: { demo: { t: 0 } },
    director: { id: 'pixel', seat: 'director', at: 'director', home: 'director', onProject: true,
      activity: { kind: 'planning', label: 'Big picture', short: 'Big picture', detail: 'Planning the first update', target: null, featureId: null },
      session: 'running', tokens: { total: 0 }, tasksDone: 0 },
    agents: _wsAgents(cfg, plan, null, true),
    threads: { pixel: [{ id: 'm1', from: 'pixel', kind: 'text', at: 0,
      text: `Hi, I'm ${nick} — I'll run ${p.name}. ${crew.length ? (crew.length === 1 ? crew[0] : crew.slice(0, -1).join(', ') + ' and ' + crew.slice(-1)) + ' ' + (crew.length === 1 ? 'is' : 'are') : 'The crew is'} settling in and reading the brief. What should we build first?` }] },
    comms: [], pending: [], checklist: [], features: [],
  };
  return { ws, plan };
}

/* dev hook: ?demo=fresh adds a just-created project with its own office config
   (what the New / Adopt flow writes) → #office/kite-notes */
if (/[?&]demo=[^&#]*\bfresh\b/.test(location.search) && !projById('kite-notes')) {
  PROJECTS.unshift({ id: 'kite-notes', name: 'Kite Notes', group: 'active', status: 'live', agents: 4, pct: 0, g1: '#4ea8ff', g2: '#2fd3c3', glyph: 'quill',
    orchestrator: agentById('a-maestro') ? 'a-maestro' : 'a-pixel', github: { connected: true, private: true }, folder: '~/dev/kite-notes',
    note: 'Just set up', cast: ['a-pete', 'a-semic', 'a-twinkle'], openable: true,
    office: { project: 'kite-notes', teams: [{ id: 'ship-it', members: ['a-pete', 'a-semic', 'a-twinkle'] }], solo: ['a-doc'] } });
}
