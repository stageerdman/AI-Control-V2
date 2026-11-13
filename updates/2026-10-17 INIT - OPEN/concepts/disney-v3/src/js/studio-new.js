/* ============================================================
   studio-new.js — the project-setup space (v6 N1–N4).
   A studio-level page at #new/<draftId> (the studio nav stays). Drafts live in
   memory: leave mid-way and the draft keeps its step; Projects shows it as an
   "In setup" card that resumes exactly there. Steps:
     0 Start · 1 Name · 2 Orchestrator · 3 Setup (Project Setter) · 4 Team
   Team step: the orchestrator proposes WHOLE TEAMS first (captains are each
   team's own); single agents only as labelled specialists or for very small
   projects. A side chat with the orchestrator edits the plan live (simple
   intent matching). Only a brand-new team is designed by the Agent Creator —
   name, emblem, captain — and it joins the Cast.
   Public: NP_DRAFTS, renderNewProject(id), npLeave(), openNewProject(mode?),
           npDraftCard(d), npDeleteDraft(id), npDemo()
   Demo hooks: ?demo=new-<0..4> · adopt-<0..4> · new-chat · new-small · drafts
   ============================================================ */

const NP_STEPS = ['Start', 'Name', 'Orchestrator', 'Setup', 'Team'];
const NP_TILES = [['#ff6f73', '#ffc24b'], ['#2e3a66', '#4ea8ff'], ['#2fd3c3', '#8be88b'], ['#9b6cff', '#4ea8ff'],
  ['#ff9b3d', '#ffc24b'], ['#5b5280', '#9b6cff'], ['#6a3fd0', '#ff9ecf'], ['#2b8a3e', '#8be88b']];
const NP_GLYPHS = ['bag', 'chart', 'leaf', 'quill', 'tree', 'pebbles', 'cloud', 'fern', 'satellite'];
/* a simulated folder picker: folders on disk, one already under AI Studio */
const NP_FOLDERS = [
  { path: '~/dev/kiln-api', name: 'Kiln API', meta: 'Node · git · 214 files', has: ['git', 'gitignore'] },
  { path: '~/dev/pocket-recipes', name: 'Pocket Recipes', meta: 'Swift · git · 88 files', has: ['git', 'gitignore', 'issues'] },
  { path: '~/Desktop/sketchbook', name: 'Sketchbook', meta: 'Python · no git yet · 31 files', has: [] },
  { path: '~/dev/aurora-storefront', name: 'Aurora Storefront', meta: 'Already in AI Studio', managed: true },
];
/* why each team gets picked, in the orchestrator's words */
const NP_TEAM_WHY = {
  'ship-it': 'the Ship-It Squad builds features end to end',
  polish: 'the Polish Patrol keeps it tidy as it grows',
  engine: 'the Engine Room owns releases and deploys',
  expedition: 'the Expedition maps the unknown before anyone builds',
};
/* alternative team line-ups the orchestrator cycles through ("another team") */
const NP_ALTS = {
  new: [['ship-it', 'polish'], ['ship-it'], ['expedition', 'ship-it'], ['ship-it', 'engine']],
  adopt: [['expedition', 'ship-it'], ['polish', 'engine'], ['polish']],
};
const NP_SMALL = /\b(small|tiny|little|solo|just me|weekend|quick|prototype|side project|hobby|mvp)\b/i;
/* words people use for a role → the Cast role it maps to (else it's a new specialty) */
const NP_ROLE_WORDS = [
  [/\b(data|sql|analytics?|metrics?)\b/i, 'Data'], [/\b(design|ux|ui|visual)\b/i, 'Design'],
  [/\b(qa|test(s|ing|er)?|quality assurance)\b/i, 'QA'], [/\b(research|investigat\w*)\b/i, 'Research'],
  [/\b(devops|infra\w*|deploy\w*|ops)\b/i, 'DevOps'], [/\b(docs?|writer|writing|documentation)\b/i, 'Writer'],
  [/\b(release\w*|changelog)\b/i, 'Release'], [/\b(front ?end|react|css)\b/i, 'Frontend'],
  [/\b(back ?end|api|server)\b/i, 'Backend'], [/\b(lint|clean ?up|refactor\w*)\b/i, 'Quality'],
];

/* ---------------- system agents (contract: data-cast.js) ---------------- */
const npSetter = () => agentById('a-setter');
const npCreator = () => agentById('a-creator');
const npOrchs = () => orchestrators();
const npNick = a => (a ? (typeof shortName === 'function' ? shortName(a) : a.name) : '');
const npSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-project';
const npHash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
function npTile(name) { const h = npHash(name); const [g1, g2] = NP_TILES[h % NP_TILES.length]; return { g1, g2, glyph: NP_GLYPHS[(h >>> 3) % NP_GLYPHS.length] }; }
const npOrchOf = d => agentById(d.orch) || npOrchs()[0];
const npTeamShort = t => t.name.replace(/^The /, '');

/* ============================================================ drafts */
const NP_DRAFTS = [];
let NP = null;            /* the draft on screen */
let _npSeq = 0;
function npNewDraft(mode) {
  const d = { id: 'd' + (++_npSeq), mode: mode || null, step: mode ? 1 : 0, name: '', about: '', folder: null,
    orch: npOrchs()[0].id, setupI: -1, setupDone: false, timer: null, plan: null, chat: [], alt: 0, busy: false, created: Date.now() };
  NP_DRAFTS.push(d); return d;
}
const npDraft = id => NP_DRAFTS.find(d => d.id === id);
/* a draft only "exists" for Projects once you've chosen new/adopt */
const npVisibleDrafts = () => NP_DRAFTS.filter(d => d.mode);
function openNewProject(mode) { const d = npNewDraft(mode); go('new/' + d.id); }

