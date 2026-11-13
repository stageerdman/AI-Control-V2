/* ============================================================
   office-board.js — the three things you can zoom into (spec-office §4):
     #board          whiteboard: the big %, features in progress, the task list
     #health         health board: GitHub (connected · private/public) · runs locally ·
                     Modularity · Cleanliness · Reusability report
     #features       features folder: Now / Planned / Shipped (identical rows)
     #feature/<id>   one feature: Description + Vision as plain text blocks
   The camera zooms onto the object, the scene behind is covered by a still
   scrim (no filters, animations paused), the card fades in. Esc / Back = one layer.

   Public: OB.show(sub), OB.close(), OB.escape(), OB.refresh(), OB.reposition(),
           OB.stageDrop(fid, word), OB.saveStaged(), OB.discardStaged()
   ============================================================ */

const OB = { sub: '', obj: null, el: null, feature: null, draft: null, _confirm: false, _t: null, _key: '' };
const OB_OBJ = { board: 'whiteboard', health: 'health', features: 'dossier', feature: 'dossier' };

OB.show = function (sub) {
  const layers = document.getElementById('oLayers'); if (!layers) return;
  const [kind, fid] = sub.split('/');
  if (!OB_OBJ[kind]) { omGo('office'); return; }
  if (kind === 'feature') {
    const f = wsFeature(fid); if (!f) { omGo('features'); return; }
    if (!this.draft || this.feature !== fid) { this.feature = fid; this.draft = { description: f.description, vision: f.vision }; }
  } else { this.feature = null; this.draft = null; }
  this.sub = sub; this._confirm = false;
  const obj = OB_OBJ[kind];
  const fresh = !this.el || this.obj !== obj;
  if (this.obj !== obj) { OE.zoomTo(obj); this.obj = obj; }
  document.getElementById('oStage').classList.add('zooming');
  if (!this.el) {
    this.el = document.createElement('div'); this.el.setAttribute('role', 'dialog'); this.el.setAttribute('aria-modal', 'false');
    this.el.addEventListener('keydown', e => this._trap(e));
    layers.appendChild(this.el);
  }
  this.el.className = 'ob-card ob-k-' + kind;
  this._key = ''; this._render();
  const first = () => { const f = this.el && this.el.querySelector('.ob-back'); if (f) f.focus({ preventScroll: true }); };
  if (fresh && !(OE.instant || reducedMotion())) {
    this.el.classList.remove('in'); clearTimeout(this._t);
    this._t = setTimeout(() => { if (this.el) { this.el.classList.add('in'); first(); } }, 480);
  } else { this.el.classList.add('in'); first(); }
};
OB.close = function () {
  this.sub = ''; this.obj = null; this.draft = null; this.feature = null; clearTimeout(this._t);
  if (this.el) { this.el.remove(); this.el = null; }
  const st = document.getElementById('oStage'); if (st) st.classList.remove('zooming');
  OE.zoomTo(null);
};
OB.escape = function () {
  const [kind] = this.sub.split('/');
  if (kind === 'feature') {
    if (this._dirty() && !this._confirm) { this._confirm = true; this._key = ''; this._render(); const k = this.el.querySelector('.ob-confirm button'); if (k) k.focus(); return; }
    this._confirm = false; this.draft = null; omGo('features'); return;
  }
  omGo('office');
};
OB.reposition = function () { if (this.obj) OE.zoomTo(this.obj, true); };
/* live data changes re-render only when what's shown actually changed (no flashing) */
OB.refresh = function () { if (this.el && !this.sub.startsWith('feature/')) this._render(); };
OB._trap = function (e) {
  if (e.key !== 'Tab') return;
  const f = [...this.el.querySelectorAll('button,textarea,input')].filter(x => !x.disabled);
  if (!f.length) return; const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};

