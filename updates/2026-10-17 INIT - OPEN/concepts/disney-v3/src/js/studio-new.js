/* ============================================================
   studio-new.js — New project / Adopt a folder (v5 C2).
   Five calm steps, one primary action each, the studio crew as the cast:
     0 Start      — New project · Adopt a folder
     1 Name       — name (+ auto logo tile); adopt = pick a folder first
     2 Orchestrator — character select from orchestrators()
     3 Setup      — the Project Setter ticks off the scaffold (adopt: reads first,
                    adds only what's missing)
     4 Team       — the orchestrator proposes a squad; one proposal asks the
                    Agent Creator for a new agent, who joins the Cast + team
   Finish → PROJECTS gets the new project (with an `office` config, spec-office-config
   shape) → go('office/<id>').
   Public: openNewProject(mode?), npDemo()  (?demo=new-<0..5> / adopt-<0..5>)
   Reads: AGENTS, TEAMS, FUNNY_NAMES, PROJECTS, agentById(), orchestrators()?,
          hero(), emblem(), logoTile(), tileGlyph(), openSheet()/closeSheet().
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

/* system agents, defensively (the shared contract lands in data-cast.js) */
const NP_FALLBACK = {
  setter: { id: 'a-setter', name: 'Project Setter', role: 'DevOps', hue: 'sun', build: 'bruiser', hair: 'none', accessory: 'none' },
  creator: { id: 'a-creator', name: 'Agent Creator', role: 'Design', hue: 'grape', build: 'lanky', hair: 'curl', accessory: 'glasses' },
};
function npSetter() { return agentById('a-setter') || NP_FALLBACK.setter; }
function npCreator() { return agentById('a-creator') || NP_FALLBACK.creator; }
function npOrchs() {
  const list = typeof orchestrators === 'function' ? orchestrators() : [];
  return list.length ? list : [agentById('pixel')];
}
const npNick = a => (typeof shortName === 'function' ? shortName(a) : a.name);
const npSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-project';
function npTile(name) {
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [g1, g2] = NP_TILES[h % NP_TILES.length];
  return { g1, g2, glyph: NP_GLYPHS[(h >>> 3) % NP_GLYPHS.length] };
}

/* team proposals the orchestrator can make. `mint` = ask the Agent Creator. */
function npProposals(mode) {
  const fromTeam = (id, why) => { const t = teamById(id); return t && { team: id, name: t.name, color: t.color, emblem: t.emblem, why, members: t.members.map(m => m.agent) }; };
  const list = mode === 'adopt' ? [
    { name: 'The Archaeologists', color: 'teal', emblem: 'compass', why: 'Existing code — learn it before changing it.',
      members: ['a-lint', 'a-doc', 'a-scar'], mint: { role: 'Migration', line: 'map the old code and plan a safe path forward' } },
    fromTeam('polish', 'Tidy first: de-dupe, document, then build.'),
    fromTeam('ship-it', 'It already works — go straight to new features.'),
  ] : [
    { name: 'The First Draft', color: 'sky', emblem: 'starship', why: 'Small and fast: build it, test it, ship it.',
      members: ['a-semic', 'a-pete', 'a-scar'], mint: { role: 'Voice', line: 'nobody in the Cast does speech yet' } },
    fromTeam('ship-it', 'They already work well together — reuse them.'),
    fromTeam('expedition', 'Not sure what to build yet? Research first.'),
  ];
  return list.filter(Boolean).map(p => Object.assign(p, { members: p.members.filter(id => agentById(id)) }));
}

/* ---------------- state ---------------- */
let NP = null;
function npReset(mode) {
  NP = { mode: mode || null, step: mode ? 1 : 0, name: '', folder: null, orch: npOrchs()[0].id,
    prop: 0, setupI: -1, setupDone: false, timer: null, phase: 'propose', minted: null, teamId: null };
}

function openNewProject(mode) {
  npReset(mode);
  const root = document.createElement('div'); root.className = 'np';
  openSheet(root, 'Start a project', { cls: 'np-sheet', onClose: npStop });
  npRender();
}
function npStop() { if (NP && NP.timer) { clearTimeout(NP.timer); NP.timer = null; } }
function npGo(step) {
  npStop(); NP.step = step; NP.phase = 'propose';
  if (step < 3) { NP.setupI = -1; NP.setupDone = false; }  /* changed name/orchestrator → set up again */
  npRender();
}

