/* ============================================================
   data-office.js — Aurora's live workspace state (spec-office §7).
   Owned by the Office builder from here on; Foundation seeds believable data.
   Public: WS, THEME_OFFICE (placeholder art + anchors), SIM_SCRIPT (Act 1
           skeleton), wsAgent(id), wsTeamTokens(), wsProjectTokens()
   Separation: THEME = pure art + anchors · WS = state · engine = moves actors.
   Secrets: asks reference credential ids only; values never appear.
   ============================================================ */

const WS = {
  project: 'aurora', overall: 64, target: 'v1.0 launch',
  grants: { gh: true, oai: true, anthropic: true, stripe: false, figma: true, vercel: true, pg: false, resend: false },
  github: { connected: true, pushedAgo: '4 min ago', branch: 'voice-search', fresh: true },
  testUrl: 'aurora-preview.studio.app', private: true,
  checkup: { when: '2h ago', vitals: { Modular: 'B', Clean: 'A', Reuse: 'C' },
    notes: { Modular: 'A couple of modules are doing two jobs — worth splitting.', Clean: 'No lint debt, tests green. Nothing to do here.', Reuse: 'Three card components are near-duplicates — they could share one.' } },

  office: { theme: 'office', camera: 'office', thread: 'pixel', demo: { t: 0, act: 1, cursor: 0 } },

  director: { id: 'pixel', seat: 'director', pos: { x: 1380, y: 470 }, facing: 'three-quarter', pose: 'typing',
    activity: { kind: 'planning', label: 'Steering the plan', detail: 'Keeping Voice search and Checkout on track for v1.0', target: null, featureId: null, since: 0 },
    session: 'running', tokens: { total: 58000 } },

  /* per-project actors. teamId null = solo (hot desk). seat = THEME anchor id. */
  agents: [
    { id: 'a-pete', teamId: 'ship-it', seat: 'A-1', pos: { x: 190, y: 520 }, facing: 'three-quarter', pose: 'typing',
      activity: { kind: 'coding', label: 'Writing VoiceBar.tsx', detail: 'Wiring the voice bar into the header — about 70% there', target: 'VoiceBar.tsx', featureId: 'voice', since: 0 },
      session: 'running', tokens: { total: 182000, byFeature: { voice: 168000, checkout: 14000 } }, tasksDone: 9, reach: ['gh', 'figma', 'vercel'], locked: [], unread: 0 },
    { id: 'a-semic', teamId: 'ship-it', seat: 'A-2', pos: { x: 310, y: 520 }, facing: 'three-quarter', pose: 'reading',
      activity: { kind: 'reading', label: 'Reading checkout.ts', detail: 'Reading checkout.ts before adding payment intents', target: 'checkout.ts', featureId: 'checkout', since: 0 },
      session: 'running', tokens: { total: 241000, byFeature: { checkout: 196000, voice: 45000 } }, tasksDone: 11, reach: ['gh', 'pg'], locked: [], unread: 0 },
    { id: 'a-scar', teamId: 'ship-it', seat: 'A-3', pos: { x: 430, y: 520 }, facing: 'three-quarter', pose: 'thinking',
      activity: { kind: 'planning', label: 'Planning tests', detail: 'Drafting the payment test plan — 48 cases so far', target: 'refund.test.ts', featureId: 'checkout', since: 0 },
      session: 'running', tokens: { total: 96000, byFeature: { checkout: 88000, voice: 8000 } }, tasksDone: 7, reach: ['gh'], locked: ['stripe'], unread: 0 },
    { id: 'a-lint', teamId: 'polish', seat: 'B-1', pos: { x: 750, y: 520 }, facing: 'three-quarter', pose: 'reading',
      activity: { kind: 'reading', label: 'Sweeping /components', detail: 'Sweeping /components for dead code and style drift', target: 'components/', featureId: 'cleanup', since: 0 },
      session: 'running', tokens: { total: 71000, byFeature: { cleanup: 71000 } }, tasksDone: 6, reach: ['gh'], locked: [], unread: 0 },
    { id: 'a-twinkle', teamId: 'polish', seat: 'B-2', pos: { x: 870, y: 520 }, facing: 'three-quarter', pose: 'typing',
      activity: { kind: 'coding', label: 'Tidying Card.tsx', detail: 'Tightening spacing on the product cards', target: 'Card.tsx', featureId: 'cleanup', since: 0 },
      session: 'running', tokens: { total: 64000, byFeature: { cleanup: 64000 } }, tasksDone: 5, reach: ['figma'], locked: [], unread: 0 },
    { id: 'a-doc', teamId: 'polish', seat: 'B-3', pos: { x: 990, y: 520 }, facing: 'three-quarter', pose: 'chilling',
      activity: { kind: 'idle', label: 'Free', detail: 'Free! Last thing I did: the README for the cart component', target: null, featureId: null, since: 0 },
      session: 'idle', tokens: { total: 38000, byFeature: { cleanup: 38000 } }, tasksDone: 3, reach: ['gh'], locked: [], unread: 0 },
    { id: 'a-baron', teamId: null, seat: 'hot-1', pos: { x: 1100, y: 750 }, facing: 'three-quarter', pose: 'chilling',
      activity: { kind: 'idle', label: 'Free', detail: 'Feet up. Preview pipeline is green and a rollback is ready', target: null, featureId: null, since: 0 },
      session: 'idle', tokens: { total: 41000, byFeature: { voice: 23000, checkout: 18000 } }, tasksDone: 2, reach: ['vercel', 'gh'], locked: [], unread: 0 },
    { id: 'a-query', teamId: null, seat: 'couch-1', pos: { x: 120, y: 780 }, facing: 'front', pose: 'sleeping',
      activity: { kind: 'sleeping', label: 'Off shift', detail: 'Cast on Aurora, no running session', target: null, featureId: 'multicur', since: 0 },
      session: 'asleep', tokens: { total: 15000, byFeature: { multicur: 15000 } }, tasksDone: 1, reach: [], locked: ['pg'], unread: 0 },
  ],

  /* per-agent chat. msg: {id, from:'user'|agentId|'pixel'|'system', kind:'text'|'ask'|'comm'|'summary', text, at, askId?, comm?} */
  threads: {
    pixel: [
      { id: 'm1', from: 'pixel', kind: 'text', text: 'Morning! Aurora is 64% to v1.0. The Ship-It Squad is on Voice search and Checkout; the Polish Patrol is tidying cards. Anything you want me to steer?', at: 0 },
    ],
    'a-pete': [
      { id: 'm2', from: 'a-pete', kind: 'summary', text: 'Wiring the voice bar into the header — about 70% there. Mic button is in, results dropdown is next.', at: 0 },
    ],
    'a-semic': [
      { id: 'm3', from: 'system', kind: 'comm', text: 'Captain → Pixel Pete: “Stub for /search is up.”', at: 0, comm: { from: 'a-semic', to: 'a-pete', text: 'Stub for /search is up' } },
    ],
  },

  /* agent↔agent events (drive bubbles & paper passing) */
  comms: [
    { id: 'c0', at: 0, from: 'a-semic', to: 'a-pete', kind: 'shout', text: 'Stub for /search is up', artifact: null },
  ],

  /* asks waiting on the user. Act 1 pushes Scarlett's (t=21) and Twinkle's (t=62). */
  pending: [],

  checklist: [
    { id: 'k1', featureId: 'voice', text: 'Mic button in header', assignees: ['a-pete'], done: true, doneAt: 0 },
    { id: 'k2', featureId: 'voice', text: '/search stub', assignees: ['a-semic'], done: true, doneAt: 0 },
    { id: 'k3', featureId: 'voice', text: 'Wire results dropdown', assignees: ['a-pete'], done: false },
    { id: 'k4', featureId: 'checkout', text: 'Payment intents', assignees: ['a-semic'], done: false },
    { id: 'k5', featureId: 'checkout', text: 'Payment test suite', assignees: ['a-scar'], done: false },
    { id: 'k6', featureId: 'cleanup', text: 'Merge 3 card twins', assignees: ['a-lint', 'a-twinkle'], done: false },
  ],

  features: [
    { id: 'voice', name: 'Voice search', status: 'now', order: 1, pct: 72, owner: 'a-pete', star: false, blocked: false,
      description: [{ id: 'd1', text: 'A mic button in the header turns speech into a product search.' }, { id: 'd2', text: 'Results drop down live as you talk.' }, { id: 'd3', text: 'Falls back to typing with one tap.' }],
      vision: [{ id: 'v1', text: 'Finding a product feels like asking a shop assistant.' }, { id: 'v2', text: 'Works on a noisy bus — no repeat-yourself loops.' }], revisedAt: null, draft: null },
    { id: 'checkout', name: 'Checkout + payments', status: 'now', order: 2, pct: 48, owner: 'ship-it', star: false, blocked: false,
      description: [{ id: 'd1', text: 'One-page checkout with saved addresses.' }, { id: 'd2', text: 'Stripe payment intents; refunds from the order page.' }, { id: 'd3', text: 'Payment suite must be green before merge.' }],
      vision: [{ id: 'v1', text: 'Paying takes under 30 seconds.' }, { id: 'v2', text: 'No surprise fees on the last step.' }], revisedAt: null, draft: null },
    { id: 'cleanup', name: 'Cleanup pass', status: 'now', order: 3, pct: 55, owner: 'polish', star: false, blocked: false,
      description: [{ id: 'd1', text: 'Merge the three near-duplicate card components.' }, { id: 'd2', text: 'Delete dead styles left from the old grid.' }],
      vision: [{ id: 'v1', text: 'Every screen uses the same Card.' }], revisedAt: null, draft: null },
    { id: 'multicur', name: 'Multi-currency', status: 'planned', order: 1, pct: 0, owner: 'a-query', star: false, blocked: false,
      description: [{ id: 'd1', text: 'Shoppers see prices in their local currency.' }, { id: 'd2', text: 'Rates refresh hourly from the provider.' }, { id: 'd3', text: 'Crypto checkout option.' }],
      vision: [{ id: 'v1', text: 'Feels native: no “converted from USD” footnotes.' }, { id: 'v2', text: 'Checkout charges in the shown currency — no surprises.' }], revisedAt: null, draft: null },
    { id: 'recs', name: 'Recommendations', status: 'planned', order: 2, pct: 0, owner: null, star: false, blocked: false,
      description: [{ id: 'd1', text: '“You might also like” on product pages.' }], vision: [{ id: 'v1', text: 'Helpful, never pushy.' }], revisedAt: null, draft: null },
    { id: 'reviews', name: 'Reviews', status: 'planned', order: 3, pct: 0, owner: null, star: false, blocked: false,
      description: [{ id: 'd1', text: 'Verified-buyer reviews with photos.' }], vision: [{ id: 'v1', text: 'Trustworthy at a glance.' }], revisedAt: null, draft: null },
    { id: 'receipts', name: 'Email receipts', status: 'planned', order: 4, pct: 0, owner: null, star: false, blocked: false,
      description: [{ id: 'd1', text: 'A tidy receipt email after every order (via Resend).' }], vision: [{ id: 'v1', text: 'Looks like the store, not a bank statement.' }], revisedAt: null, draft: null },
    ...[['grid', 'Product grid', true], ['cart', 'Cart', true], ['filters', 'Search filters'], ['auth', 'Auth / login'], ['cdn', 'Image CDN'], ['wishlist', 'Wishlist'], ['orders', 'Order history']]
      .map(([id, name, star], i) => ({ id, name, status: 'shipped', order: i + 1, pct: 100, owner: null, star: !!star, blocked: false,
        description: [{ id: 'd1', text: `${name} is live for every shopper.` }], vision: [{ id: 'v1', text: 'Quiet, fast, obvious.' }], revisedAt: null, draft: null })),
  ],
};