/* router hooks (app.js) */
function renderNewProject(id) {
  let d = npDraft(id);
  if (!d) { d = npNewDraft(); history.replaceState(null, '', '#new/' + d.id); }
  if (NP && NP !== d) npStop(NP);
  NP = d; npRender();
}
function npLeave() {
  if (!NP) return;
  npStop(NP);
  if (!NP.mode) NP_DRAFTS.splice(NP_DRAFTS.indexOf(NP), 1);   /* nothing chosen yet → nothing to keep */
  NP = null;
}
function npStop(d) {
  if (!d) return;
  if (d.timer) { clearTimeout(d.timer); d.timer = null; }
  if (d.pending) { const f = d.pending; d.pending = null; f(); }   /* a mint in flight still lands */
}

/* delete with undo (from the page or a Projects card) */
function npDeleteDraft(id) {
  const i = NP_DRAFTS.findIndex(d => d.id === id); if (i < 0) return;
  const [d] = NP_DRAFTS.splice(i, 1); npStop(d);
  if (NP === d) NP = null;
  if (currentRoute().startsWith('new/')) go('projects'); else if (APP.stage === 'projects') renderProjects();
  toast(`Draft “${escapeHtml(d.name || 'Untitled')}” deleted <button type="button" class="toast-undo">Undo</button>`, 6000);
  const u = document.querySelector('#toast .toast-undo');
  if (u) u.onclick = () => { NP_DRAFTS.splice(Math.min(i, NP_DRAFTS.length), 0, d); document.getElementById('toast').classList.remove('show'); if (APP.stage === 'projects') renderProjects(); toast('Draft restored'); };
}

/* "In setup" card on Projects: calm — tile, name, step + orchestrator, resume / delete */
function npDraftCard(d) {
  const o = npOrchOf(d); const el = document.createElement('div'); el.className = 'np-dcard';
  const tile = d.name ? logoTile(Object.assign({}, npTile(d.name)), true) : '<span class="logo-tile sm np-tile-empty" aria-hidden="true"></span>';
  el.innerHTML = `<button type="button" class="np-dresume">${tile}
      <span class="np-dtext"><b>${escapeHtml(d.name || 'Untitled project')}</b>
      <span>${d.mode === 'adopt' ? 'Adopting' : 'New'} · ${NP_STEPS[d.step]}${d.step >= 2 ? ' · ' + escapeHtml(npNick(o)) : ''}</span></span>
      <span class="np-ddots" aria-hidden="true">${NP_STEPS.map((_, i) => `<i class="${i < d.step ? 'done' : i === d.step ? 'now' : ''}"></i>`).join('')}</span></button>
    <button type="button" class="np-ddel" aria-label="Delete draft ${escapeAttr(d.name || 'Untitled project')}">✕</button>`;
  el.querySelector('.np-dresume').onclick = () => go('new/' + d.id);
  el.querySelector('.np-dresume').setAttribute('aria-label', `Resume ${d.name || 'untitled project'} — step ${d.step + 1} of 5, ${NP_STEPS[d.step]}`);
  el.querySelector('.np-ddel').onclick = () => npDeleteDraft(d.id);
  return el;
}

/* ============================================================ page */
function npGo(step) {
  npStop(NP); NP.step = step;
  if (step < 3) { NP.setupI = -1; NP.setupDone = false; NP.plan = null; NP.chat = []; }  /* changed basics → set up again */
  npRender();
}
function npRender() {
  const root = document.getElementById('scene-new'); if (!root || !NP) return;
  const d = NP, s = d.step;
  root.innerHTML = `
    <div class="np-page${s === 4 ? ' with-chat' : ''}">
      <header class="np-pagehead">
        <div><div class="kicker">${d.mode === 'adopt' ? 'Adopting a folder' : 'New project'} · in setup</div>
          <h1>${escapeHtml(d.name || 'Untitled project')}</h1></div>
        <span class="spacer"></span>
        <ol class="np-steps" aria-label="Setup steps">${NP_STEPS.map((l, i) => `<li class="${i < s ? 'done' : i === s ? 'now' : ''}"${i === s ? ' aria-current="step"' : ''}><i aria-hidden="true"></i><span>${l}</span></li>`).join('')}</ol>
      </header>
      <div class="np-grid">
        <section class="np-card" aria-label="${NP_STEPS[s]}">
          <div class="np-stage"></div>
          <div class="np-body"></div>
          <footer class="np-foot"></footer>
        </section>
        ${s === 4 ? '<aside class="np-chat" aria-label="Chat with the orchestrator"></aside>' : ''}
      </div>
      <div class="np-pagefoot">${d.mode ? '<span class="hint">Saved as you go — leave anytime, it waits on Projects.</span><button type="button" class="np-del">Delete draft</button>' : ''}</div>
    </div>`;
  const del = root.querySelector('.np-del'); if (del) del.onclick = () => npDeleteDraft(d.id);
  const card = root.querySelector('.np-card');
  const target = [npStart, npName, npOrch, npSetup, npTeam][s](card.querySelector('.np-stage'), card.querySelector('.np-body'), card.querySelector('.np-foot'));
  if (s === 4) npChatMount(root.querySelector('.np-chat'));
  const h = card.querySelector('.np-body h2'); h.tabIndex = -1;
  setTimeout(() => { const t = target && target.isConnected ? target : h; if (t && t.isConnected) t.focus({ preventScroll: true }); }, 60);
}
function npFoot(foot, { back, primary, label, disabled, extra }) {
  foot.innerHTML = '';
  if (back != null) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = '← Back'; b.onclick = () => npGo(back); foot.appendChild(b); }
  foot.insertAdjacentHTML('beforeend', '<span class="spacer"></span>');
  if (extra) foot.appendChild(extra);
  if (primary) {
    const p = document.createElement('button'); p.type = 'button'; p.className = 'btn btn-hero np-primary'; p.innerHTML = label; p.disabled = !!disabled; p.onclick = primary;
    foot.appendChild(p); return p;
  }
}
/* a character on the stage, with an optional name plate */
function npActor(agent, opts = {}, plate) {
  const w = document.createElement('div'); w.className = 'np-actor' + (opts.cls ? ' ' + opts.cls : '');
  w.appendChild(hero(agent, Object.assign({ size: 112 }, opts)));
  if (plate) w.insertAdjacentHTML('beforeend', `<span class="np-plate">${plate}</span>`);
  return w;
}
const npPlate = (a, kind) => `${escapeHtml(a.name)}<small>${kind}</small>`;

