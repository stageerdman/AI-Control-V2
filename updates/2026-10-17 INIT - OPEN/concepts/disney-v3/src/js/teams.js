/* ============================================================
   teams.js — Cast → Teams: "Roll Call" + squad zoom (spec-teams §1–§4).
   Auto-save everywhere (SYNTHESIS seam 2); destructive actions get an Undo toast.
   Public:  renderTeams(host)       the Teams tab body (called by renderCast)
            squadRoute(zoom)        in-place transition when the hash changes
            openSquad(id, {animate}) id = team id | 'new' (draft)
            squadRelayout()         re-fit the formation (resize)
   Uses cast.js helpers: cxRadios, roleTiles, hueSwatches, roleBadge, cxSaved,
   cxFlip, cxHop, cxPoof, cxCostume, cxTrap, cxPlace, _cxRectUnpushed.
   ============================================================ */
const SQ = { id: null, team: null, draft: null, sel: null, strip: false, returnTo: null };
const STAR = '<svg class="star" viewBox="-10 -10 20 20" aria-hidden="true" focusable="false"><path d="M0 -8 L2.4 -2.6 L8 -2.5 L3.7 1.2 L5 6.8 L0 3.8 L-5 6.8 L-3.7 1.2 L-8 -2.5 L-2.4 -2.6Z"/></svg>';
/* formation slots (spec-teams §2.2): [x % of stage width, y = steps back] */
const SQ_SLOTS = [[0, 0], [-22, 4], [22, 4], [-40, 8], [40, 8], [-31, 20], [31, 20]];  /* 6th/7th: back row, between the front side pairs */

const _tEl = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const teamHex = t => hueHex(t.color);
/* captain first, then member order */
function orderedMembers(t) {
  const cap = t.members.find(m => m.agent === t.captain);
  return cap ? [cap, ...t.members.filter(m => m !== cap)] : t.members.slice();
}
const _capName = t => (agentById(t.captain) || {}).name || 'none yet';
/* "Captain Sir Lint-a-lot", but never "Captain Captain Semicolon" */
const _capLine = t => { const n = _capName(t); return /^captain\b/i.test(n) ? n : 'Captain ' + n; };

/* ============================================================
   Roll call (list)
   ============================================================ */
function renderTeams(host) {
  host.innerHTML = '<div class="rollcall" role="list" aria-label="Teams"></div>';
  const list = host.firstElementChild;
  if (!TEAMS.length) list.insertAdjacentHTML('beforeend', '<p class="rc-empty">Teams let the director call a whole crew at once.</p>');
  TEAMS.forEach(t => list.appendChild(_teamRow(t)));
  list.appendChild(_ghostRow());
  list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...list.querySelectorAll('.team-row')]; const i = rows.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
}
function _teamRow(t) {
  const li = _tEl('div', 'tr-li'); li.setAttribute('role', 'listitem');
  const b = _tEl('button', 'team-row'); b.type = 'button'; b.dataset.id = t.id;
  b.style.setProperty('--team', teamHex(t));
  const n = t.members.length;
  b.setAttribute('aria-label', `${t.name}. ${n} member${n === 1 ? '' : 's'}${t.captain ? `, captain ${_capName(t)}` : ''}. ${t.blurb || ''}`);
  b.innerHTML = `<span class="tr-stage" aria-hidden="true"><span class="tr-light"></span><span class="tr-floor"></span><span class="tr-crew"></span></span>
    <span class="tr-emblem" aria-hidden="true">${emblemSVG(t, 88, { decorative: true })}</span>
    <span class="tr-text"><span class="tr-name">${escapeHtml(t.name)}</span>
      <span class="tr-blurb">${escapeHtml(t.blurb || '')}</span>
      <span class="tr-meta"><span>${n} member${n === 1 ? '' : 's'}</span>${t.captain ? `<i aria-hidden="true">·</i><span>${STAR} ${escapeHtml(_capLine(t))}</span>` : ''}</span></span>`;
  _rowCrew(t, b.querySelector('.tr-crew'));
  b.addEventListener('mouseenter', () => _rowHot(b, true));
  b.addEventListener('mouseleave', () => { if (!(document.activeElement === b && b.matches(':focus-visible'))) _rowHot(b, false); });
  b.addEventListener('focus', () => { if (b.matches(':focus-visible')) _rowHot(b, true); });
  b.addEventListener('blur', () => _rowHot(b, false));
  b.addEventListener('click', () => go('cast/teams/' + t.id));
  li.appendChild(b); return li;
}
/* the group: captain front & centre, others in a shallow V, overlapping */
function _rowCrew(t, crew) {
  const ord = orderedMembers(t);
  if (!ord.length) { _ghostCrew(crew); return; }
  const shown = ord.slice(0, 7);
  const offs = [0, -76, 76, -128, 128, -102, 102];
  shown.forEach((m, i) => {
    const a = agentById(m.agent); if (!a) return;
    const isCap = i === 0 && t.captain === m.agent;
    const side = offs[i] < 0 ? 'right' : 'left';
    const step = i === 0 ? 0 : i <= 2 ? 1 : i <= 4 ? 2 : 3;
    const w = _tEl('span', 'tr-m' + (step === 3 ? ' back' : '') + (isCap ? ' is-cap' : ''));
    w.style.cssText = `--x:${offs[i]}px;--lift:${step * 10}px;z-index:${10 - step}`;
    w.dataset.facing = i === 0 ? 'front' : 'three-quarter'; w.dataset.dir = i === 0 ? 'right' : side;
    w.appendChild(hero(a, i === 0
      ? { size: 'md', facing: 'front', captain: isCap, armband: isCap ? teamHex(t) : null }
      : { size: 'sm', facing: 'three-quarter', dir: side }));
    crew.appendChild(w);
  });
}
function _ghostCrew(crew) {
  [[-76, 'sm', 10], [0, 'md', 0], [76, 'sm', 10]].forEach(([x, s, lift]) => {
    const w = _tEl('span', 'tr-m'); w.style.cssText = `--x:${x}px;--lift:${lift}px`;
    w.appendChild(hero({}, { size: s, ghost: true, facing: 'front' })); crew.appendChild(w);
  });
}
function _ghostRow() {
  const li = _tEl('div', 'tr-li tr-ghost-li'); li.setAttribute('role', 'listitem');
  const b = _tEl('button', 'team-row tr-ghost'); b.type = 'button'; b.dataset.id = 'new';
  b.setAttribute('aria-label', 'New team. Gather a crew under a new flag.');
  b.innerHTML = `<span class="tr-stage" aria-hidden="true"><span class="tr-light"></span><span class="tr-floor"></span><span class="tr-crew"></span></span>
    <span class="tr-emblem" aria-hidden="true"><span class="em-empty"><b>+</b></span></span>
    <span class="tr-text"><span class="tr-name">New team</span><span class="tr-blurb">Gather a crew under a new flag.</span></span>`;
  _ghostCrew(b.querySelector('.tr-crew'));
  b.addEventListener('mouseenter', () => b.classList.add('hot'));
  b.addEventListener('mouseleave', () => b.classList.remove('hot'));
  b.addEventListener('click', () => go('cast/teams/new'));
  li.appendChild(b); return li;
}
/* hover = focus-visible: team-coloured stage light, emblem glow, crew hop, captain salute */
function _rowHot(b, on) {
  if (b.classList.contains('hot') === on) return;
  b.classList.toggle('hot', on);
  const list = b.closest('.rollcall'); if (list) list.classList.toggle('has-hot', !!list.querySelector('.team-row.hot'));
  if (reducedMotion()) return;
  [...b.querySelectorAll('.tr-m')].forEach((w, i) => {
    const h = w.querySelector('.hero'); if (!h || h.classList.contains('ghost')) return;
    clearTimeout(w._t);
    if (on) {
      w._t = setTimeout(() => { setFacing(h, 'front'); cxHop(h); if (w.classList.contains('is-cap')) setPose(h, 'salute'); }, i * 50);
    } else {
      setFacing(h, w.dataset.facing, { dir: w.dataset.dir }); setPose(h, 'idle');
    }
  });
}

