/* ============================================================
   office-sim.js — the story that makes the office feel alive (spec-office §6).
   Act 1: SIM_SCRIPT beats (Aurora only, one-shot). Act 2: a calm 30s ambient
   loop forever. Calm rule: agents stay at their desks; talk is "…" bubbles,
   hand-offs and pushes fly as paper. Walking is rare and purposeful
   (deploy, update the plan, arrive, wake up, clock off).

   Public: OS.start(), OS.stop(), OS.replay(), OS.skipTo(t),
           OS.onAnswer(ask, answer)  consequences of answering a "!"
           OS.wake(id)               the Director brings a sleeper in
           OS.create(need)           the Agent Creator builds a new bot at a free desk
   Dev hooks (URL ?demo=…, not in UI): fast · t<sec> · ask · chat · talk ·
           ship · end · sleepy · peek · list · creator · pager · focus · safe · door · fresh · orch2 ·
           size2|size6|size12|size20 · selftest
   ============================================================ */

const OS = { timers: [], running: false, t0: 0, cycleN: 0, seed: 7, busy: {} };

OS._param = function () { const m = /[?&]demo=([^&#]+)/.exec(location.search); return m ? decodeURIComponent(m[1]).split(',') : []; };
OS.start = async function () {
  this.stop(); this.running = true; this.busy = {}; this.lock = {};
  const demo = this._param();
  OE.speed = demo.includes('fast') ? 3 : 1;
  /* coming back to the office resumes the story where it was — never replays it */
  const d = WS.office.demo;
  if (d.started) { this._settle(); if (WS.story !== 'aurora' || d.t > SIM_ACT1_END) this._ambient(); else this._schedule(d.t); return; }
  d.started = true;
  if (demo.includes('selftest') && !OS._selftested) { OS._selftested = true; setTimeout(() => officeSelftest(), 50); return; }
  if (WS.story !== 'aurora') { this.t0 = Date.now(); this._ambient(); this._hooks(demo); return; }
  let skip = 0;
  demo.forEach(x => { const m = /^t(\d+)$/.exec(x); if (m) skip = +m[1]; });
  if (demo.includes('ask') || demo.includes('chat')) skip = Math.max(skip, 25);
  if (demo.includes('talk')) skip = Math.max(skip, 8);
  if (demo.includes('ship')) skip = Math.max(skip, 47);
  if (demo.includes('creator')) skip = Math.max(skip, 61);
  if (demo.includes('pager') || demo.includes('focus')) skip = Math.max(skip, 75);
  if (demo.includes('end')) skip = Math.max(skip, SIM_ACT1_END + 1);
  if (skip) await this.skipTo(skip);
  else this._schedule(0);
  this._hooks(demo);
};
OS._hooks = function (demo) {
  if (demo.includes('chat')) setTimeout(() => OP.open('a-scar', { from: 'scene' }), 30);
  if (demo.includes('pete')) setTimeout(() => OP.open('a-pete', { from: 'scene' }), 30);
  if (demo.includes('sleepy')) setTimeout(() => OP.sleeperPoke('a-query'), 30);
  if (demo.includes('list')) setTimeout(() => _omToggleList(true), 30);
  if (demo.includes('focus')) setTimeout(() => OPG.go(0), 30);
  if (demo.includes('safe')) setTimeout(() => _omAccess(), 30);
  if (demo.includes('door')) setTimeout(() => OM.focusActor('obj:door'), 30);
  if (demo.includes('peek')) setTimeout(() => { const b = document.querySelector('.o-body[data-id="a-semic"]'); if (b) b.classList.add('peek'); }, 30);
  if (demo.includes('talk')) setTimeout(() => { const ids = wsOnProject().filter(a => a.session !== 'asleep').map(a => a.id); OE.instant = false; if (ids.length > 1) OE.converse(ids[0], ids[1], 8); }, 30);
};
OS.stop = function () {
  if (this.running && this.t0) WS.office.demo.t = Math.max(WS.office.demo.t || 0, (Date.now() - this.t0) / 1000 * OE.speed);
  this.timers.forEach(clearTimeout); this.timers = []; this.running = false;
};
/* after an interrupted visit: anyone caught mid-errand goes back to a sensible state */
OS._settle = function () {
  const transient = ['commit', 'handoff', 'talking', 'deploying', 'arriving', 'leaving', 'writing', 'shipped'];
  [WS.director, ...wsOnProject()].forEach(a => {
    if (!transient.includes(a.activity.kind)) return;
    a.at = a.seat || a.at;
    a.activity = Object.assign({}, a.activity, a.id === 'pixel' ? { kind: 'planning', short: 'Big picture' } : { kind: 'coding', short: null });
  });
};
OS.replay = function () { toast('↺ Replaying Act 1'); location.reload(); };
OS._at = function (sec, fn) { this.timers.push(setTimeout(fn, sec * 1000 / OE.speed)); };

/* schedule beats with t > from (seconds) */
OS._schedule = function (from) {
  this.t0 = Date.now() - from * 1000 / OE.speed;
  SIM_SCRIPT.filter(b => b.t >= from && !(from > 0 && b.t <= from)).forEach(b => this._at(b.t - from, () => this._run(b)));
  this._at(Math.max(0, SIM_ACT1_END - from), () => this._ambient());
};
OS.skipTo = async function (t) {
  OE.instant = true;
  for (const b of SIM_SCRIPT.filter(x => x.t <= t)) { try { await this._run(b); } catch (e) { console.error('beat failed', b.t, b.do, e && e.message); } }
  OE.instant = false;
  officeRefresh();
  WS.office.demo.t = t;
  if (t > SIM_ACT1_END) { this.t0 = Date.now() - t * 1000; this._ambient(); } else this._schedule(t);
};
/* one beat at a time per actor: a new beat waits for that actor's previous one */
OS._run = function (b) {
  const key = b.actor || '_world';
  const p = (this.lock[key] || Promise.resolve()).then(() => this._exec(b));
  this.lock[key] = p.catch(() => {});
  return p;
};
OS._exec = async function (b) {
  const h = this.H[b.do]; if (!h) return;
  if (b.actor) this.busy[b.actor] = (this.busy[b.actor] || 0) + 1;
  try { await h.call(this, b); } finally { if (b.actor) this.busy[b.actor]--; officeChanged(); }
};

/* ------------------------------------------------------------ helpers */
const _osA = id => wsAgent(id);
const _osName = id => OP._name(id);
OS._rand = function (n) { this.seed = (this.seed * 9301 + 49297) % 233280; return Math.floor(this.seed / 233280 * n); };
OS._tick = function (id, k) { const a = _osA(id); if (a) a.tokens.total += k; };
OS._restore = function (id, prev) { OE.setActivity(id, prev.kind, prev); };
OS._seat = function (id) { const a = _osA(id); return a.seat || a.at; };
OS._check = function (kid) { const k = WS.checklist.find(x => x.id === kid); if (k && !k.done) { k.done = true; k.assignees.forEach(id => { const a = _osA(id); if (a) a.tasksDone++; }); } };
OS._comm = function (from, to, kind) { WS.comms.push({ id: 'c' + WS.comms.length, at: Date.now(), from, to, kind }); };
OS._outbox = function () { const o = OE.plan.objects.outbox; return { x: o.x + 31, y: o.y + 10 }; };

/* ------------------------------------------------------------ beat handlers */
OS.H = {
  open() {
    const box = document.getElementById('oBox'); if (!box || OE.instant || reducedMotion()) return;
    box.querySelector('.o-cam').classList.add('opening');
    setTimeout(() => box.querySelector('.o-cam') && box.querySelector('.o-cam').classList.remove('opening'), 900);
  },
  activity(b) { OE.setActivity(b.actor, b.kind, b); },

  /* a push: a paper plane flies from the desk to the push box (nobody walks) */
  async commit(b) {
    const id = b.actor; await OE.free(id);
    await OE.fly('plane', OE.deskTop(id), this._outbox(), 1400);
    WS.github.fresh = true; WS.github.pushedAgo = 'just now'; _osA(id).tasksDone++; this._tick(id, 1500);
    const flag = OE.art && OE.art.querySelector('#outFlag'); if (flag && !OE.instant) { flag.classList.remove('wave'); void flag.getBBox; flag.classList.add('wave'); }
    officeChanged();
  },

  /* talk: both turn to each other and trade "…" bubbles from their seats */
  async talk(b) {
    const id = b.actor, to = b.to; await OE.free(id);
    this._comm(id, to, 'talk');
    await OE.converse(id, to, (b.lines || [1, 2]).length);
    const a = _osA(id), t = _osA(to);
    if (a) OE.setActivity(id, a.activity.kind, a.activity);
    if (t) OE.setActivity(to, t.activity.kind, t.activity);
    if (id === 'a-lint' && to === 'a-twinkle') OE.setActivity('a-lint', 'coding', { label: 'Merging card twins', detail: 'Merging the three card twins into one <Card>', target: 'Card.tsx', featureId: 'cleanup' });
  },

  /* hand-off: an envelope flies desk → desk and lands in their tray */
  async handoff(b) {
    const id = b.actor, to = b.to; await OE.free(id);
    this._comm(id, to, 'handoff');
    await OE.fly('envelope', OE.deskTop(id), OE.deskTop(to), 1300);
    const desk = OE.desks[_osA(to).seat]; if (desk) { desk.tray = 'new'; OE.deskSync(desk.id); }
    _osA(id).tasksDone++;
    await OE.free(to);
    OE.setActivity(to, 'reviewing', { short: b.artifact, detail: `Reviewing ${b.artifact}`, target: b.artifact });
    await OE.sleep(2400); this._tick(to, 3000);
    if (desk) { desk.tray = null; OE.deskSync(desk.id); }
    if (b.review) OE.react(to, 'hop');
    if (to === 'a-scar') OE.setActivity(to, 'testing', { short: '48 tests', detail: 'Running the 48-case payment suite', target: 'refund.test.ts', featureId: 'checkout' });
    else OE.setActivity(to, 'coding', { short: 'Release branch', detail: 'Cutting the release branch for v1.0', target: 'release/v1.0', featureId: 'voice' });
  },

  async tests(b) {
    const id = b.actor; await OE.free(id);
    if (_osA(id).activity.kind !== 'testing') { OE.setActivity(id, 'testing', { short: 'Running tests', detail: 'Running the test suite', featureId: _osA(id).activity.featureId }); await OE.sleep(1600); }
    this._tick(id, 2500);
    if (b.result === 'red') {
      OE.setActivity(id, 'tests-red', { short: `${b.failing} failing`, detail: `${b.failing} failing in refund.test — Captain is fixing`, featureId: 'checkout' });
      if (b.shout) { this._comm(id, b.shout.to, 'shout'); await OE.say(id, '', { to: b.shout.to }); }
      OE.setActivity(b.shout.to, 'coding', { short: 'Fixing refunds', detail: 'Fixing the 2 refund failures', target: 'refund.ts', featureId: 'checkout' });
      OE.setActivity(id, 'waiting', { short: 'on Captain', detail: 'Waiting on Captain’s refund fix', featureId: 'checkout' });
      return;
    }
    OE.setActivity(id, 'tests-green', { short: 'All green', detail: 'All tests passing', featureId: _osA(id).activity.featureId });
    if (b.check) this._check(b.check);
    if (b.feature) { const f = wsFeature(b.feature); if (f) f.pct = b.pct; }
    officeChanged();
    await OE.sleep(1600);
    if (id === 'a-pete') OE.setActivity(id, 'idle', { short: 'Voice done', detail: 'Voice search is green — waiting for the next build', featureId: 'voice' });
    else OE.setActivity(id, 'coding', { short: 'Contrast pass', detail: 'Contrast pass on the merged <Card>', target: 'Card.tsx', featureId: 'cleanup' });
  },

  async ask(b) {
    const id = b.actor; await OE.free(id);
    OE.setActivity(id, 'needs-input', { short: 'Needs you', detail: b.ask.short, featureId: b.ask.featureId });
    if (b.ask.type === 'access') { const f = wsFeature(b.ask.featureId); if (f) f.blocked = true; }
    OP.ask(Object.assign({}, b.ask));
    /* ignored for 20s → one bigger hop, once. No nagging. */
    this.timers.push(setTimeout(() => { if (WS.pending.find(p => p.id === b.ask.id)) OE.react(id, 'bighop'); }, OE.instant ? 0 : 20000));
  },

  /* nothing left to do: walk to the couch and sleep (purposeful walk #1) */
  async clockOff(b) {
    const id = b.actor; await OE.free(id);
    OE.setActivity(id, 'leaving', { short: 'Clocked off', detail: 'Session ended — heading to the couch' });
    await OE.walkTo(id, this._couch());
    OE.setActivity(id, 'sleeping', { detail: 'Cast on Aurora, no running session' });
    announce(`${_osName(id)} clocked off.`);
  },

  /* deploy: Baron walks to the deploy station on the left wall and back */
  async deploy(b) {
    const id = b.actor; await OE.free(id);
    const prev = { ..._osA(id).activity };
    const home = _osA(id).at;
    OE.setActivity(id, 'deploying', { short: 'Build', detail: 'Shipping a fresh local build', featureId: 'voice' });
    await OE.walkTo(id, 'console');
    await OE.sleep(700);
    const btn = OE.art && OE.art.querySelector('#consoleBtn'); if (btn && !OE.instant) { btn.classList.remove('press'); void btn.getBBox; btn.classList.add('press'); }
    WS.run.built = 'just now'; officeChanged();
    this._tick(id, 4000); _osA(id).tasksDone++;
    await OE.sleep(900);
    await OE.walkTo(id, home);
    this._restore(id, prev);
  },

  async ship(b) {
    const f = wsFeature(b.feature); if (!f) return;
    f.status = 'shipped'; f.pct = 100; f.order = 0;
    WS.checklist.filter(k => k.featureId === b.feature).forEach(k => this._check(k.id));
    WS.overall = Math.min(100, WS.overall + 6);
    const id = b.actor; const r = OE.actors[id];
    OE.setActivity(id, 'shipped', { short: f.name, detail: `Shipped ${f.name}!`, featureId: b.feature });
    if (r) OE.burst(r.x, r.y - 120);
    if (!OE.instant) toast(`✨ ${escapeHtml(f.name)} shipped`);
    announce(`${f.name} shipped.`);
    OP.post('pixel', { from: 'pixel', kind: 'text', text: `${f.name} is in the fresh build 🎉 — want me to start Multi-currency?`, stream: !OE.instant });
    officeChanged();
    await OE.sleep(2600);
    OE.setActivity(id, 'idle', { short: 'Free', detail: `Free! Last thing I did: shipped ${f.name}` });
  },

  /* the Director walks to the whiteboard and adds a line (purposeful walk) */
  async whiteboard(b) {
    const id = 'pixel'; await OE.free(id);
    const prev = { ...WS.director.activity };
    OE.setActivity(id, 'writing', { short: 'Updating plan', detail: 'Updating the plan on the whiteboard' });
    await OE.walkTo(id, 'whiteboard');
    const r = OE.actors.pixel; if (r) setFacing(r.hero, 'side', { dir: 'left' });
    await OE.sleep(1800);
    WS.checklist.push(Object.assign({ id: 'k' + (WS.checklist.length + 1), done: false }, b.addCheck));
    officeChanged();
    await OE.walkTo(id, 'director');
    OE.setActivity(id, prev.kind, prev);
  },

  /* someone new joins: in through the door, straight to their desk */
  async arrive(b) {
    const id = b.actor; const a = _osA(id); a.onProject = true; a.at = 'door'; a.seat = a.home;
    const r = OE.actors[id];
    OE.adopt(a.seat, id);
    OE.setActivity(id, 'arriving', { short: 'Just joined', detail: 'Just joined — here to cut the release' });
    THEME_OFFICE.door(OE.art, true);
    if (r) { OE._moveNow(r, OE.anchor('door').x, OE.anchor('door').y); r.wrap.classList.remove('gone'); }
    announce(`${_osName(id)} joined.`);
    await OE.sleep(500);
    await OE.walkTo(id, a.seat);
    THEME_OFFICE.door(OE.art, false);
    OE.setActivity(id, b.kind, { short: 'Release notes', detail: b.label, target: b.target, featureId: 'voice' });
  },

  /* the Director calls a sleeper in from his desk ("…"); they stretch and walk to their desk */
  async wake(b) {
    const target = b.target; const t = _osA(target); if (!t || t.session !== 'asleep') return;
    await OE.free('pixel');
    await OE.say('pixel', '', { to: target, ms: 1400 });
    OE.react(target, 'stretch');
    t.session = 'running';
    if (!t.seat) { t.seat = t.home; OE.adopt(t.seat, target); }
    OE.setActivity(target, 'arriving', { short: 'Waking up', detail: 'Stretching — on my way' });
    await OE.say(target, '', { ms: 1000 });
    await OE.walkTo(target, t.seat);
    OE.setActivity(target, b.kind || 'reading', { short: 'Rates API', detail: b.label || 'Reading rates API docs', target: b.file || 'rates API docs', featureId: 'multicur' });
  },
};
/* ------------------------------------------------------------ the Agent Creator moment
   The Director needs someone who doesn't exist yet: the Agent Creator walks in
   through the door, a new bot assembles at a free desk (parts fly in, it pops
   together), the creator leaves. The new agent joins the Cast and the List. */
OS._freeSeat = function () {
  return (OE.plan.spare || []).find(sid => !WS.agents.some(a => a.onProject && (a.seat === sid || a.home === sid)));
};
OS._mint = function (b, seat) {
  const id = b.id || 'a-new-' + (WS.agents.length + 1);
  if (!agentById(id)) {
    const base = agentById(b.base || 'a-query') || AGENTS[0];
    const ag = Object.assign({}, base, { id, name: b.name, nick: b.nick || b.name.split(' ')[0], role: b.role, hue: b.hue || base.hue, kind: 'agent',
      stats: { projects: 1, tokens: 0 }, prompt: b.prompt || '', createdBy: 'a-creator' });
    if (base.look) ag.look = Object.assign({}, base.look, b.look || {}, { hue: b.hue || base.look.hue });
    AGENTS.push(ag);
  }
  const rec = { id, teamId: null, home: seat, seat, at: seat, onProject: true,
    activity: { kind: 'idle', label: 'Just built', detail: 'Just built — reading the brief', target: null, featureId: b.featureId || null },
    session: 'idle', tokens: { total: 0 }, tasksDone: 0, reach: [], locked: [], unread: 0,
    brief: { left: b.left || 'Getting up to speed.', changed: [] } };
  WS.agents.push(rec); OE.plan.home[id] = seat; WS.config.solo.push(id);
  return rec;
};
OS.H.create = async function (b) {
  const cid = 'a-creator'; const c = _osA(cid); const seat = this._freeSeat();
  if (!c || !seat) return;
  const s = OE.plan.seats[seat]; const stand = { x: s.x + 96, y: s.y + 6 };
  /* the Director calls for help (a "…" toward the door), the creator comes in */
  await OE.free('pixel');
  OE.say('pixel', '', { ms: 1300 });
  const r = OE.actors[cid];
  THEME_OFFICE.door(OE.art, true);
  if (r) { OE._moveNow(r, OE.anchor('door').x, OE.anchor('door').y); r.wrap.classList.remove('gone'); }
  c.at = 'door';
  OE.setActivity(cid, 'arriving', { short: 'Agent Creator', detail: `Here to build a ${b.role.toLowerCase()} for ${OP._dir()}` });
  announce(`The Agent Creator came in to build a ${b.role}.`);
  await OE.sleep(500);
  await OE.walkTo(cid, stand);
  THEME_OFFICE.door(OE.art, false);
  if (r) setFacing(r.hero, 'side', { dir: 'left' });
  OE.setActivity(cid, 'writing', { short: 'Building', detail: `Assembling a ${b.role.toLowerCase()} at the free desk`, facing: 'side', dir: 'left' });
  /* parts fly in, the desk dresses, the bot pops together */
  const rec = this._mint(b, seat);
  OE.adopt(seat, rec.id);
  const nr = OE._actor(rec);
  nr.wrap.classList.add('assembling');
  const to = { x: s.x, y: s.y - 70 };
  if (!OE.instant) ['bolt', 'gear', 'spark'].forEach((k, i) => setTimeout(() => OE.fly(k, { x: stand.x - 20, y: stand.y - 110 }, to, 520), i * 220));
  await OE.sleep(900);
  nr.wrap.classList.remove('assembling'); nr.wrap.classList.add('assembled');
  OE.sparkle(s.x, s.y - 120);
  await OE.sleep(1100);
  nr.wrap.classList.remove('assembled');
  OE.react(rec.id, 'hop');
  OE.setActivity(rec.id, 'reading', { short: 'The brief', detail: b.first || 'Reading the brief', target: b.target || null, featureId: b.featureId || null });
  if (!OE.instant) toast(`✨ ${escapeHtml(wsAg(cid).name)} the Agent Creator built ${escapeHtml(b.name)} — now in your Cast`);
  announce(`${b.name} was built by the Agent Creator and joined the Cast.`);
  officeChanged();
  /* and out again */
  await OE.sleep(600);
  OE.setActivity(cid, 'leaving', { short: 'Leaving', detail: 'Off to the next studio' });
  await OE.walkTo(cid, 'door');
  THEME_OFFICE.door(OE.art, true);
  await OE.sleep(350);
  if (r) r.wrap.classList.add('gone');
  c.at = 'door';
  THEME_OFFICE.door(OE.art, false);
  officeChanged();
};
OS.create = function (b) { return this._run(Object.assign({ do: 'create', actor: 'a-creator' }, b)); };

OS._couch = function () {
  const taken = WS.agents.filter(a => a.onProject).map(a => a.at);
  for (let i = 1; i <= 3; i++) if (!taken.includes('couch-' + i)) return 'couch-' + i;
  return 'couch-3';
};
OS.wake = function (id) { this._run({ do: 'wake', actor: 'pixel', target: id }); };

/* consequences of answering a "!" */
OS.onAnswer = async function (ask, answer) {
  const id = ask.agentId; const a = _osA(id); if (!a) return;
  OE.react(id, 'hop');
  if (ask.type === 'access') {
    a.locked = (a.locked || []).filter(x => x !== ask.want); a.reach = [...new Set([...(a.reach || []), ask.want])];
    const f = wsFeature(ask.featureId); if (f) f.blocked = false;
    OE.setActivity(id, 'testing', { short: 'Payment suite', detail: 'Running the payment suite with the Stripe test key', target: 'refund.test.ts', featureId: 'checkout' });
    OP._say(id, 'Thanks! Running the payment suite now 🧪');
    await OE.sleep(4000); await OE.free(id);
    OE.setActivity(id, 'tests-green', { short: '48 passing', detail: '48 passing — checkout verified', featureId: 'checkout' });
    if (f) f.pct = Math.min(99, f.pct + 6);
    this._check('k5'); WS.overall = Math.min(100, WS.overall + 2);
    officeChanged();
    await OE.sleep(1800);
    OE.setActivity(id, 'reading', { short: 'Demo sign-off', detail: 'Writing the checkout demo sign-off', target: 'signoff.md', featureId: 'checkout' });
  } else {
    OP._say(id, `${answer.replace(/[“”]/g, '')} it is — updating the button.`);
    OE.setActivity(id, 'coding', { short: 'Cart button', detail: `Updating the cart button to ${answer}`, target: 'CartButton.tsx', featureId: 'cleanup' });
  }
};

/* ------------------------------------------------------------ Act 2: calm ambient loop (nobody walks) */
OS._ambient = function () {
  const C = SIM_AMBIENT.cycle;
  const pick = (pred) => {
    const pool = wsOnProject().filter(a => pred(a) && !this.busy[a.id] && !(OE.actors[a.id] || {}).held && a.at === a.seat);
    return pool.length ? pool[this._rand(pool.length)] : null;
  };
  const awake = a => a.session === 'running' && a.activity.kind !== 'needs-input';
  const run = (b) => this._run(b);
  const cycle = () => {
    const n = this.cycleN++;
    this._at(3, () => { const a = pick(x => awake(x) && x.activity.kind === 'coding'); if (a) run({ do: 'commit', actor: a.id, n: 1 }); });
    this._at(9, () => {
      const a = pick(awake); if (!a) return;
      const b = pick(x => awake(x) && x.id !== a.id && x.teamId && x.teamId === a.teamId) || pick(x => awake(x) && x.id !== a.id);
      if (b) run({ do: 'talk', actor: a.id, to: b.id, lines: Array(SIM_AMBIENT.talks[n % SIM_AMBIENT.talks.length]).fill('') });
    });
    this._at(16, async () => {
      const a = pick(x => awake(x) && x.activity.kind === 'coding'); if (!a) return;
      const red = this._rand(100) < 12;
      this.busy[a.id] = (this.busy[a.id] || 0) + 1;
      try {
        OE.setActivity(a.id, 'testing', { short: 'Running tests', detail: 'Running the test suite', featureId: a.activity.featureId });
        await OE.sleep(2600);
        if (red) { OE.setActivity(a.id, 'tests-red', { short: '1 failing', detail: '1 failing — fixing it', featureId: a.activity.featureId }); await OE.sleep(6000); }
        OE.setActivity(a.id, 'tests-green', { short: 'All green', detail: 'All tests passing', featureId: a.activity.featureId }); a.tasksDone++;
        await OE.sleep(1500);
        const file = SIM_AMBIENT.files.coding[(n + 2) % SIM_AMBIENT.files.coding.length];
        OE.setActivity(a.id, 'coding', { short: file, detail: `Writing ${file}`, target: file, featureId: a.activity.featureId });
      } finally { this.busy[a.id]--; }
    });
    this._at(22, () => {
      const a = pick(x => awake(x) && x.activity.kind === 'reading'); if (!a) return;
      const file = SIM_AMBIENT.files.coding[n % SIM_AMBIENT.files.coding.length];
      OE.setActivity(a.id, 'coding', { short: file, detail: `Writing ${file}`, target: file, featureId: a.activity.featureId });
      const b = pick(x => awake(x) && x.activity.kind === 'coding' && x.id !== a.id);
      if (b && n % 2) { const rf = SIM_AMBIENT.files.reading[n % SIM_AMBIENT.files.reading.length]; OE.setActivity(b.id, 'reading', { short: rf, detail: `Reading ${rf}`, target: rf, featureId: b.activity.featureId }); }
    });
    /* features creep, tokens tick */
    this._at(C - 1, () => {
      WS.features.filter(f => f.status === 'now' && !f.blocked && f.pct < 96).forEach(f => f.pct += 1 + this._rand(2));
      wsOnProject().forEach(a => { if (a.session === 'running') this._tick(a.id, (a.activity.kind === 'reading' ? 3000 : 1200) + this._rand(1500)); });
      this._tick('pixel', 800);
      officeChanged();
    });
    this._at(C, cycle);
  };
  cycle();
};
