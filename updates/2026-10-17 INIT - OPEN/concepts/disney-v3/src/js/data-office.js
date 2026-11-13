/* ============================================================
   data-office.js — Aurora's live workspace state (spec-office §7).
   Public: WS, THEME_OFFICE (anchors only — art lives in office-theme.js),
           SIM_SCRIPT (Act 1), SIM_AMBIENT (Act 2 material),
           wsAgent(id), wsOnProject(), wsTeamTokens(), wsProjectTokens(),
           wsFeature(id), wsTeamIds(), wsTok(n)
   Separation: THEME = anchors (+ art in office-theme.js) · WS = state ·
               engine = moves actors. Logic only references anchor ids.
   Secrets: asks reference credential ids only; values never appear.
   ============================================================ */

const WS = {
  project: 'aurora', overall: 64, target: 'v1.0',
  grants: { gh: true, oai: true, anthropic: true, stripe: false, figma: true, vercel: true, pg: false, resend: false },
  github: { connected: true, pushedAgo: '4 min ago', branch: 'voice-search', fresh: true },
  testUrl: 'aurora-preview.studio.app', testFresh: 'deployed 1h ago', private: true,
  checkup: { when: '2h ago', vitals: { Modular: 'B', Clean: 'A', Reuse: 'C' },
    notes: { Modular: 'A couple of modules are doing two jobs — worth splitting.', Clean: 'No lint debt, tests green. Nothing to do here.', Reuse: 'Three card components are near-duplicates — they could share one.' } },

  office: { theme: 'office', camera: 'office', thread: 'pixel', demo: { t: 0, act: 1, cursor: 0 } },

  director: { id: 'pixel', seat: 'director', at: 'director', onProject: true,
    activity: { kind: 'planning', label: 'Big picture', detail: 'Keeping Voice search and Checkout on track for v1.0', target: null, featureId: null },
    session: 'running', tokens: { total: 58000 }, tasksDone: 0 },

  /* per-project actors. teamId null = solo (hot desk). seat = home desk anchor
     (null = none yet), at = where they are now. onProject false = not arrived. */
  agents: [
    { id: 'a-pete', teamId: 'ship-it', seat: 'A-1', at: 'A-1', onProject: true,
      activity: { kind: 'coding', label: 'Writing VoiceBar.tsx', detail: 'Wiring the voice bar into the header — about 70% there', target: 'VoiceBar.tsx', featureId: 'voice' },
      session: 'running', tokens: { total: 182000, byFeature: { voice: 168000, checkout: 14000 } }, tasksDone: 9, reach: ['gh', 'figma', 'vercel'], locked: [], unread: 0,
      brief: { left: 'The results dropdown and a no-mic fallback. Maybe 20 minutes.', changed: ['VoiceBar.tsx', 'Header.tsx', 'useSpeech.ts'] } },
    { id: 'a-semic', teamId: 'ship-it', seat: 'A-2', at: 'A-2', onProject: true,
      activity: { kind: 'reading', label: 'Reading checkout.ts', detail: 'Reading checkout.ts before adding payment intents', target: 'checkout.ts', featureId: 'checkout' },
      session: 'running', tokens: { total: 241000, byFeature: { checkout: 196000, voice: 45000 } }, tasksDone: 11, reach: ['gh', 'pg'], locked: [], unread: 0,
      brief: { left: 'Payment intents, then refunds. Scarlett\'s suite decides when it\'s done.', changed: ['checkout.ts', 'intents.ts', 'search.ts'] } },
    { id: 'a-scar', teamId: 'ship-it', seat: 'A-3', at: 'A-3', onProject: true,
      activity: { kind: 'planning', label: 'Planning tests', detail: 'Drafting the payment test plan — 48 cases so far', target: 'refund.test.ts', featureId: 'checkout' },
      session: 'running', tokens: { total: 96000, byFeature: { checkout: 88000, voice: 8000 } }, tasksDone: 7, reach: ['gh'], locked: ['stripe'], unread: 0,
      brief: { left: 'Run the 48-case payment suite and sign off the demo.', changed: ['refund.test.ts', 'checkout.test.ts'] } },
    { id: 'a-lint', teamId: 'polish', seat: 'B-1', at: 'B-1', onProject: true,
      activity: { kind: 'reading', label: 'Sweeping /components', detail: 'Sweeping /components for dead code and style drift', target: 'components/', featureId: 'cleanup' },
      session: 'running', tokens: { total: 71000, byFeature: { cleanup: 71000 } }, tasksDone: 6, reach: ['gh'], locked: [], unread: 0,
      brief: { left: 'Two folders to sweep, then the card merge with Twinkle.', changed: ['Card.tsx', 'legacy-grid.css (deleted)'] } },
    { id: 'a-twinkle', teamId: 'polish', seat: 'B-2', at: 'B-2', onProject: true,
      activity: { kind: 'coding', label: 'Tidying Card.tsx', detail: 'Tightening spacing on the product cards', target: 'Card.tsx', featureId: 'cleanup' },
      session: 'running', tokens: { total: 64000, byFeature: { cleanup: 64000 } }, tasksDone: 5, reach: ['figma'], locked: [], unread: 0,
      brief: { left: 'Merge the three card twins into one <Card>, then contrast checks.', changed: ['Card.tsx', 'tokens.css'] } },
    { id: 'a-doc', teamId: 'polish', seat: 'B-3', at: 'B-3', onProject: true,
      activity: { kind: 'idle', label: 'Free', detail: 'Free! Last thing I did: the README for the cart component', target: null, featureId: null },
      session: 'idle', tokens: { total: 38000, byFeature: { cleanup: 38000 } }, tasksDone: 3, reach: ['gh'], locked: [], unread: 0,
      brief: { left: 'Nothing right now — docs follow what ships.', changed: ['README.md', 'cart/README.md'] } },
    { id: 'a-baron', teamId: null, seat: 'hot-1', at: 'hot-1', onProject: true,
      activity: { kind: 'idle', label: 'Free', detail: 'Feet up. Preview pipeline is green and a rollback is ready', target: null, featureId: null },
      session: 'idle', tokens: { total: 41000, byFeature: { voice: 23000, checkout: 18000 } }, tasksDone: 2, reach: ['vercel', 'gh'], locked: [], unread: 0,
      brief: { left: 'Ready to deploy a preview whenever Pixel says.', changed: ['vercel.json'] } },
    { id: 'a-query', teamId: null, seat: null, at: 'couch-1', onProject: true,
      activity: { kind: 'sleeping', label: 'Off shift', detail: 'Cast on Aurora, no running session', target: null, featureId: 'multicur' },
      session: 'asleep', tokens: { total: 15000, byFeature: { multicur: 15000 } }, tasksDone: 1, reach: [], locked: ['pg'], unread: 0,
      brief: { left: 'Rates provider research for Multi-currency.', changed: ['rates-notes.md'] } },
    { id: 'a-merge', teamId: null, seat: null, at: 'door', onProject: false,
      activity: { kind: 'arriving', label: 'Just joined', detail: 'Here to cut the release branch', target: null, featureId: 'voice' },
      session: 'running', tokens: { total: 0, byFeature: {} }, tasksDone: 0, reach: ['gh'], locked: [], unread: 0,
      brief: { left: 'Review PRs and cut the release branch.', changed: ['CHANGELOG.md'] } },
  ],

  /* per-agent chat. msg: {id, from:'user'|agentId|'pixel'|'system', kind:'text'|'ask'|'comm'|'summary'|'system', text, at, askId?, comm?, stats?} */
  threads: {
    pixel: [
      { id: 'm1', from: 'pixel', kind: 'text', text: 'Morning! Aurora is 64% to v1.0. The Ship-It Squad is on Voice search and Checkout; the Polish Patrol is tidying cards. Tap anyone in the office to hear from them — or ask me anything.', at: 0 },
    ],
    'a-semic': [
      { id: 'm3', from: 'system', kind: 'comm', text: 'Captain Semicolon → Pixel Pete: “Stub for /search is up.”', at: 0, comm: { from: 'a-semic', to: 'a-pete', text: 'Stub for /search is up' } },
    ],
  },

  comms: [{ id: 'c0', at: 0, from: 'a-semic', to: 'a-pete', kind: 'shout', text: 'Stub for /search is up', artifact: null }],

  /* asks waiting on the user. Act 1 pushes Scarlett's (t=21) and Twinkle's (t=62). */
  pending: [],

  checklist: [
    { id: 'k1', featureId: 'voice', text: 'Voice: mic button in header', assignees: ['a-pete'], done: true },
    { id: 'k2', featureId: 'voice', text: 'Voice: /search stub', assignees: ['a-semic'], done: true },
    { id: 'k3', featureId: 'voice', text: 'Voice: wire results dropdown', assignees: ['a-pete'], done: false },
    { id: 'k4', featureId: 'checkout', text: 'Checkout: payment intents', assignees: ['a-semic'], done: false },
    { id: 'k5', featureId: 'checkout', text: 'Checkout: payment test suite', assignees: ['a-scar'], done: false },
    { id: 'k6', featureId: 'cleanup', text: 'Cleanup: merge 3 card twins', assignees: ['a-lint', 'a-twinkle'], done: false },
  ],

  features: [
    { id: 'voice', name: 'Voice search', status: 'now', order: 1, pct: 72, owner: 'a-pete', star: false, blocked: false,
      description: [{ id: 'd1', text: 'A mic button in the header turns speech into a product search.' }, { id: 'd2', text: 'Results drop down live as you talk.' }, { id: 'd3', text: 'Falls back to typing with one tap.' }],
      vision: [{ id: 'v1', text: 'Finding a product feels like asking a shop assistant.' }, { id: 'v2', text: 'Works on a noisy bus — no repeat-yourself loops.' }], revisedAt: null },
    { id: 'checkout', name: 'Checkout + payments', status: 'now', order: 2, pct: 48, owner: 'ship-it', star: false, blocked: false,
      description: [{ id: 'd1', text: 'One-page checkout with saved addresses.' }, { id: 'd2', text: 'Stripe payment intents; refunds from the order page.' }, { id: 'd3', text: 'Payment suite must be green before merge.' }],
      vision: [{ id: 'v1', text: 'Paying takes under 30 seconds.' }, { id: 'v2', text: 'No surprise fees on the last step.' }], revisedAt: null },
    { id: 'cleanup', name: 'Cleanup pass', status: 'now', order: 3, pct: 55, owner: 'polish', star: false, blocked: false,
      description: [{ id: 'd1', text: 'Merge the three near-duplicate card components.' }, { id: 'd2', text: 'Delete dead styles left from the old grid.' }],
      vision: [{ id: 'v1', text: 'Every screen uses the same Card.' }], revisedAt: null },
    { id: 'multicur', name: 'Multi-currency', status: 'planned', order: 1, pct: 0, owner: 'a-query', star: false, blocked: false,
      description: [{ id: 'd1', text: 'Shoppers see prices in their local currency.' }, { id: 'd2', text: 'Rates refresh hourly from the provider.' }, { id: 'd3', text: 'Crypto checkout option.' }],
      vision: [{ id: 'v1', text: 'Feels native: no “converted from USD” footnotes.' }, { id: 'v2', text: 'Checkout charges in the shown currency — no surprises.' }], revisedAt: null },
    { id: 'recs', name: 'Recommendations', status: 'planned', order: 2, pct: 0, owner: null, star: false, blocked: false,
      description: [{ id: 'd1', text: '“You might also like” on product pages.' }], vision: [{ id: 'v1', text: 'Helpful, never pushy.' }], revisedAt: null },
    { id: 'reviews', name: 'Reviews', status: 'planned', order: 3, pct: 0, owner: null, star: false, blocked: false,
      description: [{ id: 'd1', text: 'Verified-buyer reviews with photos.' }], vision: [{ id: 'v1', text: 'Trustworthy at a glance.' }], revisedAt: null },
    { id: 'receipts', name: 'Email receipts', status: 'planned', order: 4, pct: 0, owner: null, star: false, blocked: false,
      description: [{ id: 'd1', text: 'A tidy receipt email after every order (via Resend).' }], vision: [{ id: 'v1', text: 'Looks like the store, not a bank statement.' }], revisedAt: null },
    ...[['grid', 'Product grid', true], ['cart', 'Cart', true], ['filters', 'Search filters'], ['auth', 'Auth / login'], ['cdn', 'Image CDN'], ['wishlist', 'Wishlist'], ['orders', 'Order history']]
      .map(([id, name, star], i) => ({ id, name, status: 'shipped', order: i + 1, pct: 100, owner: null, star: !!star, blocked: false,
        description: [{ id: 'd1', text: `${name} is live for every shopper.` }], vision: [{ id: 'v1', text: 'Quiet, fast, obvious.' }], revisedAt: null })),
  ],
};

