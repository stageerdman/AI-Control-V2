/* ============================================================
   cast.js — Cast → Agents: character-select lineup + hero zoom
   (spec-cast §2–§3, SYNTHESIS seam 2: auto-save, no Save button).
   Routes (read from APP.sub, set by app.js):
     #cast                  lineup
     #cast/agent/<id>       hero zoom (deep link)      #cast/agent/new  create mode
     #cast/teams[/<id|new>] → teams.js (renderTeams / squadRoute / openSquad)
   Public:  renderCast(tab), openHero({name, role})  (voice path)
   Shared helpers teams.js reuses (one definition, used everywhere):
     fmtTokens(n), roleBadge(role, px), cxRadios(opts), roleTiles(agent, value, onPick, opts),
     hueSwatches(value, onPick), cxSaved(root), cxFlip(el, fromRect, opts), cxAfter(anim, fn), cxHop(el),
     cxPoof(holder), cxCostume(oldEl, makeNew, done), cxTrap(e, root), cxPlace(z, scene)
   ============================================================ */
const CAST = { tab: null, zoom: null, cur: null, fromCast: false, cols: 0, items: [], prefill: null, q: '', returnTo: null };

/* the router re-calls renderCast on every hash change; knowing we came from a
   #cast route lets us animate in place (FLIP) instead of re-rendering */
window.addEventListener('hashchange', e => {
  let old = '';
  try { old = e.oldURL ? new URL(e.oldURL).hash : ''; } catch (_) { /* noop */ }
  CAST.fromCast = /^#cast(\/|$)/.test(old);
});

/* ============================================================
   Shared helpers
   ============================================================ */