/* ---------------- render ---------------- */
function npRender() {
  const root = document.querySelector('.np'); if (!root) return;
  const s = NP.step;
  root.innerHTML = `
    <header class="np-head">
      <ol class="np-dots" aria-label="Steps">${NP_STEPS.map((l, i) => `<li class="${i < s ? 'done' : i === s ? 'now' : ''}"${i === s ? ' aria-current="step"' : ''}><span class="sr-only">${l}${i < s ? ' (done)' : ''}</span></li>`).join('')}</ol>
      <span class="np-steplbl">${NP_STEPS[s]}</span>
      <button class="np-x" type="button" aria-label="Close">✕</button>
    </header>
    <div class="np-stage" aria-hidden="${s === 2 ? 'false' : 'true'}"></div>
    <div class="np-body"></div>
    <footer class="np-foot"></footer>`;
  root.querySelector('.np-x').onclick = closeSheet;
  /* each step returns what should take focus (default: its heading) */
  const target = [npStart, npName, npOrch, npSetup, npTeam][s](root.querySelector('.np-stage'), root.querySelector('.np-body'), root.querySelector('.np-foot'));
  const h = root.querySelector('.np-body h2'); h.tabIndex = -1;
  setTimeout(() => { const t = target && target.isConnected ? target : h; if (t.isConnected) t.focus(); }, 60);
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
/* a character standing on the stage, with an optional name plate */
function npActor(agent, opts = {}, plate) {
  const w = document.createElement('div'); w.className = 'np-actor' + (opts.cls ? ' ' + opts.cls : '');
  w.appendChild(hero(agent, Object.assign({ size: 112 }, opts)));
  if (plate) w.insertAdjacentHTML('beforeend', `<span class="np-plate">${plate}</span>`);
  return w;
}

/* 0 — Start */
function npStart(stage, body, foot) {
  stage.append(
    npActor(npSetter(), { pose: 'waving', dir: 'right' }, 'Project Setter'),
    npActor(npOrchs()[0], { pose: 'idle', facing: 'front', size: 128 }, 'Orchestrator'),
    npActor(npCreator(), { pose: 'idle', dir: 'left' }, 'Agent Creator'));
  body.innerHTML = `<h2>Start a project</h2>
    <p class="np-sub">The Project Setter sets it up, your orchestrator picks the team.</p>
    <div class="np-choices">
      <button type="button" class="np-choice" data-mode="new"><span class="np-ic" aria-hidden="true">＋</span><b>New project</b><span>Start fresh in a new folder</span></button>
      <button type="button" class="np-choice" data-mode="adopt"><span class="np-ic" aria-hidden="true">⇢</span><b>Adopt a folder</b><span>Bring existing code under AI Studio</span></button>
    </div>`;
  body.querySelectorAll('.np-choice').forEach(b => b.onclick = () => { NP.mode = b.dataset.mode; npGo(1); });
  foot.hidden = true;
  return body.querySelector('.np-choice');
}

/* 1 — Name (+ folder for adopt) */
function npName(stage, body, foot) {
  const adopt = NP.mode === 'adopt';
  stage.innerHTML = `<div class="np-tilewrap"><span class="np-tile"></span><b class="np-tname"></b><span class="np-tpath"></span></div>`;
  body.innerHTML = `<h2>${adopt ? 'Which folder?' : 'Name your project'}</h2>
    ${adopt ? `<div class="np-folders" role="radiogroup" aria-label="Folders on this computer">${NP_FOLDERS.map((f, i) => `
      <button type="button" role="radio" class="np-folder" data-i="${i}" aria-checked="${NP.folder === i}" ${f.managed ? 'aria-disabled="true"' : ''} tabindex="-1">
        <span class="np-fic" aria-hidden="true">📁</span><span class="np-fpath">${escapeHtml(f.path)}</span><span class="np-fmeta">${escapeHtml(f.meta)}</span></button>`).join('')}</div>` : ''}
    <div class="field np-namefield"${adopt && NP.folder == null ? ' hidden' : ''}><label for="npName">Project name</label><input id="npName" autocomplete="off" placeholder="e.g. Kite Notes" value="${escapeAttr(NP.name)}"></div>`;
  const input = body.querySelector('#npName');
  const sync = () => {
    const nm = NP.name.trim();
    const t = npTile(nm || '?');
    stage.querySelector('.np-tile').outerHTML = logoTile(Object.assign({ name: nm }, t)).replace('logo-tile', 'logo-tile np-tile');
    stage.querySelector('.np-tname').textContent = nm || (adopt ? 'Pick a folder' : 'Your project');
    stage.querySelector('.np-tpath').textContent = adopt ? (NP.folder != null ? NP_FOLDERS[NP.folder].path : '') : (nm ? '~/dev/' + npSlug(nm) : '');
    btn.disabled = !nm || (adopt && NP.folder == null);
  };
  const btn = npFoot(foot, { back: 0, primary: () => { if (!btn.disabled) npGo(2); }, label: 'Continue' });
  input.oninput = () => { NP.name = input.value; sync(); };
  input.onkeydown = e => { if (e.key === 'Enter' && !btn.disabled) npGo(2); };
  if (adopt) {
    const radios = [...body.querySelectorAll('.np-folder')];
    const pick = i => {
      if (NP_FOLDERS[i].managed) { toast('That folder is already in AI Studio'); return; }
      const prevAuto = NP.folder != null && NP.name === NP_FOLDERS[NP.folder].name;
      NP.folder = i; if (!NP.name || prevAuto) NP.name = NP_FOLDERS[i].name;
      radios.forEach((r, j) => r.setAttribute('aria-checked', j === i));
      input.value = NP.name; body.querySelector('.np-namefield').hidden = false; sync();
    };
    const first = NP.folder != null ? NP.folder : 0; radios[first].tabIndex = 0;
    radios.forEach((r, i) => {
      r.onclick = () => pick(i);
      r.onkeydown = e => {
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!d) return;
        e.preventDefault(); const j = (i + d + radios.length) % radios.length;
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
  const draw = () => {
    stage.innerHTML = '';
    list.forEach(o => {
      const on = o.id === NP.orch;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'np-actor np-orch' + (on ? ' on' : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; b.dataset.id = o.id;
      b.appendChild(hero(o, { size: on ? 136 : 108, pose: on ? 'waving' : 'idle', facing: on ? 'front' : 'three-quarter' }));
      b.insertAdjacentHTML('beforeend', `<span class="np-plate">${escapeHtml(o.name)}</span>`);
      b.onclick = () => { NP.orch = o.id; draw(); stage.querySelector('.on').focus(); };
      b.onkeydown = e => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
        e.preventDefault(); const i = list.indexOf(o); NP.orch = list[(i + d + list.length) % list.length].id; draw(); stage.querySelector('.on').focus();
      };
      stage.appendChild(b);
    });
    const o = agentById(NP.orch) || list[0];
    body.querySelector('.np-quote').textContent = npOrchLine(o);
    btn.innerHTML = 'Continue with ' + escapeHtml(npNick(o));
  };
  body.innerHTML = `<h2>Who runs ${escapeHtml(NP.name)}?</h2>
    <p class="np-sub">The orchestrator keeps the big picture and picks the team. ${list.length > 1 ? 'Use ← → to choose.' : 'You can add more orchestrators in the Cast.'}</p>
    <p class="np-quote"></p>`;
  draw();
  return stage.querySelector('.on');
}
function npOrchLine(o) {
  const p = (o && o.prompt) || '';
  const first = p.split(/(?<=\.)\s/)[0];
  return first ? '“' + first + '”' : '“Big picture only: I set the goals, pick the team, and keep everyone moving.”';
}

/* 3 — Setup by the Project Setter */
function npSetupItems() {
  const adopt = NP.mode === 'adopt'; const f = adopt ? NP_FOLDERS[NP.folder] : null; const has = k => !!(f && f.has.includes(k));
  const slug = npSlug(NP.name); const items = [];
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
  const items = npSetupItems(); const setter = npSetter(); const o = agentById(NP.orch) || npOrchs()[0];
  stage.append(npActor(setter, { pose: NP.setupDone ? 'salute' : 'writing', holding: 'binder', dir: 'right', size: 128, cls: 'np-setter' }));
  stage.insertAdjacentHTML('beforeend', `<div class="np-tilewrap sm">${logoTile(Object.assign({}, npTile(NP.name)))}<b>${escapeHtml(NP.name)}</b></div>`);
  body.innerHTML = `<h2>${NP.setupDone ? 'All set up' : `${escapeHtml(npNick(setter))} is setting up ${escapeHtml(NP.name)}`}</h2>
    <p class="np-sub">${NP.mode === 'adopt' ? 'It reads the folder first and only adds what is missing.' : 'The standard AI Studio scaffold, nothing more.'}</p>
    <div class="progress np-prog" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="100"><div class="fill"></div></div>
    <ul class="np-checks">${items.map(it => `<li><span class="np-tick" aria-hidden="true"></span><b>${escapeHtml(it.label)}</b><span class="np-detail">${escapeHtml(it.detail)}</span></li>`).join('')}</ul>`;
  const btn = npFoot(foot, { back: NP.setupDone ? null : 2, primary: () => npGo(4), label: `Call in ${escapeHtml(npNick(o))} →`, disabled: !NP.setupDone });
  const lis = [...body.querySelectorAll('.np-checks li')]; const prog = body.querySelector('.np-prog');
  const paint = () => {
    lis.forEach((li, j) => { li.className = j < NP.setupI || NP.setupDone ? (items[j].kept ? 'done kept' : 'done') : j === NP.setupI ? 'doing' : ''; });
    const pct = NP.setupDone ? 100 : Math.round(Math.max(0, NP.setupI) / items.length * 100);
    prog.querySelector('.fill').style.width = pct + '%'; prog.setAttribute('aria-valuenow', pct);
  };
  paint();
  if (NP.setupDone) return btn;
  const tick = () => {
    NP.setupI++;
    if (NP.setupI >= items.length) {
      NP.setupDone = true; NP.timer = null;
      announce(`${NP.name} is set up.`);
      const h = body.querySelector('h2'); h.textContent = 'All set up';
      stage.querySelector('.np-setter').replaceWith(npActor(setter, { pose: 'salute', dir: 'right', size: 128, cls: 'np-setter' }));
      paint(); btn.disabled = false; foot.querySelector('.btn-ghost')?.remove(); btn.focus(); sparkle(50, 30); return;
    }
    paint();
    NP.timer = setTimeout(tick, reducedMotion() ? 140 : 520);
  };
  NP.timer = setTimeout(tick, reducedMotion() ? 100 : 380);
}

/* 4 — Team proposal (+ Agent Creator) */
function npTeam(stage, body, foot) {
  const props = npProposals(NP.mode); const P = props[NP.prop % props.length];
  const o = agentById(NP.orch) || npOrchs()[0]; const creator = npCreator();
  const minting = NP.phase !== 'propose' && P.mint;
  stage.classList.add('np-teamstage');
  const say = NP.phase === 'propose'
    ? (P.mint ? `${P.why} And I'll ask the Agent Creator for a ${P.mint.role} — ${P.mint.line}.` : P.why)
    : NP.phase === 'minting' ? `${npNick(creator)}, we need a ${P.mint.role}.` : `Welcome, ${npNick(NP.minted)}! The team is ready.`;
  stage.append(npActor(o, { pose: NP.phase === 'minted' ? 'celebrating' : 'talking', dir: 'right', size: 120, cls: 'np-lead' }));
  stage.insertAdjacentHTML('beforeend', `<div class="np-bubble">${escapeHtml(say)}</div>`);
  const row = document.createElement('div'); row.className = 'np-squad'; stage.appendChild(row);
  P.members.forEach((id, i) => row.appendChild(npActor(agentById(id), { size: 92, dir: 'left', pose: NP.phase === 'minted' ? 'waving' : 'idle', captain: i === 0 }, escapeHtml(npNick(agentById(id))))));
  if (P.mint) {
    if (NP.phase === 'minted') row.appendChild(npActor(NP.minted, { size: 92, dir: 'left', pose: 'celebrating', cls: 'np-new' }, escapeHtml(npNick(NP.minted)) + ' <i>new</i>'));
    else row.appendChild(npActor({ name: 'New agent' }, { size: 92, ghost: true, cls: 'np-ghost' }, 'New ' + escapeHtml(P.mint.role)));
    if (minting) row.appendChild(npActor(creator, { size: 92, dir: 'left', pose: NP.phase === 'minting' ? 'pressing' : 'salute', cls: 'np-creator' }, escapeHtml(npNick(creator))));
  }
  const n = P.members.length + (P.mint ? 1 : 0);
  body.innerHTML = `<h2>${NP.phase === 'minted' ? escapeHtml(P.name) + ' is ready' : escapeHtml(npNick(o)) + ' proposes ' + escapeHtml(P.name)}</h2>
    <p class="np-sub">${NP.phase === 'minted'
      ? `${escapeHtml(npNick(creator))} designed <b>${escapeHtml(NP.minted.name)}</b> (${escapeHtml(P.mint.role)}) — now in your Cast. Rename or restyle them anytime.`
      : `${n} agents${P.team ? ' · an existing team' : ' · a new team'}${P.mint ? ' · 1 designed by the Agent Creator' : ''}. Agents are shared — this project runs its own copies.`}</p>`;
  if (NP.phase === 'minting') { npFoot(foot, { primary: () => {}, label: 'Designing…', disabled: true }); return; }
  if (NP.phase === 'minted') return npFoot(foot, { primary: npFinish, label: 'Open the office →' });
  let swap = null;
  if (props.length > 1) { swap = document.createElement('button'); swap.type = 'button'; swap.className = 'btn btn-ghost'; swap.textContent = '↻ Swap'; swap.setAttribute('aria-label', `Swap for another proposal (${NP.prop % props.length + 1} of ${props.length})`); swap.onclick = () => { NP.prop++; npRender(); setTimeout(() => document.querySelector('.np-swap')?.focus(), 70); }; swap.classList.add('np-swap'); }
  return npFoot(foot, { back: null, extra: swap, primary: () => npAccept(P), label: 'Accept team' });
}
function npAccept(P) {
  if (!P.mint) { npFinish(); return; }
  NP.phase = 'minting'; npRender();
  NP.timer = setTimeout(() => {
    NP.minted = npMint(P.mint.role); NP.phase = 'minted'; npRender();
    sparkle(62, 30); announce(`${NP.minted.name} joined the Cast.`);
  }, reducedMotion() ? 200 : 1500);
}
/* the Agent Creator designs a new agent: a real Cast entry */
function npMint(role) {
  const used = new Set(AGENTS.map(a => a.name));
  const name = (FUNNY_NAMES.find(n => !used.has(n))) || role + ' Bot';
  let id = 'a-' + npSlug(name); while (agentById(id)) id += '-2';
  const looks = [['coral', 'sprout', 'curl'], ['mint', 'hero', 'spikes'], ['sky', 'lanky', 'bob'], ['rose', 'bruiser', 'tuft']];
  const [hue, build, hair] = looks[AGENTS.length % looks.length];
  const a = { id, kind: 'agent', name, nick: name.split(' ').slice(-1)[0], role, hue, build, hair, accessory: 'none',
    stats: { projects: 1, tokens: 0 }, createdBy: npCreator().id,
    prompt: `You are a ${role} specialist, designed by the Agent Creator for ${NP.name}. Stay in your lane, ask the orchestrator when the brief is unclear.` };
  AGENTS.push(a);
  /* custom roles (contract: ROLES = [{id,name}]) — add the new one if it's not there */
  if (Array.isArray(ROLES) && ROLES.length && typeof ROLES[0] === 'object' && !ROLES.some(r => r.name === role)) ROLES.push({ id: npSlug(role), name: role });
  return a;
}
/* create the project + its team + a minimal office config, then walk in */
function npFinish() {
  const props = npProposals(NP.mode); const P = props[NP.prop % props.length];
  const members = P.members.concat(NP.minted ? [NP.minted.id] : []);
  let id = npSlug(NP.name); while (projById(id)) id += '-2';
  let teamId = P.team;
  if (!teamId) {
    teamId = 't-' + id;
    TEAMS.push({ id: teamId, name: P.name, color: P.color, emblem: P.emblem, captain: members[0], blurb: P.why, instr: '', code: '',
      members: members.map(agent => ({ agent, instr: '' })) });
  }
  const t = npTile(NP.name);
  PROJECTS.unshift(Object.assign({ id, name: NP.name.trim(), group: 'active', status: 'live', agents: members.length, pct: 0,
    orchestrator: NP.orch, github: { connected: true, private: true },
    folder: NP.mode === 'adopt' ? NP_FOLDERS[NP.folder].path : '~/dev/' + id,
    note: `Just set up — ${npNick(agentById(NP.orch) || npOrchs()[0])} is planning the first update`,
    cast: members.slice(0, 4), openable: true,
    /* spec-office-config.md shape — the office lays itself out from this */
    office: { project: id, director: NP.orch, teams: [{ id: teamId, members }], solo: [] } }, t));
  npStop(); closeSheet(); fireConfetti();
  go('office/' + id);
}

/* dev hooks: ?demo=new-<0..5> or adopt-<0..5> jumps straight to a step
   (3 = setup running, 4 = proposal, 5 = after the Agent Creator) */
function npDemo() {
  const m = /[?&]demo=[^&#]*?\b(new|adopt)-(\d)/.exec(location.search); if (!m) return;
  const mode = m[1], s = +m[2];
  openNewProject(s === 0 ? null : mode);
  if (s === 0) return;
  if (mode === 'adopt') { NP.folder = 1; NP.name = NP_FOLDERS[1].name; } else if (s > 1) NP.name = 'Kite Notes';
  if (s >= 4) NP.setupDone = true;
  npGo(Math.min(s, 4));
  if (s === 5) { NP.minted = npMint(npProposals(mode)[0].mint.role); NP.phase = 'minted'; npRender(); }
}