const wsAgent = id => (id === 'pixel' || id === 'director') ? WS.director : WS.agents.find(a => a.id === id);
/* derived, never stored */
function wsTeamTokens() {
  const out = {};
  WS.agents.forEach(a => { const k = a.teamId || 'solo'; out[k] = (out[k] || 0) + a.tokens.total; });
  out.pixel = WS.director.tokens.total;
  return out;
}
function wsProjectTokens() { return WS.agents.reduce((s, a) => s + a.tokens.total, 0) + WS.director.tokens.total; }

/* Theme — swappable art + anchors. Logic references anchor ids only.
   art() is a placeholder; the Office builder replaces it. */
const THEME_OFFICE = {
  id: 'office', viewBox: [1600, 900], floorY: [380, 900],
  art() {
    return `<svg viewBox="0 0 1600 900" aria-hidden="true"><rect width="1600" height="380" fill="#3a2a6e"/><rect y="380" width="1600" height="520" fill="#2e2156"/>
      <rect x="250" y="60" width="510" height="240" rx="12" fill="#fff6e9" opacity=".9"/></svg>`;
  },
  objects: { whiteboard: { x: 250, y: 60, w: 510, h: 240 }, dossier: { x: 700, y: 60, w: 60, h: 70 },
    poster: { x: 790, y: 110, w: 80, h: 110 }, clock: { x: 960, y: 90, r: 28 },
    outbox: { x: 1100, y: 340 }, printer: { x: 840, y: 330 }, door: { x: 110, y: 360 },
    console: { x: 1120, y: 600 }, coffee: { x: 330, y: 700 } },
  pods: [
    { id: 'A', rug: { x: 120, y: 450, w: 520, h: 140 }, pennant: { x: 380, y: 420 },
      seats: [{ x: 190, y: 520 }, { x: 310, y: 520 }, { x: 430, y: 520 }, { x: 550, y: 520 }], perches: [{ x: 610, y: 540 }, { x: 650, y: 540 }] },
    { id: 'B', rug: { x: 680, y: 450, w: 520, h: 140 }, pennant: { x: 940, y: 420 },
      seats: [{ x: 750, y: 520 }, { x: 870, y: 520 }, { x: 990, y: 520 }, { x: 1110, y: 520 }], perches: [{ x: 1170, y: 540 }, { x: 1210, y: 540 }] },
    { id: 'C', rug: { x: 460, y: 680, w: 520, h: 140 }, pennant: { x: 720, y: 650 },
      seats: [{ x: 530, y: 750 }, { x: 650, y: 750 }, { x: 770, y: 750 }, { x: 890, y: 750 }], perches: [{ x: 950, y: 770 }, { x: 990, y: 770 }] },
  ],
  hotDesks: [{ x: 1100, y: 750 }, { x: 1220, y: 750 }, { x: 1340, y: 750 }, { x: 1460, y: 750 }],
  couch: [{ x: 120, y: 780 }, { x: 210, y: 780 }, { x: 300, y: 780 }], beanbags: [{ x: 380, y: 820 }, { x: 430, y: 840 }],
  director: { x: 1380, y: 470 }, lanes: { front: 640, back: 420 },
  /* actor depth scale (spec-office §1.1) */
  depth: y => 0.82 + 0.36 * (y - 380) / 520,
};