/* 0 — Start */
function npStart(stage, body, foot) {
  stage.append(
    npActor(npSetter(), { pose: 'waving', dir: 'right' }, npPlate(npSetter(), 'Project Setter')),
    npActor(npOrchs()[0], { pose: 'idle', facing: 'front', size: 128 }, npPlate(npOrchs()[0], 'Orchestrator')),
    npActor(npCreator(), { pose: 'idle', dir: 'left' }, npPlate(npCreator(), 'Agent Creator')));
  body.innerHTML = `<h2>Start a project</h2>
    <p class="np-sub">The Project Setter sets it up, then your orchestrator picks the teams.</p>
    <div class="np-choices">
      <button type="button" class="np-choice" data-mode="new"><span class="np-ic" aria-hidden="true">＋</span><b>New project</b><span>Start fresh in a new folder</span></button>
      <button type="button" class="np-choice" data-mode="adopt"><span class="np-ic" aria-hidden="true">⇢</span><b>Adopt a folder</b><span>Bring existing code under AI Studio</span></button>
    </div>`;
  body.querySelectorAll('.np-choice').forEach(b => b.onclick = () => { NP.mode = b.dataset.mode; npGo(1); });
  foot.hidden = true;
  return body.querySelector('.np-choice');
}

/* 1 — Name (+ folder for adopt) + an optional one-liner the orchestrator reads */
function npName(stage, body, foot) {
  const adopt = NP.mode === 'adopt';
  stage.innerHTML = `<div class="np-tilewrap"><span class="np-tile"></span><b class="np-tname"></b><span class="np-tpath"></span></div>`;
  body.innerHTML = `<h2>${adopt ? 'Which folder?' : 'Name your project'}</h2>
    ${adopt ? `<div class="np-folders" role="radiogroup" aria-label="Folders on this computer">${NP_FOLDERS.map((f, i) => `
      <button type="button" role="radio" class="np-folder" aria-checked="${NP.folder === i}" ${f.managed ? 'aria-disabled="true"' : ''} tabindex="-1">
        <span class="np-fic" aria-hidden="true">📁</span><span class="np-fpath">${escapeHtml(f.path)}</span><span class="np-fmeta">${escapeHtml(f.meta)}</span></button>`).join('')}</div>` : ''}
    <div class="np-namefields"${adopt && NP.folder == null ? ' hidden' : ''}>
      <div class="field"><label for="npName">Project name</label><input id="npName" autocomplete="off" placeholder="e.g. Kite Notes" value="${escapeAttr(NP.name)}"></div>
      <div class="field"><label for="npAbout">What is it? <span class="np-opt">optional — your orchestrator reads this</span></label><input id="npAbout" autocomplete="off" placeholder="e.g. a tiny weekend app for sharing recipes" value="${escapeAttr(NP.about)}"></div>
    </div>`;
  const input = body.querySelector('#npName'), about = body.querySelector('#npAbout');
  const btn = npFoot(foot, { back: 0, primary: () => { if (!btn.disabled) npGo(2); }, label: 'Continue' });
  const sync = () => {
    const nm = NP.name.trim();
    stage.querySelector('.np-tile').outerHTML = nm ? logoTile(Object.assign({}, npTile(nm))).replace('logo-tile', 'logo-tile np-tile') : '<span class="logo-tile np-tile np-tile-empty" aria-hidden="true"></span>';
    stage.querySelector('.np-tname').textContent = nm || (adopt ? 'Pick a folder' : 'Your project');
    stage.querySelector('.np-tpath').textContent = adopt ? (NP.folder != null ? NP_FOLDERS[NP.folder].path : '') : (nm ? '~/dev/' + npSlug(nm) : '');
    btn.disabled = !nm || (adopt && NP.folder == null);
    document.querySelector('.np-pagehead h1').textContent = nm || 'Untitled project';
  };
  input.oninput = () => { NP.name = input.value; sync(); };
  about.oninput = () => { NP.about = about.value; };
  [input, about].forEach(el => el.onkeydown = e => { if (e.key === 'Enter' && !btn.disabled) npGo(2); });
  if (adopt) {
    const radios = [...body.querySelectorAll('.np-folder')];
    const pick = i => {
      if (NP_FOLDERS[i].managed) { toast('That folder is already in AI Studio'); return; }
      const prevAuto = NP.folder != null && NP.name === NP_FOLDERS[NP.folder].name;
      NP.folder = i; if (!NP.name || prevAuto) NP.name = NP_FOLDERS[i].name;
      radios.forEach((r, j) => r.setAttribute('aria-checked', j === i));
      input.value = NP.name; body.querySelector('.np-namefields').hidden = false; sync();
    };
    radios[NP.folder != null ? NP.folder : 0].tabIndex = 0;
    radios.forEach((r, i) => {
      r.onclick = () => pick(i);
      r.onkeydown = e => {
        const dd = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!dd) return;
        e.preventDefault(); const j = (i + dd + radios.length) % radios.length;
        radios.forEach(x => x.tabIndex = -1); radios[j].tabIndex = 0; radios[j].focus();
        if (!NP_FOLDERS[j].managed) pick(j);
      };
    });
  }
  sync();
  return adopt && NP.folder == null ? body.querySelector('.np-folder[tabindex="0"]') : input;
}

