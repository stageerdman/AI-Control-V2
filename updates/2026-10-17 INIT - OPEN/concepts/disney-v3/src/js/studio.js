/* ============================================================
   studio.js — Projects · Access · Blueprint scenes (behaviour = v2).
   Public: renderProjects(), renderAccess(), renderBlueprint(),
           logoTile(project, small), keytag(cred, locked),
           openProjectAccess(grants, projectName)  (used by the Office)
   Reads: PROJECTS, CREDENTIALS, BLUEPRINT_TREE, PRINCIPLES, FRESHNESS,
          agentById(), hero(); opens projects via openOffice(id).
   ============================================================ */

function logoTile(p, sm) {
  return `<span class="logo-tile${sm ? ' sm' : ''}" aria-hidden="true" style="background:linear-gradient(145deg,${p.g1},${p.g2})"><svg viewBox="0 0 24 24">${tileGlyph(p.glyph)}</svg></span>`;
}
function keytag(c, locked) {
  const s = document.createElement('span'); s.className = 'keytag' + (locked ? ' locked' : '');
  s.innerHTML = `<span class="d" style="background:${c.color}">${c.mark}</span>${escapeHtml(c.name)}${locked ? ' 🔒' : ''}`;
  return s;
}

/* ============================================================ PROJECTS */
let projQuery = '';
function renderProjects() {
  const el = document.getElementById('scene-projects');
  const active = PROJECTS.filter(p => p.group === 'active');
  const db = PROJECTS.filter(p => p.group === 'db');
  el.innerHTML = `
    <div class="scene-head">
      <div>
        <div class="kicker">The Studio Lot</div>
        <h1>Every production, at a glance</h1>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-hero" id="newProj">＋ New project</button>
    </div>
    <div class="row" style="margin-bottom:18px;gap:16px">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="projSearch" type="search" placeholder="Search projects…  (press /)" aria-label="Search projects" value="${escapeAttr(projQuery)}">
      </div>
      <div class="result-count" id="resCount" aria-live="polite"></div>
    </div>
    <div id="shelves"></div>`;
  el.querySelector('#newProj').onclick = openNewProject;
  const search = el.querySelector('#projSearch');
  search.oninput = e => { projQuery = e.target.value; renderShelves(); };
  search.onkeydown = e => { if (e.key === 'Escape') { projQuery = ''; search.value = ''; renderShelves(); } };
  renderShelves();

  function renderShelves() {
    const q = projQuery.trim().toLowerCase();
    const m = p => !q || p.name.toLowerCase().includes(q) || (p.note || '').toLowerCase().includes(q);
    const a = active.filter(m), d = db.filter(m);
    el.querySelector('#resCount').textContent = `${a.length} on set · ${d.length} in the back lot`;
    const sh = el.querySelector('#shelves');
    if (a.length === 0 && d.length === 0) {
      sh.innerHTML = '';
      const es = document.createElement('div'); es.className = 'empty-state';
      es.appendChild(hero({ name: 'Scout', role: 'QA', hue: 'rose', build: 'sprout', hair: 'bob' }, { size: 120, pose: 'thinking' }));
      es.insertAdjacentHTML('beforeend', '<h2>No production by that name</h2><p style="color:rgba(255,246,233,.7);font-weight:600">Start a new one?</p>');
      const b = document.createElement('button'); b.className = 'btn btn-hero'; b.textContent = '＋ New project'; b.onclick = openNewProject;
      es.appendChild(b); sh.appendChild(es); return;
    }
    sh.innerHTML = `
      <section class="shelf active-shelf">
        <div class="shelf-head"><h2>On set today</h2><span class="cnt">${a.length} active</span></div>
        <div class="shelf-hr"></div>
        <div class="shelf-grid" id="activeGrid"></div>
      </section>
      <section class="shelf db-shelf">
        <div class="shelf-head"><h2>The back lot</h2><span class="cnt">${d.length} saved</span></div>
        <div class="shelf-hr"></div>
        <div class="shelf-grid" id="dbGrid"></div>
      </section>`;
    const ag = sh.querySelector('#activeGrid');
    a.forEach(p => ag.appendChild(activeCard(p)));
    if (!a.length) ag.innerHTML = '<p class="hint" style="color:rgba(255,246,233,.6)">Nothing on set matches.</p>';
    const dg = sh.querySelector('#dbGrid');
    d.forEach(p => dg.appendChild(dbCard(p)));
    if (!d.length) dg.innerHTML = '<p class="hint" style="color:rgba(255,246,233,.6)">Nothing in the back lot matches.</p>';
  }
}
function activeCard(p) {
  const b = document.createElement('button');
  b.className = 'pcard' + (p.status === 'live' ? ' live' : '') + (p.status === 'needs' ? ' needs' : '');
  const pill = p.status === 'live' ? '<span class="pill live"><span class="dot"></span>Live</span>' : p.status === 'needs' ? '<span class="pill needs">❗ Needs input</span>' : '<span class="pill idle">Idle</span>';
  b.innerHTML = `
    <div class="row" style="gap:12px;align-items:flex-start">
      ${logoTile(p)}
      <div style="flex:1;min-width:0">
        <div class="row" style="justify-content:space-between;gap:8px"><h3>${escapeHtml(p.name)}</h3>${pill}</div>
        <div class="hint">${p.agents} agents on set</div>
      </div>
    </div>
    <div class="mini-cast" aria-hidden="true"></div>
    <div class="progress sm"><div class="fill" style="width:${p.pct}%"></div></div>
    <div class="hint" style="margin-top:5px;font-weight:800">${p.pct}% to launch</div>
    <div class="note">${escapeHtml(p.note)}</div>
    <div class="micro-row">
      <span class="micro-badge">${p.github ? '✓ GitHub' : 'Connect GitHub'}</span>
      <span class="micro-badge">${p.private ? '🔒 Private' : '🌐 Public'}</span>
    </div>`;
  const mc = b.querySelector('.mini-cast');
  const shown = (p.cast || []).slice(0, 4);
  shown.forEach((id, i) => {
    const a = agentById(id); if (!a) return;
    const needs = p.status === 'needs' && i === 0;
    mc.appendChild(hero(a, { size: 'xs', pose: needs ? 'needs-input' : 'idle', facing: 'three-quarter', dir: i < shown.length / 2 ? 'right' : 'left' }));
  });
  if ((p.agents || 0) > shown.length) mc.insertAdjacentHTML('beforeend', `<span class="plus-chip">+${p.agents - shown.length}</span>`);
  b.onclick = () => openProject(p);
  return b;
}
function dbCard(p) {
  const b = document.createElement('button'); b.className = 'pcard-db';
  const tagcls = p.tag === 'Draft' ? 'draft' : p.tag === 'Archived' ? 'archived' : 'idle';
  b.innerHTML = `${logoTile(p, true)}
    <div style="flex:1;min-width:0"><h3>${escapeHtml(p.name)}</h3><div class="sub">${p.edited}${p.public ? ' · Public' : ''}</div></div>
    <span class="pill ${tagcls}">${p.tag}</span>`;
  b.onclick = () => openProject(p);
  return b;
}
function openProject(p) {
  if (p.openable) go('office/' + p.id);
  else toast(`“${escapeHtml(p.name)}” is a sketch — only Aurora is wired up in this prototype.`);
}
function openNewProject() {
  const body = document.createElement('div');
  body.innerHTML = `<h2>Start a new production</h2>
    <p class="hint" style="margin-bottom:16px">Name it and drop a logo. We scaffold it from the Blueprint and open the office.</p>
    <div class="field" style="margin-bottom:14px"><label for="npName">Project name</label><input id="npName" placeholder="e.g. Nimbus Deploy" autocomplete="off"></div>
    <div class="field" style="margin-bottom:18px"><label>Logo</label><div class="row"><span class="logo-tile" aria-hidden="true" style="background:linear-gradient(145deg,#9b6cff,#4ea8ff)"><svg viewBox="0 0 24 24">${tileGlyph('cloud')}</svg></span><button class="btn btn-ghost btn-sm" type="button">⬆ Drop an image…</button></div></div>
    <button class="btn btn-hero" id="npCreate">Create & open →</button>`;
  openSheet(body, 'Start a new production');
  body.querySelector('#npCreate').onclick = () => { closeSheet(); toast('✨ New production scaffolded from the Blueprint'); };
  setTimeout(() => body.querySelector('#npName').focus(), 60);
}

