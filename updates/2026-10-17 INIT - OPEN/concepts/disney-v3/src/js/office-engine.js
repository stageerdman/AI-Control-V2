/* ============================================================
   office-engine.js — moves actors around the theme's anchors (spec-office §7).
   Knows anchors, poses and timing; never knows what a couch looks like
   (THEME_OFFICE draws) or what the story is (office-sim.js decides).

   Public: ACTIVITY (the §2 table — one row per activity kind)
     OE.mount(boxEl)            build furniture + actors for WS into the stage box
     OE.unmount()
     OE.anchor(id)              → {x,y} (seat / object stand / 'visit:<agentId>')
     OE.walkTo(id, anchorOrPt, {holding, pose}) → Promise   (Manhattan along lanes)
     OE.setActivity(id, kind, {label, detail, target, short}) → updates WS + pose/tag/monitor
     OE.say(id, text, {to, ms, shout}) → Promise (speech bubble)
     OE.face(id) / OE.unface(id) / OE.free(id) → Promise (resolves when not held)
     OE.bang(id, on)            the "!" badge
     OE.react(id, kind)         one-off flourishes: 'hop' | 'clap' | 'stretch' | 'pop-z'
     OE.fly(kind, from, to)     a paper plane / envelope in flight
     OE.deskSync(seatId?)       refresh desk(s) from WS
     OE.zoomTo(objectId|null) → screen rect of the object after the move
     OE.fit()                   re-letterbox (on resize)
     OE.actors (id → actor record), OE.speed, OE.instant
   ============================================================ */

const ACTIVITY = {
  reading: { icon: '📖', tag: 'Reading', pose: 'reading', holding: 'binder', glyph: 'read', seated: true },
  planning: { icon: '💭', tag: 'Planning', pose: 'thinking', glyph: 'caret', seated: true, sticky: true },
  coding: { icon: '⌨️', tag: 'Coding', pose: 'typing', glyph: 'code', seated: true },
  commit: { icon: '📮', tag: 'Pushing', pose: 'carrying', holding: 'paper', glyph: 'code' },
  testing: { icon: '🧪', tag: 'Testing', pose: 'waiting', glyph: 'dots', seated: true, lamp: 'run' },
  'tests-green': { icon: '✅', tag: 'All green', pose: 'celebrating', glyph: 'green', seated: true, lamp: 'green', star: true },
  'tests-red': { icon: '❌', tag: 'Failing', pose: 'frustrated', glyph: 'red', seated: true, lamp: 'red' },
  'needs-input': { icon: '❗', tag: 'Needs you', pose: 'needs-input', glyph: 'pause', seated: false },
  waiting: { icon: '⏳', tag: 'Waiting', pose: 'waiting', glyph: 'hourglass', seated: true },
  handoff: { icon: '📨', tag: 'Handing off', pose: 'carrying', holding: 'envelope', glyph: 'code' },
  reviewing: { icon: '🔍', tag: 'Reviewing', pose: 'writing', holding: 'pen', glyph: 'diff', seated: true },
  talking: { icon: '💬', tag: 'Syncing', pose: 'talking', glyph: 'code' },
  deploying: { icon: '🚀', tag: 'Deploying', pose: 'pressing', glyph: 'rocket' },
  idle: { icon: '☕', tag: 'Free', pose: 'chilling', holding: 'mug', glyph: 'emblem', seated: true },
  sleeping: { icon: '💤', tag: 'Off shift', pose: 'sleeping', glyph: 'off', seated: true },
  shipped: { icon: '🎉', tag: 'Shipped!', pose: 'celebrating', glyph: 'check', seated: false },
  arriving: { icon: '👋', tag: 'Just joined', pose: 'walking', glyph: 'emblem' },
  leaving: { icon: '👋', tag: 'Clocked off', pose: 'walking', glyph: 'off' },
  writing: { icon: '🖊️', tag: 'Updating plan', pose: 'writing', holding: 'pen', glyph: 'caret' },
};
/* verbs for long-form status lines ("Writing VoiceBar.tsx") */
const ACTIVITY_VERB = { reading: 'Reading', planning: 'Planning', coding: 'Writing', testing: 'Running', reviewing: 'Reviewing', handoff: 'Handing off', commit: 'Pushing', deploying: 'Deploying' };