/* ============================================================
   Squad zoom — routing
   ============================================================ */
function squadRoute(zoom) {
  const cur = SQ.draft ? 'new' : SQ.id;
  if (zoom === cur || (zoom && SQ.team && zoom === SQ.team.id)) return;
  if (!cur && zoom) openSquad(zoom, { animate: true });
  else if (cur && !zoom) _closeSquad({ animate: true });
  else { _closeSquad({ animate: false }); openSquad(zoom, { animate: false }); }
}
function _newTeamDraft() {
  const usedE = new Set(TEAMS.map(t => t.emblem)), usedH = new Set(TEAMS.map(t => t.color));
  return { id: null, name: '', blurb: '', color: HUES.find(h => !usedH.has(h)) || 'coral',
    emblem: (EMBLEMS.find(e => !usedE.has(e.id)) || EMBLEMS[0]).id, captain: null, instr: '', code: '', members: [] };
}

function openSquad(id, { animate = true } = {}) {
  const scene = document.getElementById('scene-cast');
  let t;
  if (id === 'new') { t = SQ.draft = _newTeamDraft(); }
  else { t = teamById(id); SQ.draft = null; if (!t) { history.replaceState(null, '', '#cast/teams'); APP.sub = 'teams'; return; } }
  Object.assign(SQ, { id: t.id, team: t, sel: null, strip: false });
  const row = scene.querySelector(`.team-row[data-id="${id}"]`);
  SQ.returnTo = row;
  if (row) _rowHot(row, false);
  const fromCrew = row && row.querySelector('.tr-crew').getBoundingClientRect();
  const fromEm = row && row.querySelector('.tr-emblem').getBoundingClientRect();

  const z = _tEl('section', 'zoom zoom-squad');
  z.setAttribute('role', 'dialog'); z.setAttribute('aria-modal', 'true'); z.setAttribute('aria-labelledby', 'sqTitle');
  z.style.setProperty('--team', teamHex(t));
  z.innerHTML = `<div class="z-bg" aria-hidden="true"></div>
    <div class="z-stage sq-stage">
      <button class="z-back" type="button"><span aria-hidden="true">←</span> Teams</button>
      <div class="sq-mark" aria-hidden="true"></div>
      <div class="z-cone" aria-hidden="true"></div><div class="z-floor" aria-hidden="true"></div>
      <div class="sq-form"></div>
      <div class="sq-floorbar"></div>
      <div class="sq-strip" role="region" aria-label="Add to crew" hidden></div>
    </div>`;
  cxPlace(z, scene);
  scene.appendChild(z);
  z.querySelector('.z-back').onclick = () => go('cast/teams');
  z.querySelector('.sq-stage').addEventListener('click', e => {
    if (SQ.strip && !e.target.closest('.sq-strip,.sq-add,.sq-m')) _closeStrip();
  });
  _paintMark(z, t);
  _renderFormation(z);
  _panelTeam(z);

  const world = scene.querySelector('.cast-world');
  const list = scene.querySelector('.rollcall');
  const rows = [...list.querySelectorAll('.tr-li')];
  const idx = row ? rows.indexOf(row.parentElement) : -1;
  rows.forEach((li, i) => { li.classList.toggle('up', i < idx); li.classList.toggle('down', i > idx); });
  const anim = animate && !reducedMotion() && fromCrew;
  if (anim) {
    row.parentElement.classList.add('is-flying');
    world.classList.add('pushing');
    cxFlip(z.querySelector('.sq-form'), fromCrew, { duration: 520 });
    cxFlip(z.querySelector('.sq-id .emblem'), fromEm, { duration: 520 });
  } else {
    world.classList.add('pushing', 'instant');
    if (animate) z.classList.add('fade-in');
  }
  setTimeout(() => { if (z.isConnected) _crewWave(z); }, anim ? 520 : 60);
  setTimeout(() => {
    if (!z.isConnected) return;
    if (!t.id) z.querySelector('.zp-title').focus(); else z.querySelector('#sqTitle').focus();
  }, anim ? 300 : 30);
}
function _crewWave(z) {
  if (reducedMotion()) return;
  [...z.querySelectorAll('.sq-m .hero')].forEach((h, i) => setTimeout(() => cxHop(h), i * 60));
}

