/* ============================================================
   office-pager.js — the pager, bottom-left of the office (v5).
   A small playful device that lists who needs you, one page per team (or
   solo agent). Scroll through the pages (▲ ▼, mouse wheel, arrow keys);
   press the screen → the camera glides to that team's pod and lights it.
   Go there and leave without doing anything → it drops off the pager,
   until a NEW ask arrives. The "!" over the agent stays regardless.

   Public: OPG.mount(el), OPG.refresh(), OPG.go(i), OPG.visited(agentId),
           OPG.leave()   (the visit is over — what you saw is marked seen)
   Reads: wsPager() (data-office), OM.focusTeam / OM.focusKey (office-main)
   ============================================================ */

const OPG = { el: null, idx: 0, keys: '', visit: null, shown: null, _wheel: 0 };

OPG.mount = function (el) {
  this.el = el; this.idx = 0; this.keys = ''; this.visit = null; this.shown = null;
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
  this.refresh();
};

OPG.entries = () => wsPager();

OPG.step = function (d) {
  const n = this.entries().length; if (n < 2) return;
  this.idx = (this.idx + d + n) % n; this._render(true);
};
OPG.go = function (i) {
  const e = this.entries()[i]; if (!e) return;
  this.visit = { key: e.key, asks: e.asks.map(a => a.id) };
  OM.focusTeam(e);
  this._render();
};
/* the visit ends (Esc, ← Whole office, another page, a layer, leaving the room):
   anything you went to see and left alone stays off the pager */
OPG.leave = function () {
  if (!this.visit) return;
  this.visit.asks.forEach(id => { WS.pager.seen[id] = true; });
  this.visit = null;
  this.refresh();
};
/* you went straight to an agent (clicked them): their asks count as seen */
OPG.visited = function (agentId) {
  let hit = false;
  WS.pending.forEach(a => { if (a.agentId === agentId && !WS.pager.seen[a.id]) { WS.pager.seen[a.id] = true; hit = true; } });
  if (hit) this.refresh();
};

OPG.refresh = function () {
  if (!this.el) return;
  const list = this.entries();
  const keys = list.map(e => e.key + ':' + e.asks.map(a => a.id).join('+')).join('|') + '@' + (OM.focusKey || '');
  if (keys === this.keys) return;
  const first = this.shown == null; this.shown = this.shown || new Set();
  /* a new ask arrived: turn to its page, one small wiggle (no blinking, no nagging) */
  const fresh = list.findIndex(e => e.asks.some(a => !this.shown.has(a.id)));
  list.forEach(e => e.asks.forEach(a => this.shown.add(a.id)));
  this.keys = keys;
  if (fresh >= 0) this.idx = fresh;
  this.idx = Math.min(this.idx, Math.max(0, list.length - 1));
  this._render(false, fresh >= 0 && !first);
};

OPG._render = function (stepped, wiggle) {
  const list = this.entries(), n = list.length;
  const dev = this.el.querySelector('.o-pager'), scr = this.el.querySelector('#opgScreen');
  dev.classList.toggle('has', n > 0);
  this.el.querySelector('#opgUp').disabled = n < 2;
  this.el.querySelector('#opgDn').disabled = n < 2;
  dev.setAttribute('aria-label', n ? `Pager — ${n} ${n === 1 ? 'team needs' : 'teams need'} you` : 'Pager — nobody needs you');
  if (!n) {
    scr.disabled = true;
    scr.innerHTML = `<span class="o-pg-top"><span>PAGER</span></span><b class="o-pg-name">All quiet</b><span class="o-pg-what">Nobody needs you</span>`;
    scr.removeAttribute('aria-label');
    return;
  }
  const e = list[this.idx];
  const team = e.teamId ? teamById(e.teamId) : null;
  const name = team ? team.name.replace(/^The /, '') : OP._name(e.agentId);
  const what = e.asks.map(a => `${OP._short(a.agentId)} · ${a.short}`).join(', ');
  const here = OM.focusKey === e.key;
  scr.disabled = false;
  scr.innerHTML = `<span class="o-pg-top"><span>${n} NEED${n === 1 ? 'S' : ''} YOU</span><span>${this.idx + 1}/${n}</span></span>
    <b class="o-pg-name">${team ? emblemSVG(team, 16, { decorative: true }) : ''}<span>${escapeHtml(name)}</span></b>
    <span class="o-pg-what">${escapeHtml(here ? 'You’re here' : what)}</span>`;
  scr.setAttribute('aria-label', `${here ? 'Showing' : 'Go to'} ${name} — ${e.asks.map(a => `${OP._name(a.agentId)} needs ${a.short}`).join(', ')}. Page ${this.idx + 1} of ${n}.`);
  if (stepped) this.el.querySelector('#opgLive').textContent = `${name}: ${what}. ${this.idx + 1} of ${n}.`;
  if (wiggle && !reducedMotion()) { dev.classList.remove('wiggle'); void dev.offsetWidth; dev.classList.add('wiggle'); }
};
