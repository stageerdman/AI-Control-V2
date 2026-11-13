/* ============================================================
   office-engine.js — moves actors around the floor plan (spec-office §7).
   Knows anchors, poses and timing; never knows what a couch looks like
   (THEME_OFFICE draws) or what the story is (office-sim.js decides).

   Public: ACTIVITY (one row per activity kind)
     OE.mount(boxEl) / OE.unmount()
     OE.anchor(id)              → {x,y} (seat id · 'director' · 'couch-N' · object stand)
     OE.walkTo(id, anchorOrPt, {holding, pose}) → Promise   (glides along lanes)
     OE.setActivity(id, kind, {label, detail, target, short}) → WS + pose + hover card
     OE.say(id, text, {to, ms}) → Promise   (a plain "…" bubble; words never shown)
     OE.converse(a, b, n)       → Promise   n alternating "…" bubbles, nobody moves
     OE.face(id) / OE.unface(id) / OE.free(id) → Promise (resolves when not held)
     OE.bang(id, on)            the "!" badge
     OE.react(id, kind)         one-off flourishes: 'hop' | 'bighop' | 'stretch' | 'roll' | 'snug' | 'pop-z'
     OE.fly(kind, from, to)     'plane' | 'envelope' | 'bolt' | 'gear' | 'spark' in flight
     OE.sparkle(x, y)           six soft stars (a new bot is built)
     OE.deskSync(seatId?)       refresh desk(s) from WS
     OE.zoomTo(objectId|null)   OE.fit()
     OE.focusRect(camRect|null, glowRect)  pager focus on a pod (room stays live)
     OE.actors (id → actor record), OE.W, OE.speed, OE.instant
   ============================================================ */

const ACTIVITY = {
  reading: { icon: '📖', tag: 'Reading', pose: 'reading', holding: 'binder', glyph: 'read', seated: true },
  planning: { icon: '💭', tag: 'Planning', pose: 'thinking', glyph: 'caret', seated: true },
  coding: { icon: '⌨️', tag: 'Coding', pose: 'typing', glyph: 'code', seated: true },
  commit: { icon: '📮', tag: 'Pushing', pose: 'typing', glyph: 'code', seated: true },
  testing: { icon: '🧪', tag: 'Testing', pose: 'waiting', glyph: 'dots', seated: true },
  'tests-green': { icon: '✅', tag: 'All green', pose: 'celebrating', glyph: 'green', seated: true },
  'tests-red': { icon: '❌', tag: 'Failing', pose: 'frustrated', glyph: 'red', seated: true },
  'needs-input': { icon: '❗', tag: 'Needs you', pose: 'needs-input', glyph: 'pause', seated: false },
  waiting: { icon: '⏳', tag: 'Waiting', pose: 'waiting', glyph: 'hourglass', seated: true },
  handoff: { icon: '📨', tag: 'Handing off', pose: 'typing', glyph: 'code', seated: true },
  reviewing: { icon: '🔍', tag: 'Reviewing', pose: 'writing', holding: 'pen', glyph: 'diff', seated: true },
  talking: { icon: '💬', tag: 'Syncing', pose: 'talking', glyph: 'code', seated: true },
  deploying: { icon: '🚀', tag: 'Deploying', pose: 'pressing', glyph: 'rocket' },
  idle: { icon: '☕', tag: 'Free', pose: 'chilling', holding: 'mug', glyph: 'emblem', seated: true },
  sleeping: { icon: '💤', tag: 'Off shift', pose: 'sleeping', glyph: 'off', seated: true },
  shipped: { icon: '🎉', tag: 'Shipped!', pose: 'celebrating', glyph: 'check', seated: true },
  arriving: { icon: '👋', tag: 'Just joined', pose: 'walking', glyph: 'emblem' },
  leaving: { icon: '👋', tag: 'Clocked off', pose: 'walking', glyph: 'off' },
  writing: { icon: '🖊️', tag: 'Updating plan', pose: 'writing', holding: 'pen', glyph: 'caret' },
};