/* ============================================================ ACCESS */
let expandedCred = null;
function renderAccess() {
  const el = document.getElementById('scene-access');
  el.innerHTML = `
    <div class="scene-head">
      <div><div class="kicker">The Key Cabinet</div><h1>Saved once — granted per project</h1>
      <p>An access entry is a key, what it serves, and how to use it. Agents hold nothing by default; a project grants reach, and values stay masked everywhere.</p></div>
      <div class="spacer"></div>
      <button class="btn btn-hero" id="addAccess">＋ Add access</button>
    </div>
    <div class="vault">
      <h2>🔐 Access entries</h2>
      <p class="sub">You see where a key goes — never the key itself.</p>
      <div id="accessList"></div>
      <div class="masklock">🔒 Values are masked everywhere in AI Control, including logs.</div>
    </div>`;
  el.querySelector('#addAccess').onclick = () => openAccessForm(null);
  const list = el.querySelector('#accessList');
  CREDENTIALS.forEach(c => {
    const row = document.createElement('div'); row.className = 'access-entry';
    row.innerHTML = `
      <div class="ic" style="background:${c.color}">${c.mark}</div>
      <div class="body">
        <div class="row" style="gap:0"><b>${escapeHtml(c.name)}</b><span class="val">${c.val}</span></div>
        <div class="serves">${escapeHtml(c.serves)}</div>
        <div class="afford">
          ${c.docs ? '<a href="#access" onclick="return false" aria-label="Open ' + escapeAttr(c.name) + ' docs">Docs ↗</a>' : ''}
          <button data-expand="${c.id}" aria-expanded="${expandedCred === c.id}">Details ▾</button>
          <button data-replace="${c.id}">Replace key</button>
          <button data-edit="${c.id}">Edit</button>
          <span style="color:rgba(255,246,233,.5);font-weight:700;font-size:12px">Used by ${c.used} project${c.used === 1 ? '' : 's'}</span>
        </div>
        ${expandedCred === c.id ? `<div class="expand">${c.instr ? ('<b>Instructions:</b> ' + escapeHtml(c.instr) + '<br>') : ''}Masked value ends in <code>${c.val.slice(-4)}</code>. The real value never enters the DOM, clipboard, or logs.</div>` : ''}
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-expand]').forEach(b => b.onclick = () => { expandedCred = expandedCred === b.dataset.expand ? null : b.dataset.expand; renderAccess(); el.querySelector(`[data-expand="${b.dataset.expand}"]`)?.focus(); });
  list.querySelectorAll('[data-replace]').forEach(b => b.onclick = () => openAccessForm(credById(b.dataset.replace), true));
  list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openAccessForm(credById(b.dataset.edit)));
}
function openAccessForm(cred, replaceOnly) {
  const body = document.createElement('div');
  const title = replaceOnly ? 'Replace key' : cred ? 'Edit access' : 'Add access';
  const dis = replaceOnly ? 'disabled' : '';
  body.innerHTML = `<h2>${title}</h2>
    <div class="stack" style="margin-top:14px">
      <div class="field"><label for="afName">Name</label><input id="afName" value="${cred ? escapeAttr(cred.name) : ''}" ${dis} placeholder="e.g. Stripe"></div>
      <div class="field"><label for="afKey">${replaceOnly ? 'New key (write-only)' : 'Key (write-only, stored masked)'}</label><input id="afKey" type="password" autocomplete="off" placeholder="Paste the secret — we only keep the last 4"></div>
      <div class="field"><label for="afServes">What it serves</label><input id="afServes" value="${cred ? escapeAttr(cred.serves) : ''}" ${dis} placeholder="One line"></div>
      <div class="field"><label for="afDocs">Docs link (optional)</label><input id="afDocs" ${dis} placeholder="paste a docs link…"></div>
      <div class="field"><label for="afInstr">Extra instructions (optional)</label><textarea id="afInstr" rows="2" ${dis} placeholder="e.g. Test key only outside production.">${cred ? escapeHtml(cred.instr) : ''}</textarea></div>
      <button class="btn btn-hero" id="afSave">Save to cabinet</button>
      <span class="masklock" style="color:var(--ink-soft)">🔒 The previous value is never shown — you can only paste a new one.</span>
    </div>`;
  openSheet(body, title);
  body.querySelector('#afSave').onclick = () => { closeSheet(); toast(replaceOnly ? '🔑 Key replaced — still masked' : '🔑 Saved to the Key Cabinet'); };
  setTimeout(() => body.querySelector(replaceOnly ? '#afKey' : '#afName').focus(), 60);
}

/* project-held access grid; grants = {credId: bool}, mutated in place */
function openProjectAccess(grants, projectName = 'Aurora') {
  const count = () => Object.values(grants).filter(Boolean).length;
  const body = document.createElement('div');
  body.innerHTML = `<button class="btn btn-ghost btn-sm close" id="paClose" aria-label="Close">✕</button>
    <h2>What ${escapeHtml(projectName)} can reach</h2>
    <p class="hint" style="margin:8px 0 16px">${escapeHtml(projectName)} can reach <b id="paCount">${count()} of ${CREDENTIALS.length}</b> capabilities. Agents inherit only what you grant here — values stay masked.</p>
    <div id="paList"></div>`;
  openSheet(body, projectName + ' access');
  body.querySelector('#paClose').onclick = closeSheet;
  const list = body.querySelector('#paList');
  CREDENTIALS.forEach(c => {
    const on = !!grants[c.id];
    const row = document.createElement('div'); row.className = 'toggle-row' + (on ? ' on' : '');
    row.innerHTML = `<div class="ic" style="background:${c.color}">${c.mark}</div>
      <div class="t"><b>${escapeHtml(c.name)}</b> <span class="vl">${c.val}</span><div class="sv">${escapeHtml(c.serves)}</div></div>
      <span class="state">${on ? 'Granted' : 'Not granted'}</span>`;
    const sw = document.createElement('button'); sw.className = 'switch'; sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', on); sw.setAttribute('aria-label', 'Grant ' + c.name + ' to ' + projectName);
    sw.onclick = () => {
      grants[c.id] = !grants[c.id]; const v = grants[c.id];
      sw.setAttribute('aria-checked', v); row.classList.toggle('on', v);
      row.querySelector('.state').textContent = v ? 'Granted' : 'Not granted';
      body.querySelector('#paCount').textContent = `${count()} of ${CREDENTIALS.length}`;
      toast((v ? '🔑 ' : '🔒 ') + escapeHtml(c.name) + (v ? ' granted to ' : ' revoked from ') + escapeHtml(projectName));
    };
    row.appendChild(sw); list.appendChild(row);
  });
}

/* ============================================================ BLUEPRINT */
let bpTab = 'kit';
function renderBlueprint() {
  const el = document.getElementById('scene-blueprint');
  el.innerHTML = `
    <div class="scene-head">
      <div class="row" style="gap:12px">
        <div id="qm" class="bp-mascot" aria-hidden="true"></div>
        <div><div class="kicker">The Starter Kit</div><h1>What every new project is born with</h1></div>
      </div>
      <div class="spacer"></div>
      <div class="lib-tabs" role="tablist" aria-label="Blueprint sections">
        <button role="tab" data-tab="kit" aria-selected="${bpTab === 'kit'}">Starter Kit</button>
        <button role="tab" data-tab="pri" aria-selected="${bpTab === 'pri'}">Principles</button>
      </div>
    </div>
    <div id="bpBody"></div>`;
  /* the quartermaster: a DevOps hard-hat in teal, reading the kit list */
  el.querySelector('#qm').appendChild(hero({ name: 'Quartermaster', role: 'DevOps', hue: 'teal', build: 'hero', hair: 'tuft' }, { size: 72, pose: 'idle' }));
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { bpTab = b.dataset.tab; renderBlueprint(); el.querySelector(`[data-tab="${bpTab}"]`).focus(); });
  const body = el.querySelector('#bpBody');
  if (bpTab === 'kit') {
    body.innerHTML = `<div class="panel"><p class="section-title">📁 Default files & folder structure</p>
      <p class="hint" style="margin:-6px 0 14px">Every new project is born from this kit. Click any description to edit it — changes auto-save.</p>
      <ul class="tree" role="tree" id="tree"></ul></div>`;
    renderTree(body.querySelector('#tree'), BLUEPRINT_TREE);
  } else {
    body.innerHTML = `
      <div class="bp-grid">
        <div class="panel"><p class="section-title">📐 Principles projects follow</p><div class="principle-grid" id="priGrid"></div></div>
        <div class="panel">
          <div class="row" style="justify-content:space-between"><p class="section-title" style="margin:0">🩺 Per-project freshness</p><button class="btn btn-hero btn-sm" id="rebuildAll">Rebuild outdated</button></div>
          <div style="margin-top:14px" id="freshList"></div>
        </div>
      </div>`;
    const pg = body.querySelector('#priGrid');
    PRINCIPLES.forEach(p => {
      const c = document.createElement('div'); c.className = 'principle-card';
      c.innerHTML = `<span class="tag" style="background:${hexTint(p.color)};color:${shade(PALETTE[p.color], -70)}">${p.mod}</span><p>${escapeHtml(p.text)}</p>`;
      pg.appendChild(c);
    });
    const fl = body.querySelector('#freshList');
    renderFreshness(fl);
    body.querySelector('#rebuildAll').onclick = () => {
      FRESHNESS.forEach(f => { if (!f.ok) { f.ok = true; f.note = 'rebuilt just now'; } });
      fireConfetti(); toast('✨ All projects back in sync'); renderFreshness(fl);
    };
  }
}
function renderFreshness(fl) {
  fl.innerHTML = '';
  FRESHNESS.forEach(f => {
    const p = projById(f.id);
    const row = document.createElement('div'); row.className = 'fresh-row';
    row.innerHTML = `${logoTile(p, true)}<div><b style="font-size:14px">${escapeHtml(p.name)}</b></div>
      <div class="st ${f.ok ? 'ok' : 'stale'}">${f.ok ? '✓ Up to date · ' + f.note : '⚠ Needs rebuild — ' + f.note}</div>`;
    if (!f.ok) {
      const b = document.createElement('button'); b.className = 'btn btn-ghost btn-sm'; b.textContent = 'Rebuild'; b.style.marginLeft = '10px';
      b.onclick = () => { f.ok = true; f.note = 'rebuilt just now'; fireConfetti(); toast(`✨ ${escapeHtml(p.name)} is back in sync`); renderFreshness(fl); };
      row.appendChild(b);
    }
    fl.appendChild(row);
  });
}
function renderTree(ul, nodes) {
  nodes.forEach(n => {
    const li = document.createElement('li'); li.setAttribute('role', 'treeitem');
    const node = document.createElement('div'); node.className = 'node';
    node.innerHTML = `<span class="glyph" aria-hidden="true">${n.glyph}</span><span class="path">${escapeHtml(n.path)}</span>
      <span class="desc" contenteditable="true" role="textbox" aria-label="Description for ${escapeAttr(n.path)}">${escapeHtml(n.desc)}</span>`;
    const d = node.querySelector('.desc');
    d.addEventListener('blur', () => { if (d.textContent !== n.desc) { n.desc = d.textContent; toast('📘 Blueprint updated'); } });
    d.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); d.blur(); } });
    li.appendChild(node);
    if (n.children) { const sub = document.createElement('ul'); sub.setAttribute('role', 'group'); renderTree(sub, n.children); li.appendChild(sub); }
    ul.appendChild(li);
  });
}