function _closeSquad({ animate = true } = {}) {
  const scene = document.getElementById('scene-cast');
  const z = scene.querySelector('.zoom-squad');
  const t = SQ.team; const id = SQ.draft ? 'new' : t && t.id;
  Object.assign(SQ, { id: null, team: null, draft: null, sel: null, strip: false });
  const world = scene.querySelector('.cast-world');
  if (!z) { world && world.classList.remove('pushing', 'instant'); scene.classList.remove('zoomed'); return; }
  renderTeams(scene.querySelector('#castBody'));
  const list = scene.querySelector('.rollcall');
  const row = list.querySelector(`.team-row[data-id="${id}"]`);
  const rows = [...list.querySelectorAll('.tr-li')];
  const idx = row ? rows.indexOf(row.parentElement) : -1;
  rows.forEach((li, i) => { li.classList.toggle('up', i < idx); li.classList.toggle('down', i > idx); });
  const done = () => {
    z.remove(); scene.classList.remove('zoomed'); world.classList.remove('instant');
    if (row) { row.parentElement.classList.remove('is-flying'); row.focus({ preventScroll: true }); }
    else list.querySelector('.team-row')?.focus({ preventScroll: true });
  };
  if (!animate || reducedMotion() || !row) {
    world.classList.remove('pushing');
    if (animate) { z.classList.add('fade-out'); setTimeout(done, 170); } else done();
    return;
  }
  row.parentElement.classList.add('is-flying');
  const crewR = row.querySelector('.tr-crew').getBoundingClientRect();
  const emR = row.querySelector('.tr-emblem').getBoundingClientRect();
  world.classList.remove('instant'); void world.offsetWidth;
  z.classList.add('leaving');
  world.classList.remove('pushing');
  cxFlip(z.querySelector('.sq-id .emblem'), emR, { reverse: true, duration: 420 });
  const a = cxFlip(z.querySelector('.sq-form'), crewR, { reverse: true, duration: 420 });
  cxAfter(a, done);
}

/* ============================================================
   Stage: watermark + formation
   ============================================================ */