/* 2 — Orchestrator (the stage IS the picker) */
function npOrch(stage, body, foot) {
  const list = npOrchs();
  if (!list.some(o => o.id === NP.orch)) NP.orch = list[0].id;
  stage.classList.add('np-pick'); stage.setAttribute('role', 'radiogroup'); stage.setAttribute('aria-label', 'Orchestrators');
  const btn = npFoot(foot, { back: 1, primary: () => npGo(3), label: '' });
  body.innerHTML = `<h2>Who runs ${escapeHtml(NP.name)}?</h2>
    <p class="np-sub">The orchestrator keeps the big picture and picks the teams.${list.length > 1 ? ' Use ← → to choose.' : ''}</p>
    <p class="np-quote"></p>`;
  const draw = () => {
    stage.innerHTML = '';
    list.forEach(o => {
      const on = o.id === NP.orch;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'np-actor np-orch' + (on ? ' on' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1;
      b.appendChild(hero(o, { size: on ? 136 : 108, pose: on ? 'waving' : 'idle', facing: on ? 'front' : 'three-quarter' }));
      b.insertAdjacentHTML('beforeend', `<span class="np-plate">${escapeHtml(o.name)}</span>`);
      b.onclick = () => { NP.orch = o.id; draw(); stage.querySelector('.on').focus(); };
      b.onkeydown = e => {
        const dd = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!dd) return;
        e.preventDefault(); const i = list.indexOf(o); NP.orch = list[(i + dd + list.length) % list.length].id; draw(); stage.querySelector('.on').focus();
      };
      stage.appendChild(b);
    });
    const o = npOrchOf(NP);
    body.querySelector('.np-quote').textContent = npOrchLine(o);
    btn.innerHTML = 'Continue with ' + escapeHtml(npNick(o));
  };
  draw();
  return stage.querySelector('.on');
}
function npOrchLine(o) {
  const parts = ((o && o.prompt) || '').split(/(?<=\.)\s/); const first = /^You are\b/.test(parts[0]) && parts[1] ? parts[1] : parts[0];
  return first ? '“' + first + '”' : '';
}

/* 3 — Setup by the Project Setter */
function npSetupItems(d) {
  const adopt = d.mode === 'adopt'; const f = adopt ? NP_FOLDERS[d.folder] : null; const has = k => !!(f && f.has.includes(k));
  const slug = npSlug(d.name); const items = [];
  if (adopt) items.push({ label: 'Read the folder', detail: f.has.length ? 'found ' + f.has.map(k => ({ git: 'git', gitignore: '.gitignore', issues: 'issues.txt' }[k])).join(', ') : 'plain folder, nothing to keep' });
  else items.push({ label: 'Project folder', detail: '~/dev/' + slug });
  items.push(
    { label: '.project', detail: 'project marker · modules, secrets' },
    { label: 'CLAUDE.md', detail: 'compiled from Structure, Coding, UX, Workflow' },
    has('gitignore') ? { label: '.gitignore + .env', detail: 'kept .gitignore, made sure it covers .env', kept: true } : { label: '.gitignore + .env', detail: '.env stays out of git' },
    { label: 'updates/', detail: 'first update: INIT - OPEN' },
    has('issues') ? { label: 'issues.txt', detail: 'already there — kept', kept: true } : { label: 'issues.txt', detail: 'running list of issues & TODOs' },
    has('git') ? { label: 'GitHub', detail: 'existing repo connected · private', kept: true } : { label: 'GitHub', detail: 'new private repo · ' + slug });
  return items;
}
function npSetup(stage, body, foot) {
  const d = NP; const items = npSetupItems(d); const setter = npSetter(); const o = npOrchOf(d);
  stage.append(npActor(setter, { pose: d.setupDone ? 'salute' : 'writing', holding: 'binder', dir: 'right', size: 128, cls: 'np-setter' }));
  stage.insertAdjacentHTML('beforeend', `<div class="np-tilewrap sm">${logoTile(Object.assign({}, npTile(d.name)))}<b>${escapeHtml(d.name)}</b></div>`);
  body.innerHTML = `<h2>${d.setupDone ? 'All set up' : `${escapeHtml(npNick(setter))}, the Project Setter, is setting up ${escapeHtml(d.name)}`}</h2>
    <p class="np-sub">${d.mode === 'adopt' ? 'It reads the folder first and only adds what is missing.' : 'The standard AI Studio scaffold, nothing more.'}</p>
    <div class="progress np-prog" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
    <ul class="np-checks">${items.map(it => `<li><span class="np-tick" aria-hidden="true"></span><b>${escapeHtml(it.label)}</b><span class="np-detail">${escapeHtml(it.detail)}</span></li>`).join('')}</ul>`;
  const btn = npFoot(foot, { back: d.setupDone ? null : 2, primary: () => npGo(4), label: `Call in ${escapeHtml(npNick(o))} →`, disabled: !d.setupDone });
  const lis = [...body.querySelectorAll('.np-checks li')]; const prog = body.querySelector('.np-prog');
  const paint = () => {
    lis.forEach((li, j) => { li.className = j < d.setupI || d.setupDone ? (items[j].kept ? 'done kept' : 'done') : j === d.setupI ? 'doing' : ''; });
    const pct = d.setupDone ? 100 : Math.round(Math.max(0, d.setupI) / items.length * 100);
    prog.querySelector('.fill').style.width = pct + '%'; prog.setAttribute('aria-valuenow', pct);
  };
  paint();
  if (d.setupDone) return btn;
  const tick = () => {
    if (NP !== d) { d.timer = null; return; }
    d.setupI++;
    if (d.setupI >= items.length) {
      d.setupDone = true; d.timer = null;
      announce(`${d.name} is set up.`);
      body.querySelector('h2').textContent = 'All set up';
      stage.querySelector('.np-setter').replaceWith(npActor(setter, { pose: 'salute', dir: 'right', size: 128, cls: 'np-setter' }));
      paint(); btn.disabled = false; foot.querySelector('.btn-ghost')?.remove(); btn.focus(); sparkle(50, 30); return;
    }
    paint();
    d.timer = setTimeout(tick, reducedMotion() ? 140 : 520);
  };
  d.timer = setTimeout(tick, reducedMotion() ? 100 : 380);
}

