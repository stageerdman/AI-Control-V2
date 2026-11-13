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
/* office sub-routes for the project that's open (Aurora keeps the short #board… forms) */
function omGo(sub) {
  const pid = OM.project || 'aurora';
  if (pid === 'aurora') go(sub || 'office'); else go('office/' + pid + (sub && sub !== 'office' ? '/' + sub : ''));
}
function closeOffice() {
  if (OM.focusKey) OM.unfocusTeam(true);
  if (typeof OS !== 'undefined') OS.stop();
  OE.unmount(); OM.mounted = false; OM.project = null;
  document.removeEventListener('keydown', _omKeys);
  window.removeEventListener('resize', _omResize);
  document.getElementById('office').innerHTML = '';
}

function _omMount(p) {
  if (OM.mounted) closeOffice();            /* office → another project's office */
  wsUse(p.id);                              /* its own state: Aurora demo or built from p.office */
  wsPrune();                                /* skip agents deleted from the Cast since (Undo brings them back) */
  OM.project = p.id; OM.mounted = true;
  /* this project's repo facts (its Director comes from PROJECTS[i].orchestrator via wsAg) */
  const g = _wsGithub(p.id); WS.github.connected = g.connected; WS.github.private = g.private;
  const host = document.getElementById('office');
  /* v5: no top bar — the room and the chat fill the screen. The door leaves,
     the safe is Access, the whiteboard + the Director's plaque carry the %. */
  host.innerHTML = `
    <div class="o-main">
      <section class="o-stagewrap" id="oStage" aria-roledescription="office scene">
        <h1 class="sr-only">${escapeHtml(p.name)} — the office</h1>
        <div class="o-box" id="oBox"></div>
        <div class="o-hots" id="oHots"></div>
        <div class="o-scrim" aria-hidden="true"></div>
        <div class="o-layers" id="oLayers"></div>
        <button class="o-ctl o-unfocus" type="button" id="oUnfocus" hidden>← <span>Whole office</span></button>
        <div class="o-pagerwrap" id="oPager"></div>
        <div class="o-stagectl">
          <button class="o-ctl" type="button" id="oListBtn" aria-pressed="false" aria-controls="oList">▤ <span>List</span></button>
          <button class="o-ctl" type="button" id="oWideBtn" aria-pressed="false" aria-label="Hide the chat panel">⤢</button>
        </div>
        <div class="o-list" id="oList" role="region" aria-label="Office list — everyone and what they are doing"></div>
      </section>
      <aside class="o-panel" id="oPanel"></aside>
    </div>`;
  host.querySelector('#oListBtn').onclick = () => _omToggleList();
  host.querySelector('#oWideBtn').onclick = () => _omWide(!OM.wide);
  host.querySelector('#oUnfocus').onclick = () => OM.unfocusTeam();

  OE.mount(host.querySelector('#oBox'));
  _omHotspots();
  OP.mount(host.querySelector('#oPanel'));
  _omStageA11y();
  OPG.mount(host.querySelector('#oPager'));
  document.addEventListener('keydown', _omKeys);
  window.addEventListener('resize', _omResize);
  officeRefresh();
  OS.start();
}
function _omResize() { OE.fit(); if (OM.layer) OB.reposition(); }