function _paintMark(z, t, emblemId) {
  z.querySelector('.sq-mark').innerHTML = emblemSVG(emblemId ? { color: t.color, emblem: emblemId } : t, 360, { decorative: true });
}
function _stageDims(z) {
  const st = z.querySelector('.sq-stage');
  const W = st.clientWidth || 800, H = st.clientHeight || 600;
  const cap = Math.round(Math.max(150, Math.min(H * 0.46, W * 0.36, 330)));
  return { W, H, cap, crew: Math.round(cap * 0.62) };
}
/* before: Map(agentId → rect) to FLIP from; walkIn: agentId arriving from the strip */
function _renderFormation(z, { before = null, walkIn = null, walkFrom = null } = {}) {
  const t = SQ.team; const form = z.querySelector('.sq-form');
  const { W, cap, crew } = _stageDims(z);
  const ord = orderedMembers(t);
  form.innerHTML = '';
  form.style.height = Math.round(cap + W * 0.22 * 0.5 + 60) + 'px';
  z.querySelector('.sq-stage').classList.toggle('empty', !ord.length);
  if (!ord.length) {
    [[-22, 8], [0, 0], [22, 8]].forEach(([x, y], i) => {
      const px = i === 1 ? cap * 0.8 : crew;
      const b = _tEl('button', 'sq-m sq-empty'); b.type = 'button';
      b.setAttribute('aria-label', i === 1 ? 'Add the first crew member (becomes captain)' : 'Add a crew member');
      b.style.cssText = `left:${W / 2 + x / 100 * W - px * 0.375}px;bottom:${y / 100 * W * 0.5}px;z-index:${10 - (y ? 1 : 0)}`;
      b.appendChild(hero({}, { size: Math.round(px), ghost: true, facing: 'front' }));
      if (i === 1) b.insertAdjacentHTML('beforeend', '<span class="sq-plus" aria-hidden="true">+</span>');
      b.onclick = () => _openStrip(z);
      form.appendChild(b);
    });
  }
  ord.forEach((m, i) => {
    const a = agentById(m.agent); if (!a) return;
    const [x, y] = SQ_SLOTS[i]; const step = y === 0 ? 0 : y <= 4 ? 1 : y <= 8 ? 2 : 3; const back = step === 3;
    const isCap = t.captain === m.agent;
    const px = i === 0 ? cap : Math.round(crew * Math.pow(0.94, step - 1));
    const eff = a.role;
    const b = _tEl('button', 'sq-m' + (back ? ' back' : '') + (isCap ? ' is-cap' : '') + (SQ.sel === m.agent ? ' sel' : '')); b.type = 'button';
    b.dataset.id = m.agent; b.dataset.x = x;
    b.setAttribute('aria-label', `${a.name}, ${eff}${isCap ? ', Captain' : ''}. Edit on this team`);
    b.style.cssText = `left:${Math.round(W / 2 + x / 100 * W - px * 0.375)}px;bottom:${Math.round(y / 100 * W * 0.5)}px;width:${Math.round(px * 0.75)}px;z-index:${10 - step}`;
    b.appendChild(hero(a, { size: px, facing: 'front', captain: isCap, armband: isCap ? teamHex(t) : null }));
    b.insertAdjacentHTML('beforeend', `<span class="sq-plate"><b>${escapeHtml(a.name)}</b><span>${isCap ? `${STAR} Captain · ` : ''}${escapeHtml(eff)}</span></span>`);
    b.onclick = e => { e.stopPropagation(); _selectMember(z, m.agent); };
    b.addEventListener('mouseenter', () => cxHop(b.querySelector('.hero')));
    form.appendChild(b);
    const h = b.querySelector('.hero');
    if (walkIn === m.agent && walkFrom) {
      setPose(h, 'walking'); setFacing(h, 'side', { dir: walkFrom.left + walkFrom.width / 2 > h.getBoundingClientRect().left ? 'left' : 'right' });
      const an = cxFlip(h, walkFrom, { duration: 520 });
      const settle = () => { setPose(h, 'idle'); setFacing(h, 'front'); cxHop(h); };
      cxAfter(an, settle);
    } else if (before && before.has(m.agent)) {
      const r = before.get(m.agent); const now = h.getBoundingClientRect();
      if (Math.abs(r.left - now.left) > 4 || Math.abs(r.height - now.height) > 4) {
        if (!reducedMotion()) { setPose(h, 'walking'); setFacing(h, 'side', { dir: r.left > now.left ? 'left' : 'right' }); }
        const an = cxFlip(h, r, { duration: 440, easing: 'cubic-bezier(.34,1.3,.64,1)' });
        const settle = () => { setPose(h, 'idle'); setFacing(h, 'front'); };
        cxAfter(an, settle);
      }
    }
  });
  _floorBar(z);
  _lookAtSelected(z);
}
function _formationRects(z) {
  const m = new Map();
  z.querySelectorAll('.sq-m[data-id]').forEach(b => m.set(b.dataset.id, b.querySelector('.hero').getBoundingClientRect()));
  return m;
}
function squadRelayout() { const z = document.querySelector('#scene-cast .zoom-squad'); if (z && SQ.team) _renderFormation(z); }
function _floorBar(z) {
  const t = SQ.team; const bar = z.querySelector('.sq-floorbar'); const n = t.members.length;
  bar.innerHTML = n >= TEAM_MAX ? `<span class="sq-full">Crew full · ${n}/${TEAM_MAX}</span>`
    : `<button type="button" class="btn-glass sq-add">+ Add to crew</button>`;
  const add = bar.querySelector('.sq-add'); if (add) add.onclick = e => { e.stopPropagation(); _openStrip(z); };
  bar.hidden = SQ.strip;
}
/* the crew looks at whoever you picked */
function _lookAtSelected(z) {
  const st = z.querySelector('.sq-stage'); st.classList.toggle('has-sel', !!SQ.sel);
  const selB = SQ.sel && z.querySelector(`.sq-m[data-id="${SQ.sel}"]`);
  z.querySelectorAll('.sq-m[data-id]').forEach(b => {
    const h = b.querySelector('.hero'); if (h.classList.contains('pose-walking')) return;
    b.classList.toggle('sel', b === selB);
    if (!selB || b === selB) setFacing(h, 'front');
    else setFacing(h, 'three-quarter', { dir: +b.dataset.x < +selB.dataset.x ? 'right' : 'left' });
  });
}

/* ============================================================
   Panel — team view
   ============================================================ */