OB._render = function () {
  const kind = this.sub.split('/')[0];
  const html = kind === 'board' ? this._board() : kind === 'health' ? this._health() : kind === 'features' ? this._folder() : this._featurePage();
  if (html === this._key) return;
  const active = document.activeElement && this.el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  this._key = html; this.el.innerHTML = html;
  this._wire(kind);
  if (active) { const f = this.el.querySelector(`[data-key="${active}"]`); if (f) f.focus({ preventScroll: true }); }
};
const _obBack = (label, aria) => `<button type="button" class="ob-back" data-key="back" aria-label="${escapeAttr(aria)}">← ${escapeHtml(label)}</button>`;
const _obMark = st => `<span class="ob-mark m-${st}" aria-hidden="true">${st === 'shipped' ? '<svg viewBox="0 0 16 16"><path d="M4 8.5l2.6 2.6L12 5.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span>`;
const OB_ST = { now: 'In progress', planned: 'Planned', shipped: 'Shipped' };

/* ------------------------------------------------------------ whiteboard */
OB._board = function () {
  const now = WS.features.filter(f => f.status === 'now').sort((a, b) => a.order - b.order);
  const C = 2 * Math.PI * 58;
  this.el.setAttribute('aria-label', 'Whiteboard');
  return `${_obBack('Office', 'Back to the office')}
    <div class="ob-wb">
      <div class="ob-big" role="img" aria-label="${WS.overall}% to ${escapeAttr(WS.target)}">
        <svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="58" fill="none" stroke="#ece8f5" stroke-width="14"/>
          <circle cx="70" cy="70" r="58" fill="none" stroke="${PALETTE.coral}" stroke-width="14" stroke-linecap="round" transform="rotate(-90 70 70)" stroke-dasharray="${(C * WS.overall / 100).toFixed(1)} ${C.toFixed(1)}"/></svg>
        <b>${WS.overall}<small>%</small></b><span>to ${escapeHtml(WS.target)}</span>
      </div>
      <div class="ob-cols">
        <section aria-labelledby="obN"><h3 id="obN">In progress</h3>
          <ul class="ob-now">${now.map(f => `<li><button type="button" data-key="f-${f.id}" data-feat="${f.id}">
            <span class="ob-fn">${escapeHtml(f.name)}</span><span class="ob-pct">${f.pct}%</span>
            <span class="ob-track${f.blocked ? ' blocked' : ''}"><i style="width:${f.pct}%"></i></span></button></li>`).join('') || '<li class="ob-empty">Nothing in progress.</li>'}</ul>
        </section>
        <section aria-labelledby="obT"><h3 id="obT">Tasks</h3>
          <ul class="ob-tasks">${WS.checklist.length ? '' : `<li class="ob-empty">No tasks yet — ${escapeHtml(OP._dir())} writes them here as the plan takes shape.</li>`}${WS.checklist.map(k => `<li class="${k.done ? 'done' : ''}"><span class="ob-box" aria-hidden="true">${k.done ? '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3L12.5 5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span><span class="sr-only">${k.done ? 'Done:' : 'To do:'}</span> ${escapeHtml(k.text)}</li>`).join('')}</ul>
        </section>
      </div>
    </div>`;
};

/* ------------------------------------------------------------ health report */
OB._health = function () {
  const word = { A: 'Great', B: 'Good', C: 'Needs work' };
  this.el.setAttribute('aria-label', 'Health check report');
  const g = WS.github, r = WS.run;
  const gh = g.connected
    ? `<b>GitHub</b><span class="ob-pv">Connected · ${g.private ? '🔒 Private' : '🌐 Public'}</span><button type="button" class="btn btn-ghost btn-sm" data-key="priv" id="obPriv">Make ${g.private ? 'public' : 'private'}</button>`
    : `<b>GitHub</b><span class="ob-pv">Not connected</span><button type="button" class="btn btn-ghost btn-sm" data-key="ghc" id="obGhc">Connect</button>`;
  return `${_obBack('Office', 'Back to the office')}
    <header class="ob-hhead"><h2>Health check</h2><span>Checked ${escapeHtml(WS.checkup.when)}</span></header>
    <ul class="ob-proj" aria-label="Repository and how the app runs">
      <li><span class="ob-pi" aria-hidden="true">⎇</span>${gh}</li>
      <li><span class="ob-pi" aria-hidden="true">⌂</span><b>Runs locally</b><span class="ob-pv">open with <code>${escapeHtml(r.cmd)}</code> in <code>${escapeHtml(r.where)}</code> · built ${escapeHtml(r.built)}</span></li>
    </ul>
    ${WS.checkup.items.length ? '' : '<p class="ob-empty">The first check runs after the first update lands.</p>'}
    <ul class="ob-health">${WS.checkup.items.map(it => `<li>
      <div class="ob-hk"><span class="ob-grade g-${it.grade}" aria-hidden="true">${it.grade}</span><b>${escapeHtml(it.name)}</b><span class="ob-hw">${word[it.grade] || ''}<span class="sr-only"> (grade ${it.grade})</span></span></div>
      <p><span class="ob-hl">Good</span>${escapeHtml(it.good)}</p>
      <p><span class="ob-hl">To fix</span>${escapeHtml(it.fix)}</p></li>`).join('')}</ul>`;
};

/* ------------------------------------------------------------ features folder */
OB._folder = function () {
  const by = st => WS.features.filter(f => f.status === st).sort((a, b) => a.order - b.order);
  this.el.setAttribute('aria-label', 'Features');
  const group = (st, title) => { const list = by(st); return list.length ? `<h3>${title}</h3><ul class="ob-rows">${list.map(f => `<li><button type="button" class="ob-row" data-key="r-${f.id}" data-fid="${f.id}">${_obMark(f.status)}<span class="sr-only">${OB_ST[f.status]}:</span><span class="ob-rn">${escapeHtml(f.name)}</span><span class="ob-chev" aria-hidden="true">›</span></button></li>`).join('')}</ul>` : ''; };
  return `${_obBack('Office', 'Back to the office')}
    <header class="ob-hhead"><h2>Features</h2></header>
    <div class="ob-scroll">${WS.features.length ? group('now', 'Now') + group('planned', 'Planned') + group('shipped', 'Shipped') : `<p class="ob-empty">No features yet. Tell ${escapeHtml(OP._dir())} what to build first.</p>`}</div>`;
};

/* ------------------------------------------------------------ feature page */
OB._dirty = function () { const f = wsFeature(this.feature); const d = this.draft; return !!(f && d && (d.description !== f.description || d.vision !== f.vision)); };
OB._featurePage = function () {
  const f = wsFeature(this.feature), d = this.draft, dirty = this._dirty();
  this.el.setAttribute('aria-label', `Feature: ${f.name}`);
  return `${_obBack('Features', 'Back to all features')}
    <header class="ob-hhead"><h2>${escapeHtml(f.name)}</h2><span class="ob-st">${_obMark(f.status)}${OB_ST[f.status]}</span></header>
    <label class="ob-fl" for="obDesc">Description</label>
    <textarea id="obDesc" class="ob-ta${d.staged === 'description' ? ' staged' : ''}" data-key="desc" data-sec="description" rows="5">${escapeHtml(d.description)}</textarea>
    <label class="ob-fl" for="obVis">Vision</label>
    <textarea id="obVis" class="ob-ta" data-key="vis" data-sec="vision" rows="4">${escapeHtml(d.vision)}</textarea>
    <footer class="ob-foot">${this._confirm
      ? `<div class="ob-confirm" role="alert"><span>Unsaved changes.</span><button type="button" class="btn btn-ghost btn-sm" data-c="keep">Keep editing</button><button type="button" class="btn btn-ghost btn-sm" data-c="discard">Discard</button><button type="button" class="btn btn-hero btn-sm" data-c="save">Save</button></div>`
      : `<span class="ob-saved" aria-live="polite">${f.revisedAt && !dirty ? 'Saved' : ''}</span><button type="button" class="btn btn-hero btn-sm" id="obSave" data-key="save" ${dirty ? '' : 'disabled'}>Save &amp; brief ${escapeHtml(OP._dir())}</button>`}</footer>`;
};

/* ------------------------------------------------------------ wiring */
OB._wire = function (kind) {
  const el = this.el;
  el.querySelector('.ob-back').onclick = () => this.escape();
  el.querySelectorAll('[data-feat],[data-fid]').forEach(b => b.onclick = () => omGo('feature/' + (b.dataset.feat || b.dataset.fid)));
  const pv = el.querySelector('#obPriv'); if (pv) pv.onclick = () => OM.privacy();
  const gc = el.querySelector('#obGhc'); if (gc) gc.onclick = () => { WS.github.connected = true; toast('🐙 GitHub connected (prototype)'); officeChanged(); };
  if (kind !== 'feature') return;
  el.querySelectorAll('textarea').forEach(ta => ta.oninput = () => {
    this.draft[ta.dataset.sec] = ta.value;
    const s = el.querySelector('#obSave'); if (s) s.disabled = !this._dirty();
    const sv = el.querySelector('.ob-saved'); if (sv) sv.textContent = this._dirty() ? 'Unsaved' : '';
  });
  const save = el.querySelector('#obSave'); if (save) save.onclick = () => { this._save(); this._key = ''; this._render(); el.querySelector('.ob-back').focus(); };
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const c = b.dataset.c; this._confirm = false;
    if (c === 'keep') { this._key = ''; this._render(); el.querySelector('textarea').focus(); }
    if (c === 'discard') { this.draft = null; omGo('features'); }
    if (c === 'save') { this._save(); omGo('features'); }
  });
};
OB._save = function () {
  const f = wsFeature(this.feature); const d = this.draft;
  f.description = d.description.trim(); f.vision = d.vision.trim(); f.revisedAt = 'just now';
  this.draft = { description: f.description, vision: f.vision };
  let msg = `Got it — the ${f.name} brief is updated. I'll brief whoever picks it up.`;
  let tellId = null;
  if (f.status === 'now' && f.owner) {
    tellId = teamById(f.owner) ? wsCaptain(f.owner) : f.owner;
    if (tellId && wsAgent(tellId) && wsAgent(tellId).onProject) msg += ` Telling ${OP._short(tellId)} now.`; else tellId = null;
  }
  OP.post('pixel', { from: 'pixel', kind: 'text', text: msg, stream: true });
  toast(`Saved — ${escapeHtml(OP._dir())} is briefed`);
  if (tellId) OE.say('pixel', '', { to: tellId, ms: 1600 });
  officeChanged();
};

/* voice path: the Director removes the sentence that mentions <word>; you confirm with "Save it" */
OB.stageDrop = function (fid, word) {
  const f = wsFeature(fid); if (!f) return false;
  const cut = s => { const parts = s.match(/[^.!?]+[.!?]*\s*/g) || [s]; const keep = parts.filter(p => !p.toLowerCase().includes(word.toLowerCase())); return keep.length === parts.length ? null : keep.join('').trim(); };
  const base = this.feature === fid && this.draft ? this.draft : { description: f.description, vision: f.vision };
  const nd = cut(base.description), nv = nd == null ? cut(base.vision) : null;
  if (nd == null && nv == null) return false;
  this.feature = fid;
  this.draft = { description: nd ?? base.description, vision: nv ?? base.vision, staged: nd != null ? 'description' : 'vision' };
  if (this.sub === 'feature/' + fid) { this._key = ''; this._render(); } else omGo('feature/' + fid);
  return true;
};
OB.saveStaged = function () { if (!this.draft || !this._dirty()) return false; this._save(); if (this.el && this.sub.startsWith('feature/')) { this._key = ''; this._render(); } return true; };
OB.discardStaged = function () { const f = wsFeature(this.feature); if (!f) return; this.draft = { description: f.description, vision: f.vision }; if (this.el && this.sub.startsWith('feature/')) { this._key = ''; this._render(); } };
