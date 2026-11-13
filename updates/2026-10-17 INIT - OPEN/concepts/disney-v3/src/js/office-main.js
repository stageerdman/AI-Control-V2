/* ============================================================
   office-main.js — The Office shell (spec-office §1.4, §5, §8).
   Owns: layout (top bar · stage · panel), the stage's object hotspots,
         the accessible list mirror, stage keyboard model, layer routing.
   Contract the router relies on:
     openOffice(projectId, sub)  sub = '' | 'board' | 'features' | 'feature/<id>'
     closeOffice()
   Public: officeChanged(id?) — any module calls this after changing WS;
           officeRefresh() — immediate full refresh of mirrors;
           OM.clickActor(id), OM.focusActor(id), OM.layer
   Demo hooks (dev only, not in UI): ?demo=<state> — see office-sim.js OS.demo.
   ============================================================ */

const OM = { project: null, mounted: false, layer: '', listOpen: false, wide: false, focusId: 'pixel', _q: false };

function openOffice(projectId, sub = '') {
  const p = projById(projectId) || PROJECTS[0];
  if (!OM.mounted || OM.project !== p.id) _omMount(p);
  _omLayer(sub || '');
}
function closeOffice() {
  if (typeof OS !== 'undefined') OS.stop();
  OE.unmount(); OM.mounted = false; OM.project = null;
  document.removeEventListener('keydown', _omKeys);
  window.removeEventListener('resize', _omResize);
  document.getElementById('office').innerHTML = '';
}

function _omMount(p) {
  OM.project = p.id; OM.mounted = true;
  const host = document.getElementById('office');
  host.innerHTML = `
    <header class="o-top" role="banner">
      <a class="ws-chip o-back" href="#projects" aria-label="Back to all projects">← <span>Projects</span></a>
      <div class="o-title">${logoTile(p, true)}<div><b>${escapeHtml(p.name)}</b><span>The Office</span></div></div>
      <button class="o-prog" id="oProg" type="button" aria-label="Open the whiteboard"></button>
      <span class="spacer"></span>
      <div class="o-chips">
        <a class="ws-chip" href="#" id="oGh"></a>
        <button class="ws-chip" type="button" id="oPriv"></button>
        <a class="ws-chip live-dot" href="#" id="oTest"></a>
        <button class="ws-chip" type="button" id="oAccess">🔑 <span class="o-lbl">Access</span></button>
        <button class="ws-chip" type="button" id="oBell"></button>
      </div>
    </header>
    <div class="o-main">
      <section class="o-stagewrap" id="oStage" aria-roledescription="office scene">
        <div class="o-box" id="oBox"></div>
        <div class="o-hots" id="oHots"></div>
        <div class="o-scrim" aria-hidden="true"></div>
        <div class="o-layers" id="oLayers"></div>
        <div class="o-stagectl">
          <button class="o-ctl" type="button" id="oListBtn" aria-pressed="false" aria-controls="oList">▤ <span>List</span></button>
          <button class="o-ctl" type="button" id="oWideBtn" aria-pressed="false" aria-label="Hide the chat panel">⤢</button>
        </div>
        <div class="o-list" id="oList" role="region" aria-label="Office list — everyone and what they are doing"></div>
      </section>
      <aside class="o-panel" id="oPanel"></aside>
    </div>`;
  /* top bar wiring */
  host.querySelector('#oProg').onclick = () => go('board');
  host.querySelector('#oGh').onclick = e => { e.preventDefault(); toast(`🐙 Pushed ${escapeHtml(WS.github.pushedAgo)} · branch <span style="font-family:var(--mono)">${escapeHtml(WS.github.branch)}</span>`); };
  host.querySelector('#oTest').onclick = e => { e.preventDefault(); toast('↗ Opening the preview (prototype — no real link)'); };
  host.querySelector('#oPriv').onclick = _omPrivacy;
  host.querySelector('#oAccess').onclick = () => openProjectAccess(WS.grants, p.name.split(' ')[0]);
  host.querySelector('#oBell').onclick = () => { const ask = WS.pending[0]; if (ask) OP.open(ask.agentId, { from: 'bell' }); else toast('Nobody is waiting on you 🎈'); };
  host.querySelector('#oListBtn').onclick = () => _omToggleList();
  host.querySelector('#oWideBtn').onclick = () => _omWide(!OM.wide);

  OE.mount(host.querySelector('#oBox'));
  _omHotspots();
  OP.mount(host.querySelector('#oPanel'));
  _omStageA11y();
  document.addEventListener('keydown', _omKeys);
  window.addEventListener('resize', _omResize);
  officeRefresh();
  OS.start();
}
function _omResize() { OE.fit(); if (OM.layer) OB.reposition(); }