function _panelTeam(z, { drill = false } = {}) {
  const t = SQ.team; SQ.sel = null; _lookAtSelected(z);
  const p = _tEl('div', 'z-panel' + (drill ? ' drill-out' : ''));
  p.innerHTML = `<div class="zp-scroll">
    <div class="zp-top"><span class="zp-kicker">${t.id ? 'Team' : 'New team'}</span><span class="zp-saved" aria-hidden="true">Saved ✓</span></div>
    <div class="sq-id">
      <button type="button" class="sq-em-btn" aria-haspopup="true" aria-expanded="false"></button>
      <div class="sq-id-text">
        <h2 class="sr-only" id="sqTitle" tabindex="-1"></h2>
        <input class="zp-title" maxlength="32" placeholder="Name your crew" aria-label="Team name" aria-describedby="sqNameErr" autocomplete="off" spellcheck="false">
        <p class="zp-err" id="sqNameErr" hidden>Teams need a name</p>
      </div>
    </div>
    <div class="sq-picker" hidden></div>
    <label class="zp-field"><span class="zp-sub">Blurb</span>
      <input class="zp-input sq-blurb" maxlength="90" placeholder="What is this crew for, in one breath?" aria-describedby="sqCount" autocomplete="off">
      <span class="sq-count" id="sqCount" aria-live="polite"></span></label>
    <div class="look-row sq-colour"><span class="zp-sub">Colour</span></div>
    <section class="zp-sec"><h3 class="zp-label"><label for="sqRules">What this team does</label></h3>
      <p class="zp-hint-line">Their mission and rules. Every member reads this on top of their own brain.</p>
      <textarea class="zp-area" id="sqRules" rows="4" placeholder="e.g. Takes one feature from idea to demo. Ships behind a flag, keeps main green."></textarea></section>
    <section class="zp-sec"><h3 class="zp-label"><label for="sqCode">How this team codes</label></h3>
      <p class="zp-hint-line">Code structure and design they follow, folders they create, what they touch and where.</p>
      <textarea class="zp-area" id="sqCode" rows="5" placeholder="e.g. Feature folders in src/features/&lt;name&gt;/ with UI, API and tests together. Shared code moves to src/shared/ only when a second feature needs it."></textarea></section>
    <section class="zp-sec"><h3 class="zp-label">Crew <span class="sq-count-crew"></span><span class="zp-hint">max ${TEAM_MAX}</span></h3>
      <ul class="sq-crew" role="list"></ul>
      <button type="button" class="btn-glass sq-add sq-add-panel">+ Add to crew</button></section>
    <p class="zp-foot">The director briefs this team through its captain.</p>
    ${t.id ? '<div class="sq-danger"><button type="button" class="zp-link danger sq-del">Delete team</button></div>' : ''}
  </div>`;
  const $ = s => p.querySelector(s);
  const saved = () => { if (t.id) cxSaved(p); };
  const title = $('#sqTitle'), name = $('.zp-title'), err = $('.zp-err');
  title.textContent = (t.name || 'New team') + ': squad details';
  name.value = t.name;
  const emBtn = $('.sq-em-btn');
  const paintEm = () => { emBtn.innerHTML = emblemSVG(t, 64, { decorative: true }); emBtn.setAttribute('aria-label', `Change emblem (now ${emblemById(t.emblem).name})`); };
  paintEm();
  emBtn.onclick = () => _togglePicker(z, p, paintEm);

  name.addEventListener('input', () => {
    const v = name.value.trim();
    if (!v) { err.hidden = !t.id; return; }
    err.hidden = true; t.name = v; title.textContent = v + ': squad details';
    _commitDraft(z) || saved();
  });
  name.addEventListener('blur', () => { if (!name.value.trim() && t.id) { name.value = t.name; err.hidden = true; } });
  name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });

  const blurb = $('.sq-blurb'), cnt = $('.sq-count');
  blurb.value = t.blurb || '';
  const count = () => { const n = blurb.value.length; cnt.textContent = n >= 70 ? `${n}/90` : ''; };
  count();
  blurb.addEventListener('input', () => { t.blurb = blurb.value; count(); clearTimeout(blurb.t); blurb.t = setTimeout(saved, 350); });

  $('.sq-colour').appendChild(hueSwatches(t.color, v => {
    t.color = v; z.style.setProperty('--team', teamHex(t)); paintEm(); _paintMark(z, t); _renderFormation(z); saved();
    announce(`${t.name || 'Team'} colour: ${COLOR_NAMES[v]}`);
  }, 'Colour'));

  /* the two team prompts: what they do (t.instr) + how they code (t.code) — auto-grow, auto-save */
  [['#sqRules', 'instr'], ['#sqCode', 'code']].forEach(([sel, key]) => {
    const ta = $(sel); ta.value = t[key] || '';
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 12 * 21 + 28) + 'px'; };
    ta.addEventListener('input', () => { t[key] = ta.value; grow(); clearTimeout(ta.t); ta.t = setTimeout(saved, 350); });
    requestAnimationFrame(grow);
  });

  _crewList(z, p);
  $('.sq-add-panel').onclick = () => _openStrip(z);
  const del = $('.sq-del'); if (del) del.onclick = () => _deleteTeam(t);

  const old = z.querySelector('.z-panel');
  if (old) old.replaceWith(p); else z.appendChild(p);
  return p;
}
function _crewList(z, p) {
  const t = SQ.team; const ul = p.querySelector('.sq-crew');
  p.querySelector('.sq-count-crew').textContent = `${t.members.length}/${TEAM_MAX}`;
  const add = p.querySelector('.sq-add-panel'); if (add) add.hidden = t.members.length >= TEAM_MAX;
  const ord = orderedMembers(t);
  ul.innerHTML = ord.length ? '' : '<li class="zp-empty">No crew yet. The first one you add becomes captain.</li>';
  ord.forEach(m => {
    const a = agentById(m.agent); if (!a) return;
    const isCap = t.captain === m.agent; const eff = a.role;
    const li = _tEl('li');
    const b = _tEl('button', 'sq-row'); b.type = 'button';
    b.setAttribute('aria-label', `${a.name}, ${eff}${isCap ? ', Captain' : ''}. Edit on this team`);
    b.innerHTML = `<span class="sq-row-fig"></span><span class="sq-row-text"><b>${escapeHtml(a.name)}${isCap ? ` <em>${STAR} Captain</em>` : ''}</b>
      <span>${roleBadge(eff, 12)}${escapeHtml(eff)}</span>
      ${m.instr ? '' : `<span class="sq-nudge">Give ${escapeHtml(shortName(a))} a job</span>`}</span><i class="chev" aria-hidden="true">›</i>`;
    b.querySelector('.sq-row-fig').appendChild(hero(a, { size: 'xs', facing: 'front' }));
    b.onclick = () => _selectMember(z, m.agent);
    li.appendChild(b); ul.appendChild(li);
  });
}