function fmtTokens(n) {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
}
function roleBadge(role, px = 14) {
  const g = ROLE_GEAR[role]; if (!g) return '';
  return `<svg class="role-badge" viewBox="-8.6 -8.6 17.2 17.2" width="${px}" height="${px}" aria-hidden="true" focusable="false"><circle r="7.6" fill="${hueHex(g.accent)}" stroke="#241a44" stroke-width="1.4"/>${g.badge()}</svg>`;
}
function _cxEl(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

/* radiogroup with roving tabindex; arrows move + select (ARIA radio pattern) */
function cxRadios({ label, items, value, onPick, cls = '' }) {
  const g = _cxEl('div', 'cx-radios ' + cls); g.setAttribute('role', 'radiogroup'); g.setAttribute('aria-label', label);
  const btns = items.map(it => {
    const b = _cxEl('button', 'cx-radio', it.html); b.type = 'button'; b.setAttribute('role', 'radio');
    b.dataset.value = it.value; b.setAttribute('aria-label', it.label || it.value); if (it.title) b.title = it.title;
    g.appendChild(b); return b;
  });
  const set = v => {
    btns.forEach(b => { const on = b.dataset.value === String(v); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
    if (!btns.some(b => b.tabIndex === 0) && btns[0]) btns[0].tabIndex = 0;
  };
  set(value);
  g.addEventListener('click', e => {
    const b = e.target.closest('.cx-radio'); if (!b || b.getAttribute('aria-checked') === 'true') return;
    set(b.dataset.value); onPick(b.dataset.value, b);
  });
  g.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const i = btns.indexOf(document.activeElement); if (i < 0) return;
    let j = null;
    if (step) j = (i + step + btns.length) % btns.length; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = btns.length - 1; else return;
    e.preventDefault(); e.stopPropagation(); btns[j].focus(); btns[j].click();
  });
  g.set = set; g.btns = btns;
  return g;
}
/* "loadout" tiles: the agent themselves wearing each role's gear */
function roleTiles(agent, value, onPick, { label = 'Role', castRole = null } = {}) {
  return cxRadios({
    label, cls: 'role-tiles', value, onPick,
    items: ROLES.map(r => ({
      value: r, label: `Role ${r}${r === castRole ? ', cast role' : ''}. ${ROLE_GEAR[r].look}`, title: ROLE_GEAR[r].look,
      html: `<span class="rt-fig">${heroSVG(Object.assign({}, agent, { role: r }), { size: 52, facing: 'front' })}</span><span class="rt-name">${r}</span>${r === castRole ? '<span class="rt-cast">cast</span>' : ''}`,
    })),
  });
}
const _CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="#241a44" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function hueSwatches(value, onPick, label = 'Colour') {
  return cxRadios({
    label, cls: 'swatches', value, onPick,
    items: HUES.map(h => ({ value: h, label: `${label} ${COLOR_NAMES[h]}`, title: COLOR_NAMES[h], html: `<span class="sw" style="--c:${PALETTE[h]}">${_CHECK}</span>` })),
  });
}
function _chips(label, list, value, onPick) {
  return cxRadios({ label, cls: 'chips', value, onPick, items: list.map(v => ({ value: v, label: `${label} ${v}`, html: escapeHtml(v) })) });
}
/* quiet "Saved ✓" pip next to the panel kicker */
function cxSaved(root) {
  const p = root && root.querySelector('.zp-saved'); if (!p) return;
  p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
}
/* FLIP: animate el from fromRect to where it is now (or back, reverse:true). Feet-anchored. */
function cxFlip(el, from, { duration = 560, easing = 'cubic-bezier(.2,.8,.2,1)', reverse = false } = {}) {
  if (!el || !from || !from.width || reducedMotion()) return null;
  const to = el.getBoundingClientRect(); if (!to.width) return null;
  const s = from.height / to.height;
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2), dy = from.bottom - to.bottom;
  const a = `translate(${dx}px,${dy}px) scale(${s})`;
  el.style.transformOrigin = '50% 100%';
  return el.animate(reverse ? [{ transform: 'none' }, { transform: a }] : [{ transform: a }, { transform: 'none' }],
    { duration, easing, fill: reverse ? 'forwards' : 'none' });
}
/* run fn once when an animation ends — with a timer fallback (throttled tabs never fire onfinish) */
function cxAfter(anim, fn) {
  let done = false; const once = () => { if (!done) { done = true; fn(); } };
  if (!anim) { once(); return; }
  anim.onfinish = once;
  const t = anim.effect && anim.effect.getTiming ? (+anim.effect.getTiming().duration || 0) + (+anim.effect.getTiming().delay || 0) : 600;
  setTimeout(once, t + 120);
}
function cxHop(h) { if (!h || reducedMotion()) return; h.classList.remove('hop'); void h.offsetWidth; h.classList.add('hop'); setTimeout(() => h.classList.remove('hop'), 420); }
function cxPoof(holder) {
  if (!holder || reducedMotion()) return;
  const p = _cxEl('div', 'cx-poof', '<i></i>'.repeat(8)); p.setAttribute('aria-hidden', 'true');
  holder.appendChild(p); setTimeout(() => p.remove(), 650);
}
/* costume change: squash to a sliver, swap gear at the midpoint, spring back + poof */
function cxCostume(oldEl, makeNew, done) {
  if (!oldEl) return;
  if (reducedMotion()) { const n = makeNew(); oldEl.replaceWith(n); if (done) done(n); return; }
  const holder = oldEl.parentElement;
  oldEl.classList.add('cx-twirl-out');
  setTimeout(() => {
    const n = makeNew(); n.classList.add('cx-twirl-in');
    if (oldEl.isConnected) oldEl.replaceWith(n);
    cxPoof(holder);
    setTimeout(() => n.classList.remove('cx-twirl-in'), 260);
    if (done) done(n);
  }, 170);
}
function cxTrap(e, root) {
  if (e.key !== 'Tab') return;
  const f = [...root.querySelectorAll('button:not([disabled]),[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')]
    .filter(x => x.offsetParent !== null && !x.closest('[inert],[hidden]'));
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
/* overlays sit inside the scrolling scene: pin them to the visible box */
function cxPlace(z, scene) {
  z.style.top = scene.scrollTop + 'px'; z.style.height = scene.clientHeight + 'px';
  scene.classList.add('zoomed');
}
/* measure an element as if `world` had no camera transform */
function _cxRectUnpushed(world, el, classes) {
  world.style.transition = 'none';
  const had = classes.filter(c => world.classList.contains(c)); had.forEach(c => world.classList.remove(c));
  const r = el.getBoundingClientRect();
  had.forEach(c => world.classList.add(c)); void world.offsetWidth; world.style.transition = '';
  return r;
}

/* ============================================================
   Router entry
   ============================================================ */
function renderCast(tab = 'agents') {
  const scene = document.getElementById('scene-cast');
  const sub = (APP.sub || '').split('/').filter(Boolean);
  const zoom = tab === 'teams' ? (sub[1] || null) : (sub[0] === 'agent' ? (sub[1] || null) : null);
  const live = CAST.fromCast && CAST.tab === tab && scene.querySelector('#castBody');
  CAST.fromCast = false;
  if (live) { if (tab === 'teams') squadRoute(zoom); else _heroRoute(zoom); return; }

  CAST.tab = tab; CAST.zoom = null; CAST.cur = null; CAST.cols = 0;
  if (typeof SQ !== 'undefined') Object.assign(SQ, { id: null, team: null, draft: null, sel: null });
  scene.classList.remove('zoomed'); scene.scrollTop = 0;
  scene.innerHTML = `
    <div class="cast-world">
      <div class="scene-head cast-head">
        <h1>The Cast</h1>
        <div class="lib-tabs" role="tablist" aria-label="Cast">
          <a role="tab" href="#cast" aria-selected="${tab === 'agents'}">Agents</a>
          <a role="tab" href="#cast/teams" aria-selected="${tab === 'teams'}">Teams</a>
        </div>
        <div class="spacer"></div>
        ${tab === 'agents' ? `<label class="cast-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M16.5 16.5 L21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          <input type="search" id="castSearch" placeholder="Search name or role" aria-label="Search the cast by name or role" autocomplete="off" value="${escapeAttr(CAST.q)}"></label>`
          : `<button class="btn btn-sm cast-new-team" type="button">+ New team</button>`}
      </div>
      <div id="castBody"></div>
    </div>`;
  const body = scene.querySelector('#castBody');
  if (tab === 'teams') {
    scene.querySelector('.cast-new-team').onclick = () => go('cast/teams/new');
    renderTeams(body);
    if (zoom) openSquad(zoom, { animate: false });
    _castDemo(); return;
  }
  _renderLineup(body);
  const s = scene.querySelector('#castSearch');
  s.addEventListener('input', () => { CAST.q = s.value; _applySearch(true); });
  s.addEventListener('keydown', e => { if (e.key === 'Escape' && s.value) { e.preventDefault(); s.value = ''; CAST.q = ''; _applySearch(true); } });
  if (zoom) _openAgent(zoom, { animate: false });
  _castDemo();
}
/* voice path: "make a backend agent called Major Refactor" */
function openHero({ name = '', role = 'Frontend' } = {}) {
  CAST.prefill = { name, role: ROLES.includes(role) ? role : 'Frontend' };
  go('cast/agent/new');
}

/* ============================================================
   Lineup (character select)
   ============================================================ */
const SLOT_W = 168, SLOT_GAP = 24;

function _renderLineup(body) {
  body.innerHTML = `<div class="lineup-wrap"><div class="lineup" role="list" aria-label="Agents"></div>
    <p class="lineup-none" hidden></p></div>`;
  CAST.items = AGENTS.map(_slotEl).concat(_ghostSlotEl());
  CAST.cols = 0;
  _layoutLineup();
  _applySearch(false);
  const lineup = body.querySelector('.lineup');
  lineup.addEventListener('keydown', _lineupKeys);
  body.querySelector('.lineup-none').addEventListener('click', e => {
    if (e.target.closest('.recruit-q')) openHero({ name: CAST.q.trim().slice(0, 22) });
  });
}
function _slotEl(a) {
  const li = _cxEl('div', 'slot-li'); li.setAttribute('role', 'listitem');
  const b = _cxEl('button', 'slot'); b.type = 'button'; b.dataset.id = a.id; b.tabIndex = -1;
  b.setAttribute('aria-label', `${a.name}, ${a.role}. Open details`);
  b.innerHTML = `<span class="slot-cone" aria-hidden="true"></span><span class="slot-fig"><span class="slot-pool" aria-hidden="true"></span></span>
    <span class="slot-name">${escapeHtml(a.name)}</span><span class="slot-role">${roleBadge(a.role, 13)}${escapeHtml(a.role)}</span>`;
  b.querySelector('.slot-fig').appendChild(hero(a, { size: 'md' }));
  _wireSlot(b); li.appendChild(b); return li;
}
function _ghostSlotEl() {
  const li = _cxEl('div', 'slot-li ghost-li'); li.setAttribute('role', 'listitem');
  const b = _cxEl('button', 'slot slot-ghost'); b.type = 'button'; b.dataset.id = 'new'; b.tabIndex = -1;
  b.setAttribute('aria-label', 'Create a new agent');
  b.innerHTML = `<span class="slot-cone" aria-hidden="true"></span><span class="slot-fig"><span class="slot-pool" aria-hidden="true"></span></span>
    <span class="slot-name">New agent</span><span class="slot-role">+ Recruit</span>`;
  b.querySelector('.slot-fig').appendChild(hero({ hue: 'sun' }, { size: 'md', ghost: true, facing: 'front' }));
  _wireSlot(b); li.appendChild(b); return li;
}
function _wireSlot(b) {
  b.addEventListener('mouseenter', () => _slotHot(b, true));
  b.addEventListener('mouseleave', () => { if (document.activeElement !== b || !b.matches(':focus-visible')) _slotHot(b, false); });
  b.addEventListener('focus', () => { if (b.matches(':focus-visible')) _slotHot(b, true); });
  b.addEventListener('blur', () => _slotHot(b, false));
  b.addEventListener('click', () => go('cast/agent/' + b.dataset.id));
}
function _slotHot(b, on) {
  if (b.classList.contains('hot') === on) return;
  b.classList.toggle('hot', on);
  const lineup = b.closest('.lineup'); if (lineup) lineup.classList.toggle('has-hot', !!lineup.querySelector('.slot.hot'));
  const h = b.querySelector('.hero'); if (!h || b.classList.contains('slot-ghost')) return;
  if (on) { setFacing(h, 'front'); cxHop(h); }
  else setFacing(h, b.dataset.facing || 'three-quarter', { dir: b.dataset.dir || 'right' });
}
/* balanced rows (11 → 6+5), characters face inward like a lineup */
function _layoutLineup() {
  const lineup = document.querySelector('#scene-cast .lineup'); if (!lineup) return;
  const w = lineup.clientWidth || 1000;
  const narrow = w < 560;
  const slotW = narrow ? 120 : SLOT_W, gap = narrow ? 12 : SLOT_GAP;
  const cols = Math.max(2, Math.min(6, Math.floor((w + gap) / (slotW + gap))));
  if (cols === CAST.cols && lineup.children.length) return;
  CAST.cols = cols;
  const n = CAST.items.length, rows = Math.ceil(n / cols), per = Math.ceil(n / rows);
  lineup.innerHTML = '';
  for (let r = 0; r < rows; r++) {
    const row = _cxEl('div', 'lineup-row'); row.setAttribute('role', 'presentation');
    row.innerHTML = '<span class="lineup-floor" aria-hidden="true"></span>';
    const chunk = CAST.items.slice(r * per, r * per + per);
    chunk.forEach((li, i) => {
      const b = li.querySelector('.slot'); const h = b.querySelector('.hero');
      const k = chunk.length; const mid = (k - 1) / 2;
      const facing = i === mid ? 'front' : 'three-quarter';
      const dir = i < mid ? 'right' : 'left';
      b.dataset.facing = facing; b.dataset.dir = dir; b.dataset.row = r; b.dataset.col = i;
      if (!b.classList.contains('slot-ghost') && !b.classList.contains('hot')) setFacing(h, facing, { dir });
      row.appendChild(li);
    });
    lineup.appendChild(row);
  }
  _rovingFix();
}
function _visibleSlots() { return CAST.items.map(li => li.querySelector('.slot')).filter(b => !b.closest('.away')); }
function _rovingFix(prefer) {
  const vis = _visibleSlots();
  const cur = prefer || vis.find(b => b.tabIndex === 0) || vis[0];
  CAST.items.forEach(li => { const b = li.querySelector('.slot'); b.tabIndex = b === cur ? 0 : -1; });
}
function _lineupKeys(e) {
  const vis = _visibleSlots(); const i = vis.indexOf(document.activeElement); if (i < 0) return;
  const cur = vis[i]; let j = null;
  if (e.key === 'ArrowRight') j = Math.min(vis.length - 1, i + 1);
  else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = vis.length - 1;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const r = +cur.dataset.row + (e.key === 'ArrowDown' ? 1 : -1);
    const inRow = vis.filter(b => +b.dataset.row === r);
    if (inRow.length) { const col = +cur.dataset.col; const t = inRow.reduce((best, b) => Math.abs(+b.dataset.col - col) < Math.abs(+best.dataset.col - col) ? b : best, inRow[0]); j = vis.indexOf(t); }
    else j = i;
  } else return;
  e.preventDefault(); e.stopPropagation();
  _rovingFix(vis[j]); vis[j].focus();
}
function _applySearch(speak) {
  const q = CAST.q.trim().toLowerCase();
  let n = 0;
  CAST.items.forEach(li => {
    const b = li.querySelector('.slot');
    if (b.classList.contains('slot-ghost')) return;
    const a = agentById(b.dataset.id);
    const hit = !q || (a.name + ' ' + a.role).toLowerCase().includes(q);
    if (hit) n++;
    li.classList.toggle('away', !hit); li.inert = !hit;
  });
  const ghost = CAST.items[CAST.items.length - 1];
  const none = q && n === 0;
  ghost.classList.toggle('away', !!none); ghost.inert = !!none;
  const p = document.querySelector('#scene-cast .lineup-none');
  if (p) {
    p.hidden = !none;
    if (none) p.innerHTML = `No one by that name. <button type="button" class="recruit-q">Recruit “${escapeHtml(CAST.q.trim().slice(0, 22))}”</button>`;
  }
  _rovingFix();
  if (speak) {
    clearTimeout(_applySearch.t);
    _applySearch.t = setTimeout(() => announce(!q ? 'Showing the whole cast' : n ? `${n} agent${n === 1 ? '' : 's'} match` : 'No agents match'), 350);
  }
}
window.addEventListener('resize', () => {
  clearTimeout(_layoutLineup.t);
  _layoutLineup.t = setTimeout(() => {
    if (APP.stage !== 'cast') return;
    if (CAST.tab === 'agents' && !CAST.zoom) _layoutLineup();
    const z = document.querySelector('#scene-cast .zoom'); const scene = document.getElementById('scene-cast');
    if (z) { cxPlace(z, scene); if (z.classList.contains('zoom-agent')) _refreshBig(false); else if (typeof squadRelayout === 'function') squadRelayout(); }
  }, 120);
});

/* ============================================================
   Hero zoom
   ============================================================ */
function _heroRoute(zoom) {
  if (zoom === CAST.zoom) return;
  if (!CAST.zoom && zoom) _openAgent(zoom, { animate: true });
  else if (CAST.zoom && !zoom) _closeAgent({ animate: true });
  else { _closeAgent({ animate: false }); _openAgent(zoom, { animate: false }); }
}
function _leastUsedHue() {
  const c = Object.fromEntries(HUES.map(h => [h, 0])); AGENTS.forEach(a => { if (a.hue in c) c[a.hue]++; });
  return HUES.reduce((m, h) => (c[h] < c[m] ? h : m), HUES[0]);
}
function _draftAgent(pre) {
  const role = (pre && pre.role) || 'Frontend';
  return { id: null, name: (pre && pre.name) || '', role, hue: _leastUsedHue(), build: 'hero', hair: 'tuft', accessory: 'none',
    prompt: PROMPT_TEMPLATES[role], stats: { projects: 0, tokens: 0 } };
}
function _slotFor(id) {
  const li = CAST.items.find(l => l.querySelector('.slot').dataset.id === (id || 'new'));
  return li ? li.querySelector('.slot') : null;
}
function _bigPx(z) {
  const st = z.querySelector('.z-stage');
  const h = st.clientHeight || 600, w = st.clientWidth || 500;
  return Math.round(Math.max(200, Math.min(380, h * 0.6, w * 0.9 / 0.75)));
}
function _bigHero(agent, px) { return hero(agent, { size: px, facing: 'front' }); }

function _openAgent(id, { animate = true } = {}) {
  const scene = document.getElementById('scene-cast');
  let agent;
  if (id === 'new') { agent = _draftAgent(CAST.prefill); CAST.prefill = null; }
  else {
    agent = AGENTS.find(a => a.id === id);
    if (!agent) { history.replaceState(null, '', '#cast'); APP.sub = ''; return; }
  }
  CAST.zoom = id; CAST.cur = agent;
  const slot = _slotFor(agent.id);
  const slotHero = slot && slot.querySelector('.hero');
  const from = slotHero && !slot.closest('.away') ? slotHero.getBoundingClientRect() : null;
  CAST.returnTo = slot;
  _slotHot(slot || document.createElement('button'), false);

  const z = _cxEl('section', 'zoom zoom-agent');
  z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-labelledby', 'zhTitle');
  z.innerHTML = `<div class="z-bg" aria-hidden="true"></div>
    <div class="z-stage">
      <button class="z-back" type="button"><span aria-hidden="true">←</span> Cast</button>
      <div class="z-cone" aria-hidden="true"></div><div class="z-floor" aria-hidden="true"></div>
      <div class="z-fig"></div>
      <div class="z-nav"></div>
    </div>`;
  cxPlace(z, scene);
  scene.appendChild(z);
  z.querySelector('.z-back').onclick = () => go('cast');
  _paintAgent(z, agent);
  const big = z.querySelector('.z-fig .hero');

  const world = scene.querySelector('.cast-world');
  const anim = animate && !reducedMotion() && from && from.width;
  if (anim) {
    const sr = slot.getBoundingClientRect(), wr = world.getBoundingClientRect();
    world.style.transformOrigin = `${sr.left - wr.left + sr.width / 2}px ${sr.top - wr.top + sr.height / 2}px`;
    slot.parentElement.classList.add('is-flying');
    z.classList.add('entering');
    void z.offsetWidth;
    world.classList.add('camera-push');
    z.classList.remove('entering');
    cxFlip(big, from, { duration: 560 });
  } else {
    world.classList.add('camera-push', 'instant');
    if (animate) z.classList.add('fade-in');
  }
  setTimeout(() => {
    const b = z.querySelector('.z-fig .hero'); if (!b || reducedMotion()) return;
    setPose(b, 'celebrating'); setTimeout(() => { if (b.isConnected) setPose(b, 'idle'); }, 900);
  }, anim ? 560 : 60);
  setTimeout(() => {
    if (!z.isConnected) return;
    if (!agent.id) z.querySelector('.zp-title').focus(); else z.querySelector('#zhTitle').focus();
  }, anim ? 300 : 30);
}

/* stage + panel for one agent (also used by prev/next) */
function _paintAgent(z, agent) {
  const fig = z.querySelector('.z-fig'); fig.innerHTML = '';
  z.style.setProperty('--accent', hueHex((ROLE_GEAR[agent.role] || {}).accent || agent.hue));
  fig.appendChild(_bigHero(agent, _bigPx(z)));
  const nav = z.querySelector('.z-nav');
  const i = AGENTS.indexOf(agent);
  if (i < 0) nav.innerHTML = '';
  else {
    nav.innerHTML = `<button type="button" class="z-step" data-d="-1" aria-label="Previous agent" title="Previous ( [ )">‹</button>
      <span>${i + 1} / ${AGENTS.length}</span>
      <button type="button" class="z-step" data-d="1" aria-label="Next agent" title="Next ( ] )">›</button>`;
    nav.querySelectorAll('.z-step').forEach(b => b.onclick = () => _stepAgent(+b.dataset.d));
  }
  const old = z.querySelector('.z-panel');
  const p = _agentPanel(agent, z);
  if (old) old.replaceWith(p); else z.appendChild(p);
}
function _stepAgent(d) {
  const z = document.querySelector('#scene-cast .zoom-agent'); if (!z || !CAST.cur || !CAST.cur.id) return;
  const i = AGENTS.indexOf(CAST.cur); const next = AGENTS[(i + d + AGENTS.length) % AGENTS.length];
  CAST.cur = next; CAST.zoom = next.id; CAST.returnTo = _slotFor(next.id);
  history.replaceState(null, '', '#cast/agent/' + next.id); APP.sub = 'agent/' + next.id;
  _paintAgent(z, next);
  const big = z.querySelector('.z-fig .hero');
  if (!reducedMotion()) {
    big.animate([{ transform: `translateX(${d * 40}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
    z.querySelector('.z-panel').animate([{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
  }
  announce(`${next.name}, ${next.role}. ${AGENTS.indexOf(next) + 1} of ${AGENTS.length}`);
  z.querySelector('#zhTitle').focus();
}
function _refreshBig(hop = true) {
  const z = document.querySelector('#scene-cast .zoom-agent'); if (!z || !CAST.cur) return;
  const old = z.querySelector('.z-fig .hero'); const n = _bigHero(CAST.cur, _bigPx(z));
  if (old) old.replaceWith(n); else z.querySelector('.z-fig').appendChild(n);
  if (hop) cxHop(n);
}

function _agentPanel(agent, z) {
  const isNew = !agent.id;
  const p = _cxEl('div', 'z-panel');
  p.innerHTML = `<div class="zp-scroll">
    <h2 class="sr-only" id="zhTitle" tabindex="-1"></h2>
    <div class="zp-top"><span class="zp-kicker">${isNew ? 'New recruit' : 'Agent'}</span><span class="zp-saved" aria-hidden="true">Saved ✓</span></div>
    <div class="zp-name">
      <input class="zp-title" id="zpName" maxlength="22" placeholder="Name your agent" aria-label="Agent name" aria-describedby="zpNameErr" autocomplete="off" spellcheck="false">
      <button type="button" class="zp-dice" aria-label="Suggest a funny name" title="Suggest a name"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.6" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.6" fill="currentColor"/></svg></button>
    </div>
    <p class="zp-err" id="zpNameErr" hidden>Give them a name first</p>
    <p class="zp-caption"></p>
    <p class="zp-stats"></p>
    <section class="zp-sec zp-role"><h3 class="zp-label">Role</h3><p class="zp-note" hidden></p></section>
    <section class="zp-sec zp-look"><h3 class="zp-label">Look</h3>
      <div class="look-row"><span class="zp-sub">Colour</span><div class="lk-hue"></div></div>
      <div class="look-row"><span class="zp-sub">Build</span><div class="lk-build"></div></div>
      <div class="look-row"><span class="zp-sub">Hair</span><div class="lk-hair"></div></div>
      <div class="look-row"><span class="zp-sub">Extra</span><div class="lk-acc"></div></div>
    </section>
    <section class="zp-sec"><h3 class="zp-label"><label for="zpPrompt">Brain</label><span class="zp-hint">its own system prompt</span></h3>
      <textarea class="zp-area mono" id="zpPrompt" rows="6" spellcheck="false"></textarea>
      <div class="zp-tpl" hidden></div></section>
    <section class="zp-sec zp-teams-sec"><h3 class="zp-label">Teams</h3><ul class="zp-teams" role="list"></ul></section>
  </div>`;
  const $ = s => p.querySelector(s);
  const saved = () => { if (agent.id) cxSaved(p); };
  const title = $('#zhTitle'), name = $('.zp-title'), err = $('.zp-err');
  name.value = agent.name;

  const caption = () => {
    title.textContent = `${agent.name || 'New agent'}: hero details`;
    $('.zp-caption').innerHTML = `${roleBadge(agent.role, 16)}<span>${escapeHtml(agent.role)}</span><i aria-hidden="true">·</i><span>${COLOR_NAMES[agent.hue] || agent.hue}</span>`;
    $('.zp-stats').textContent = agent.id && (agent.stats.projects || agent.stats.tokens)
      ? `${agent.stats.projects} project${agent.stats.projects === 1 ? '' : 's'} · ${fmtTokens(agent.stats.tokens)} tokens`
      : 'New recruit · no history yet';
  };
  caption();

  /* name: auto-save; create mode commits the record on the first valid name */
  const commitName = v => {
    const t = v.trim();
    if (!t) { err.hidden = !agent.id; return; }
    err.hidden = true; agent.name = t;
    if (!agent.id) {
      agent.id = 'a-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) + '-' + Date.now().toString(36).slice(-4);
      AGENTS.push(agent); CAST.zoom = agent.id;
      history.replaceState(null, '', '#cast/agent/' + agent.id); APP.sub = 'agent/' + agent.id;
      $('.zp-kicker').textContent = 'Agent';
      announce(`${t} joined the cast`);
    }
    caption(); saved();
  };
  name.addEventListener('input', () => commitName(name.value));
  name.addEventListener('blur', () => { if (!name.value.trim() && agent.id) { name.value = agent.name; err.hidden = true; } });
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
  $('.zp-dice').onclick = () => {
    const pool = FUNNY_NAMES.filter(n => !AGENTS.some(a => a.name === n));
    name.value = pool[Math.floor(Math.random() * pool.length)] || FUNNY_NAMES[0];
    commitName(name.value); _refreshBig(true);
  };

  /* role: live costume change + prompt follow-along */
  const tiles = roleTiles(agent, agent.role, r => {
    const prev = agent.role; agent.role = r;
    z.style.setProperty('--accent', hueHex(ROLE_GEAR[r].accent));
    const big = z.querySelector('.z-fig .hero');
    cxCostume(big, () => _bigHero(agent, _bigPx(z)));
    announce(`Now ${r}: ${ROLE_GEAR[r].look}.`);
    const note = $('.zp-note'), tpl = $('.zp-tpl'), area = $('#zpPrompt');
    if (!agent.prompt.trim() || agent.prompt === PROMPT_TEMPLATES[prev]) {
      const before = agent.prompt; agent.prompt = PROMPT_TEMPLATES[r]; area.value = agent.prompt;
      note.hidden = false; tpl.hidden = true;
      note.innerHTML = `Prompt switched to the ${r} template · <button type="button" class="zp-link">Undo</button>`;
      note.querySelector('button').onclick = () => { agent.prompt = before; area.value = before; note.hidden = true; saved(); };
    } else {
      note.hidden = true; tpl.hidden = false;
      tpl.innerHTML = `<button type="button" class="zp-chip">Use ${r} template</button>`;
      tpl.querySelector('button').onclick = () => { agent.prompt = PROMPT_TEMPLATES[r]; area.value = agent.prompt; tpl.hidden = true; saved(); };
    }
    caption(); saved();
  });
  $('.zp-role').insertBefore(tiles, $('.zp-note'));

  /* look: identity, never changes with role */
  const look = (key, v) => {
    agent[key] = v; _refreshBig(true); caption(); saved();
    tiles.querySelectorAll('.cx-radio').forEach(b => { b.querySelector('.rt-fig').innerHTML = heroSVG(Object.assign({}, agent, { role: b.dataset.value }), { size: 52, facing: 'front' }); });
  };
  $('.lk-hue').appendChild(hueSwatches(agent.hue, v => look('hue', v)));
  $('.lk-build').appendChild(_chips('Build', BUILDS, agent.build, v => look('build', v)));
  $('.lk-hair').appendChild(_chips('Hair', HAIR, agent.hair, v => look('hair', v)));
  $('.lk-acc').appendChild(_chips('Extra', ACCESSORIES, agent.accessory, v => look('accessory', v)));

  const area = $('#zpPrompt'); area.value = agent.prompt || '';
  const grow = () => { area.style.height = 'auto'; area.style.height = Math.min(area.scrollHeight + 2, 16 * 20 + 28) + 'px'; };
  area.addEventListener('input', () => { agent.prompt = area.value; grow(); clearTimeout(area.t); area.t = setTimeout(saved, 350); });
  requestAnimationFrame(grow);

  const ts = agent.id ? teamsOf(agent.id) : [];
  $('.zp-teams').innerHTML = ts.length ? ts.map(t => {
    const ov = memberOf(t, agent.id).role;
    return `<li><a href="#cast/teams/${escapeAttr(t.id)}" class="zp-team">${emblemSVG(t, 32, { decorative: true })}<span><b>${escapeHtml(t.name)}</b>${t.captain === agent.id ? '<em>★ Captain</em>' : ''}${ov ? `<em>plays ${escapeHtml(ov)} here</em>` : ''}</span><i aria-hidden="true">›</i></a></li>`;
  }).join('') : '<li class="zp-empty">No team yet — add them from a team’s crew.</li>';
  return p;
}

function _closeAgent({ animate = true } = {}) {
  const scene = document.getElementById('scene-cast');
  const z = scene.querySelector('.zoom-agent');
  const agent = CAST.cur; CAST.zoom = null; CAST.cur = null;
  const world = scene.querySelector('.cast-world');
  if (!z) { if (world) world.classList.remove('camera-push', 'instant'); scene.classList.remove('zoomed'); return; }
  /* rebuild the lineup with any saved changes (the world stays pushed for now) */
  const body = scene.querySelector('#castBody');
  CAST.items = AGENTS.map(_slotEl).concat(_ghostSlotEl()); CAST.cols = 0;
  _layoutLineup(); _applySearch(false);
  const slot = _slotFor(agent && agent.id);
  const li = slot && slot.parentElement;
  const done = () => {
    z.remove(); scene.classList.remove('zoomed');
    world.classList.remove('instant');
    if (li) li.classList.remove('is-flying');
    if (slot && !slot.closest('.away')) {
      _rovingFix(slot); slot.focus({ preventScroll: true });
      if (agent && CAST.returnTo && CAST.returnTo.classList.contains('slot-ghost')) cxHop(slot.querySelector('.hero'));
    } else body.querySelector('.slot')?.focus();
  };
  const big = z.querySelector('.z-fig .hero');
  if (!animate || reducedMotion() || !slot || slot.closest('.away')) {
    world.classList.remove('camera-push');
    if (animate) { z.classList.add('fade-out'); setTimeout(done, 170); } else done();
    return;
  }
  const r = _cxRectUnpushed(world, slot.querySelector('.hero'), ['camera-push', 'instant']);
  const sr = _cxRectUnpushed(world, slot, ['camera-push', 'instant']), wr = _cxRectUnpushed(world, world, ['camera-push', 'instant']);
  world.style.transformOrigin = `${sr.left - wr.left + sr.width / 2}px ${sr.top - wr.top + sr.height / 2}px`;
  world.classList.remove('instant'); void world.offsetWidth;
  li.classList.add('is-flying');
  if (big) setPose(big, 'idle');
  z.classList.add('leaving');
  world.classList.remove('camera-push');
  const a = cxFlip(big, r, { reverse: true, duration: 480 });
  cxAfter(a, done);
}

/* zoom keyboard: Esc = back, Tab trapped, [ / ] prev/next */
document.addEventListener('keydown', e => {
  if (APP.view !== 'studio' || APP.stage !== 'cast') return;
  const z = document.querySelector('#scene-cast .zoom-agent'); if (!z) return;
  if (e.key === 'Tab') { cxTrap(e, z); return; }
  if (e.key === 'Escape') { e.preventDefault(); go('cast'); return; }
  const typing = /input|textarea|select/i.test(e.target.tagName);
  if (!typing && (e.key === '[' || e.key === ']')) { e.preventDefault(); _stepAgent(e.key === ']' ? 1 : -1); }
});

/* dev-only: ?demo=<state>#route opens hover/selection states for headless screenshots.
   hot:N (lineup slot / team row N) · member:<agentId> · strip · picker · search:<q> · role:<Role> */
function _castDemo() {
  const d = new URLSearchParams(location.search).get('demo'); if (!d) return;
  setTimeout(() => {
    const [k, v] = d.split(':');
    const sq = document.querySelector('#scene-cast .zoom-squad');
    if (k === 'hot') {
      const el = document.querySelectorAll('#scene-cast .slot, #scene-cast .team-row')[+v || 0];
      if (el) (el.classList.contains('slot') ? _slotHot : _rowHot)(el, true);
    }
    if (k === 'member' && sq) _selectMember(sq, v);
    if (k === 'strip' && sq) _openStrip(sq);
    if (k === 'picker' && sq) sq.querySelector('.sq-em-btn').click();
    if (k === 'role') document.querySelector(`#scene-cast .zoom .role-tiles [data-value="${v}"]`)?.click();
    if (k === 'search') { const s = document.getElementById('castSearch'); s.value = v; CAST.q = v; _applySearch(false); }
  }, 400);
}