const OE = {
  actors: {}, desks: {}, box: null, world: null, cam: null, art: null, plan: null, W: 1600,
  speed: 1, instant: false, zoom: { z: 1, tx: 0, ty: 0, obj: null }, k: 1, _convos: 0,

  /* ---------------------------------------------------------- build */
  mount(box) {
    const plan = this.plan = THEME_OFFICE.plan; this.W = plan.W;
    this.box = box; this.actors = {}; this.desks = {};
    box.style.width = plan.W + 'px';
    const teams = {}; wsTeamIds().forEach(t => { teams[t] = teamById(t); });
    box.innerHTML = `<div class="o-cam"><div class="o-world" style="width:${plan.W}px">${THEME_OFFICE.art(plan, { teams, title: (projById(WS.project) || {}).name || '' })}<div class="o-layer"></div><div class="o-fx"></div></div></div>`;
    this.cam = box.querySelector('.o-cam'); this.world = box.querySelector('.o-world');
    this.art = box.querySelector('.ot-art'); this.layer = box.querySelector('.o-layer'); this.fxLayer = box.querySelector('.o-fx');
    THEME_OFFICE.sync(this.art, WS);
    /* team pods: every member's desk; solo desks appear only when someone sits there */
    plan.pods.forEach(p => { if (p.teamId) p.seats.forEach(sid => this._desk(sid, 'pod', plan.seats[sid], teamById(p.teamId).color)); });
    WS.agents.filter(a => a.onProject && a.seat && !this.desks[a.seat]).forEach(a => this._desk(a.seat, 'hot', plan.seats[a.seat], null));
    this._desk('director', 'boss', plan.director, 'sun');
    const cf = document.createElement('div'); cf.className = 'o-prop o-couchfront'; cf.innerHTML = THEME_OFFICE.couchFront(plan);
    cf.style.zIndex = 818; this.layer.appendChild(cf);
    this._actor(WS.director);
    WS.agents.forEach(a => this._actor(a));
    this.deskSync();
    this.fit();
  },
  unmount() { Object.values(this.actors).forEach(a => { a.walkTok = -1; clearTimeout(a._rt); }); this.actors = {}; this.desks = {}; this.box = null; },

  _desk(id, kind, s, hue) {
    if (!s) return;
    const owner = id === 'director' ? WS.director : WS.agents.find(a => a.seat === id || a.home === id);
    const ag = owner ? wsAg(owner.id) : null;
    const el = document.createElement('div'); el.className = 'o-prop o-desk'; el.dataset.seat = id;
    el.innerHTML = THEME_OFFICE.desk(kind, { hue, accent: ag && ag.hue, item: id === 'director' ? 'telescope' : ['mug', 'plant', null][Object.keys(this.desks).length % 3] });
    const sc = THEME_OFFICE.depth(s.y);
    this._place(el, s.x, s.y, s.y + 7, sc);
    const chair = document.createElement('div'); chair.className = 'o-prop o-chair'; chair.dataset.seat = id;
    chair.innerHTML = THEME_OFFICE.chair(ag ? ag.hue : (hue || 'grape'));
    this._place(chair, s.x, s.y, s.y - 3, sc);
    this.layer.append(chair, el);
    this.desks[id] = { id, el, chair, kind, x: s.x, y: s.y, hue, tray: null };
  },
  _place(el, x, y, z, s = 1) { el.style.transform = `translate(${x}px,${y}px) scale(${s})`; el.style.zIndex = Math.round(z); },

  _actor(a) {
    const ag = wsAg(a.id);
    const team = a.teamId ? teamById(a.teamId) : null;
    const isCaptain = team && wsCaptain(a.teamId) === a.id;
    const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const H = a.id === 'pixel' ? 184 : 176;
    const wrap = document.createElement('div'); wrap.className = 'o-actor'; wrap.dataset.id = a.id;
    const btn = document.createElement('button'); btn.className = 'o-body'; btn.type = 'button'; btn.dataset.id = a.id; btn.tabIndex = -1;
    btn.style.setProperty('--H', H + 'px');
    const h = hero(ag, { size: H, pose: act.pose, facing: 'three-quarter', seated: act.seated, props: false, holding: act.holding || 'none',
      captain: isCaptain, armband: isCaptain ? team.color : null });
    btn.appendChild(h);
    btn.insertAdjacentHTML('beforeend', `<span class="o-blanket" style="--bk:${hueHex(ag.hue)}" aria-hidden="true"></span>
      <span class="o-over" aria-hidden="true">
        <span class="o-bubble" hidden><i></i><i></i><i></i></span>
        <span class="o-bang" hidden><b>!</b></span>
        <span class="o-card"></span>
      </span>`);
    wrap.appendChild(btn);
    this.layer.appendChild(wrap);
    const p = this.anchor(a.at);
    const rec = { id: a.id, data: a, ag, team, wrap, btn, hero: h, x: p.x, y: p.y, held: false, waiters: [], dir: 'right', walkTok: 0 };
    this.actors[a.id] = rec;
    if (!a.onProject) wrap.classList.add('gone');
    this._moveNow(rec, p.x, p.y);
    this._apply(rec);
    return rec;
  },
  /* the hover/focus card: who, where, and — only here — what they're doing */
  _card(rec) {
    const a = rec.data, ag = rec.ag, act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const where = rec.team ? `${emblemSVG(rec.team, 16, { decorative: true })}<span>${escapeHtml(rec.team.name.replace(/^The /, ''))}</span>` : (a.id === 'pixel' ? '<span>Director</span>' : '<span>Solo</span>');
    let doing = a.activity.detail || a.activity.label;
    if (a.activity.kind === 'needs-input') { const ask = WS.pending.find(p => p.agentId === a.id); doing = 'Needs you' + (ask ? ' — ' + ask.short : ''); }
    if (a.activity.kind === 'sleeping') doing = 'Off shift';
    const key = [a.activity.kind, doing].join('|');
    if (rec._cardKey === key) return; rec._cardKey = key;
    rec.btn.querySelector('.o-card').innerHTML = `<b>${escapeHtml(ag.name)}</b><span class="o-cmeta">${escapeHtml(a.id === 'pixel' ? 'Big picture' : wsRole(ag))} · ${where}</span><span class="o-cact">${act.icon} ${escapeHtml(doing)}</span>`;
  },

  /* ---------------------------------------------------------- anchors */
  anchor(id) {
    const P = this.plan || THEME_OFFICE.plan;
    if (!id) return { x: P.W / 2, y: 600 };
    if (typeof id === 'object') return id;
    if (id === 'director') return { ...P.director };
    if (P.seats[id]) return { x: P.seats[id].x, y: P.seats[id].y };
    const m = /^couch-(\d)$/.exec(id); if (m) return { ...P.couch[(+m[1] - 1) % P.couch.length] };
    const o = P.objects[id]; if (o && o.stand) return { ...o.stand };
    return { x: P.W / 2, y: 600 };
  },
  _lane(p) { const P = this.plan; return P.rows.length > 1 && p.y > (P.rows[0] + P.rows[1]) / 2 ? P.lanes.mid : P.lanes.back; },
  _route(a, b) {
    const P = this.plan, la = this._lane(a), lb = this._lane(b);
    const pts = [];
    const push = (x, y) => { const l = pts[pts.length - 1] || a; if (Math.abs(l.x - x) > 1 || Math.abs(l.y - y) > 1) pts.push({ x, y }); };
    if (la === lb) {
      if (Math.abs(a.y - la) < 24 && Math.abs(b.y - lb) < 24) { push(b.x, b.y); return pts; }
      push(a.x, la); push(b.x, la); push(b.x, b.y);
    } else {
      const g = P.gaps.reduce((best, x) => Math.abs(a.x - x) + Math.abs(b.x - x) < Math.abs(a.x - best) + Math.abs(b.x - best) ? x : best, P.gaps[0]);
      push(a.x, la); push(g, la); push(g, lb); push(b.x, lb); push(b.x, b.y);
    }
    return pts;
  },

  /* ---------------------------------------------------------- motion */
  _moveNow(rec, x, y) {
    rec.x = x; rec.y = y;
    rec.wrap.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    rec.wrap.style.zIndex = Math.round(y);
    rec.btn.style.setProperty('--s', (THEME_OFFICE.depth(y) * (rec.id === 'pixel' ? 1.04 : 1)).toFixed(3));
  },
  _faceTo(rec, p) {
    const dx = p.x - rec.x, dy = p.y - rec.y;
    if (Math.abs(dx) > 2) { rec.dir = dx < 0 ? 'left' : 'right'; setFacing(rec.hero, 'side', { dir: rec.dir }); }
    else if (dy > 0) setFacing(rec.hero, 'front');
    else setFacing(rec.hero, 'side', { dir: rec.dir });
  },
  sleep(ms) { return this.instant ? Promise.resolve() : new Promise(r => setTimeout(r, ms / this.speed)); },
  free(id) { const r = this.actors[id]; if (!r || !r.held) return Promise.resolve(); return new Promise(res => r.waiters.push(res)); },
  /* one continuous glide at constant speed (rAF). A newer walk cancels an older one
     and starts from wherever the actor really is — no stalls, no jumps. */
  async walkTo(id, target, o = {}) {
    const rec = this.actors[id]; if (!rec) return;
    await this.free(id);
    const to = typeof target === 'string' ? this.anchor(target) : target;
    const tok = ++rec.walkTok;
    rec.walking = true;
    setPose(rec.hero, o.pose || 'walking', { seated: false, holding: o.holding || 'none', props: false, moving: true });
    rec.btn.style.setProperty('--lift', '0px');
    rec.wrap.classList.add('walking');
    if (this.instant || reducedMotion()) {
      if (!this.instant && reducedMotion()) { rec.wrap.classList.add('blink-out'); await new Promise(r => setTimeout(r, 160)); }
      if (rec.walkTok !== tok) return;
      this._moveNow(rec, to.x, to.y);
      rec.wrap.classList.remove('blink-out');
    } else {
      const pts = this._route({ x: rec.x, y: rec.y }, to);
      await this._glide(rec, pts, tok);
    }
    if (rec.walkTok !== tok) return;
    rec.walking = false; rec.wrap.classList.remove('walking');
    if (typeof target === 'string') rec.data.at = target;
    if (to.look) setFacing(rec.hero, 'side', { dir: to.look });
  },
  _glide(rec, pts, tok) {
    return new Promise(res => {
      if (!pts.length) return res();
      const v = 230 * this.speed; let i = 0, last = 0;
      this._faceTo(rec, pts[0]);
      const step = now => {
        if (rec.walkTok !== tok || !this.box) return res();
        const dt = last ? Math.min(50, now - last) / 1000 : 0; last = now;
        let move = v * dt;
        while (move > 0 && i < pts.length) {
          const p = pts[i], dx = p.x - rec.x, dy = p.y - rec.y, d = Math.hypot(dx, dy);
          if (d <= move) { this._moveNow(rec, p.x, p.y); move -= d; if (++i < pts.length) this._faceTo(rec, pts[i]); }
          else { this._moveNow(rec, rec.x + dx / d * move, rec.y + dy / d * move); move = 0; }
        }
        if (i >= pts.length) return res();
        tick();
      };
      /* rAF when frames are painting; a timer fallback when they aren't (hidden tab, headless) */
      const tick = () => { let done = false; const go = () => { if (!done) { done = true; step(performance.now()); } }; requestAnimationFrame(go); setTimeout(go, 48); };
      tick();
    });
  },

  /* ---------------------------------------------------------- state → look */
  setActivity(id, kind, o = {}) {
    const rec = this.actors[id]; const a = rec ? rec.data : wsAgent(id); if (!a) return;
    const act = ACTIVITY[kind] || ACTIVITY.idle;
    a.activity = Object.assign({}, a.activity, { kind, label: o.label || act.tag, detail: o.detail || o.label || act.tag, target: o.target ?? null, short: o.short || null });
    if ('featureId' in o) a.activity.featureId = o.featureId;
    a.session = kind === 'sleeping' ? 'asleep' : kind === 'idle' ? 'idle' : 'running';
    if (rec) this._apply(rec, o);
    this.deskSync(a.seat);
    if (typeof officeChanged === 'function') officeChanged(id);
  },
  _apply(rec, o = {}) {
    const a = rec.data; const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const atDesk = !!a.at && (a.at === a.seat || a.at === 'director');
    const onCouch = /^couch-/.test(a.at || '');
    const seated = !!act.seated && (atDesk || onCouch);
    if (!rec.walking) {
      setPose(rec.hero, act.pose, { seated, holding: act.holding || 'none', props: false, moving: false });
      if (!rec.held) {
        if (o.facing) setFacing(rec.hero, o.facing, { dir: o.dir || 'right' });
        else if (act.pose === 'sleeping') setFacing(rec.hero, 'front');
        else setFacing(rec.hero, 'three-quarter', { dir: a.at === 'director' ? 'left' : 'right' });
      }
      rec.btn.style.setProperty('--lift', (seated && atDesk ? 16 : 0) + 'px');
    }
    rec.btn.style.setProperty('--hy', rec.hero.style.getPropertyValue('--head-y') || '10%');
    rec.wrap.dataset.kind = a.activity.kind;
    rec.wrap.classList.toggle('asleep', a.activity.kind === 'sleeping');
    this.bang(rec.id, a.activity.kind === 'needs-input');
    this._card(rec);
    rec.btn.setAttribute('aria-label', actorLabel(a));
  },
  bang(id, on) {
    const r = this.actors[id]; if (!r) return;
    r.btn.querySelector('.o-bang').hidden = !on;
    r.wrap.classList.toggle('has-bang', !!on);
  },

  /* desks read their owner's state */
  deskSync(seatId) {
    const ids = seatId ? [seatId] : Object.keys(this.desks);
    ids.forEach(sid => {
      const d = this.desks[sid]; if (!d) return;
      const owner = sid === 'director' ? WS.director : WS.agents.find(a => a.seat === sid && a.onProject);
      const s = { glyph: 'off', hue: d.hue || 'grape', tray: d.tray };
      if (owner) {
        const act = ACTIVITY[owner.activity.kind] || ACTIVITY.idle;
        s.hue = wsAg(owner.id).hue;
        s.glyph = owner.session === 'asleep' ? 'off' : act.glyph;
        d.chair.classList.toggle('empty', owner.at !== sid);
      } else d.chair.classList.add('empty');
      THEME_OFFICE.deskSync(d.el, s);
    });
  },
  /* a desk gets a (new) owner: build it if needed, dress it for them */
  adopt(seatId, agentId) {
    if (!this.desks[seatId]) this._desk(seatId, 'hot', this.plan.seats[seatId], null);
    const d = this.desks[seatId]; if (!d) return;
    const ag = wsAg(agentId);
    d.el.innerHTML = THEME_OFFICE.desk(d.kind, { hue: d.hue, accent: ag.hue, item: 'mug' });
    d.chair.innerHTML = THEME_OFFICE.chair(ag.hue);
    this.deskSync(seatId);
  },
  /* a small real button floating by an actor (e.g. "Chat anyway" on a sleeper) */
  chip(id, label, onClick) {
    const r = this.actors[id]; if (!r) return;
    this.fxLayer.querySelectorAll('.o-chip').forEach(c => c.remove());
    const b = document.createElement('button'); b.type = 'button'; b.className = 'o-chip'; b.textContent = label;
    const H = parseFloat(r.btn.style.getPropertyValue('--H')) || 176; const s = THEME_OFFICE.depth(r.y);
    b.style.transform = `translate(${r.x}px,${r.y - H * s * .8}px)`;
    b.onclick = e => { e.stopPropagation(); b.remove(); onClick(); };
    this.fxLayer.appendChild(b);
    clearTimeout(this._chipT); this._chipT = setTimeout(() => b.remove(), 6000);
  },

  /* ---------------------------------------------------------- talk: "…" only */
  async say(id, text, o = {}) {
    const rec = this.actors[id]; if (!rec || this.instant) return;
    const b = rec.btn.querySelector('.o-bubble');
    b.hidden = false; b.classList.remove('to-left', 'to-right');
    if (o.to && this.actors[o.to]) b.classList.add(this.actors[o.to].x < rec.x ? 'to-left' : 'to-right');
    rec.wrap.classList.add('speaking');
    await this.sleep(o.ms || 1500);
    b.hidden = true; rec.wrap.classList.remove('speaking');
  },
  /* two agents exchange n bubbles from where they sit; max 2 conversations at once */
  async converse(a, b, n = 2) {
    while (this._convos >= 2 && !this.instant) await this.sleep(400);
    this._convos++;
    const ra = this.actors[a], rb = this.actors[b];
    if (ra && rb && !ra.walking && !ra.held) setFacing(ra.hero, 'three-quarter', { dir: rb.x < ra.x ? 'left' : 'right' });
    if (ra && rb && !rb.walking && !rb.held) setFacing(rb.hero, 'three-quarter', { dir: ra.x < rb.x ? 'left' : 'right' });
    try { for (let i = 0; i < n; i++) await this.say(i % 2 ? b : a, '', { to: i % 2 ? a : b, ms: 1300 }); }
    finally { this._convos--; }
  },

  /* ---------------------------------------------------------- facing the viewer */
  face(id) {
    const r = this.actors[id]; if (!r) return;
    r.held = true; r.wrap.classList.add('held');
    if (r.data.activity.kind !== 'sleeping') setFacing(r.hero, 'front');
  },
  unface(id) {
    const r = this.actors[id]; if (!r || !r.held) return;
    r.held = false; r.wrap.classList.remove('held');
    this._apply(r);
    const w = r.waiters.splice(0); w.forEach(f => f());
  },
  react(id, kind) {
    const r = this.actors[id]; if (!r || this.instant) return;
    const cls = 'r-' + kind;
    r.wrap.classList.remove(cls); void r.wrap.offsetWidth; r.wrap.classList.add(cls);
    clearTimeout(r._rt); r._rt = setTimeout(() => r.wrap.classList.remove(cls), 1400);
  },

  /* ---------------------------------------------------------- props in flight */
  async fly(kind, from, to, ms = 1100) {
    if (this.instant || reducedMotion() || !this.fxLayer) return;
    const el = document.createElement('div'); el.className = 'o-flyer'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = OE_FLYERS[kind] || OE_FLYERS.envelope;
    this.fxLayer.appendChild(el);
    el.style.transform = `translate(${from.x}px,${from.y}px)`;
    void el.offsetWidth;
    el.style.transitionDuration = (ms / this.speed) + 'ms';
    el.style.transform = `translate(${to.x}px,${to.y}px)`;
    await this.sleep(ms);
    el.remove();
  },
  /* a soft, brief sparkle (the new-bot moment) — six little stars, no confetti */
  sparkle(x, y) {
    if (this.instant || reducedMotion() || !this.fxLayer) return;
    for (let i = 0; i < 6; i++) {
      const p = document.createElement('i'); p.className = 'o-spark'; const a = i / 6 * Math.PI * 2;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', (Math.cos(a) * 70).toFixed(0) + 'px'); p.style.setProperty('--dy', (Math.sin(a) * 50).toFixed(0) + 'px');
      this.fxLayer.appendChild(p); setTimeout(() => p.remove(), 900);
    }
  },
  burst(x, y) {
    if (this.instant || reducedMotion()) return;
    const cols = [PALETTE.sun, PALETTE.coral, PALETTE.teal, PALETTE.mint];
    for (let i = 0; i < 16; i++) {
      const p = document.createElement('i'); p.className = 'o-conf';
      p.style.background = cols[i % cols.length];
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', (Math.random() * 200 - 100).toFixed(0) + 'px');
      p.style.setProperty('--dy', (-50 - Math.random() * 110).toFixed(0) + 'px');
      p.style.setProperty('--r', (Math.random() * 540).toFixed(0) + 'deg');
      this.fxLayer.appendChild(p); setTimeout(() => p.remove(), 1700);
    }
  },
  /* where an actor's desk-top is (for flyers) */
  deskTop(id) { const r = this.actors[id]; return r ? { x: r.x, y: r.y - 60 } : { x: this.W / 2, y: 500 }; },

  /* ---------------------------------------------------------- camera */
  fit() {
    if (!this.box) return;
    const vp = this.box.parentElement; const Wv = vp.clientWidth;
    /* narrow screens: the chat is a bottom drawer — fit the room into what's above it */
    const panel = document.getElementById('oPanel');
    const drawer = matchMedia('(max-width:899px)').matches && panel ? panel.offsetHeight : 0;
    const H = Math.max(120, vp.clientHeight - drawer);
    const k = Math.min(Wv / this.W, H / 1062);
    this.k = k;
    const ox = (Wv - this.W * k) / 2, oy = (H - 1062 * k) / 2;
    this.box.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
    this.box.style.setProperty('--k', k);
    this._ox = ox; this._oy = oy;
    if (this.zoom.obj) this.zoomTo(this.zoom.obj, true);
    else if (this.zoom.rect) this.focusRect(this.zoom.rect, this.zoom.glow, true);
  },
  /* fit an object's bounds into the viewport; null = back to the office */
  zoomTo(objId, quiet) {
    if (!this.box) return null;
    this._glow(null);
    let b = null;
    if (objId) { const o = this.plan.objects[objId] || this.plan.objects.whiteboard; b = { x: o.x - 16, y: o.y - 16, w: o.w + 32, h: o.h + 32 }; }
    this._camTo(b, quiet, { obj: objId, zmax: Infinity });
    this.box.classList.toggle('zoomed', !!objId);
    return true;
  },
  /* pager focus: glide to a world rect (a team pod) and glow it; the room stays live.
     cam/glow are world rects {x,y,w,h}; null = back to the whole office. */
  focusRect(cam, glow, quiet) {
    if (!this.box) return null;
    this.box.classList.remove('zoomed');
    this._camTo(cam, quiet, { rect: cam, glow, zmax: 1.75 });
    this._glow(cam ? glow : null, quiet);
    return true;
  },
  _glow(r, quiet) {
    let g = this.layer && this.layer.querySelector('.o-podglow');
    if (!r) { if (g) { g.classList.remove('on'); clearTimeout(this._gt); this._gt = setTimeout(() => g.remove(), 400); } return; }
    clearTimeout(this._gt);
    if (!g) { g = document.createElement('div'); g.className = 'o-podglow'; g.setAttribute('aria-hidden', 'true'); this.layer.appendChild(g); }
    g.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    /* lights up after the camera lands — never restyles during the move */
    if (quiet || this.instant || reducedMotion()) g.classList.add('on'); else setTimeout(() => g.classList.add('on'), 520);
  },
  /* the one camera move. b = world rect (null = whole room).
     Perf: during the move the GPU slides the room as ONE flat layer (.moving =
     will-change). Restyle-heavy work (--z feeds every overlay's size; pausing
     every animation) waits until the camera lands, so the move itself never
     triggers a full-scene style/raster pass. */
  _camTo(b, quiet, o) {
    const vp = this.box.parentElement; const Wv = vp.clientWidth, H = vp.clientHeight;
    let z = 1, tx = 0, ty = 0;
    if (b) {
      const by = b.y + 70; /* world → box (the world sits 70px down the box) */
      z = Math.min(o.zmax, (Wv * 0.94) / (b.w * this.k), (H * 0.9) / (b.h * this.k));
      const cx = b.x + b.w / 2, cy = by + b.h / 2;
      const ccx = (Wv / 2 - this._ox) / this.k, ccy = (H / 2 - this._oy) / this.k;
      tx = ccx - z * cx; ty = ccy - z * cy;
      /* a pod focus never shows the void beside the room: keep the room covering the view */
      if (o.rect) {
        const lo = (Wv - this._ox) / this.k - z * this.W, hi = -this._ox / this.k;
        if (lo <= hi) tx = Math.max(lo, Math.min(hi, tx));
        const tlo = (H - this._oy) / this.k - z * 1000, thi = -this._oy / this.k;
        if (tlo <= thi) ty = Math.max(tlo, Math.min(thi, ty));
      }
    }
    this.zoom = { z, tx, ty, obj: o.obj || null, rect: o.rect || null, glow: o.glow || null };
    const cam = this.cam, box = this.box, zoomedObj = !!o.obj;
    const settle = () => {
      cam.classList.remove('moving');
      box.style.setProperty('--z', z);
      const st = document.getElementById('oStage'); if (st) st.classList.toggle('settled', zoomedObj);
    };
    clearTimeout(this._zt);
    cam.classList.toggle('quiet', !!quiet);
    const tf = b ? `translate(${tx}px,${ty}px) scale(${z})` : '';
    if (quiet || OE.instant || reducedMotion()) { cam.style.transform = tf; settle(); }
    else {
      const st = document.getElementById('oStage'); if (st) st.classList.remove('settled');
      cam.classList.add('moving');
      requestAnimationFrame(() => { cam.style.transform = tf; });
      this._zt = setTimeout(settle, 560);
    }
  },
};