/* emblem picker: 5×2, team hue, hover previews the stage watermark */
function _togglePicker(z, p, paintEm) {
  const t = SQ.team; const pk = p.querySelector('.sq-picker'); const btn = p.querySelector('.sq-em-btn');
  if (!pk.hidden) { pk.hidden = true; btn.setAttribute('aria-expanded', 'false'); _paintMark(z, t); btn.focus(); return; }
  pk.hidden = false; btn.setAttribute('aria-expanded', 'true');
  pk.innerHTML = '<p class="zp-sub">Choose an emblem</p>';
  const usedBy = id => TEAMS.filter(x => x !== t && x.emblem === id).map(x => x.name);
  const g = cxRadios({
    label: 'Team emblem', cls: 'em-grid', value: t.emblem,
    items: EMBLEMS.map(e => {
      const u = usedBy(e.id);
      return { value: e.id, label: `${e.name}${u.length ? `, in use by ${u.join(', ')}` : ''}`, title: u.length ? `${e.name} · in use by ${u.join(', ')}` : e.name,
        html: `${emblemSVG({ color: t.color, emblem: e.id }, 52, { decorative: true })}<span>${escapeHtml(e.name)}</span>${u.length ? '<i class="em-used" aria-hidden="true"></i>' : ''}` };
    }),
    onPick: v => {
      t.emblem = v; paintEm(); _paintMark(z, t);
      const em = btn.querySelector('.emblem'); if (em && !reducedMotion()) em.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      if (t.id) cxSaved(p);
      announce(`Emblem: ${emblemById(v).name}`);
    },
  });
  g.addEventListener('mouseover', e => { const b = e.target.closest('.cx-radio'); if (b) _paintMark(z, t, b.dataset.value); });
  g.addEventListener('mouseleave', () => _paintMark(z, t));
  pk.appendChild(g);
  (g.querySelector('[aria-checked="true"]') || g.querySelector('.cx-radio')).focus();
}

/* ============================================================
   Panel — member view (job, captain, remove; role lives on the agent)
   ============================================================ */
function _selectMember(z, agentId) {
  const t = SQ.team; const m = memberOf(t, agentId); const a = agentById(agentId); if (!m || !a) return;
  if (SQ.strip) _closeStrip(true);
  SQ.sel = agentId; _lookAtSelected(z);
  const selB = z.querySelector(`.sq-m[data-id="${agentId}"]`); if (selB) cxHop(selB.querySelector('.hero'));
  const first = shortName(a);
  const p = _tEl('div', 'z-panel drill-in');
  p.innerHTML = `<div class="zp-scroll">
    <div class="zp-top"><button type="button" class="zp-crumb"><span aria-hidden="true">←</span> ${escapeHtml(t.name || 'New team')}</button><span class="zp-saved" aria-hidden="true">Saved ✓</span></div>
    <div class="sq-mhead"><span class="sq-mfig"></span><div><h2 id="sqMember" tabindex="-1">${escapeHtml(a.name)}</h2>
      <p>${roleBadge(a.role, 14)}${escapeHtml(a.role)} in the cast · <a href="#cast/agent/${escapeAttr(a.id)}" class="zp-link">Open agent page</a></p></div></div>
    <section class="zp-sec"><h3 class="zp-label"><label for="sqJob">Job on this team</label></h3>
      <textarea class="zp-area" id="sqJob" rows="4" placeholder="What is ${escapeAttr(first)}’s job on this crew?"></textarea>
      <p class="zp-hint-line">${escapeHtml(first)} runs with: their own brain <span aria-hidden="true">▸</span> what the team does <span aria-hidden="true">▸</span> how the team codes <span aria-hidden="true">▸</span> this job.</p></section>
    <div class="sq-mactions"></div>
  </div>`;
  const $ = s => p.querySelector(s);
  const saved = () => { if (t.id) cxSaved(p); };
  const paintHead = () => { const f = $('.sq-mfig'); f.innerHTML = ''; f.appendChild(hero(a, { size: 72, facing: 'front', captain: t.captain === a.id, armband: t.captain === a.id ? teamHex(t) : null })); };
  paintHead();
  $('.zp-crumb').onclick = () => _backToTeam(z);

  const job = $('#sqJob'); job.value = m.instr || '';
  job.addEventListener('input', () => { m.instr = job.value; clearTimeout(job.t); job.t = setTimeout(saved, 350); });

  const acts = $('.sq-mactions');
  const paintActs = () => {
    const isCap = t.captain === a.id;
    acts.innerHTML = (isCap ? `<span class="sq-capbadge">${STAR} Captain of this crew</span>` : `<button type="button" class="btn-team sq-mkcap">${STAR} Make captain</button>`)
      + '<button type="button" class="zp-link danger sq-remove">Remove from team</button>';
    const mk = acts.querySelector('.sq-mkcap'); if (mk) mk.onclick = () => { _makeCaptain(z, a.id); paintActs(); paintHead(); acts.querySelector('.sq-capbadge')?.setAttribute('tabindex', '-1'); acts.querySelector('.sq-capbadge')?.focus(); };
    acts.querySelector('.sq-remove').onclick = () => _removeFromCrew(z, a.id);
  };
  paintActs();

  const old = z.querySelector('.z-panel'); old.replaceWith(p);
  setTimeout(() => p.querySelector('#sqMember').focus(), 30);
}
function _backToTeam(z) {
  const id = SQ.sel;
  _panelTeam(z, { drill: true });
  const row = [...z.querySelectorAll('.sq-row')].find(b => b.getAttribute('aria-label').startsWith((agentById(id) || {}).name + ','));
  (row || z.querySelector('#sqTitle')).focus();
}