/* ------------------------------------------------------------ the few interactive objects */
const OM_HOTS = [
  { id: 'door', label: 'Leave office — back to all projects', act: () => _omLeave() },
  { id: 'dossier', label: 'Features — now, planned, shipped', act: () => omGo('features') },
  { id: 'whiteboard', label: 'Whiteboard — progress and tasks', act: () => omGo('board') },
  { id: 'health', label: 'Health check — code health, GitHub, how it runs', act: () => omGo('health') },
  { id: 'safe', label: 'Safe — what this project can reach (Access)', act: () => _omAccess() },
];
/* the door: it swings open, then you're back on Projects */
function _omLeave() {
  if (OE.instant || reducedMotion()) { go('projects'); return; }
  THEME_OFFICE.door(OE.art, true);
  setTimeout(() => { if (APP.view === 'office') go('projects'); }, 260);
}
/* the safe: the project's access grants (values masked), the existing sheet */
function _omAccess() {
  const p = projById(OM.project) || {};
  const dial = OE.art && OE.art.querySelector('#safeDial');
  if (dial && !OE.instant && !reducedMotion()) { dial.classList.remove('spin'); void dial.getBBox; dial.classList.add('spin'); }
  openProjectAccess(WS.grants, (p.name || 'Aurora').split(' ')[0]);
}
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
  OPG.visited(id);
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
    if (OM.focusKey) { e.preventDefault(); OM.unfocusTeam(); return; }
    if (OP.thread !== 'pixel') { OP.open('pixel'); return; }
  }
  if (typing) return;
  if (e.altKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) { e.preventDefault(); OS.replay(); return; }
  if (e.key === '!' ) {
    const ask = WS.pending[0]; if (!ask) { announce('Nobody needs you right now.'); return; }
    e.preventDefault(); if (OM.layer) omGo('office'); OM.focusActor(ask.agentId); return;
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
  _omList(); OPG.refresh();
  const n = WS.pending.length, people = 1 + wsOnProject().length;
  document.getElementById('oStage').setAttribute('aria-label', `Office — ${people} people${n ? `, ${n} need${n === 1 ? 's' : ''} you` : ''}. Arrow keys move between people; ! jumps to whoever needs you.`);
  document.getElementById('oStage').setAttribute('role', 'group');
  THEME_OFFICE.sync(OE.art, WS);
  Object.values(OE.actors).forEach(r => OE._card(r));
  OP.refresh();
  if (OM.layer) OB.refresh();
}
/* privacy toggle — reached from the health report's GitHub line */
function _omPrivacy() {
  const goingPublic = WS.github.private, name = ((projById(OM.project) || {}).name || 'Aurora').split(' ')[0];
  const body = document.createElement('div');
  body.innerHTML = `<h2>${goingPublic ? `Make ${escapeHtml(name)} public?` : `Make ${escapeHtml(name)} private?`}</h2>
    <p class="hint" style="margin:8px 0 18px;font-size:14px">${goingPublic ? 'Anyone with the GitHub link will see the code. Secrets stay masked and never leave the vault.' : 'Only you and granted agents will see the repo.'}</p>
    <div class="row"><button class="btn btn-ghost" id="pvNo">Keep ${goingPublic ? 'private' : 'public'}</button><button class="btn btn-hero" id="pvYes">${goingPublic ? 'Make public' : 'Make private'}</button></div>`;
  openSheet(body, 'Change visibility');
  body.querySelector('#pvNo').onclick = closeSheet;
  body.querySelector('#pvYes').onclick = () => { WS.github.private = !WS.github.private; closeSheet(); toast(WS.github.private ? `🔒 ${escapeHtml(name)} is private` : `🌐 ${escapeHtml(name)} is public`); officeRefresh(); };
}
OM.privacy = _omPrivacy;