/* Act 1 — the ~64s story (spec-office §6). Skeleton the engine interprets. */
const SIM_SCRIPT = [
  { t: 0, do: 'open' },
  { t: 3, actor: 'a-pete', do: 'commit', n: 2 },
  { t: 6, actor: 'a-semic', do: 'activity', kind: 'coding', label: 'Writing intents.ts', target: 'intents.ts' },
  { t: 8, actor: 'a-lint', do: 'talk', to: 'a-twinkle', lines: ['These 3 cards are twins.', 'Merge them into <Card>!', 'On it.'] },
  { t: 13, actor: 'a-semic', do: 'handoff', to: 'a-scar', artifact: 'PR #41' },
  { t: 15, actor: 'a-scar', do: 'activity', kind: 'testing', label: 'Running 48 tests' },
  { t: 17, actor: 'a-scar', do: 'tests', result: 'red', failing: 2, shout: { to: 'a-semic', text: '2 fails in refund.test' } },
  { t: 21, actor: 'a-scar', do: 'ask', ask: { id: 'ask-scar', agentId: 'a-scar', team: 'ship-it', type: 'access', want: 'stripe',
    q: 'I need the Stripe <b>test</b> key to run the payment suite. Without it I can\'t verify checkout.', ctx: 'Blocking: Checkout + payments · 48%' } },
  { t: 25, actor: 'a-doc', do: 'clockOff', say: 'Nothing to write till Voice ships' },
  { t: 29, actor: 'a-twinkle', do: 'tests', result: 'green', check: 'k6' },
  { t: 33, actor: 'a-pete', do: 'tests', result: 'green', feature: 'voice', pct: 100 },
  { t: 35, actor: 'pixel', do: 'talk', to: 'a-baron', lines: ['Preview it.'] },
  { t: 36, actor: 'a-baron', do: 'deploy' },
  { t: 39, do: 'ship', feature: 'voice' },
  { t: 46, actor: 'pixel', do: 'whiteboard', addCheck: { featureId: 'multicur', text: 'Multi-currency: rate provider', assignees: ['a-query'] } },
  { t: 48, actor: 'a-merge', do: 'arrive', seat: 'hot-3', activity: { kind: 'reading', label: 'Reading release notes' } },
  { t: 52, actor: 'pixel', do: 'wake', target: 'a-query', then: { seat: 'hot-2', kind: 'reading', label: 'Reading rates API docs' } },
  { t: 58, actor: 'a-lint', do: 'handoff', to: 'a-merge', artifact: 'PR #42', review: 'APPROVED' },
  { t: 62, actor: 'a-twinkle', do: 'ask', ask: { id: 'ask-twinkle', agentId: 'a-twinkle', team: 'polish', type: 'decision',
    q: 'Cart button copy — which reads better?', ctx: 'Blocking: nothing — a quick call', options: ['Add to bag', 'Add to cart'] } },
];
