/* ============================================================
   office-pager.js — the pager (v6): a small playful device, bottom-left,
   on every screen (studio + offices). One page per OFFICE that needs you —
   never teams or desks: you go to the office, and inside it the "!" over an
   agent shows who. Scroll the pages (▲ ▼, mouse wheel, arrow keys); press the
   screen → that project's office. Open an office and leave without answering
   → it drops off the pager until a NEW ask arrives there.

   Self-mounting on document.body; follows hashchange on its own.
   Public: OPG.refresh(), OPG.go(i), OPG.enter(projectId), OPG.leave(),
           OPG.entries()
   Reads: wsPagerOffices() / wsPagerVisited() (data-office), PROJECTS, OM
   ============================================================ */

const OPG = { el: null, idx: 0, keys: null, shown: null, here: null, _wheel: 0 };

OPG.mount = function () {
  if (this.el) return;
  const el = this.el = document.createElement('div');
  el.className = 'o-pagerwrap'; el.id = 'pager';
  el.innerHTML = `
    <div class="o-pager" role="group" aria-roledescription="pager">
      <span class="o-pg-led" aria-hidden="true"></span>
      <button type="button" class="o-pg-screen" id="opgScreen"></button>
      <div class="o-pg-keys">
        <button type="button" class="o-pg-btn" id="opgUp" aria-label="Previous page">▲</button>
        <button type="button" class="o-pg-btn" id="opgDn" aria-label="Next page">▼</button>
      </div>
      <span class="sr-only" aria-live="polite" id="opgLive"></span>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#opgScreen').onclick = () => this.go(this.idx);
  el.querySelector('#opgUp').onclick = () => this.step(-1);
  el.querySelector('#opgDn').onclick = () => this.step(1);
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); this.step(-1); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.step(1); }
  });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    const now = Date.now(); if (now - this._wheel < 220 || Math.abs(e.deltaY) < 4) return;
    this._wheel = now; this.step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  /* after the router has run (its listener is added later, at boot) */
  window.addEventListener('hashchange', () => setTimeout(() => this.refresh(), 0));
  this.refresh();
};

/* the office you're standing in never pages you — its "!" already does */
OPG.entries = function () { return wsPagerOffices().filter(e => e.projectId !== this.here); };

OPG.step = function (d) {
  const n = this.entries().length; if (n < 2) return;
  this.idx = (this.idx + d + n) % n; this._render(true);
};
OPG.go = function (i) {
  const e = this.entries()[i]; if (!e) return;
  go(e.projectId === 'aurora' ? 'office' : 'office/' + e.projectId);
};
/* office visits: entering remembers where you are; leaving marks what it asked as seen */
OPG.enter = function (pid) { this.here = pid; this.refresh(); };
OPG.leave = function () {
  if (!this.here) return;
  wsPagerVisited(this.here); this.here = null; this.refresh();
};

OPG.refresh = function () {
  if (!this.el) return;
  const h = location.hash;
  const hide = /^#(new|setup)/.test(h) || (typeof OM !== 'undefined' && OM.mounted && !!OM.layer);
  this.el.hidden = hide;
  this.el.classList.toggle('in-office', typeof OM !== 'undefined' && !!OM.mounted);
  const list = this.entries();
  const keys = list.map(e => e.projectId + ':' + e.asks.map(a => a.id).join('+')).join('|');
  if (keys === this.keys) return;
  const first = this.shown == null; this.shown = this.shown || new Set();
  /* a new ask somewhere: turn to that office, one small wiggle (no blinking, no nagging) */
  const fresh = list.findIndex(e => e.asks.some(a => !this.shown.has(e.projectId + ':' + a.id)));
  list.forEach(e => e.asks.forEach(a => this.shown.add(e.projectId + ':' + a.id)));
  this.keys = keys;
  if (fresh >= 0) this.idx = fresh;
  this.idx = Math.min(this.idx, Math.max(0, list.length - 1));
  this._render(false, fresh >= 0 && !first);
};

/* one calm line per office */
OPG._line = function (e) {
  const p = projById(e.projectId) || {};
  if (e.asks.length > 1) return `${e.asks.length} need you`;
  const a = e.asks[0];
  if (!a.agentId) return a.short;
  const ag = agentById(a.agentId);
  return `${ag ? shortName(ag) : 'Someone'} needs you`;
};

OPG._render = function (stepped, wiggle) {
  const list = this.entries(), n = list.length;
  const dev = this.el.querySelector('.o-pager'), scr = this.el.querySelector('#opgScreen');
  dev.classList.toggle('has', n > 0);
  this.el.querySelector('#opgUp').disabled = n < 2;
  this.el.querySelector('#opgDn').disabled = n < 2;
  dev.setAttribute('aria-label', n ? `Pager — ${n} ${n === 1 ? 'office needs' : 'offices need'} you` : 'Pager — nobody needs you');
  if (!n) {
    scr.disabled = true;
    scr.innerHTML = `<span class="o-pg-top"><span>PAGER</span></span><b class="o-pg-name">All quiet</b><span class="o-pg-what">Nobody needs you</span>`;
    scr.removeAttribute('aria-label');
    return;
  }
  const e = list[this.idx], p = projById(e.projectId) || { name: e.projectId };
  const line = this._line(e);
  scr.disabled = false;
  scr.innerHTML = `<span class="o-pg-top"><span>${n} OFFICE${n === 1 ? '' : 'S'}</span><span>${this.idx + 1}/${n}</span></span>
    <b class="o-pg-name">${typeof logoTile === 'function' && p.g1 ? logoTile(p, true) : ''}<span>${escapeHtml(p.name)}</span></b>
    <span class="o-pg-what">${escapeHtml(line)}</span>`;
  scr.setAttribute('aria-label', `Go to the ${p.name} office — ${line}. Page ${this.idx + 1} of ${n}.`);
  if (stepped) this.el.querySelector('#opgLive').textContent = `${p.name}: ${line}. ${this.idx + 1} of ${n}.`;
  if (wiggle && !reducedMotion()) { dev.classList.remove('wiggle'); void dev.offsetWidth; dev.classList.add('wiggle'); }
};

/* mount once the page is there (scripts sit at the end of <body>) */
if (document.body) OPG.mount(); else document.addEventListener('DOMContentLoaded', () => OPG.mount());