/* ------------------------------------------------------------ the only three interactive objects */
const OM_HOTS = [
  { id: 'dossier', label: 'Features — now, planned, shipped', act: () => go('features') },
  { id: 'whiteboard', label: 'Whiteboard — progress and tasks', act: () => go('board') },
  { id: 'health', label: 'Health check — modularity, cleanliness, reusability', act: () => go('health') },
];
function _omHotspots() {
  const box = document.querySelector('#oBox .o-world');
  OM_HOTS.forEach(h => {
    const o = THEME_OFFICE.plan.objects[h.id];
    const b = document.createElement('button'); b.type = 'button'; b.className = 'o-hot'; b.dataset.obj = h.id; b.tabIndex = -1;
    b.setAttribute('aria-label', h.label);
    b.style.cssText = `left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px`;
    b.innerHTML = `<span class="o-hot-l" aria-hidden="true">${escapeHtml(o.label)}</span>`;
    b.onclick = e => { e.stopPropagation(); OM.opener = b; h.act(); };
    box.appendChild(b);
  });
}

/* ------------------------------------------------------------ actors: click + keyboard */
function _omStageA11y() {
  const stage = document.getElementById('oStage');
  stage.addEventListener('click', e => {
    const b = e.target.closest('.o-body'); if (!b) return;
    OM.opener = b; OM.clickActor(b.dataset.id);
  });
  stage.addEventListener('focusin', e => {
    const t = e.target.closest('.o-body,.o-hot'); if (!t) return;
    OM.focusId = t.dataset.id || 'obj:' + t.dataset.obj; _omRoving();
  });
  /* bubbles pause while hovered (spec §2 communication) */
  _omRoving();
}
OM.clickActor = function (id) {
  const a = wsAgent(id); if (!a) return;
  if (a.activity.kind === 'sleeping') { OP.sleeperPoke(id); return; }
  OP.open(id, { from: 'scene' });
};
/* order: Pixel → desks in reading order (row, then x) → couch → objects */
function _omOrder() {
  const rank = id => { if (id === 'pixel') return -1; const r = OE.actors[id]; return r ? Math.round(r.y / 120) * 100000 + r.x : 1e9; };
  const ids = ['pixel', ...wsOnProject().map(a => a.id)].sort((a, b) => rank(a) - rank(b));
  return [...ids, ...OM_HOTS.map(h => 'obj:' + h.id)];
}
function _omEl(key) { return key.startsWith('obj:') ? document.querySelector(`.o-hot[data-obj="${key.slice(4)}"]`) : document.querySelector(`.o-body[data-id="${key}"]`); }
function _omRoving() {
  document.querySelectorAll('#oStage .o-body,#oStage .o-hot').forEach(el => el.tabIndex = -1);
  const el = _omEl(OM.focusId) || _omEl('pixel'); if (el) el.tabIndex = 0;
}
OM.focusActor = function (key) { OM.focusId = key; _omRoving(); const el = _omEl(key); if (el) el.focus({ preventScroll: true }); };
function _omPos(key) {
  if (key.startsWith('obj:')) { const o = THEME_OFFICE.plan.objects[key.slice(4)]; return { x: o.x + o.w / 2, y: o.y + o.h / 2 }; }
  const r = OE.actors[key]; return r ? { x: r.x, y: r.y - 50 } : { x: 0, y: 0 };
}
function _omKeys(e) {
  if (APP.view !== 'office' || sheetOpen()) return;
  const t = e.target; const typing = /input|textarea|select/i.test(t.tagName) || t.isContentEditable;
  if (e.key === 'Escape' && !typing) {
    if (OM.listOpen) { _omToggleList(false); return; }
    if (OM.layer) { e.preventDefault(); OB.escape(); return; }
    if (OP.thread !== 'pixel') { OP.open('pixel'); return; }
  }
  if (typing) return;
  if (e.altKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) { e.preventDefault(); OS.replay(); return; }
  if (e.key === '!' ) {
    const ask = WS.pending[0]; if (!ask) { announce('Nobody needs you right now.'); return; }
    e.preventDefault(); if (OM.layer) go('office'); OM.focusActor(ask.agentId); return;
  }
  const inStage = t.closest && t.closest('#oStage .o-body,#oStage .o-hot'); if (!inStage || OM.layer) return;
  const order = _omOrder();
  if (e.key === 'Home') { e.preventDefault(); OM.focusActor('pixel'); return; }
  if (e.key === 'End') { e.preventDefault(); OM.focusActor(order[order.length - 1]); return; }
  const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const d = dirs[e.key]; if (!d) return;
  e.preventDefault();
  const cur = _omPos(OM.focusId); let best = null, bs = Infinity;
  order.forEach(k => {
    if (k === OM.focusId) return; const el = _omEl(k); if (!el || el.closest('.gone')) return;
    const p = _omPos(k); const dx = p.x - cur.x, dy = p.y - cur.y;
    const along = dx * d[0] + dy * d[1]; if (along <= 4) return;
    const across = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
    const s = along + across * 2.2; if (s < bs) { bs = s; best = k; }
  });
  if (best) OM.focusActor(best);
}