const wsAgent = id => (id === 'pixel' || id === 'director') ? WS.director : WS.agents.find(a => a.id === id);
const wsOnProject = () => WS.agents.filter(a => a.onProject);
const wsFeature = id => WS.features.find(f => f.id === id);
/* teams present on the project, in roster order → pods A, B, C */
function wsTeamIds() { const ids = []; wsOnProject().forEach(a => { if (a.teamId && !ids.includes(a.teamId)) ids.push(a.teamId); }); return ids.slice(0, 3); }
/* derived, never stored */
function wsTeamTokens() {
  const out = {};
  wsOnProject().forEach(a => { const k = a.teamId || 'solo'; out[k] = (out[k] || 0) + a.tokens.total; });
  out.pixel = WS.director.tokens.total;
  return out;
}
function wsProjectTokens() { return wsOnProject().reduce((s, a) => s + a.tokens.total, 0) + WS.director.tokens.total; }
function wsTok(n) { return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/0$/, '') + 'M' : Math.round(n / 1000) + 'k'; }

/* ---------- Theme anchors (stage units, viewBox 1600×900; floor y 380→900) ----------
   Art is attached by office-theme.js (THEME_OFFICE.art etc.). The engine only
   ever asks for anchors by id. */
const THEME_OFFICE = {
  id: 'office', viewBox: [1600, 900], floorY: [380, 900],
  /* clickable wall/floor objects: hit boxes + where an agent stands to use them */
  objects: {
    whiteboard: { x: 240, y: 48, w: 520, h: 256, stand: { x: 505, y: 412 }, label: 'Whiteboard' },
    dossier: { x: 690, y: 30, w: 74, h: 104, label: 'Features' },
    poster: { x: 786, y: 96, w: 92, h: 128, label: 'Checkup' },
    clock: { x: 924, y: 58, w: 76, h: 104, label: 'Progress' },
    printer: { x: 796, y: 286, w: 94, h: 112, stand: { x: 842, y: 418 }, label: 'Printer' },
    outbox: { x: 904, y: 262, w: 66, h: 92, stand: { x: 936, y: 414 }, label: 'Outbox' },
    console: { x: 1078, y: 318, w: 72, h: 96, stand: { x: 1040, y: 424 }, label: 'Launch button' },
    door: { x: 26, y: 136, w: 136, h: 250, stand: { x: 96, y: 410 }, label: 'Door' },
    coffee: { x: 392, y: 612, w: 84, h: 104, stand: { x: 432, y: 716 }, label: 'Coffee' },
  },
  pods: [
    { id: 'A', rug: { x: 96, y: 452, w: 512, h: 146 }, flag: { x: 614, y: 590 },
      seats: [{ x: 172, y: 528 }, { x: 292, y: 528 }, { x: 412, y: 528 }, { x: 532, y: 528 }] },
    { id: 'B', rug: { x: 672, y: 452, w: 512, h: 146 }, flag: { x: 1186, y: 590 },
      seats: [{ x: 748, y: 528 }, { x: 868, y: 528 }, { x: 988, y: 528 }, { x: 1108, y: 528 }] },
    { id: 'C', rug: { x: 500, y: 690, w: 512, h: 146 }, flag: { x: 1018, y: 828 },
      seats: [{ x: 576, y: 766 }, { x: 696, y: 766 }, { x: 816, y: 766 }, { x: 936, y: 766 }] },
  ],
  hotDesks: [{ x: 1096, y: 770 }, { x: 1216, y: 770 }, { x: 1336, y: 770 }, { x: 1456, y: 770 }],
  hotRug: { x: 1030, y: 700, w: 500, h: 140 },
  couch: [{ x: 116, y: 800 }, { x: 280, y: 800 }, { x: 196, y: 806 }],
  beanbags: [{ x: 660, y: 838 }, { x: 760, y: 846 }],
  director: { x: 1392, y: 512 },
  lanes: { back: 422, front: 652 },
  gaps: [56, 650, 1206],                 /* x columns where walkers cross between back and front */
  window: { x: 1012, y: 104, w: 160, h: 150 },
  /* actor depth scale (spec-office §1.1) */
  depth: y => 0.82 + 0.36 * (y - 380) / 520,
};