/* list mirror: same state, grouped; rows do what clicking the agent does */
function _omList() {
  const el = document.getElementById('oList'); if (!el) return;
  const row = a => {
    const ag = wsAg(a.id); const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
    const needs = a.activity.kind === 'needs-input';
    return `<li><button type="button" class="o-lrow${needs ? ' needs' : ''}" data-id="${a.id}">
      <span class="o-lface" style="background:${hueHex(ag.hue)}" aria-hidden="true">${escapeHtml(ag.name[0])}</span>
      <span class="o-lt"><b>${escapeHtml(ag.name)}</b><span class="o-lact">${act.icon} ${escapeHtml(needs ? 'Needs you' : a.session === 'asleep' ? 'Off shift' : a.activity.detail || a.activity.label)}</span></span></button></li>`;
  };
  const on = wsOnProject();
  const groups = [['Director', [WS.director]]];  /* the project's orchestrator */
  wsTeamIds().forEach(t => groups.push([teamById(t).name, on.filter(a => a.teamId === t && a.session !== 'asleep')]));
  groups.push(['Solo', on.filter(a => !a.teamId && a.session !== 'asleep')]);
  groups.push(['Off shift', on.filter(a => a.session === 'asleep')]);
  const cur = wsDemoSize();
  el.innerHTML = `<div class="o-lhead"><b>Everyone</b><button type="button" class="o-ctl" id="oListClose" aria-label="Close list">✕</button></div>
    ${groups.filter(g => g[1].length).map(([name, list]) => `<h3>${escapeHtml(name)}</h3><ul>${list.map(row).join('')}</ul>`).join('')}
    ${WS.project === 'aurora' ? `<nav class="o-dev" aria-label="Demo office size (dev)">Size ${['size2', 'size6', 'size12', 'size20'].map(k => `<a href="?demo=${k}#office"${k === cur ? ' aria-current="true"' : ''}>${k.slice(4)}</a>`).join('')}</nav>` : ''}`;
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
  if (sub && OM.focusKey) OM.unfocusTeam(true);
  if (!sub) { OB.close(); if (prev && OM.opener && document.contains(OM.opener)) { try { OM.opener.focus({ preventScroll: true }); } catch (e) { } } return; }
  OB.show(sub);
}

/* ------------------------------------------------------------ pager → team focus
   The camera glides to a team's pod (or a solo desk) and a soft glow marks it.
   The room stays live and clickable. Leaving the focus = the visit is over:
   asks you went to see and left alone drop off the pager (OPG.leave). */
function _omFocusRect(entry) {
  const P = THEME_OFFICE.plan;
  let rugs = entry.teamId ? P.pods.filter(p => p.teamId === entry.teamId).map(p => p.rug) : [];
  if (!rugs.length) { const r = OE.actors[entry.agentId]; if (!r) return null; rugs = [{ x: r.x - 80, y: r.y - 72, w: 160, h: 136 }]; }
  const x0 = Math.min(...rugs.map(r => r.x)), x1 = Math.max(...rugs.map(r => r.x + r.w));
  const y0 = Math.min(...rugs.map(r => r.y)), y1 = Math.max(...rugs.map(r => r.y + r.h));
  return { glow: { x: x0 - 26, y: y0 - 18, w: x1 - x0 + 52, h: y1 - y0 + 36 }, cam: { x: x0 - 90, y: y0 - 190, w: x1 - x0 + 180, h: y1 - y0 + 230 } };
}
OM.focusTeam = function (entry) {
  if (!entry) return;
  if (OM.layer) { omGo('office'); setTimeout(() => OM.focusTeam(entry), 80); return; }
  if (OM.focusKey && OM.focusKey !== entry.key) OPG.leave();
  const r = _omFocusRect(entry); if (!r) return;
  OM.focusKey = entry.key;
  OE.focusRect(r.cam, r.glow);
  const name = entry.teamId ? teamById(entry.teamId).name : OP._name(entry.agentId);
  const b = document.getElementById('oUnfocus'); b.hidden = false;
  b.setAttribute('aria-label', `Leave ${name} — back to the whole office`);
  document.getElementById('oStage').classList.add('team-focus');
  announce(`Looking at ${name}. ${entry.asks.map(a => OP._name(a.agentId) + ' needs ' + a.short).join('. ')}.`);
  OM.focusActor(entry.asks[0].agentId);
  OPG.refresh();
};
OM.unfocusTeam = function (quiet) {
  if (!OM.focusKey) return;
  OM.focusKey = null;
  OPG.leave();
  const b = document.getElementById('oUnfocus'); if (b) b.hidden = true;
  const st = document.getElementById('oStage'); if (st) st.classList.remove('team-focus');
  if (OE.box) OE.focusRect(null, null, quiet);
};