/* things that fly across the room: pushes, hand-offs, and bot parts */
const OE_FLYERS = {
  plane: `<svg viewBox="-20 -14 40 28" width="40" height="28"><path d="M-18 2 L18 -12 L4 12 L0 4Z" fill="#fff6e9" stroke="#241a44" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  envelope: `<svg viewBox="-14 -10 28 20" width="30" height="22"><rect x="-12" y="-8" width="24" height="16" rx="2" fill="#f3d79e" stroke="#241a44" stroke-width="2.2"/><path d="M-12 -8 L0 2 L12 -8" fill="none" stroke="#241a44" stroke-width="2"/></svg>`,
  bolt: `<svg viewBox="-10 -10 20 20" width="20" height="20"><path d="M-6 -3 L0 -7 L6 -3 V3 L0 7 L-6 3Z" fill="#c9c3dd" stroke="#241a44" stroke-width="2" stroke-linejoin="round"/><circle r="2.2" fill="#241a44"/></svg>`,
  gear: `<svg viewBox="-12 -12 24 24" width="24" height="24"><path d="M-2 -10 H2 L3 -7 L6 -8 L8 -6 L7 -3 L10 -2 V2 L7 3 L8 6 L6 8 L3 7 L2 10 H-2 L-3 7 L-6 8 L-8 6 L-7 3 L-10 2 V-2 L-7 -3 L-8 -6 L-6 -8 L-3 -7Z" fill="#ffc24b" stroke="#241a44" stroke-width="1.8" stroke-linejoin="round"/><circle r="3" fill="#fff6e9" stroke="#241a44" stroke-width="1.6"/></svg>`,
  spark: `<svg viewBox="-10 -10 20 20" width="20" height="20"><path d="M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4Z" fill="#8be88b" stroke="#241a44" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
};

/* the accessible name of an actor — full sentence, never colour-only */
function actorLabel(a) {
  const ag = wsAg(a.id);
  const team = a.teamId ? teamById(a.teamId) : null;
  const where = a.id === 'pixel' ? 'Director' : team ? team.name : 'Solo';
  let st = a.activity.detail || a.activity.label;
  if (a.activity.kind === 'needs-input') { const ask = WS.pending.find(p => p.agentId === a.id); st = 'needs your input' + (ask ? ': ' + ask.short : a.activity.detail ? ': ' + a.activity.detail : ''); }
  if (a.activity.kind === 'sleeping') st = 'off shift, asleep on the couch';
  return `${ag.name}, ${a.id === 'pixel' ? 'Director (orchestrator)' : wsRole(ag)}, ${where} — ${st}`;
}