/* ---------- Act 1 — the ~64s story (spec-office §6) ----------
   The engine/sim interprets each beat; `t` in seconds from opening. */
const SIM_SCRIPT = [
  { t: 0, do: 'open' },
  { t: 3, actor: 'a-pete', do: 'commit', n: 2 },
  { t: 6, actor: 'a-semic', do: 'activity', kind: 'coding', label: 'Writing intents.ts', detail: 'Adding Stripe payment intents to /checkout', target: 'intents.ts' },
  { t: 8, actor: 'a-lint', do: 'talk', to: 'a-twinkle', lines: ['These 3 cards are twins.', 'Merge them into `<Card>`!', 'On it.'] },
  { t: 13, actor: 'a-semic', do: 'handoff', to: 'a-scar', artifact: 'PR #41' },
  { t: 17, actor: 'a-scar', do: 'tests', result: 'red', failing: 2, shout: { to: 'a-semic', text: '2 fails in `refund.test`' } },
  { t: 21, actor: 'a-semic', do: 'commit', n: 1, shout: { to: 'a-scar', text: 'Fixed — retry?' } },
  { t: 23, actor: 'a-scar', do: 'ask', ask: { id: 'ask-scar', agentId: 'a-scar', type: 'access', want: 'stripe', short: 'Stripe test key',
    q: 'I need the Stripe <b>test</b> key to run the payment suite. Without it I can\'t verify checkout.', ctx: 'Blocking: Checkout + payments · 48%', featureId: 'checkout' } },
  { t: 26, actor: 'a-doc', do: 'clockOff', say: 'Nothing to write till Voice ships…' },
  { t: 30, actor: 'a-twinkle', do: 'tests', result: 'green', check: 'k6' },
  { t: 34, actor: 'a-pete', do: 'tests', result: 'green', check: 'k3', feature: 'voice', pct: 100 },
  { t: 37, actor: 'pixel', do: 'talk', to: 'a-baron', lines: ['Voice is green. Preview it?', 'Rollback’s ready. Launching.'] },
  { t: 41, actor: 'a-baron', do: 'deploy' },
  { t: 46, do: 'ship', feature: 'voice', actor: 'a-pete' },
  { t: 52, actor: 'pixel', do: 'whiteboard', addCheck: { featureId: 'multicur', text: 'Multi-currency: rate provider', assignees: ['a-query'] } },
  { t: 55, actor: 'a-merge', do: 'arrive', seat: 'hot-3', kind: 'reading', label: 'Reading release notes', target: 'CHANGELOG.md' },
  { t: 59, actor: 'pixel', do: 'wake', target: 'a-query', seat: 'hot-2', kind: 'reading', label: 'Reading rates API docs', file: 'rates API docs' },
  { t: 67, actor: 'a-lint', do: 'handoff', to: 'a-merge', artifact: 'PR #42', review: 'APPROVED' },
  { t: 74, actor: 'a-twinkle', do: 'ask', ask: { id: 'ask-twinkle', agentId: 'a-twinkle', type: 'decision', short: 'Cart button copy',
    q: 'Cart button copy — which reads better?', ctx: 'Not blocking — a quick call', options: ['Add to bag', 'Add to cart'], featureId: 'cleanup' } },
];
const SIM_ACT1_END = 78;

/* ---------- Act 2 — ambient loop material (24s cycle) ---------- */
const SIM_AMBIENT = {
  cycle: 24,
  talks: [
    ['Is `<Card>` safe to reuse?', 'Yes — v2 props only.'],
    ['Copy says “bag”, ok?', 'Bag it is.'],
    ['Stub for /search is up', 'Thanks, wiring it now.'],
    ['Who owns refunds?', 'Captain does.'],
    ['Lint is screaming again', 'Only at the old grid.'],
    ['Coffee?', 'After this test run.'],
    ['Need a review on #43', 'Looking in five.'],
    ['Contrast ok on dark?', '4.8:1 — we’re good.'],
  ],
  files: { coding: ['PriceTag.tsx', 'useCart.ts', 'Results.tsx', 'refund.ts', 'Card.tsx', 'tokens.css'], reading: ['orders.ts', 'README.md', 'stripe docs', 'Card.tsx', 'schema.sql'] },
};
