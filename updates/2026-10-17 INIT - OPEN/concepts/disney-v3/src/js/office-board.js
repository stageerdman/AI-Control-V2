/* ============================================================
   office-board.js — whiteboard zoom, feature dossier, feature page (spec-office §4).
   Layer stack: Office → Board → Features → Feature (edit). Hash mirrors layers:
   #office · #board · #features · #feature/<id>. Esc / browser Back = one layer.
   The panel stays live at every level.

   Public: OB.show(sub), OB.close(), OB.escape(), OB.refresh(), OB.reposition()
   ============================================================ */

const OB = { sub: '', boardEl: null, sheetEl: null, feature: null, draft: null, whoMode: 'tasks', _confirm: false, _t: null };

OB.show = function (sub) {
  const layers = document.getElementById('oLayers'); if (!layers) return;
  const was = this.sub; this.sub = sub;
  const [kind, fid] = sub.split('/');
  if (!this.boardEl) {
    OE.zoomTo('whiteboard');
    document.getElementById('oStage').classList.add('zooming');
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'ob-board'; this.boardEl.setAttribute('role', 'dialog'); this.boardEl.setAttribute('aria-modal', 'false');
    this.boardEl.setAttribute('aria-label', 'Whiteboard — progress, checklist, tokens, who did what');
    layers.appendChild(this.boardEl);
    this._renderBoard();
    const delay = (OE.instant || reducedMotion()) ? 0 : 520;
    clearTimeout(this._t);
    this._t = setTimeout(() => { if (this.boardEl) { this.boardEl.classList.add('in'); if (kind === 'board') this.boardEl.querySelector('.ob-back').focus({ preventScroll: true }); } }, delay);
  } else if (kind === 'board' && was && was !== 'board') {
    const f = this.boardEl.querySelector('.ob-back'); if (f) f.focus({ preventScroll: true });
  }
  if (kind === 'board') { this._closeSheet(); return; }
  if (kind === 'features') { this.feature = null; this.draft = null; this._sheet('dossier'); return; }
  if (kind === 'feature') {
    const f = wsFeature(fid); if (!f) { go('features'); return; }
    if (!this.draft || this.feature !== fid) { this.feature = fid; this.draft = this._mkDraft(f); }
    this._sheet('feature');
  }
};
OB.close = function () {
  this.sub = ''; this._closeSheet();
  if (this.boardEl) { const b = this.boardEl; b.classList.remove('in'); setTimeout(() => b.remove(), 180); this.boardEl = null; }
  document.getElementById('oStage') && document.getElementById('oStage').classList.remove('zooming');
  OE.zoomTo(null);
};
OB.escape = function () {
  const [kind] = this.sub.split('/');
  if (kind === 'feature') {
    if (this._dirty() && !this._confirm) { this._confirm = true; this._renderSheet(); const k = this.sheetEl.querySelector('.ob-confirm button'); if (k) k.focus(); return; }
    this._confirm = false; this.draft = null; go('features'); return;
  }
  if (kind === 'features') { go('board'); return; }
  go('office');
};
OB.reposition = function () { if (this.sub) OE.zoomTo('whiteboard', true); };
OB.refresh = function () {
  if (this.boardEl) this._renderBoard(true);
  if (this.sheetEl && this.sheetEl.dataset.kind === 'dossier') this._renderSheet();
};

