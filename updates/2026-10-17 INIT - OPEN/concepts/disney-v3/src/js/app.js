/* ============================================================
   app.js — boot, studio nav, hash router, global keys, motes.
   Routes:  #projects · #cast · #cast/teams · #access · #blueprint ·
            #office/<projectId>[/<sub>]  (also #office → aurora; #board,
            #features, #feature/<id> → office sub-layers) · #gallery[/<section>]
   Hooks into other modules (defined by them):
            renderProjects/renderAccess/renderBlueprint (studio.js),
            renderCast(tab) (cast.js), openOffice(id, sub)/closeOffice() (office-*.js),
            renderGallery(section) (gallery.js)
   Public:  STAGES, APP (current route state), route()
   ============================================================ */
const STAGES = [{ id: 'projects', label: 'Projects' }, { id: 'cast', label: 'Cast' }, { id: 'access', label: 'Access' }, { id: 'blueprint', label: 'Blueprint' }];
const APP = { view: null, stage: 'projects', sub: '' };

function _buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = STAGES.map(s => `<a href="#${s.id}" data-stage="${s.id}">${s.label}</a>`).join('');
}
function _showLayer(which) {
  document.getElementById('studio').hidden = which !== 'studio';
  document.getElementById('office').hidden = which !== 'office';
  document.getElementById('gallery').hidden = which !== 'gallery';
}

function route() {
  const parts = currentRoute().split('/').filter(Boolean);
  let head = parts[0] || 'projects';
  /* office shorthands from spec-office §3.5 */
  if (['board', 'features', 'feature'].includes(head)) { parts.unshift('office', 'aurora'); head = 'office'; }
  if (head === 'office' && (!parts[1] || ['board', 'features', 'feature'].includes(parts[1]))) parts.splice(1, 0, 'aurora');

  if (APP.view === 'office' && head !== 'office' && typeof closeOffice === 'function') closeOffice();
  if (sheetOpen()) closeSheet();

  if (head === 'gallery') {
    _showLayer('gallery'); APP.view = 'gallery';
    renderGallery(parts[1] || ''); return;
  }
  if (head === 'office') {
    _showLayer('office'); APP.view = 'office'; APP.sub = parts.slice(2).join('/');
    openOffice(parts[1], APP.sub); return;
  }
  const stage = STAGES.some(s => s.id === head) ? head : 'projects';
  _showLayer('studio'); APP.view = 'studio'; APP.stage = stage; APP.sub = parts.slice(1).join('/');
  document.querySelectorAll('#stage .scene').forEach(s => s.classList.toggle('active', s.id === 'scene-' + stage));
  document.querySelectorAll('#nav a').forEach(a => { if (a.dataset.stage === stage) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (stage === 'projects') renderProjects();
  if (stage === 'cast') renderCast(parts[1] === 'teams' ? 'teams' : 'agents');
  if (stage === 'access') renderAccess();
  if (stage === 'blueprint') renderBlueprint();
}

/* keyboard: '/' focuses project search; ←/→ move studio stages when focus is
   on the page itself or the nav (never steals arrows from lists/radiogroups) */
window.addEventListener('keydown', e => {
  if (e.defaultPrevented) return;
  const t = e.target;
  const typing = /input|textarea|select/i.test(t.tagName) || t.isContentEditable;
  if (APP.view !== 'studio' || sheetOpen() || typing) return;
  if (e.key === '/' && APP.stage === 'projects') {
    const s = document.getElementById('projSearch'); if (s) { e.preventDefault(); s.focus(); } return;
  }
  const free = t === document.body || t.closest('#nav') || t.classList.contains('scene');
  if (!free || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
  const i = STAGES.findIndex(s => s.id === APP.stage);
  const j = e.key === 'ArrowRight' ? Math.min(STAGES.length - 1, i + 1) : Math.max(0, i - 1);
  if (j !== i) { e.preventDefault(); go(STAGES[j].id); }
});

function _motes() {
  const m = document.getElementById('motes');
  for (let i = 0; i < 22; i++) {
    const d = document.createElement('span'); d.className = 'mote'; const s = 2 + Math.random() * 5;
    d.style.width = s + 'px'; d.style.height = s + 'px'; d.style.left = Math.random() * 100 + 'vw'; d.style.bottom = (-10 - Math.random() * 20) + 'vh';
    d.style.animationDuration = (14 + Math.random() * 20) + 's'; d.style.animationDelay = (-Math.random() * 20) + 's'; m.appendChild(d);
  }
}

/* ---- boot ---- */
_buildNav(); _motes();
window.addEventListener('hashchange', route);
route();