/* ============================================================ 4 — Team (the plan) */
/* plan = { teams: [teamId], specialists: [agentId], small: bool } — captains always come from TEAMS */
function npInitialPlan(d) {
  if (NP_SMALL.test(d.about || '')) return { teams: [], specialists: npSmallCrew(), small: true };
  return { teams: NP_ALTS[d.mode === 'adopt' ? 'adopt' : 'new'][0].slice(), specialists: [], small: false };
}
function npSmallCrew() { return ['a-pete', 'a-semic'].filter(id => agentById(id)); }
const npPlanTeams = p => p.teams.map(teamById).filter(Boolean);
function npPlanAgents(p) {
  const ids = []; npPlanTeams(p).forEach(t => t.members.forEach(m => { if (!ids.includes(m.agent)) ids.push(m.agent); }));
  p.specialists.forEach(id => { if (!ids.includes(id)) ids.push(id); }); return ids;
}
function npPlanWhy(p, d) {
  if (p.small && !p.teams.length) return `It’s a small one, so a whole team would be overkill — ${p.specialists.map(id => npNick(agentById(id))).join(' and ')} can carry it.`;
  const ts = npPlanTeams(p);
  const bits = ts.map(t => NP_TEAM_WHY[t.id] || `${t.name} — ${(t.blurb || 'designed for this').replace(/\.$/, '').toLowerCase()}`);
  let s = ts.length ? (ts.length === 1 ? `One team: ${bits[0]}.` : `${ts.length} teams: ${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}.`) : 'No teams yet.';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (p.specialists.length) s += ` Plus ${p.specialists.map(id => npNick(agentById(id))).join(' and ')} as specialist${p.specialists.length > 1 ? 's' : ''}.`;
  return s;
}

function npTeam(stage, body, foot) {
  const d = NP; if (!d.plan) d.plan = npInitialPlan(d);
  if (!d.chat.length) d.chat.push({ from: d.orch, text: `I’ve read the brief for ${d.name}. ${npPlanWhy(d.plan, d)} Ask me why, swap a team, add or drop a specialist — or I can have ${npNick(npCreator())} design a brand-new team.` });
  npDrawPlan(stage, body);
  return npFoot(foot, { back: null, primary: npFinish, label: 'Accept the plan →' });
}
/* the stage: orchestrator left, then each team as a squad under its emblem, then specialists */
function npDrawPlan(stage, body) {
  const d = NP, p = d.plan, o = npOrchOf(d);
  stage.className = 'np-stage np-planstage';
  stage.innerHTML = '';
  stage.appendChild(npActor(o, { pose: d.busy ? 'thinking' : 'talking', dir: 'right', size: 116, cls: 'np-lead' }, npPlate(o, 'Orchestrator')));
  const row = document.createElement('div'); row.className = 'np-groups'; stage.appendChild(row);
  const placed = new Set();
  npPlanTeams(p).forEach(t => {
    const g = document.createElement('div'); g.className = 'np-group' + (t._new ? ' np-newteam' : '');
    g.innerHTML = `<div class="np-ghead"><span class="np-emb"></span><b>${escapeHtml(npTeamShort(t))}</b>${t._new ? '<i>new</i>' : ''}</div><div class="np-gmem"></div>`;
    if (typeof emblem === 'function') g.querySelector('.np-emb').appendChild(emblem(t, 26));
    const mem = g.querySelector('.np-gmem');
    t.members.forEach(m => {
      const a = agentById(m.agent); if (!a) return;
      const dup = placed.has(a.id); placed.add(a.id);
      mem.appendChild(npActor(a, { size: 76, dir: 'left', pose: 'idle', captain: t.captain === a.id, ghost: dup }, escapeHtml(npNick(a))));
    });
    row.appendChild(g);
  });
  if (p.specialists.length) {
    const g = document.createElement('div'); g.className = 'np-group np-spec';
    g.innerHTML = `<div class="np-ghead"><b>${p.small && !p.teams.length ? 'Just these two' : 'Specialists'}</b></div><div class="np-gmem"></div>`;
    p.specialists.forEach(id => { const a = agentById(id); if (a) g.querySelector('.np-gmem').appendChild(npActor(a, { size: 76, dir: 'left', pose: a._fresh ? 'celebrating' : 'idle' }, escapeHtml(npNick(a)) + (a._fresh ? ' <i>new</i>' : ''))); });
    row.appendChild(g);
  }
  if (d.busy === 'creator') row.appendChild(npActor(npCreator(), { size: 84, dir: 'left', pose: 'pressing', cls: 'np-creator' }, escapeHtml(npNick(npCreator()))));
  const ts = npPlanTeams(p), n = npPlanAgents(p).length;
  const caps = ts.map(t => npNick(agentById(t.captain))).filter(Boolean);
  body.innerHTML = `<h2>${escapeHtml(npNick(o))}’s plan for ${escapeHtml(d.name)}</h2>
    <p class="np-sub">${!ts.length && p.small ? `No team — ${n} agents, briefed by ${escapeHtml(npNick(o))} directly. This project runs its own copies — no shared memory.</p>` : ''}${!ts.length && p.small ? '' : `${ts.length ? `${ts.length} team${ts.length > 1 ? 's' : ''}` : 'No teams'}${p.specialists.length ? ` · ${p.specialists.length} specialist${p.specialists.length > 1 ? 's' : ''}` : ''} · ${n} agents.
    ${caps.length ? `Captains come from each team’s own design (${caps.map(escapeHtml).join(', ')}).` : ''} This project runs its own copies — no shared memory.</p>`}`;
}

