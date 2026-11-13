/* ============================================================
   office-sim.js — the story that makes the office feel alive (spec-office §6).
   Act 1: SIM_SCRIPT beats (one-shot). Act 2: a calm 24s ambient loop forever.
   Every movement means something real (read, wrote, tested, handed off).

   Public: OS.start(), OS.stop(), OS.replay(), OS.skipTo(t),
           OS.onAnswer(ask, answer)  consequences of answering a "!"
           OS.wake(id)               Pixel brings a sleeper in
   Dev hooks (URL ?demo=…, not in UI): fast · t<sec> · ask · chat · talk ·
           ship · end · sleepy · board/features/feature (+ any of the above)
   ============================================================ */

const OS = { timers: [], running: false, t0: 0, cycleN: 0, seed: 7, busy: {} };

OS._param = function () { const m = /[?&]demo=([^&#]+)/.exec(location.search); return m ? decodeURIComponent(m[1]).split(',') : []; };
OS.start = async function () {
  this.stop(); this.running = true; this.busy = {}; this.lock = {};
  const demo = this._param();
  /* coming back to the office resumes the story where it was — never replays it */
  const d = WS.office.demo;
  if (d.started) { this._settle(); OE.speed = demo.includes('fast') ? 3 : 1; if (d.t > SIM_ACT1_END) this._ambient(); else this._schedule(d.t); return; }
  d.started = true;
  OE.speed = demo.includes('fast') ? 3 : 1;
  let skip = 0;
  demo.forEach(d => { const m = /^t(\d+)$/.exec(d); if (m) skip = +m[1]; });
  if (demo.includes('ask') || demo.includes('chat')) skip = Math.max(skip, 25);
  if (demo.includes('talk')) skip = Math.max(skip, 7);
  if (demo.includes('ship')) skip = Math.max(skip, 46);
  if (demo.includes('end')) skip = Math.max(skip, SIM_ACT1_END + 1);
  if (demo.includes('selftest')) { setTimeout(() => officeSelftest(), 50); return; }
  if (skip) await this.skipTo(skip);
  else this._schedule(0);
  if (demo.includes('chat')) setTimeout(() => OP.open('a-scar', { from: 'scene' }), 30);
  if (demo.includes('pete')) setTimeout(() => OP.open('a-pete', { from: 'scene' }), 30);
  if (demo.includes('sleepy')) setTimeout(() => OP.sleeperPoke('a-query'), 30);
  if (demo.includes('peek')) setTimeout(() => { const b = document.querySelector('.o-body[data-id="a-semic"]'); if (b) b.classList.add('peek'); }, 30);
};
OS.stop = function () {
  if (this.running && this.t0) WS.office.demo.t = Math.max(WS.office.demo.t || 0, (Date.now() - this.t0) / 1000 * OE.speed);
  this.timers.forEach(clearTimeout); this.timers = []; this.running = false;
};
OS.elapsed = function () { return (Date.now() - this.t0) / 1000 * OE.speed; };
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
  for (const b of SIM_SCRIPT.filter(x => x.t <= t)) { if (/trace/.test(location.search)) console.log("beat", b.t, b.do); try { await this._run(b); } catch (e) { console.error("beat failed", b.t, b.do, e && e.message); } }
  OE.instant = false;
  officeRefresh();
  WS.office.demo.t = t;
  if (t > SIM_ACT1_END) { this.t0 = Date.now() - t * 1000; this._ambient(); } else this._schedule(t);
};
/* one beat at a time per actor: a new beat waits for that actor's previous one */
OS._run = function (b) {
  this.lock = this.lock || {};
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
OS._tick = function (id, k) { const a = _osA(id); if (!a) return; a.tokens.total += k; const f = a.activity.featureId; if (f && a.tokens.byFeature) a.tokens.byFeature[f] = (a.tokens.byFeature[f] || 0) + k; };
OS._restore = function (id, prev) { OE.setActivity(id, prev.kind, prev); };
OS._seat = function (id) { const a = _osA(id); return a.seat || a.at; };
OS._check = function (kid) { const k = WS.checklist.find(x => x.id === kid); if (k && !k.done) { k.done = true; k.assignees.forEach(id => { const a = _osA(id); if (a) a.tasksDone++; }); } };
OS._comm = function (from, to, text, kind = 'talk') {
  WS.comms.push({ id: 'c' + WS.comms.length, at: Date.now(), from, to, kind, text });
  OP.post(from, { from: 'system', kind: 'comm', comm: { from, to, text } });
};

/* ------------------------------------------------------------ beat handlers */
OS.H = {
  open() {
    const box = document.getElementById('oBox'); if (!box || OE.instant || reducedMotion()) return;
    box.querySelector('.o-cam').classList.add('opening');
    setTimeout(() => box.querySelector('.o-cam') && box.querySelector('.o-cam').classList.remove('opening'), 900);
  },
  activity(b) { OE.setActivity(b.actor, b.kind, b); },

  async commit(b) {
    const id = b.actor; await OE.free(id);
    const prev = { ..._osA(id).activity };
    OE.setActivity(id, 'commit', { short: `${b.n} commit${b.n > 1 ? 's' : ''}`, detail: `Pushing ${b.n} commit${b.n > 1 ? 's' : ''} to main`, featureId: prev.featureId });
    if (b.shout) OE.say(id, b.shout.text, { to: b.shout.to, shout: true, ms: 1600 }), this._comm(id, b.shout.to, b.shout.text, 'shout');
    await OE.walkTo(id, 'outbox', { holding: 'paper' });
    WS.github.fresh = true; WS.github.pushedAgo = 'just now'; _osA(id).tasksDone++; this._tick(id, 1500);
    OE.pop(936, 330, `📮 +${b.n}`);
    const flag = OE.art && OE.art.querySelector('#outFlag'); if (flag && !OE.instant) { flag.classList.remove('wave'); void flag.getBBox; flag.classList.add('wave'); }
    officeChanged();
    await OE.sleep(500);
    await OE.walkTo(id, this._seat(id));
    this._restore(id, prev.kind === 'commit' ? { kind: 'coding', label: 'Coding' } : prev);
  },

  async talk(b) {
    const id = b.actor, to = b.to; await OE.free(id);
    const prev = { ..._osA(id).activity };
    OE.setActivity(id, 'talking', { short: OP._short(to), detail: `Syncing with ${_osName(to)}`, featureId: prev.featureId });
    await OE.walkTo(id, 'visit:' + to);
    const rt = OE.actors[to]; const rv = OE.actors[id];
    if (rt && rv && !rt.held) setFacing(rt.hero, 'three-quarter', { dir: rv.x < rt.x ? 'left' : 'right' });
    if (rv) { setPose(rv.hero, 'talking', { seated: false, props: false, holding: 'none' }); setFacing(rv.hero, 'side', { dir: rt && rt.x < rv.x ? 'left' : 'right' }); }
    this._comm(id, to, b.lines.join(' / '));
    await OE.converse(id, to, b.lines);
    if (rt && !rt.held) OE.setActivity(to, _osA(to).activity.kind, _osA(to).activity);
    await OE.walkTo(id, this._seat(id));
    this._restore(id, prev);
    if (id === 'a-lint' && to === 'a-twinkle') { OE.setActivity('a-lint', 'coding', { label: 'Merging card twins', detail: 'Merging the three card twins into one <Card>', target: 'Card.tsx', featureId: 'cleanup' }); }
  },

  async handoff(b) {
    const id = b.actor, to = b.to; await OE.free(id);
    const prev = { ..._osA(id).activity };
    OE.setActivity(id, 'handoff', { short: `${b.artifact} → ${OP._short(to)}`, detail: `Handing ${b.artifact} to ${_osName(to)}`, featureId: prev.featureId });
    await OE.walkTo(id, 'visit:' + to, { holding: 'envelope' });
    const desk = OE.desks[_osA(to).seat]; if (desk) { desk.tray = 'new'; OE.deskSync(desk.id); }
    this._comm(id, to, `${b.artifact}: ready for review`, 'handoff');
    await OE.sleep(600);
    if (desk) { desk.tray = true; OE.deskSync(desk.id); }
    _osA(id).tasksDone++;
    const back = OE.walkTo(id, this._seat(id)).then(() => this._restore(id, prev.kind === 'reading' ? { kind: 'coding', label: 'Coding', detail: 'Fixing review notes', featureId: prev.featureId } : prev));
    await OE.free(to);
    OE.setActivity(to, 'reviewing', { short: b.artifact, detail: `Reviewing ${b.artifact}`, target: b.artifact });
    await OE.sleep(2200); this._tick(to, 3000);
    if (b.review && desk) { desk.stamp = b.review; OE.deskSync(desk.id); OE.react(to, 'hop'); await OE.sleep(1600); desk.stamp = null; desk.tray = null; OE.deskSync(desk.id); }
    if (to === 'a-scar') OE.setActivity(to, 'testing', { short: '48 tests', detail: 'Running the 48-case payment suite', target: 'refund.test.ts', featureId: 'checkout' });
    else OE.setActivity(to, 'coding', { short: 'Release branch', detail: 'Cutting the release branch for v1.0', target: 'release/v1.0', featureId: 'voice' });
    if (desk && !b.review) { desk.tray = null; OE.deskSync(desk.id); }
    await back;
  },

  async tests(b) {
    const id = b.actor; await OE.free(id);
    if (_osA(id).activity.kind !== 'testing') { OE.setActivity(id, 'testing', { short: 'Running tests', detail: 'Running the test suite', featureId: _osA(id).activity.featureId }); await OE.sleep(1600); }
    this._tick(id, 2500);
    if (b.result === 'red') {
      OE.setActivity(id, 'tests-red', { short: `${b.failing} failing`, detail: `${b.failing} failing in refund.test — Captain is fixing`, featureId: 'checkout' });
      const r = OE.actors[id];
      if (r) OE.fly('ball', { x: r.x + 10, y: r.y - 70 }, { x: r.x + 70, y: r.y + 40 }, 700);
      if (b.shout) { this._comm(id, b.shout.to, b.shout.text, 'shout'); await OE.say(id, b.shout.text, { to: b.shout.to, shout: true }); }
      OE.setActivity(b.shout.to, 'coding', { short: 'Fixing refunds', detail: 'Fixing the 2 refund failures', target: 'refund.ts', featureId: 'checkout' });
      OE.setActivity(id, 'waiting', { short: 'on Captain', detail: 'Waiting on Captain’s refund fix', featureId: 'checkout' });
      return;
    }
    OE.setActivity(id, 'tests-green', { short: 'All green', detail: 'All tests passing', featureId: _osA(id).activity.featureId });
    if (b.check) this._check(b.check);
    if (b.feature) { const f = wsFeature(b.feature); if (f) f.pct = b.pct; }
    OE.react(id, 'hop'); officeChanged();
    await OE.sleep(1600);
    if (id === 'a-pete') OE.setActivity(id, 'idle', { short: 'Voice done', detail: 'Voice search is green — waiting for the preview', featureId: 'voice' });
    else OE.setActivity(id, 'coding', { short: 'Contrast pass', detail: 'Contrast pass on the merged <Card>', target: 'Card.tsx', featureId: 'cleanup' });
  },

  async ask(b) {
    const id = b.actor; await OE.free(id);
    OE.setActivity(id, 'needs-input', { short: 'Needs you', detail: b.ask.short, featureId: b.ask.featureId });
    if (b.ask.type === 'access') { const f = wsFeature(b.ask.featureId); if (f) f.blocked = true; }
    OP.ask(Object.assign({}, b.ask));
    this._askAt = Date.now();
    /* ignored for 20s → one bigger hop, once. No nagging. */
    this.timers.push(setTimeout(() => { if (WS.pending.find(p => p.id === b.ask.id)) OE.react(id, 'bighop'); }, OE.instant ? 0 : 20000));
  },

  async clockOff(b) {
    const id = b.actor; await OE.free(id);
    if (b.say) await OE.say(id, b.say, { ms: 2000 });
    OE.setActivity(id, 'leaving', { short: 'Clocked off', detail: 'Session ended — heading to the couch' });
    const spot = this._couch();
    await OE.walkTo(id, spot);
    OE.setActivity(id, 'sleeping', { detail: 'Cast on Aurora, no running session' });
    OP.system(`${_osName(id)} clocked off — nothing to write till Voice ships.`);
    announce(`${_osName(id)} clocked off.`);
  },
  _couchFree: null,

  async deploy(b) {
    const id = b.actor; await OE.free(id);
    const prev = { ..._osA(id).activity };
    const home = _osA(id).at;
    await OE.walkTo(id, 'console');
    OE.setActivity(id, 'deploying', { short: 'Preview', detail: 'Deploying a fresh preview', featureId: 'voice' });
    await OE.sleep(900);
    const btn = OE.art && OE.art.querySelector('#consoleBtn'); if (btn && !OE.instant) { btn.classList.remove('press'); void btn.getBBox; btn.classList.add('press'); }
    OE.fly('plane', { x: 1110, y: 300 }, { x: 1160, y: 150 }, 1300);
    WS.testFresh = 'deployed just now'; OM.testFresh = true; officeChanged();
    if (!OE.instant) setTimeout(() => { OM.testFresh = false; officeChanged(); }, 6000);
    OP.system('Fresh preview is up — Test link refreshed.');
    this._tick(id, 4000); _osA(id).tasksDone++;
    await OE.sleep(1200);
    await OE.walkTo(id, home);
    this._restore(id, prev);
  },

  async ship(b) {
    const f = wsFeature(b.feature); if (!f) return;
    f.status = 'shipped'; f.pct = 100; f.star = true; f.order = 0;
    WS.checklist.filter(k => k.featureId === b.feature).forEach(k => this._check(k.id));
    WS.overall = Math.min(100, WS.overall + 6);
    const id = b.actor; const r = OE.actors[id];
    OE.setActivity(id, 'shipped', { short: f.name, detail: `Shipped ${f.name}!`, featureId: b.feature });
    if (r) OE.burst(r.x, r.y - 120);
    const flag = document.querySelector(`.o-flag[data-team="${_osA(id).teamId}"] .f-stars`);
    if (flag) flag.innerHTML += `<path transform="translate(${16 + flag.childElementCount * 18} -212) scale(1.4)" d="M0 -7 L2 -2 L7 -2 L3 1 L4.5 6.5 L0 3.5 L-4.5 6.5 L-3 1 L-7 -2 L-2 -2Z" fill="${PALETTE.sun}" stroke="#241a44" stroke-width="2"/>`;
    /* everyone awake glances toward the pod and claps once */
    wsOnProject().concat([WS.director]).forEach(a => { if (a.id !== id && a.session !== 'asleep' && a.activity.kind !== 'needs-input') OE.react(a.id, 'clap'); });
    if (!OE.instant) toast(`✨ ${escapeHtml(f.name)} shipped`);
    announce(`${f.name} shipped.`);
    OP.post('pixel', { from: 'pixel', kind: 'text', text: `${f.name} is live on the preview 🎉 — want me to start Multi-currency?`, stream: !OE.instant });
    if (OP.thread === 'pixel' && OP.el) OP._quick(['Start it now', 'Wait for checkout', 'Show me the plan']);
    officeChanged();
    await OE.sleep(2600);
    await this._goIdle(id, `Free! Last thing I did: shipped ${f.name}`);
  },

  async whiteboard(b) {
    const id = 'pixel'; await OE.free(id);
    const prev = { ...WS.director.activity };
    await OE.walkTo(id, 'whiteboard');
    OE.setActivity(id, 'writing', { short: 'Updating plan', detail: 'Updating the plan on the whiteboard' });
    const r = OE.actors.pixel; if (r) setFacing(r.hero, 'side', { dir: 'left' });
    await OE.sleep(1800);
    WS.checklist.push(Object.assign({ id: 'k' + (WS.checklist.length + 1), done: false }, b.addCheck));
    OP.system(`Pixel added “${b.addCheck.text}” to the plan.`);
    officeChanged();
    await OE.walkTo(id, 'director');
    OE.setActivity(id, prev.kind, prev);
  },

  async arrive(b) {
    const id = b.actor; const a = _osA(id); a.onProject = true; a.at = 'door'; a.seat = b.seat;
    const r = OE.actors[id];
    OE.adopt(b.seat, id);
    OE.setActivity(id, 'arriving', { short: 'Just joined', detail: 'Just joined — here to cut the release' });
    THEME_OFFICE.door(OE.art, true);
    if (r) r.wrap.classList.remove('gone');
    OP.system(`${_osName(id)} joined to cut the release.`);
    announce(`${_osName(id)} joined.`);
    await OE.sleep(500);
    await OE.walkTo(id, b.seat);
    THEME_OFFICE.door(OE.art, false);
    OE.setActivity(id, b.kind, { short: 'Release notes', detail: b.label, target: b.target, featureId: 'voice' });
  },

  async wake(b) {
    const target = b.target; const t = _osA(target); if (!t || t.session !== 'asleep') return;
    await OE.free('pixel');
    const prev = { ...WS.director.activity };
    OE.setActivity('pixel', 'talking', { short: OP._short(target), detail: `Waking ${_osName(target)}` });
    await OE.walkTo('pixel', 'visit:' + target);
    await OE.say('pixel', b.line || 'Rise and shine — rates research?', { to: target, ms: 1800 });
    OE.react(target, 'stretch');
    t.session = 'running';
    if (!t.seat) { t.seat = b.seat || this._freeHot(); OE.adopt(t.seat, target); }
    OE.setActivity(target, 'arriving', { short: 'Waking up', detail: 'Stretching — on my way' });
    await OE.say(target, 'On it! ☕', { ms: 1200 });
    const back = OE.walkTo('pixel', 'director').then(() => OE.setActivity('pixel', prev.kind, prev));
    await OE.walkTo(target, t.seat);
    OE.setActivity(target, b.kind || 'reading', { short: 'Rates API', detail: b.label || 'Reading rates API docs', target: b.file || 'rates API docs', featureId: 'multicur' });
    OP.system(`${_osName(target)} is in — ${(b.label || 'reading rates API docs').toLowerCase()}.`);
    await back;
  },
};
/* free agents physically go chill in the lounge (beanbags) — idle reads by location */
OS._goIdle = async function (id, detail) {
  OE.setActivity(id, 'idle', { short: 'Free', detail });
  const a = _osA(id); if (!a || !/^[ABC]-|^hot-/.test(a.at || '')) return;
  const spot = this._bean(); if (!spot) return;
  await OE.walkTo(id, spot, { holding: 'mug', pose: 'walking' });
  OE.setActivity(id, 'idle', { short: 'Free', detail });
};
OS._bean = function () {
  const taken = WS.agents.filter(a => a.onProject).map(a => a.at);
  for (let i = 1; i <= THEME_OFFICE.beanbags.length; i++) if (!taken.includes('bean-' + i)) return 'bean-' + i;
  return null;
};
OS._couch = function () {
  const taken = WS.agents.filter(a => a.onProject).map(a => a.at);
  for (let i = 1; i <= 3; i++) if (!taken.includes('couch-' + i)) return 'couch-' + i;
  return this._bean() || 'couch-3';
};
OS._freeHot = function () {
  const taken = WS.agents.filter(a => a.onProject).map(a => a.seat);
  for (let i = 1; i <= 4; i++) if (!taken.includes('hot-' + i)) return 'hot-' + i;
  return 'hot-4';
};
OS.wake = function (id) { this._run({ do: 'wake', actor: 'pixel', target: id }); };

/* consequences of answering a "!" */
OS.onAnswer = async function (ask, answer) {
  const id = ask.agentId; const a = _osA(id); if (!a) return;
  const r = OE.actors[id];
  if (r) OE.burst(r.x, r.y - 130);
  OE.react(id, 'hop');
  if (ask.type === 'access') {
    a.locked = (a.locked || []).filter(x => x !== ask.want); a.reach = [...new Set([...(a.reach || []), ask.want])];
    OE._card(OE.actors[id]);
    const f = wsFeature(ask.featureId); if (f) f.blocked = false;
    OE.setActivity(id, 'testing', { short: 'Payment suite', detail: 'Running the payment suite with the Stripe test key', target: 'refund.test.ts', featureId: 'checkout' });
    OP._say(id, 'Thanks! Running the payment suite now 🧪');
    await OE.sleep(4000); await OE.free(id);
    OE.setActivity(id, 'tests-green', { short: '48 passing', detail: '48 passing — checkout verified', featureId: 'checkout' });
    if (f) f.pct = Math.min(99, f.pct + 6);
    this._check('k5'); WS.overall = Math.min(100, WS.overall + 2);
    OE.react(id, 'hop'); officeChanged();
    await OE.sleep(1800);
    OE.setActivity(id, 'reading', { short: 'Demo sign-off', detail: 'Writing the checkout demo sign-off', target: 'signoff.md', featureId: 'checkout' });
  } else {
    OP._say(id, `${answer.replace(/[“”]/g, '')} it is — updating the button.`);
    OE.setActivity(id, 'coding', { short: 'Cart button', detail: `Updating the cart button to ${answer}`, target: 'CartButton.tsx', featureId: 'cleanup' });
  }
};

/* ------------------------------------------------------------ Act 2: calm ambient loop */
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
    this._at(2, () => { const a = pick(x => awake(x) && x.activity.kind === 'coding'); if (a) run({ do: 'commit', actor: a.id, n: 1 + this._rand(3) }); });
    this._at(7, () => {
      const a = pick(awake); if (!a) return;
      const b = pick(x => awake(x) && x.id !== a.id && x.teamId !== a.teamId) || pick(x => awake(x) && x.id !== a.id);
      if (b) run({ do: 'talk', actor: a.id, to: b.id, lines: SIM_AMBIENT.talks[n % SIM_AMBIENT.talks.length] });
    });
    this._at(13, async () => {
      const a = pick(x => awake(x) && x.activity.kind === 'coding'); if (!a) return;
      const red = this._rand(100) < 15;
      this.busy[a.id] = (this.busy[a.id] || 0) + 1;
      try {
        OE.setActivity(a.id, 'testing', { short: 'Running tests', detail: 'Running the test suite', featureId: a.activity.featureId });
        await OE.sleep(2200);
        if (red) { OE.setActivity(a.id, 'tests-red', { short: '1 failing', detail: '1 failing — fixing it', featureId: a.activity.featureId }); await OE.sleep(6000); }
        OE.setActivity(a.id, 'tests-green', { short: 'All green', detail: 'All tests passing', featureId: a.activity.featureId }); a.tasksDone++;
        await OE.sleep(1500);
        const file = SIM_AMBIENT.files.coding[(n + 2) % SIM_AMBIENT.files.coding.length];
        OE.setActivity(a.id, 'coding', { short: file, detail: `Writing ${file}`, target: file, featureId: a.activity.featureId });
      } finally { this.busy[a.id]--; }
    });
    this._at(18, () => {
      const a = pick(x => awake(x) && x.activity.kind === 'reading'); if (!a) return;
      const file = SIM_AMBIENT.files.coding[n % SIM_AMBIENT.files.coding.length];
      OE.setActivity(a.id, 'coding', { short: file, detail: `Writing ${file}`, target: file, featureId: a.activity.featureId });
      const b = pick(x => awake(x) && x.activity.kind === 'coding' && x.id !== a.id);
      if (b && n % 2) { const rf = SIM_AMBIENT.files.reading[n % SIM_AMBIENT.files.reading.length]; OE.setActivity(b.id, 'reading', { short: rf, detail: `Reading ${rf}`, target: rf, featureId: b.activity.featureId }); }
    });
    if (n % 3 === 2) this._at(20, async () => {
      const a = pick(x => x.session !== 'asleep' && x.activity.kind !== 'needs-input'); if (!a) return;
      this.busy[a.id] = (this.busy[a.id] || 0) + 1;
      try {
        const prev = { ...a.activity };
        OE.setActivity(a.id, 'idle', { short: 'Coffee', detail: 'Grabbing a coffee' });
        await OE.walkTo(a.id, 'coffee', { holding: 'mug', pose: 'walking' });
        await OE.sleep(2500);
        await OE.walkTo(a.id, a.seat, { holding: 'mug', pose: 'walking' });
        OE.setActivity(a.id, prev.kind, prev);
      } finally { this.busy[a.id]--; }
    });
    /* features creep, tokens tick — reading ticks fastest */
    this._at(C - 1, () => {
      WS.features.filter(f => f.status === 'now' && !f.blocked && f.pct < 96).forEach(f => f.pct += 1 + this._rand(3));
      wsOnProject().forEach(a => { if (a.session === 'running') this._tick(a.id, (a.activity.kind === 'reading' ? 3000 : 1200) + this._rand(1500)); });
      this._tick('pixel', 800);
      officeChanged();
    });
    this._at(C, cycle);
  };
  cycle();
};