/* ------------------------------------------------------------ refresh (mirrors) */
function officeChanged() {
  if (OM._q) return; OM._q = true;
  Promise.resolve().then(() => { OM._q = false; officeRefresh(); });
}
function officeRefresh() {
  if (!OM.mounted) return;
  _omTop(); _omList();
  const n = WS.pending.length, people = 1 + wsOnProject().length;
  document.getElementById('oStage').setAttribute('aria-label', `Office — ${people} people${n ? `, ${n} need${n === 1 ? 's' : ''} you` : ''}. Arrow keys move between people; ! jumps to whoever needs you.`);
  document.getElementById('oStage').setAttribute('role', 'group');
  THEME_OFFICE.sync(OE.art, WS);
  Object.values(OE.actors).forEach(r => OE._card(r));
  OP.refresh();
  if (OM.layer) OB.refresh();
}
function _omTop() {
  const $ = id => document.getElementById(id);
  $('oProg').innerHTML = `<b>${WS.overall}%</b><span class="o-pbar"><i style="width:${WS.overall}%"></i></span><span class="o-ptgt">→ ${escapeHtml(WS.target)}</span>`;
  $('oProg').setAttribute('aria-label', `${WS.overall}% to ${WS.target} — open the whiteboard`);
  $('oGh').innerHTML = `<span class="ok">●</span> <span class="o-lbl">GitHub</span> ✓`;
  $('oGh').title = `Pushed ${WS.github.pushedAgo} · branch ${WS.github.branch}`;
  $('oGh').setAttribute('aria-label', `GitHub connected — pushed ${WS.github.pushedAgo}`);
  $('oPriv').innerHTML = WS.private ? '🔒 <span class="o-lbl">Private</span>' : '🌐 <span class="o-lbl">Public</span>';
  $('oTest').innerHTML = `Test ↗ <span class="o-lbl o-url">${escapeHtml(WS.testUrl)}</span>`;
  $('oTest').title = `Preview ${WS.testFresh}`;
  $('oTest').classList.toggle('fresh', !!OM.testFresh);
  const n = WS.pending.length;
  $('oBell').innerHTML = `🔔${n ? `<span class="bell-badge">${n}</span>` : ''}`;
  $('oBell').setAttribute('aria-label', n ? `${n} ${n === 1 ? 'person needs' : 'people need'} your input — open the oldest` : 'Nobody is waiting on you');
}
function _omPrivacy() {
  const goingPublic = WS.private;
  const body = document.createElement('div');
  body.innerHTML = `<h2>${goingPublic ? 'Make Aurora public?' : 'Make Aurora private?'}</h2>
    <p class="hint" style="margin:8px 0 18px;font-size:14px">${goingPublic ? 'Anyone with the GitHub link will see the code. Secrets stay masked and never leave the vault.' : 'Only you and granted agents will see the repo.'}</p>
    <div class="row"><button class="btn btn-ghost" id="pvNo">Keep ${goingPublic ? 'private' : 'public'}</button><button class="btn btn-hero" id="pvYes">${goingPublic ? 'Make public' : 'Make private'}</button></div>`;
  openSheet(body, 'Change visibility');
  body.querySelector('#pvNo').onclick = closeSheet;
  body.querySelector('#pvYes').onclick = () => { WS.private = !WS.private; closeSheet(); toast(WS.private ? '🔒 Aurora is private' : '🌐 Aurora is public'); officeRefresh(); };
}