/* ---------------- chat with the orchestrator ---------------- */
function npChatMount(el) {
  const d = NP, o = npOrchOf(d);
  el.innerHTML = `<header class="op-head"><div class="op-portrait"></div>
      <div class="op-who"><b>${escapeHtml(o.name)}</b><span class="op-role">Orchestrator</span><span class="op-status">Planning ${escapeHtml(d.name)}’s teams</span></div></header>
    <div class="op-log" role="log" aria-live="polite"></div>
    <form class="op-composer"><input autocomplete="off" placeholder="Message ${escapeAttr(npNick(o))}…" aria-label="Message ${escapeAttr(o.name)}"><button class="btn btn-hero btn-sm" type="submit">Send</button></form>`;
  el.querySelector('.op-portrait').appendChild(hero(o, { size: 72, pose: 'talking', facing: 'front', props: false }));
  const log = el.querySelector('.op-log'); d.chat.forEach(m => npBubble(log, m));
  el.querySelector('form').onsubmit = e => {
    e.preventDefault(); const inp = el.querySelector('input'); const v = inp.value.trim();
    if (!v || d.busy) { inp.focus(); return; }
    inp.value = ''; npSay(v);
  };
}
function npBubble(log, m) {
  const b = document.createElement('div'); b.className = 'bubble ' + (m.from === 'user' ? 'me' : 'them');
  const who = m.from === 'user' ? 'You' : npNick(agentById(m.from));
  b.innerHTML = `<span class="who">${escapeHtml(who)}</span><span class="t">${escapeHtml(m.text)}</span>`;
  log.appendChild(b); log.scrollTop = log.scrollHeight;
}
/* user says something → orchestrator answers (and maybe edits the plan) */
function npSay(text, instant) {
  const d = NP; d.chat.push({ from: 'user', text });
  const log = document.querySelector('.np-chat .op-log'); if (log) npBubble(log, d.chat[d.chat.length - 1]);
  const r = npIntent(d, text);
  const reply = () => {
    npPost(d, r);
    if (!r.mint) { npRedrawPlan(d); return; }
    /* the Agent Creator steps onto the stage, designs, and the result lands */
    d.busy = 'creator'; npRedrawPlan(d);
    d.pending = () => { d.busy = false; r.mint(); npPost(d, r.after); npRedrawPlan(d); if (NP === d) sparkle(45, 32); };
    const fire = () => { d.timer = null; if (d.pending) { const f = d.pending; d.pending = null; f(); } };
    if (instant) fire(); else d.timer = setTimeout(fire, reducedMotion() ? 250 : 1400);
  };
  if (instant) { reply(); return; }
  d.busy = true; npRedrawPlan(d);
  const t = document.createElement('div'); t.className = 'bubble them np-typing'; t.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  if (log) { log.appendChild(t); log.scrollTop = log.scrollHeight; }
  setTimeout(() => { t.remove(); d.busy = false; reply(); }, reducedMotion() ? 150 : 650);
}
function npPost(d, r) {
  if (!r || !r.text) return;
  const m = { from: r.from || d.orch, text: r.text }; d.chat.push(m);
  const log = document.querySelector('.np-chat .op-log'); if (log && NP === d) npBubble(log, m);
}
function npRedrawPlan(d) {
  const card = document.querySelector('#scene-new .np-card'); if (!card || !NP || NP !== d || NP.step !== 4) return;
  npDrawPlan(card.querySelector('.np-stage'), card.querySelector('.np-body'));
}