function _makeCaptain(z, id) {
  const t = SQ.team; if (t.captain === id) return;
  const before = _formationRects(z);
  setCaptain(t, id);
  _renderFormation(z, { before });
  _captainCheer(z, id);
}
function _captainCheer(z, id) {
  const t = SQ.team; const a = agentById(id);
  announce(`${a.name} is now captain of ${t.name || 'the new team'}.`);
  if (reducedMotion()) return;
  setTimeout(() => {
    const b = z.querySelector(`.sq-m[data-id="${id}"]`); if (!b) return;
    const r = b.getBoundingClientRect();
    sparkle((r.left + r.width / 2) / innerWidth * 100, (r.top + r.height * 0.35) / innerHeight * 100);
    z.querySelectorAll('.sq-m[data-id] .hero').forEach(h => { setPose(h, 'celebrating'); setTimeout(() => h.isConnected && setPose(h, 'idle'), 900); });
  }, 460);
}

function _removeFromCrew(z, id) {
  const t = SQ.team; const a = agentById(id);
  const wasCap = t.captain === id;
  const b = z.querySelector(`.sq-m[data-id="${id}"]`);
  const finish = () => {
    const before = _formationRects(z);
    const res = removeMember(t, id); if (!res) return;
    SQ.sel = null;
    _renderFormation(z, { before });
    _panelTeam(z, { drill: true });
    z.querySelector('#sqTitle').focus();
    const promoted = wasCap && t.captain ? agentById(t.captain) : null;
    if (promoted) _captainCheer(z, t.captain);
    announce(`${a.name} left the crew.${promoted ? ` ${promoted.name} is now captain.` : ''}`);
    toast(`${escapeHtml(a.name)} left the crew <button type="button" class="toast-undo">Undo</button>`, 6000);
    const u = document.querySelector('#toast .toast-undo');
    if (u) u.onclick = () => {
      if (memberOf(t, id) || t.members.length >= TEAM_MAX) return;
      t.members.splice(res.index, 0, res.rec); if (wasCap) t.captain = id;
      document.getElementById('toast').classList.remove('show');
      announce(`${a.name} is back on ${t.name}.`);
      _refreshTeamViews(t);
    };
  };
  if (!b || reducedMotion()) { finish(); return; }
  const h = b.querySelector('.hero');
  b.classList.remove('sel'); setPose(h, 'waving'); setFacing(h, 'front');
  setTimeout(() => {
    setPose(h, 'walking'); setFacing(h, 'side', { dir: 'right' });
    const st = z.querySelector('.sq-stage').getBoundingClientRect(); const r = b.getBoundingClientRect();
    cxAfter(b.animate([{ transform: 'none', opacity: 1 }, { transform: `translateX(${st.right - r.left + 40}px)`, opacity: 0 }], { duration: 520, easing: 'ease-in', fill: 'forwards' }), finish);
  }, 380);
}
/* after Undo, refresh whatever view shows this team */
function _refreshTeamViews(t) {
  const z = document.querySelector('#scene-cast .zoom-squad');
  if (z && SQ.team === t) { _renderFormation(z); if (!SQ.sel) _panelTeam(z); return; }
  const host = document.querySelector('#scene-cast #castBody');
  if (host && CAST.tab === 'teams' && !z) renderTeams(host);
}
function _deleteTeam(t) {
  const i = TEAMS.indexOf(t); if (i < 0) return;
  TEAMS.splice(i, 1);
  go('cast/teams');
  announce(`${t.name} deleted. Agents stay in your cast.`);
  setTimeout(() => {
    toast(`${escapeHtml(t.name)} deleted <button type="button" class="toast-undo">Undo</button>`, 6000);
    const u = document.querySelector('#toast .toast-undo');
    if (u) u.onclick = () => {
      if (!TEAMS.includes(t)) TEAMS.splice(Math.min(i, TEAMS.length), 0, t);
      document.getElementById('toast').classList.remove('show');
      announce(`${t.name} restored.`); _refreshTeamViews(t);
    };
  }, 60);
}
/* a draft becomes a real team once it has a name and one member */
function _commitDraft(z) {
  const t = SQ.team;
  if (!SQ.draft || t.id || !t.name.trim() || !t.members.length) return false;
  t.id = 't-' + t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) + '-' + Date.now().toString(36).slice(-4);
  TEAMS.push(t); SQ.draft = null; SQ.id = t.id;
  history.replaceState(null, '', '#cast/teams/' + t.id); APP.sub = 'teams/' + t.id;
  const k = z.querySelector('.zp-kicker'); if (k) k.textContent = 'Team';
  fireConfetti();
  announce(`${t.name} is official.`);
  const del = z.querySelector('.zp-scroll');
  if (del && !z.querySelector('.sq-del') && !SQ.sel) {
    del.insertAdjacentHTML('beforeend', '<div class="sq-danger"><button type="button" class="zp-link danger sq-del">Delete team</button></div>');
    del.querySelector('.sq-del').onclick = () => _deleteTeam(t);
  }
  return true;
}