/* list mirror: same state, grouped; rows do what clicking the agent does */
function _omList() {
  const el = document.getElementById('oList'); if (!el) return;
  const row = a => {
    const ag = agentById(a.id === 'pixel' ? 'director' : a.id); const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const needs = a.activity.kind === 'needs-input';
    return `<li><button type="button" class="o-lrow${needs ? ' needs' : ''}" data-id="${a.id}">
      <span class="o-lface" style="background:${hueHex(ag.hue)}" aria-hidden="true">${escapeHtml(ag.name[0])}</span>
      <span class="o-lt"><b>${escapeHtml(ag.name)}</b><span class="o-lact">${act.icon} ${escapeHtml(needs ? 'Needs you' : a.session === 'asleep' ? 'Off shift' : a.activity.detail || a.activity.label)}</span></span></button></li>`;
  };
  const on = wsOnProject();
  const groups = [['Director', [WS.director]]];
  wsTeamIds().forEach(t => groups.push([teamById(t).name, on.filter(a => a.teamId === t && a.session !== 'asleep')]));
  groups.push(['Solo', on.filter(a => !a.teamId && a.session !== 'asleep')]);
  groups.push(['Off shift', on.filter(a => a.session === 'asleep')]);
  const cur = wsDemoSize();
  el.innerHTML = `<div class="o-lhead"><b>Everyone</b><button type="button" class="o-ctl" id="oListClose" aria-label="Close list">✕</button></div>
    ${groups.filter(g => g[1].length).map(([name, list]) => `<h3>${escapeHtml(name)}</h3><ul>${list.map(row).join('')}</ul>`).join('')}
    <nav class="o-dev" aria-label="Demo office size (dev)">Size ${['size2', 'size6', 'size12', 'size20'].map(k => `<a href="?demo=${k}#office"${k === cur ? ' aria-current="true"' : ''}>${k.slice(4)}</a>`).join('')}</nav>`;
  el.querySelector('#oListClose').onclick = () => _omToggleList(false);
  el.querySelectorAll('.o-lrow').forEach(b => b.onclick = () => { OM.opener = b; OM.clickActor(b.dataset.id); });
}
function _omToggleList(force) {
  OM.listOpen = force == null ? !OM.listOpen : force;
  document.getElementById('oStage').classList.toggle('list-open', OM.listOpen);
  const b = document.getElementById('oListBtn'); b.setAttribute('aria-pressed', OM.listOpen);
  if (OM.listOpen) { const f = document.querySelector('#oList .o-lrow'); if (f) f.focus(); } else b.focus();
}
function _omWide(on) {
  OM.wide = on; document.getElementById('office').classList.toggle('wide', on);
  const b = document.getElementById('oWideBtn'); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Show the chat panel' : 'Hide the chat panel');
  setTimeout(() => OE.fit(), 320); OE.fit();
}
OM.showPanel = function () {
  if (OM.wide) _omWide(false);
  const o = document.getElementById('office'); if (o.classList.contains('drawer-up')) return;
  o.classList.add('drawer-up'); setTimeout(() => OE.fit(), 340);
};

/* ------------------------------------------------------------ layers: office → board → features → feature */
function _omLayer(sub) {
  const prev = OM.layer; OM.layer = sub;
  if (!sub) { OB.close(); if (prev && OM.opener && document.contains(OM.opener)) { try { OM.opener.focus({ preventScroll: true }); } catch (e) { } } return; }
  OB.show(sub);
}