/* ------------------------------------------------------------ board */
OB._renderBoard = function (keepFocus) {
  const el = this.boardEl; if (!el) return;
  const active = keepFocus && document.activeElement && el.contains(document.activeElement) ? (document.activeElement.dataset.key || '') : '';
  const now = WS.features.filter(f => f.status === 'now').slice(0, 3);
  const total = wsProjectTokens(); const tt = wsTeamTokens();
  const C = 2 * Math.PI * 52;
  const people = [WS.director, ...wsOnProject()];
  const rows = [...wsTeamIds().map(t => ({ key: t, name: teamById(t).name.replace(/^The /, ''), team: teamById(t), n: tt[t] || 0 })),
    ...(tt.solo ? [{ key: 'solo', name: 'Solo', n: tt.solo }] : []), { key: 'pixel', name: 'Pixel', n: tt.pixel }];
  const maxT = Math.max(...rows.map(r => r.n));
  const who = people.filter(p => p.id !== 'pixel').map(p => ({ p, v: this.whoMode === 'tasks' ? p.tasksDone : p.tokens.total }))
    .sort((a, b) => b.v - a.v);
  const unit = this.whoMode === 'tasks' ? 1 : 20000;
  const maxW = Math.max(1, ...who.map(w => Math.ceil(w.v / unit)));
  const vitals = Object.entries(WS.checkup.vitals);
  el.innerHTML = `
    <button type="button" class="ob-back" data-key="back">← Office</button>
    <div class="ob-grid">
      <section class="ob-q ob-prog" aria-labelledby="obP"><h3 id="obP">Progress</h3>
        <div class="ob-ringrow">
          <svg class="ob-ring" viewBox="0 0 128 128" role="img" aria-label="${WS.overall}% to ${escapeAttr(WS.target)}">
            <circle cx="64" cy="64" r="52" fill="none" stroke="#ece8f5" stroke-width="13"/>
            <circle cx="64" cy="64" r="52" fill="none" stroke="${PALETTE.coral}" stroke-width="13" stroke-linecap="round" transform="rotate(-90 64 64)" stroke-dasharray="${(C * WS.overall / 100).toFixed(1)} ${C.toFixed(1)}"/>
            <text x="64" y="70" text-anchor="middle" font-size="30" font-weight="900" fill="#241a44">${WS.overall}%</text></svg>
          <div><b class="ob-big">→ ${escapeHtml(WS.target)}</b><span class="ob-sub">launch</span></div>
        </div>
        <ul class="ob-bars">${now.map(f => `<li><button type="button" data-key="f-${f.id}" data-feat="${f.id}" class="ob-bar${f.blocked ? ' blocked' : ''}">
            <span class="ob-bn">${escapeHtml(f.name)}${f.blocked ? ' <span class="ob-blk">❗ blocked</span>' : ''}</span>
            <span class="ob-track"><i style="width:${f.pct}%"></i></span><span class="ob-pct">${f.pct}%</span></button></li>`).join('')}</ul>
      </section>
      <section class="ob-q ob-now" aria-labelledby="obN"><h3 id="obN">Now — checklist</h3>
        <ul class="ob-check">${WS.checklist.map(k => `<li class="${k.done ? 'done' : ''}">
            <span class="ob-box" aria-hidden="true">${k.done ? '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.5 3.5L13 4.5" fill="none" stroke="#2b8a3e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span>
            <span class="sr-only">${k.done ? 'Done:' : 'To do:'}</span><span class="ob-kt">${escapeHtml(k.text)}</span>
            <span class="ob-who">${k.assignees.map(id => { const a = wsAgent(id); const ag = agentById(id); const act = a ? ACTIVITY[a.activity.kind] : null;
              return `<button type="button" class="ob-as" data-key="as-${k.id}-${id}" data-agent="${id}" aria-label="Chat with ${escapeAttr(ag.name)}"><span class="ob-face" style="--c:${hueHex(ag.hue)}">${escapeHtml(ag.name[0])}</span>${escapeHtml(OP._short(id))}${!k.done && act ? ` <span aria-hidden="true">${act.icon}</span>` : ''}</button>`; }).join('')}</span></li>`).join('')}</ul>
        <button type="button" class="ob-link" data-key="plan" id="obPlan">Tell Pixel to change the plan →</button>
      </section>
      <section class="ob-q ob-tok" aria-labelledby="obT"><h3 id="obT">Tokens <span>this project</span></h3>
        <div class="ob-total"><b>${wsTok(total)}</b><span>total on ${escapeHtml(projById(OM.project).name.split(' ')[0])}</span></div>
        <ul class="ob-tbars">${rows.map(r => {
          const col = r.team ? hueHex(r.team.color) : r.key === 'pixel' ? PALETTE.sun : '#a99bd0';
          const members = r.key === 'pixel' ? [] : wsOnProject().filter(a => (a.teamId || 'solo') === r.key);
          return `<li tabindex="0" data-key="t-${r.key}" aria-label="${escapeAttr(r.name)}: ${r.n.toLocaleString()} tokens${members.length ? '. ' + members.map(m => agentById(m.id).name + ' ' + wsTok(m.tokens.total)).join(', ') : ''}">
            <span class="ob-tn">${r.team ? emblemSVG(r.team, 18, { decorative: true }) : r.key === 'pixel' ? '<span class="ob-dot" style="background:' + PALETTE.sun + '"></span>' : '<span class="ob-dot"></span>'}${escapeHtml(r.name)}</span>
            <span class="ob-track"><i style="width:${(r.n / maxT * 100).toFixed(1)}%;background:${col}"></i></span><b>${wsTok(r.n)}</b>
            ${members.length ? `<span class="ob-split">${members.map(m => `${escapeHtml(OP._short(m.id))} ${wsTok(m.tokens.total)}`).join(' · ')}</span>` : ''}</li>`; }).join('')}</ul>
        <p class="ob-foot">Tokens = model usage on Aurora since kickoff. Cost estimate lives in Access.</p>
      </section>
      <section class="ob-q ob-whowrap" aria-labelledby="obW"><h3 id="obW">Who did what</h3>
        <div class="ob-tog" role="radiogroup" aria-label="Measure">
          <button type="button" role="radio" data-key="m-tasks" aria-checked="${this.whoMode === 'tasks'}" data-mode="tasks">Tasks done</button>
          <button type="button" role="radio" data-key="m-tokens" aria-checked="${this.whoMode === 'tokens'}" data-mode="tokens">Tokens</button></div>
        <ul class="ob-who-list">${who.map(({ p, v }) => { const ag = agentById(p.id); const n = Math.max(v ? 1 : 0, Math.ceil(v / unit));
          return `<li class="${p.session === 'asleep' ? 'asleep' : ''}"><span class="ob-wn" style="--c:${hueHex(ag.hue)}">${escapeHtml(OP._short(p.id))}</span>
            <span class="ob-sheets" aria-hidden="true" style="--n:${n};--max:${maxW}">${Array.from({ length: n }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>
            <b>${this.whoMode === 'tasks' ? v : wsTok(v)}</b>${p.session === 'asleep' ? '<span class="ob-zz">💤</span>' : ''}</li>`; }).join('')}</ul>
        ${this.whoMode === 'tokens' ? '<p class="ob-foot">More tokens ≠ more work — reading big files is expensive.</p>' : '<p class="ob-foot">One sheet = one checklist item closed.</p>'}
      </section>
    </div>
    <div class="ob-checkup" aria-label="Health checkup">
      <span class="ob-ck-t">Checkup <span>inspected ${escapeHtml(WS.checkup.when)}</span></span>
      ${vitals.map(([k, g]) => { const [word] = _GRADE[g] || _GRADE.B; return `<span class="ob-stamp g-${g}"><b>${g}</b><span>${k}<em>${word}</em></span>${g !== 'A' ? `<button type="button" class="ob-fix" data-key="fix-${k}" data-vital="${k}" title="${escapeAttr(WS.checkup.notes[k])}">Ask Pixel to fix →</button>` : ''}</span>`; }).join('')}
    </div>`;
  el.querySelector('.ob-back').onclick = () => go('office');
  el.querySelectorAll('[data-feat]').forEach(b => b.onclick = () => go('feature/' + b.dataset.feat));
  el.querySelectorAll('[data-agent]').forEach(b => b.onclick = () => OP.open(b.dataset.agent, { from: 'board' }));
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { this.whoMode = b.dataset.mode; this._renderBoard(); el.querySelector(`[data-mode="${this.whoMode}"]`).focus(); });
  el.querySelector('#obPlan').onclick = () => { OP.open('pixel', { from: 'type' }); const i = document.getElementById('opInput'); i.value = 'Change the plan: '; i.focus(); };
  el.querySelectorAll('[data-vital]').forEach(b => b.onclick = () => {
    const k = b.dataset.vital; OP.open('pixel', { from: 'type' });
    OP.post('pixel', { from: 'user', kind: 'text', text: `Fix the ${k} rating.` });
    OP._typing(() => OP._say('pixel', `On it — ${WS.checkup.notes[k]} I'll put the Polish Patrol on it and re-run the checkup after.`));
  });
  if (active) { const f = el.querySelector(`[data-key="${active}"]`); if (f) f.focus({ preventScroll: true }); }
};

/* ------------------------------------------------------------ dossier + feature sheet */
OB._sheet = function (kind) {
  const layers = document.getElementById('oLayers');
  if (!this.sheetEl) {
    this.sheetEl = document.createElement('div'); this.sheetEl.className = 'ob-sheet';
    this.sheetEl.setAttribute('role', 'dialog');
    layers.appendChild(this.sheetEl);
    this.sheetEl.addEventListener('keydown', e => this._trap(e));
  }
  this.sheetEl.dataset.kind = kind; this._confirm = false;
  this.sheetEl.setAttribute('aria-modal', kind === 'feature' ? 'true' : 'false');
  this.sheetEl.classList.remove('flip'); void this.sheetEl.offsetWidth; this.sheetEl.classList.add(kind === 'feature' ? 'flip' : 'drop');
  this._renderSheet();
  const f = this.sheetEl.querySelector(kind === 'feature' ? '.ob-sback' : '.ob-row'); if (f) f.focus({ preventScroll: true });
};
OB._closeSheet = function () { if (this.sheetEl) { this.sheetEl.remove(); this.sheetEl = null; } };
OB._trap = function (e) {
  if (e.key !== 'Tab' || this.sheetEl.dataset.kind !== 'feature') return;
  const f = [...this.sheetEl.querySelectorAll('button,input,[tabindex="0"]')].filter(x => !x.disabled);
  if (!f.length) return; const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};
OB._renderSheet = function () {
  const s = this.sheetEl; if (!s) return;
  if (s.dataset.kind === 'dossier') return this._renderDossier();
  return this._renderFeature();
};
OB._renderDossier = function () {
  const s = this.sheetEl;
  const by = st => WS.features.filter(f => f.status === st).sort((a, b) => a.order - b.order);
  const now = by('now'), planned = by('planned'), shipped = by('shipped');
  const owner = f => { if (!f.owner) return ''; const t = teamById(f.owner); if (t) return `<span class="ob-own">${emblemSVG(t, 16, { decorative: true })}${escapeHtml(t.name.replace(/^The /, ''))}</span>`; const a = agentById(f.owner); return a ? `<span class="ob-own"><span class="ob-face" style="--c:${hueHex(a.hue)}">${escapeHtml(a.name[0])}</span>${escapeHtml(OP._short(f.owner))}</span>` : ''; };
  const row = (f, shape, label) => `<li><button type="button" class="ob-row st-${f.status}" data-fid="${f.id}">
      <span class="ob-shape" aria-hidden="true">${shape}</span><span class="sr-only">${label}:</span>
      <span class="ob-rn">${escapeHtml(f.name)}${f.star ? ' <span aria-label="starred">★</span>' : ''}${f.revisedAt ? ' <span class="ob-rev">revised</span>' : ''}</span>
      ${f.status === 'now' ? `<span class="ob-rp">${f.pct}%</span>` : ''}${owner(f)}${f.blocked ? '<span class="ob-blk">❗ blocked</span>' : ''}<span class="ob-chev" aria-hidden="true">›</span></button></li>`;
  const scroll = s.querySelector('.ob-sbody') ? s.querySelector('.ob-sbody').scrollTop : 0;
  s.setAttribute('aria-label', 'Features — Aurora Storefront');
  s.innerHTML = `<div class="ob-shead"><div><span class="ob-kick">Dossier</span><h2>Features — ${escapeHtml(projById(OM.project).name)}</h2>
      <p class="ob-meta">${shipped.length} shipped · ${now.length} now · ${planned.length} planned</p></div>
      <button type="button" class="btn btn-ghost btn-sm" id="obProp">+ Propose one</button>
      <button type="button" class="ob-x" id="obX" aria-label="Close features">✕</button></div>
    <div class="ob-sbody">
      <div class="ob-propose" id="obPropose" hidden><input aria-label="New feature name" placeholder="Name the feature…" id="obPropIn"><button type="button" class="btn btn-hero btn-sm" id="obPropGo">Add to planned</button></div>
      <h3>Now</h3><ul class="ob-rows">${now.map(f => row(f, '●', 'In progress')).join('')}</ul>
      <h3>Planned <span>up next first</span></h3><ul class="ob-rows">${planned.map(f => row(f, '○', 'Planned')).join('')}</ul>
      <h3>Shipped</h3><ul class="ob-rows shipped">${shipped.map(f => row(f, '✓', 'Shipped')).join('')}</ul>
    </div>`;
  s.querySelector('.ob-sbody').scrollTop = scroll;
  s.querySelector('#obX').onclick = () => go('board');
  s.querySelectorAll('[data-fid]').forEach(b => b.onclick = () => go('feature/' + b.dataset.fid));
  s.querySelector('#obProp').onclick = () => { const p = s.querySelector('#obPropose'); p.hidden = false; s.querySelector('#obPropIn').focus(); };
  const add = () => {
    const v = s.querySelector('#obPropIn').value.trim(); if (!v) { s.querySelector('#obPropIn').focus(); return; }
    const id = 'f' + Date.now().toString(36);
    WS.features.push({ id, name: v, status: 'planned', order: WS.features.filter(f => f.status === 'planned').length + 1, pct: 0, owner: null, star: false, blocked: false, description: [], vision: [], revisedAt: null });
    OP.post('pixel', { from: 'pixel', kind: 'text', text: `Added “${v}” to the planned pile. Give it a vision and I’ll brief whoever picks it up.` });
    officeChanged(); go('feature/' + id);
  };
  s.querySelector('#obPropGo').onclick = add;
  s.querySelector('#obPropIn').onkeydown = e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') { e.stopPropagation(); s.querySelector('#obPropose').hidden = true; s.querySelector('#obProp').focus(); } };
};

/* feature page — lines of intent, editable: edit inline, strike, add, save & brief Pixel */
OB._mkDraft = f => ({ description: f.description.map(l => ({ id: l.id, text: l.text, orig: l.text, struck: false, added: false })),
  vision: f.vision.map(l => ({ id: l.id, text: l.text, orig: l.text, struck: false, added: false })) });
OB._dirty = function () {
  const d = this.draft; if (!d) return false;
  return [...d.description, ...d.vision].some(l => l.struck || l.added || l.text !== l.orig);
};
OB._diff = function () {
  const all = [...this.draft.description, ...this.draft.vision];
  return { struck: all.filter(l => l.struck).length, added: all.filter(l => l.added && !l.struck && l.text.trim()).length, edited: all.filter(l => !l.added && !l.struck && l.text !== l.orig).length };
};
OB._renderFeature = function (focusSel) {
  const s = this.sheetEl; const f = wsFeature(this.feature); const d = this.draft;
  const shape = { now: '●', planned: '○', shipped: '✓' }[f.status]; const stName = { now: 'in progress', planned: 'planned', shipped: 'shipped' }[f.status];
  const lines = (sec) => d[sec].map((l, i) => `<li class="ob-line${l.struck ? ' struck' : ''}${l.added ? ' added' : ''}" data-sec="${sec}" data-i="${i}">
      <span class="ob-ln">${i + 1}</span>
      ${l.editing ? `<input class="ob-lin" value="${escapeAttr(l.text)}" aria-label="${sec === 'description' ? 'Description' : 'Vision'} line ${i + 1}">`
        : `<button type="button" class="ob-lt" data-act="edit" aria-label="Edit ${sec} line ${i + 1}: ${escapeAttr(l.text)}${l.struck ? ' (will be removed)' : ''}">${escapeHtml(l.text) || '<em>empty line</em>'}</button>`}
      ${l.struck ? '<span class="ob-will">(will be removed)</span>' : ''}
      <span class="ob-lacts">
        ${l.struck ? `<button type="button" class="ob-la" data-act="restore" aria-label="Restore ${sec} line ${i + 1}">Restore</button>`
          : `${l.editing ? '' : `<button type="button" class="ob-la" data-act="edit" aria-label="Edit ${sec} line ${i + 1}" title="Edit">✎</button>`}
             ${l.added ? `<button type="button" class="ob-la" data-act="delete" aria-label="Delete ${sec} line ${i + 1}" title="Delete">⌫</button>`
               : `<button type="button" class="ob-la" data-act="strike" aria-label="Strike ${sec} line ${i + 1}" title="Strike"><s>S</s></button>`}`}
      </span></li>`).join('');
  const df = this._diff(); const dirty = this._dirty();
  s.setAttribute('aria-label', `Feature: ${f.name}`);
  s.innerHTML = `<div class="ob-shead"><button type="button" class="ob-sback">← All features</button>
      <div class="ob-ftitle"><h2>${escapeHtml(f.name)}</h2><span class="ob-st st-${f.status}">${shape} ${stName}${f.status === 'now' ? ` · ${f.pct}%` : ''}</span>${f.revisedAt ? `<span class="ob-rev">Revised · ${escapeHtml(f.revisedAt)}</span>` : ''}</div>
      <button type="button" class="ob-x" id="obX" aria-label="Close feature">✕</button></div>
    <div class="ob-sbody ob-paper">
      ${f.status === 'shipped' ? '<p class="ob-note">Shipped — edits update the record, not the code.</p>' : ''}
      <h3>Description</h3><ol class="ob-lines">${lines('description')}</ol>
      <button type="button" class="ob-add" data-add="description">+ Add a line</button>
      <h3>Vision</h3><ol class="ob-lines">${lines('vision')}</ol>
      <button type="button" class="ob-add" data-add="vision">+ Add a line</button>
    </div>
    <div class="ob-sfoot">
      ${this._confirm ? `<div class="ob-confirm" role="alert"><span>Unsaved changes.</span><button type="button" class="btn btn-ghost btn-sm" data-c="keep">Keep editing</button><button type="button" class="btn btn-ghost btn-sm" data-c="discard">Discard changes</button><button type="button" class="btn btn-hero btn-sm" data-c="save">Save</button></div>`
        : `<span class="ob-diff" aria-live="polite">${dirty ? `${df.struck} struck · ${df.added} added${df.edited ? ` · ${df.edited} edited` : ''} · unsaved` : 'No changes'}</span>
           <button type="button" class="btn btn-ghost btn-sm" id="obDiscard" ${dirty ? '' : 'disabled'}>Discard</button>
           <button type="button" class="btn btn-hero btn-sm" id="obSave" ${dirty ? '' : 'disabled'}>Save &amp; brief Pixel</button>`}
    </div>`;
  s.querySelector('.ob-sback').onclick = () => this.escape();
  s.querySelector('#obX').onclick = () => this.escape();
  s.querySelectorAll('.ob-line').forEach(li => {
    const sec = li.dataset.sec, i = +li.dataset.i, l = d[sec][i];
    li.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'edit') { d[sec].forEach(x => x.editing = false); l.editing = true; l._pre = l.text; this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${i}"] input`); }
      if (act === 'strike') { l.struck = true; l.editing = false; announce(`Line ${i + 1} struck — will be removed on save.`); this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${i}"] [data-act="restore"]`); }
      if (act === 'restore') { l.struck = false; announce(`Line ${i + 1} restored.`); this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${i}"] [data-act="strike"]`); }
      if (act === 'delete') { d[sec].splice(i, 1); this._renderFeature(`[data-add="${sec}"]`); }
    });
    const inp = li.querySelector('input');
    if (inp) {
      inp.oninput = () => { l.text = inp.value; const df2 = this._diff(); const el = s.querySelector('.ob-diff'); if (el) el.textContent = `${df2.struck} struck · ${df2.added} added${df2.edited ? ` · ${df2.edited} edited` : ''} · unsaved`; const sv = s.querySelector('#obSave'); if (sv) { sv.disabled = false; s.querySelector('#obDiscard').disabled = false; } };
      inp.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); l.text = inp.value.trim(); l.editing = false;
          if (!l.text && l.added) { d[sec].splice(i, 1); this._renderFeature(`[data-add="${sec}"]`); return; }
          if (l.added && i === d[sec].length - 1) { d[sec].push({ id: 'n' + Date.now(), text: '', orig: '', added: true, struck: false, editing: true }); this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${i + 1}"] input`); return; }
          this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${i}"] .ob-lt`); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation();
          if (l.added && !l.orig && !inp.value.trim()) { d[sec].splice(i, 1); this._renderFeature(`[data-add="${sec}"]`); return; }
          l.text = l._pre ?? l.text; l.editing = false; this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${i}"] .ob-lt`); }
      };
      inp.onblur = () => { if (!l.editing) return; setTimeout(() => { if (l.editing && document.activeElement !== inp) { l.text = inp.value.trim() || l.text; l.editing = false; if (!l.text && l.added) d[sec].splice(i, 1); if (this.sheetEl) this._renderFeature(); } }, 0); };
    }
  });
  s.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const sec = b.dataset.add; d[sec].forEach(x => x.editing = false);
    d[sec].push({ id: 'n' + Date.now(), text: '', orig: '', added: true, struck: false, editing: true });
    this._renderFeature(`.ob-line[data-sec="${sec}"][data-i="${d[sec].length - 1}"] input`);
  });
  if (this._confirm) {
    s.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      const c = b.dataset.c; this._confirm = false;
      if (c === 'keep') this._renderFeature('.ob-lt');
      if (c === 'discard') { this.draft = null; go('features'); }
      if (c === 'save') { this._save(); go('features'); }
    });
  } else {
    s.querySelector('#obDiscard').onclick = () => { this.draft = this._mkDraft(f); this._renderFeature('.ob-sback'); announce('Changes discarded.'); };
    s.querySelector('#obSave').onclick = () => { this._save(); this._renderFeature('.ob-sback'); };
  }
  if (focusSel) { const t = s.querySelector(focusSel); if (t) { t.focus({ preventScroll: false }); if (t.tagName === 'INPUT') { const v = t.value; t.value = ''; t.value = v; } } }
};
OB._save = function () {
  const f = wsFeature(this.feature); const d = this.draft; const df = this._diff();
  const keep = arr => arr.filter(l => !l.struck && l.text.trim()).map(l => ({ id: l.id, text: l.text.trim() }));
  f.description = keep(d.description); f.vision = keep(d.vision); f.revisedAt = 'just now';
  this.draft = this._mkDraft(f);
  const parts = [df.struck ? `−${df.struck} line${df.struck > 1 ? 's' : ''}` : '', df.added ? `+${df.added}` : '', df.edited ? `${df.edited} edited` : ''].filter(Boolean).join(', ');
  let msg = `Got it — vision for ${f.name} updated (${parts || 'no change'}). I'll brief whoever picks it up.`;
  let tellId = null;
  if (f.status === 'now' && f.owner) {
    const t = teamById(f.owner); tellId = t ? t.captain : f.owner;
    if (tellId && wsAgent(tellId) && wsAgent(tellId).onProject) msg += ` Telling ${OP._short(tellId)} now.`; else tellId = null;
  }
  OP.post('pixel', { from: 'pixel', kind: 'text', text: msg, stream: true });
  toast('Saved ✓ — Pixel is briefed');
  if (tellId) OE.say('pixel', `${OP._short(tellId)}: ${f.name} brief changed`, { ms: 2400 }).then(() => OE.say(tellId, 'Got it 👍', { ms: 1400 }));
  officeChanged();
};