const OE = {
  actors: {}, desks: {}, box: null, world: null, cam: null, art: null,
  speed: 1, instant: false, zoom: { z: 1, tx: 0, ty: 0, obj: null }, k: 1, _convos: 0,

  /* ---------------------------------------------------------- build */
  mount(box) {
    this.box = box; this.actors = {}; this.desks = {};
    const teamIds = wsTeamIds();
    /* pods close up to the team's real size (3–4 desks): no empty desks staring back */
    const podsCtx = teamIds.map((t, i) => {
      const pod = THEME_OFFICE.pods[i]; const n = Math.max(1, Math.min(4, WS.agents.filter(a => a.teamId === t && a.seat && a.seat.startsWith(pod.id)).length));
      const s0 = pod.seats[0], sl = pod.seats[n - 1];
      return { id: pod.id, team: teamById(t), n, rug: { x: s0.x - 84, y: pod.rug.y, w: sl.x - s0.x + 168 + 54, h: pod.rug.h }, flag: { x: sl.x + 112, y: pod.rug.y + pod.rug.h - 8 } };
    });
    box.innerHTML = `<div class="o-cam"><div class="o-world">${THEME_OFFICE.art({ pods: podsCtx, title: (projById(WS.project) || {}).name || '' })}<div class="o-layer"></div><div class="o-fx"></div></div></div>`;
    this.cam = box.querySelector('.o-cam'); this.world = box.querySelector('.o-world');
    this.art = box.querySelector('.ot-art'); this.layer = box.querySelector('.o-layer'); this.fxLayer = box.querySelector('.o-fx');
    THEME_OFFICE.sync(this.art, WS);
    /* furniture: pods for present teams (4 desks each), hot desks, Pixel's desk, couch front */
    podsCtx.forEach((p, pi) => {
      const pod = THEME_OFFICE.pods[pi];
      pod.seats.slice(0, p.n).forEach((s, si) => this._desk(`${pod.id}-${si + 1}`, 'pod', s, p.team.color));
      this._flag(p.flag, p.team, p.team.id);
    });
    /* hot desks appear only when a solo agent sits there */
    WS.agents.filter(a => a.onProject && /^hot-/.test(a.seat || '')).forEach(a => this._hotDesk(a.seat));
    THEME_OFFICE.beanbags.forEach((b, i) => {
      const el = document.createElement('div'); el.className = 'o-prop o-bean'; el.innerHTML = THEME_OFFICE.beanFront(i);
      this._place(el, b.x, b.y, b.y + 6, THEME_OFFICE.depth(b.y)); this.layer.appendChild(el);
    });
    this._desk('director', 'boss', THEME_OFFICE.director, 'sun');
    const cf = document.createElement('div'); cf.className = 'o-prop o-couchfront'; cf.innerHTML = THEME_OFFICE.couchFront();
    cf.style.zIndex = 818; this.layer.appendChild(cf);
    /* actors */
    this._actor(WS.director);
    WS.agents.forEach(a => this._actor(a));
    this.deskSync();
    this.fit();
  },
  unmount() { Object.values(this.actors).forEach(a => clearTimeout(a._bt)); this.actors = {}; this.desks = {}; this.box = null; },

  _desk(id, kind, s, hue) {
    const owner = id === 'director' ? WS.director : WS.agents.find(a => a.seat === id);
    const ownerAgent = owner ? agentById(owner.id) : null;
    const idx = Object.keys(this.desks).length;
    const item = id === 'director' ? 'telescope' : ['mug', 'duck', 'photo', 'cactus', 'plant'][idx % 5];
    const el = document.createElement('div'); el.className = 'o-prop o-desk'; el.dataset.seat = id;
    el.innerHTML = THEME_OFFICE.desk(kind, { hue, accent: ownerAgent && ownerAgent.hue, item, spare: !owner });
    const sc = THEME_OFFICE.depth(s.y);
    this._place(el, s.x, s.y, s.y + 7, sc);
    const chair = document.createElement('div'); chair.className = 'o-prop o-chair'; chair.dataset.seat = id;
    chair.innerHTML = THEME_OFFICE.chair(ownerAgent ? ownerAgent.hue : (hue || 'grape'));
    this._place(chair, s.x, s.y, s.y - 3, sc);
    if (!owner) chair.classList.add('spare');
    this.layer.append(chair, el);
    this.desks[id] = { id, el, chair, kind, x: s.x, y: s.y, hue, tray: null, stamp: null };
  },
  _hotDesk(seatId) {
    if (this.desks[seatId]) return;
    const i = +seatId.slice(4) - 1; const s = THEME_OFFICE.hotDesks[i]; if (!s) return;
    this._desk(seatId, 'hot', s, null);
  },
  _flag(pt, team, id) {
    const el = document.createElement('div'); el.className = 'o-prop o-flag'; el.dataset.team = id;
    el.innerHTML = THEME_OFFICE.flag(team);
    const em = emblem(team, 66, { decorative: true }); em.classList.add('o-flag-em'); el.appendChild(em);
    this._place(el, pt.x, pt.y, pt.y, THEME_OFFICE.depth(pt.y));
    this.layer.appendChild(el);
  },
  _place(el, x, y, z, s = 1) { el.style.transform = `translate(${x}px,${y}px) scale(${s})`; el.style.zIndex = Math.round(z); },

  _actor(a) {
    const ag = agentById(a.id === 'pixel' ? 'director' : a.id);
    const team = a.teamId ? teamById(a.teamId) : null;
    const isCaptain = team && team.captain === a.id;
    const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const H = a.id === 'pixel' ? 184 : 176;
    const wrap = document.createElement('div'); wrap.className = 'o-actor'; wrap.dataset.id = a.id;
    const btn = document.createElement('button'); btn.className = 'o-body'; btn.type = 'button'; btn.dataset.id = a.id; btn.tabIndex = -1;
    btn.style.setProperty('--H', H + 'px');
    const h = hero(ag, { size: H, pose: act.pose, facing: 'three-quarter', seated: act.seated, props: false, holding: act.holding || 'none',
      captain: isCaptain, armband: isCaptain ? team.color : null });
    btn.appendChild(h);
    btn.insertAdjacentHTML('beforeend', `<span class="o-blanket" style="--bk:${hueHex(ag.hue)}" aria-hidden="true"></span>`);
    btn.insertAdjacentHTML('beforeend', `<span class="o-over" aria-hidden="true">
        <span class="o-bubble" hidden></span>
        <span class="o-bang" hidden><b>!</b><span>Needs you</span></span>
        <span class="o-tag"><i class="o-ti"></i><span class="o-tt"></span><i class="o-unread" hidden></i></span>
        <span class="o-card"></span>
      </span>`);
    wrap.appendChild(btn);
    this.layer.appendChild(wrap);
    const p = this.anchor(a.at);
    const rec = { id: a.id, data: a, ag, team, wrap, btn, hero: h, x: p.x, y: p.y, held: false, waiters: [], dir: 'right' };
    this.actors[a.id] = rec;
    if (!a.onProject) wrap.classList.add('gone');
    this._moveNow(rec, p.x, p.y);
    this._card(rec);
    this._apply(rec);
    return rec;
  },
  _card(rec) {
    const a = rec.data, ag = rec.ag;
    const teamBit = rec.team ? `${emblemSVG(rec.team, 16, { decorative: true })}<span>${escapeHtml(rec.team.name.replace(/^The /, ''))}</span>` : (a.id === 'pixel' ? '<span>Director</span>' : '<span class="o-solo">Solo</span>');
    const reach = (a.reach || []).map(id => credById(id)).filter(Boolean).map(c => c.name);
    rec.btn.querySelector('.o-card').innerHTML = `<b>${escapeHtml(ag.name)}</b><span class="o-cmeta">${escapeHtml(ag.role)} · ${teamBit}</span>${reach.length ? `<span class="o-reach">reaches ${escapeHtml(reach.join(' · '))}</span>` : ''}`;
  },

  /* ---------------------------------------------------------- anchors */
  anchor(id) {
    if (!id) return { x: 800, y: 600 };
    if (typeof id === 'object') return id;
    const T = THEME_OFFICE;
    if (id === 'director') return { x: T.director.x, y: T.director.y };
    let m = /^([ABC])-(\d)$/.exec(id);
    if (m) { const pod = T.pods.find(p => p.id === m[1]); return { ...pod.seats[+m[2] - 1] }; }
    m = /^hot-(\d)$/.exec(id); if (m) return { ...T.hotDesks[+m[1] - 1] };
    m = /^couch-(\d)$/.exec(id); if (m) return { ...T.couch[+m[1] - 1] };
    m = /^bean-(\d)$/.exec(id); if (m) return { ...T.beanbags[+m[1] - 1] };
    m = /^visit:(.+)$/.exec(id);
    if (m) {
      const r = this.actors[m[1]]; const at = r ? r.data.at : null; const p = r ? { x: r.x, y: r.y } : { x: 800, y: 600 };
      if (at === 'director') return { x: p.x - 104, y: p.y + 12, look: 'right' };
      if (/^hot-/.test(at)) return { x: p.x - 66, y: p.y - 16, look: 'right' };
      if (/^couch-|^bean-/.test(at)) return { x: p.x + 70, y: p.y + 40, look: 'left' };
      return { x: p.x - 66, y: p.y + 64, look: 'right' };
    }
    const o = T.objects[id]; if (o && o.stand) return { ...o.stand };
    return { x: 800, y: 600 };
  },
  _route(a, b) {
    const L = THEME_OFFICE.lanes, gaps = THEME_OFFICE.gaps;
    const zone = p => p.y > 580 ? 'F' : 'B';
    const pts = [];
    const push = (x, y) => { const l = pts[pts.length - 1] || a; if (Math.abs(l.x - x) > 1 || Math.abs(l.y - y) > 1) pts.push({ x, y }); };
    const za = zone(a), zb = zone(b);
    if (za === zb) {
      const lane = za === 'B' ? L.back : L.front;
      if (Math.abs(a.y - b.y) < 30 && Math.abs(a.y - lane) < 40) { push(b.x, b.y); return pts; }
      push(a.x, lane); push(b.x, lane); push(b.x, b.y);
    } else {
      const g = gaps.reduce((best, x) => Math.abs(a.x - x) + Math.abs(b.x - x) < Math.abs(a.x - best) + Math.abs(b.x - best) ? x : best, gaps[0]);
      const la = za === 'B' ? L.back : L.front, lb = zb === 'B' ? L.back : L.front;
      push(a.x, la); push(g, la); push(g, lb); push(b.x, lb); push(b.x, b.y);
    }
    return pts;
  },

  /* ---------------------------------------------------------- motion */
  _moveNow(rec, x, y) {
    rec.x = x; rec.y = y;
    rec.wrap.style.transform = `translate(${x}px,${y}px)`;
    rec.wrap.style.zIndex = Math.round(y) + (rec.data.at === 'director' ? 0 : 0);
    const s = THEME_OFFICE.depth(y) * (rec.id === 'pixel' ? 1.04 : 1);
    rec.btn.style.setProperty('--s', s.toFixed(3));
  },
  sleep(ms) { return this.instant ? Promise.resolve() : new Promise(r => setTimeout(r, ms / this.speed)); },
  free(id) { const r = this.actors[id]; if (!r || !r.held) return Promise.resolve(); return new Promise(res => r.waiters.push(res)); },
  async walkTo(id, target, o = {}) {
    const rec = this.actors[id]; if (!rec) return;
    await this.free(id);
    const to = typeof target === 'string' ? this.anchor(target) : target;
    const from = { x: rec.x, y: rec.y };
    const pts = this._route(from, to);
    rec.walking = true;
    setPose(rec.hero, o.pose || (o.holding && o.holding !== 'none' ? 'carrying' : 'walking'), { seated: false, holding: o.holding || 'none', props: false, moving: true });
    rec.wrap.classList.add('walking');
    if (this.instant || reducedMotion()) {
      if (!this.instant) { rec.wrap.classList.add('blink-out'); await new Promise(r => setTimeout(r, 150)); }
      this._moveNow(rec, to.x, to.y);
      if (!this.instant) { rec.wrap.classList.remove('blink-out'); }
    } else {
      for (const p of pts) {
        const dx = p.x - rec.x, dy = p.y - rec.y; const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > 2) { rec.dir = dx < 0 ? 'left' : 'right'; setFacing(rec.hero, 'side', { dir: rec.dir }); }
        else if (dy > 0) setFacing(rec.hero, 'front');
        else setFacing(rec.hero, 'side', { dir: rec.dir });
        const ms = Math.max(120, dist / 300 * 1000) / this.speed;
        rec.wrap.style.transitionDuration = ms + 'ms';
        /* z-sort: going nearer, update z first; going away, after */
        if (dy > 0) rec.wrap.style.zIndex = Math.round(p.y);
        this._moveNow(rec, p.x, p.y);
        await new Promise(r => setTimeout(r, ms));
        rec.wrap.style.zIndex = Math.round(p.y);
      }
      rec.wrap.style.transitionDuration = '';
    }
    rec.walking = false; rec.wrap.classList.remove('walking');
    if (typeof target === 'string') rec.data.at = target;
    if (to.look) setFacing(rec.hero, 'side', { dir: to.look });
  },

  /* ---------------------------------------------------------- state → look */
  setActivity(id, kind, o = {}) {
    const rec = this.actors[id]; const a = rec ? rec.data : wsAgent(id); if (!a) return;
    const act = ACTIVITY[kind] || ACTIVITY.idle;
    a.activity = Object.assign({}, a.activity, { kind, label: o.label || act.tag, detail: o.detail || o.label || act.tag, target: o.target ?? null, short: o.short || null });
    if ('featureId' in o) a.activity.featureId = o.featureId;
    if (kind === 'sleeping') a.session = 'asleep'; else if (kind === 'idle') a.session = 'idle'; else a.session = 'running';
    if (rec) this._apply(rec, o);
    this.deskSync(a.seat);
    if (typeof officeChanged === 'function') officeChanged(id);
  },
  _apply(rec, o = {}) {
    const a = rec.data; const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const atDesk = a.at && a.at === a.seat;
    const onCouch = /^couch-|^bean-/.test(a.at || '');
    const lying = false; /* sleepers sit slumped on their own cushion — reads better than lying (UX review) */
    const seated = !lying && act.seated && (atDesk || onCouch);
    if (!rec.walking) {
      setPose(rec.hero, act.pose, { seated, holding: act.holding || 'none', props: false, moving: false });
      if (!rec.held) {
        if (o.facing) setFacing(rec.hero, o.facing, { dir: o.dir || 'right' });
        else if (act.pose === 'sleeping' || kindFront(a.activity.kind)) setFacing(rec.hero, 'front');
        else setFacing(rec.hero, 'three-quarter', { dir: a.at === 'director' ? 'left' : 'right' });
      }
    }
    rec.btn.style.setProperty('--hy', rec.hero.style.getPropertyValue('--head-y') || '10%');
    rec.btn.style.setProperty('--lift', (seated && atDesk ? 16 : 0) + 'px');
    rec.wrap.classList.toggle('lying', !rec.walking && lying);
    rec.wrap.dataset.kind = a.activity.kind;
    rec.wrap.classList.toggle('asleep', a.activity.kind === 'sleeping');
    rec.wrap.dataset.family = { sleeping: 'sleep', idle: 'free', 'needs-input': 'needs', 'tests-red': 'red', 'tests-green': 'green', shipped: 'green' }[a.activity.kind] || 'work';
    rec.wrap.classList.toggle('odd', /^[ABC]-[24]$|^hot-[24]$/.test(a.at || '') && !!seated);
    rec.wrap.classList.toggle('needs', a.activity.kind === 'needs-input');
    rec.btn.querySelector('.o-ti').textContent = act.icon;
    const sh = a.activity.short; rec.btn.querySelector('.o-tt').textContent = sh && sh.length <= 13 ? sh : act.tag;
    this.bang(rec.id, a.activity.kind === 'needs-input');
    rec.btn.setAttribute('aria-label', actorLabel(a));
    function kindFront(k) { return k === 'shipped'; }
  },
  bang(id, on) {
    const r = this.actors[id]; if (!r) return;
    r.btn.querySelector('.o-bang').hidden = !on;
    r.wrap.classList.toggle('has-bang', !!on);
  },
  unread(id, on) { const r = this.actors[id]; if (r) r.btn.querySelector('.o-unread').hidden = !on; },

  /* desks read their owner's state */
  deskSync(seatId) {
    const ids = seatId ? [seatId] : Object.keys(this.desks);
    ids.forEach(sid => {
      const d = this.desks[sid]; if (!d) return;
      const owner = sid === 'director' ? WS.director : WS.agents.find(a => a.seat === sid && a.onProject);
      const s = { glyph: 'off', hue: d.hue || 'grape', lamp: null, pile: 0, sticky: false, star: false, tray: d.tray, stamp: d.stamp };
      if (owner) {
        const act = ACTIVITY[owner.activity.kind] || ACTIVITY.idle;
        const ag = agentById(owner.id === 'pixel' ? 'director' : owner.id);
        s.hue = ag.hue; s.glyph = act.glyph; s.lamp = act.lamp || d.lastLamp || null; s.pile = Math.ceil((owner.tasksDone || 0) * 0.7);
        if (act.lamp && act.lamp !== 'run') d.lastLamp = act.lamp;
        s.sticky = !!act.sticky; s.star = !!(act.star || d.starred);
        if (act.star) d.starred = true;
        const away = owner.at !== sid;
        d.chair.classList.toggle('empty', away || owner.session === 'asleep');
        d.el.classList.toggle('away', owner.session === 'asleep');
        if (owner.session === 'asleep') s.glyph = 'off';
      } else d.chair.classList.add('empty');
      THEME_OFFICE.deskSync(d.el, s);
    });
  },

  /* a desk gets a (new) owner: re-dress it for them */
  adopt(seatId, agentId) {
    if (/^hot-/.test(seatId)) this._hotDesk(seatId);
    const d = this.desks[seatId]; if (!d) return;
    const ag = agentById(agentId);
    d.el.innerHTML = THEME_OFFICE.desk(d.kind, { hue: d.hue, accent: ag.hue, item: ['mug', 'duck', 'photo', 'cactus', 'plant'][(seatId.length + agentId.length) % 5] });
    d.chair.innerHTML = THEME_OFFICE.chair(ag.hue); d.chair.classList.remove('spare');
    this.deskSync(seatId);
  },
  /* a small real button floating by an actor (e.g. "Chat anyway" on a sleeper) */
  chip(id, label, onClick) {
    const r = this.actors[id]; if (!r) return;
    this.fxLayer.querySelectorAll('.o-chip').forEach(c => c.remove());
    const b = document.createElement('button'); b.type = 'button'; b.className = 'o-chip'; b.textContent = label;
    const H = parseFloat(r.btn.style.getPropertyValue('--H')) || 176; const s = THEME_OFFICE.depth(r.y);
    b.style.transform = `translate(${r.x}px,${r.y - H * s - 8}px)`;
    b.onclick = e => { e.stopPropagation(); b.remove(); onClick(); };
    this.fxLayer.appendChild(b);
    clearTimeout(this._chipT); this._chipT = setTimeout(() => b.remove(), 6000);
  },

  /* ---------------------------------------------------------- talk */
  async say(id, text, o = {}) {
    const rec = this.actors[id]; if (!rec || this.instant) return;
    const b = rec.btn.querySelector('.o-bubble');
    b.innerHTML = escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
    b.hidden = false; b.classList.remove('to-left', 'to-right', 'shout');
    if (o.to && this.actors[o.to]) b.classList.add(this.actors[o.to].x < rec.x ? 'to-left' : 'to-right');
    if (o.shout) b.classList.add('shout');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    rec.wrap.classList.add('speaking');
    const ms = o.ms || 1700;
    await this.sleep(ms);
    if (rec._hoverBubble) await new Promise(r => { rec._release = r; });
    b.hidden = true; rec.wrap.classList.remove('speaking');
  },
  /* converse: max 2 conversations visible at once — extras wait */
  async converse(a, b, lines) {
    while (this._convos >= 2 && !this.instant) await this.sleep(400);
    this._convos++;
    try { for (let i = 0; i < lines.length; i++) await this.say(i % 2 ? b : a, lines[i], { to: i % 2 ? a : b }); }
    finally { this._convos--; }
  },

  /* ---------------------------------------------------------- facing the viewer */
  face(id) {
    const r = this.actors[id]; if (!r) return;
    if (!r.held) r._prevFacing = r.hero._hero ? r.hero._hero.opts.facing : 'three-quarter';
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
    const r = this.actors[id]; if (!r) return;
    const cls = 'r-' + kind;
    r.wrap.classList.remove(cls); void r.wrap.offsetWidth; r.wrap.classList.add(cls);
    clearTimeout(r._rt); r._rt = setTimeout(() => r.wrap.classList.remove(cls), 1400);
    if (kind === 'hop') { r.hero.classList.remove('hop'); void r.hero.offsetWidth; r.hero.classList.add('hop'); }
  },

  /* ---------------------------------------------------------- props in flight */
  async fly(kind, from, to, ms = 1100) {
    if (this.instant) return;
    const el = document.createElement('div'); el.className = 'o-flyer o-fly-' + kind; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = kind === 'plane'
      ? `<svg viewBox="-20 -14 40 28" width="44" height="30"><path d="M-18 2 L18 -12 L4 12 L0 4Z" fill="#fff6e9" stroke="#241a44" stroke-width="2.5" stroke-linejoin="round"/><path d="M0 4 L18 -12" stroke="#241a44" stroke-width="2"/></svg>`
      : kind === 'ball' ? `<svg viewBox="-8 -8 16 16" width="16" height="16"><circle r="6.5" fill="#fff6e9" stroke="#241a44" stroke-width="2"/><path d="M-3 -2 l3 3 3 -4 M-4 3 l4 -1" stroke="#8e86ad" stroke-width="1.2" fill="none"/></svg>`
      : `<span class="o-env">📨</span>`;
    this.fxLayer.appendChild(el);
    el.style.transform = `translate(${from.x}px,${from.y}px)`;
    if (reducedMotion()) { el.classList.add('static'); el.style.transform = `translate(${(from.x + to.x) / 2}px,${(from.y + to.y) / 2}px)`; await this.sleep(1500); el.remove(); return; }
    void el.offsetWidth;
    el.style.transitionDuration = (ms / this.speed) + 'ms';
    el.style.transform = `translate(${to.x}px,${to.y}px)`;
    el.classList.add('go');
    await this.sleep(ms);
    el.remove();
  },
  burst(x, y) {
    if (this.instant || reducedMotion()) return;
    const cols = [PALETTE.sun, PALETTE.coral, PALETTE.teal, PALETTE.mint, PALETTE.grape, PALETTE.rose];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('i'); p.className = 'o-conf';
      p.style.background = cols[i % cols.length];
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', (Math.random() * 260 - 130).toFixed(0) + 'px');
      p.style.setProperty('--dy', (-60 - Math.random() * 150).toFixed(0) + 'px');
      p.style.setProperty('--r', (Math.random() * 720).toFixed(0) + 'deg');
      p.style.animationDelay = (Math.random() * .15).toFixed(2) + 's';
      this.fxLayer.appendChild(p); setTimeout(() => p.remove(), 1800);
    }
  },
  /* small one-shot floating label in the world (e.g. "+6%") */
  pop(x, y, text) {
    if (this.instant) return;
    const p = document.createElement('div'); p.className = 'o-popup'; p.textContent = text;
    p.style.transform = `translate(${x}px,${y}px)`; this.fxLayer.appendChild(p); setTimeout(() => p.remove(), 1600);
  },

  /* ---------------------------------------------------------- camera */
  fit() {
    if (!this.box) return;
    const vp = this.box.parentElement; const W = vp.clientWidth, H = vp.clientHeight;
    const k = Math.min(W / 1600, H / 1062);
    this.k = k;
    const ox = (W - 1600 * k) / 2, oy = (H - 1062 * k) / 2;
    this.box.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
    this.box.style.setProperty('--k', k);
    this._ox = ox; this._oy = oy;
    if (this.zoom.obj) this.zoomTo(this.zoom.obj, true);
  },
  /* fit an object's bounds into the viewport; null = back to the office */
  zoomTo(objId, quiet) {
    if (!this.box) return null;
    const vp = this.box.parentElement; const W = vp.clientWidth, H = vp.clientHeight;
    let z = 1, tx = 0, ty = 0, rect = null;
    if (objId) {
      const o = THEME_OFFICE.objects[objId] || THEME_OFFICE.objects.whiteboard;
      const pad = objId === 'whiteboard' ? 1.0 : 1;
      const bx = o.x - 16 * pad, by = o.y + 70 - 16 * pad, bw = o.w + 32 * pad, bh = o.h + 32 * pad;
      z = Math.min((W * 0.94) / (bw * this.k), (H * 0.9) / (bh * this.k));
      const cx = bx + bw / 2, cy = by + bh / 2;
      tx = 800 - z * cx; ty = 531 - z * cy;
      rect = { x: this._ox + this.k * (z * (o.x) + tx), y: this._oy + this.k * (z * (o.y + 70) + ty), w: o.w * z * this.k, h: o.h * z * this.k };
    }
    this.zoom = { z, tx, ty, obj: objId };
    this.cam.classList.toggle('quiet', !!quiet);
    this.cam.style.transform = objId ? `translate(${tx}px,${ty}px) scale(${z})` : '';
    this.box.style.setProperty('--z', z);
    this.box.classList.toggle('zoomed', !!objId);
    return rect;
  },
};

/* the accessible name of an actor — full sentence, never colour-only */
function actorLabel(a) {
  const ag = agentById(a.id === 'pixel' ? 'director' : a.id);
  const team = a.teamId ? teamById(a.teamId) : null;
  const where = a.id === 'pixel' ? 'Director' : team ? team.name : 'Solo';
  let st = a.activity.detail || a.activity.label;
  if (a.activity.kind === 'needs-input') { const ask = WS.pending.find(p => p.agentId === a.id); st = 'needs your input' + (ask ? ': ' + ask.short : a.activity.detail ? ': ' + a.activity.detail : ''); }
  if (a.activity.kind === 'sleeping') st = 'off shift, sleeping on the couch';
  return `${ag.name}, ${ag.role}, ${where} — ${st}`;
}