/* ============================================================
   Add to crew — the lineup strip rising from the stage floor
   ============================================================ */
function _openStrip(z) {
  const t = SQ.team;
  if (t.members.length >= TEAM_MAX) { announce(`Crew full — ${TEAM_MAX} is the max. The director can call more than one team.`); return; }
  if (SQ.sel) _panelTeam(z, { drill: true });
  SQ.strip = true;
  const strip = z.querySelector('.sq-strip'); strip.hidden = false;
  z.querySelector('.sq-stage').classList.add('strip-open');
  z.querySelector('.sq-floorbar').hidden = true;
  _paintStrip(z);
  setTimeout(() => strip.querySelector('.sq-cand,.sq-strip-done')?.focus(), 60);
}
function _paintStrip(z) {
  const t = SQ.team; const strip = z.querySelector('.sq-strip');
  const cands = AGENTS.filter(a => !memberOf(t, a.id));
  strip.innerHTML = `<div class="sq-strip-head"><b>Who joins the crew?</b><span>${t.members.length}/${TEAM_MAX} · max ${TEAM_MAX} per crew</span>
      <button type="button" class="btn-glass sq-strip-done">Done</button></div>
    <div class="sq-strip-list" role="list"></div>`;
  const list = strip.querySelector('.sq-strip-list');
  if (!cands.length) list.innerHTML = '<p class="zp-empty">Everyone in the cast is already on this crew.</p>';
  cands.forEach(a => {
    const li = _tEl('div', 'sq-cand-li'); li.setAttribute('role', 'listitem');
    const b = _tEl('button', 'sq-cand'); b.type = 'button'; b.dataset.id = a.id;
    b.setAttribute('aria-label', `Add ${a.name}, ${a.role}`);
    b.innerHTML = `<span class="sq-cand-fig"></span><b>${escapeHtml(a.name)}</b><span>${escapeHtml(a.role)}</span>`;
    b.querySelector('.sq-cand-fig').appendChild(hero(a, { size: 'sm', facing: 'front' }));
    b.addEventListener('mouseenter', () => cxHop(b.querySelector('.hero')));
    b.onclick = e => { e.stopPropagation(); _addFromStrip(z, a.id, b); };
    li.appendChild(b); list.appendChild(li);
  });
  strip.querySelector('.sq-strip-done').onclick = e => { e.stopPropagation(); _closeStrip(); };
}
function _addFromStrip(z, id, candBtn) {
  const t = SQ.team; const a = agentById(id);
  const from = candBtn.querySelector('.hero').getBoundingClientRect();
  const first = !t.members.length;
  if (!addMember(t, id)) return;
  const before = _formationRects(z);
  _renderFormation(z, { before, walkIn: id, walkFrom: from });
  if (!SQ.sel) _crewList(z, z.querySelector('.z-panel'));
  const next = candBtn.parentElement.nextElementSibling || candBtn.parentElement.previousElementSibling;
  candBtn.parentElement.remove();
  z.querySelector('.sq-strip-head span').textContent = `${t.members.length}/${TEAM_MAX} · max ${TEAM_MAX} per crew`;
  announce(`${a.name} joined ${t.name || 'the crew'}. ${t.members.length} of ${TEAM_MAX}.`);
  if (first) _captainCheer(z, id);
  if (_commitDraft(z)) { /* team birth: confetti fired in commit */ }
  else if (t.id) cxSaved(z.querySelector('.z-panel'));
  if (t.members.length >= TEAM_MAX) {
    _closeStrip();
    toast('Crew full — the director can call more than one team.');
    return;
  }
  (next && next.querySelector('.sq-cand') || z.querySelector('.sq-strip-done')).focus();
}
function _closeStrip(silent) {
  const z = document.querySelector('#scene-cast .zoom-squad'); if (!z) return;
  SQ.strip = false;
  z.querySelector('.sq-strip').hidden = true;
  z.querySelector('.sq-stage').classList.remove('strip-open');
  _floorBar(z);
  if (!silent) (z.querySelector('.sq-add') || z.querySelector('#sqTitle')).focus();
}

/* squad keyboard: Esc backs out one level (picker → strip → member → team → list) */
document.addEventListener('keydown', e => {
  if (APP.view !== 'studio' || APP.stage !== 'cast') return;
  const z = document.querySelector('#scene-cast .zoom-squad'); if (!z) return;
  if (e.key === 'Tab') { cxTrap(e, z); return; }
  if (e.key !== 'Escape') return;
  e.preventDefault();
  const pk = z.querySelector('.sq-picker:not([hidden])');
  if (pk) { const p = z.querySelector('.z-panel'); pk.hidden = true; _paintMark(z, SQ.team); const b = p.querySelector('.sq-em-btn'); b.setAttribute('aria-expanded', 'false'); b.focus(); return; }
  if (SQ.strip) { _closeStrip(); return; }
  if (SQ.sel) { _backToTeam(z); return; }
  go('cast/teams');
});