/* intent matching: plain words → plan edits + a reply in the orchestrator's voice */
function npFindTeam(text) {
  const t = text.toLowerCase();
  return TEAMS.find(x => { const w = npTeamShort(x).toLowerCase(); return t.includes(w) || t.includes(x.id) || w.split(/[\s-]+/).some(k => k.length > 4 && t.includes(k)); });
}
function npFindAgent(text) {
  const t = text.toLowerCase();
  const word = w => new RegExp('\\b' + w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t);
  return AGENTS.find(a => kindOf(a) === 'agent' && (word(a.name) || word(npNick(a))));
}
function npRoleIn(text) {
  const hit = NP_ROLE_WORDS.find(([re]) => re.test(text)); if (hit) return { role: hit[1], known: true };
  const m = /\b(?:for|a|an)\s+([a-z][a-z-]{2,20})\s+(?:specialist|expert|person|agent|team|crew|squad)\b/i.exec(text) || /\b(?:specialist|expert|team|crew)\s+for\s+([a-z][a-z-]{2,20})\b/i.exec(text);
  return m ? { role: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), known: false } : null;
}
/* what a requested new team is FOR ("design a new team for mobile" → Mobile; the verb "design" isn't the topic) */
function npTeamTopic(raw) {
  const m = /\bfor\s+(?:a\s+|an\s+|the\s+|our\s+)?([a-z][a-z-]{2,20})/i.exec(raw);
  if (m) { const hit = NP_ROLE_WORDS.find(([re]) => re.test(m[1])); return { role: hit ? hit[1] : m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() }; }
  const r = npRoleIn(raw.replace(/\bdesign(ed)?\b/ig, '')); return r || { role: 'Mobile' };
}
function npIntent(d, raw) {
  const text = raw.toLowerCase(), p = d.plan, cr = npNick(npCreator());
  const say = s => ({ text: s });
  const isDrop = /\b(drop|remove|without|no need for|lose|kick|take out|don'?t need)\b/.test(text);
  const isAdd = /\b(add|need|want|bring|include|plus|also|get us|hire)\b/.test(text);
  const team = npFindTeam(text), agent = npFindAgent(text);
  /* captains: never the orchestrator's call for an existing team */
  if (/\bcaptain/.test(text) && !/\bnew team\b/.test(text)) {
    const ts = npPlanTeams(p);
    return say(ts.length ? `Captains aren’t mine to pick — each team chose its own: ${ts.map(t => `${npNick(agentById(t.captain))} for ${npTeamShort(t)}`).join(', ')}. If you want a different captain, change it on the team in the Cast.` : 'No team, no captain — on a project this small I brief everyone directly.');
  }
  /* a brand-new team → the Agent Creator designs it (name, emblem, captain) */
  if (/\b(new|brand[- ]new|fresh|own|design( us)?( a)?|create( a)?)\b.{0,12}\b(team|crew|squad)\b/.test(text)) {
    const r = npTeamTopic(raw);
    let made = null;
    return { text: `Nobody in the Cast covers ${r.role.toLowerCase()} as a team yet. ${cr}, can you design us one?`,
      mint: () => { made = npDesignTeam(r.role, d); p.teams.push(made.id); p.small = false; },
      get after() { return { from: npCreator().id, text: `Here’s ${made.name}: ${made.members.map(m => npNick(agentById(m.agent))).join(', ')} — ${npNick(agentById(made.captain))} captains. They’re in the Cast now, so any project can use them.` }; } };
  }
  if (/\b(small|tiny|smaller|just two|fewer|minimal|lean)\b/.test(text)) {
    p.teams = []; p.specialists = npSmallCrew(); p.small = true;
    return say(`Then let’s not field a whole team. ${p.specialists.map(id => npNick(agentById(id))).join(' and ')} can carry it; I’ll brief them directly.`);
  }
  if (/\b(bigger|more people|larger|scale up|full team)\b/.test(text)) {
    const next = NP_ALTS[d.mode === 'adopt' ? 'adopt' : 'new'][0].find(id => !p.teams.includes(id)) || TEAMS.find(t => !p.teams.includes(t.id))?.id;
    if (!next) return say('Every team in the Cast is already on it.');
    if (p.small) p.specialists = []; p.teams.push(next); p.small = false;
    return say(`More hands, then: ${NP_TEAM_WHY[next] || npTeamShort(teamById(next))}. They come as a whole team, captain included.`);
  }
  if (team && isDrop) {
    if (!p.teams.includes(team.id)) return say(`${team.name} isn’t on the plan.`);
    p.teams = p.teams.filter(x => x !== team.id);
    return say(`${team.name} is off. ${p.teams.length ? npPlanWhy(p, d) : 'That leaves no team — tell me what you’d like instead.'}`);
  }
  if (team && (isAdd || /\b(instead|swap|switch|rather|use)\b/.test(text))) {
    if (p.teams.includes(team.id)) return say(`${team.name} is already on it — captained by ${npNick(agentById(team.captain))}.`);
    if (/\b(instead|swap|switch|rather|replace)\b/.test(text) && p.teams.length && !p.small) { const old = teamById(p.teams[p.teams.length - 1]); p.teams[p.teams.length - 1] = team.id; p.small = false; return say(`Swapped ${npTeamShort(old)} for ${team.name} — ${NP_TEAM_WHY[team.id] || 'they fit this better'}.`); }
    if (p.small) p.specialists = []; p.teams.push(team.id); p.small = false;
    return say(`Added ${team.name} — ${NP_TEAM_WHY[team.id] || 'a good fit'}. ${npNick(agentById(team.captain))} stays their captain.`);
  }
  if (agent && isDrop) {
    if (!p.specialists.includes(agent.id)) {
      const inTeam = npPlanTeams(p).find(t => memberOf(t, agent.id));
      return say(inTeam ? `${npNick(agent)} comes with ${inTeam.name} — I keep teams whole. Drop the team, or keep them both?` : `${npNick(agent)} isn’t on the plan.`);
    }
    p.specialists = p.specialists.filter(x => x !== agent.id);
    return say(`${npNick(agent)} is off the plan.`);
  }
  if (/\b(another|different|other|else|swap|alternative|not (this|that|these))\b/.test(text)) {
    const alts = NP_ALTS[d.mode === 'adopt' ? 'adopt' : 'new']; d.alt = (d.alt + 1) % alts.length;
    p.teams = alts[d.alt].slice(); p.small = false; if (p.specialists.every(id => npSmallCrew().includes(id))) p.specialists = [];
    return say(`Another way to run it: ${npPlanWhy(p, d).replace(/^./, c => c.toLowerCase())}`);
  }
  /* a specialist: from the Cast if someone fits, else the Agent Creator designs one */
  const r = (isAdd || /\bspecialist|expert\b/.test(text)) ? (agent ? { agent } : npRoleIn(raw)) : null;
  if (r) {
    const fit = r.agent || (r.known && AGENTS.find(a => kindOf(a) === 'agent' && roleName(a) === r.role && !npPlanAgents(p).includes(a.id)));
    if (fit) {
      if (npPlanAgents(p).includes(fit.id)) return say(`${npNick(fit)} is already on the plan.`);
      p.specialists.push(fit.id);
      return say(`Good call — ${fit.name} joins as a ${roleName(fit).toLowerCase()} specialist, outside the teams. I’ll brief them myself.`);
    }
    let made = null;
    return { text: `No one in the Cast does ${r.role.toLowerCase()}. ${cr}, can you design a ${r.role} specialist?`,
      mint: () => { made = npMintAgent(r.role, npPlanAgents(p)); p.specialists.push(made.id); },
      get after() { return { from: npCreator().id, text: `Done — meet ${made.name}, ${r.role} specialist. Added to the Cast; rename or restyle them anytime.` }; } };
  }
  if (/\b(why|how come|reason|explain)\b/.test(text)) {
    const ts = npPlanTeams(p);
    return say(ts.length ? `${npPlanWhy(p, d)} I start from whole teams because they already know how to work together — their captain, their rules, how they code. Single agents only come in as specialists.` : npPlanWhy(p, d));
  }
  if (/\b(ok|okay|good|great|perfect|looks good|yes|sounds good|thanks)\b/.test(text)) return say('Great — accept the plan when you’re ready and I’ll open the office.');
  return say(`I can explain why, swap a team (“try the Engine Room instead”), add or drop a specialist (“add a data specialist”), or ask ${cr} for a brand-new team (“design a new team for mobile”).`);
}

/* ---------------- the Agent Creator ---------------- */
function npMintAgent(role, mates_) {
  const used = new Set(AGENTS.map(a => a.name));
  const name = FUNNY_NAMES.find(n => !used.has(n)) || role + ' Bot ' + (AGENTS.length + 1);
  let id = 'a-' + npSlug(name); while (agentById(id)) id += '-2';
  const mates = (mates_ || []).map(agentById).filter(Boolean);
  const hue = ['mint', 'rose', 'coral', 'grape', 'sky', 'teal', 'sun'].find(c => !mates.some(m => (m.look ? m.look.hue : m.hue) === c)) || HUES[AGENTS.length % HUES.length];
  const [build, hair] = [['sprout', 'curl'], ['hero', 'spikes'], ['lanky', 'bob'], ['bruiser', 'tuft']][AGENTS.length % 4];
  const a = { id, kind: 'agent', name, nick: name.split(' ').slice(-1)[0], role, hue, build, hair, accessory: 'none',
    stats: { projects: 1, tokens: 0 }, createdBy: npCreator().id, _fresh: true,
    prompt: `You are a ${role} specialist, designed by the Agent Creator. Stay in your lane; ask the orchestrator when the brief is unclear.` };
  /* regular-crew gear only (no director fedora / megaphone, no setter hard hat), unlike its mates */
  const h = npHash(role + name);
  const pick = (o, ok, k) => { const l = ok.filter(x => x in o && !mates.some(m => m.look && (m.look.hat === x || m.look.tool === x))); return l.length ? l[k % l.length] : 'none'; };
  const hat = pick(HATS, ['headphones', 'goggles', 'headlamp', 'mortarboard', 'newsboy', 'captain', 'beret'], h);
  setWholeLook(a, { hat, tool: pick(TOOLS, ['stylus', 'cog', 'pickaxe', 'book', 'quill', 'flag', 'palette'], h >>> 4), decal: hatDecal(hat), body: build, antenna: hair, face: 'none', hue });
  AGENTS.push(a); addRole(role);
  return a;
}
/* a whole new team: name, emblem, colour, captain, members — joins the Cast */
const NP_TEAM_NAMES = ['The Night Shift', 'The Pocket Rockets', 'The Signal Crew', 'The Moonlighters', 'The Tinker Works', 'The Spark Unit'];
function npDesignTeam(role, d) {
  const taken = new Set(TEAMS.map(t => t.emblem)); const usedC = new Set(TEAMS.map(t => t.color));
  const name = NP_TEAM_NAMES.find(n => !TEAMS.some(t => t.name === n)) || `The ${role} Crew`;
  const em = (EMBLEMS.find(e => !taken.has(e.id)) || EMBLEMS[0]).id;
  const color = HUES.find(c => !usedC.has(c)) || HUES[TEAMS.length % HUES.length];
  const lead = npMintAgent(role, npPlanAgents(d.plan));
  const second = npMintAgent(role, npPlanAgents(d.plan).concat(lead.id));
  const qa = AGENTS.find(a => kindOf(a) === 'agent' && roleName(a) === 'QA' && !npPlanAgents(d.plan).includes(a.id));
  const members = [lead.id, second.id].concat(qa ? [qa.id] : []);
  let id = 't-' + npSlug(name); while (teamById(id)) id += '-2';
  const t = { id, name, color, emblem: em, captain: lead.id, _new: true,
    blurb: `${role} from first sketch to shipped build.`,
    instr: `Own everything ${role.toLowerCase()} on the projects you join. The captain splits the work and reports to the orchestrator.`,
    code: '', members: members.map(agent => ({ agent, instr: '' })) };
  TEAMS.push(t);
  return t;
}

/* ---------------- finish: project + office config, then walk in ---------------- */
function npFinish() {
  const d = NP, p = d.plan;
  const placed = new Set();
  const teams = npPlanTeams(p).map(t => { const members = t.members.map(m => m.agent).filter(id => agentById(id) && !placed.has(id)); members.forEach(id => placed.add(id)); return { id: t.id, members }; }).filter(t => t.members.length);
  const solo = p.specialists.filter(id => agentById(id) && !placed.has(id));
  const all = teams.flatMap(t => t.members).concat(solo);
  let id = npSlug(d.name); while (projById(id)) id += '-2';
  AGENTS.forEach(a => { delete a._fresh; }); TEAMS.forEach(t => { delete t._new; });
  PROJECTS.unshift(Object.assign({ id, name: d.name.trim(), group: 'active', status: 'live', agents: all.length, pct: 0,
    orchestrator: d.orch, github: { connected: true, private: true },
    folder: d.mode === 'adopt' ? NP_FOLDERS[d.folder].path : '~/dev/' + id,
    note: d.about.trim() || `Just set up — ${npNick(npOrchOf(d))} is planning the first update`,
    cast: all.slice(0, 4), openable: true,
    /* spec-office-config.md shape — the office lays itself out from this; captains come from TEAMS */
    office: { project: id, director: d.orch, teams, solo } }, npTile(d.name)));
  npStop(d); NP_DRAFTS.splice(NP_DRAFTS.indexOf(d), 1); NP = null;
  fireConfetti(); go('office/' + id);
}

/* ---------------- dev hooks ----------------
   ?demo=new-<0..4> / adopt-<0..4>  jump to a step (3 = setup running)
   ?demo=new-chat   team step after a short chat that changes the plan
   ?demo=new-small  a "tiny weekend app" → two agents, no team
   ?demo=drafts     two drafts in setup, shown on Projects                */
function npDemo() {
  const m = /[?&]demo=([^&#]*)/.exec(location.search); if (!m) return;
  const v = decodeURIComponent(m[1]);
  const fill = (d, mode, s) => {
    if (mode === 'adopt') { d.folder = 1; d.name = NP_FOLDERS[1].name; } else if (s > 0) d.name = 'Kite Notes';
    d.step = s; if (s >= 4) d.setupDone = true;
  };
  if (v === 'drafts') {
    const a = npNewDraft('new'); fill(a, 'new', 2); a.name = 'Kite Notes';
    const b = npNewDraft('adopt'); fill(b, 'adopt', 3); b.setupI = 3; b.orch = 'a-maestro';
    go('projects'); return;
  }
  const k = /^(new|adopt)-(\d|chat|small)$/.exec(v); if (!k) return;
  const d = npNewDraft(k[1]);
  if (k[2] === 'chat' || k[2] === 'small') {
    fill(d, k[1], 4); if (k[2] === 'small') { d.name = 'Pantry Pal'; d.about = 'a tiny weekend app for sharing recipes'; }
    go('new/' + d.id);
    if (k[2] === 'chat') setTimeout(() => { npSay('why these teams?', true); npSay('add a data specialist', true); npSay('and design a brand-new team for mobile', true); }, 30);
    return;
  }
  const s = +k[2]; if (s === 0) d.mode = null; else fill(d, k[1], Math.min(s, 4));
  go('new/' + d.id);
}
