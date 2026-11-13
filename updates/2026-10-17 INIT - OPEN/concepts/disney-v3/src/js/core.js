/* ============================================================
   core.js — shared primitives every module may use.
   Public: PALETTE, COLOR_NAMES, HUES, hueHex(), shade(), hexTint(),
           escapeHtml(), escapeAttr(), reducedMotion(), toast(),
           fireConfetti(), sparkle(), announce(), openSheet(), closeSheet(),
           go(route), currentRoute()
   No DOM rendering of screens here; no knowledge of other modules.
   ============================================================ */

/* The 7 character hues (+ sun-deep, a gear/UI accent only). */
const PALETTE = {
  sun: '#ffc24b', 'sun-deep': '#ff9b3d', coral: '#ff6f73', teal: '#2fd3c3',
  sky: '#4ea8ff', grape: '#9b6cff', mint: '#8be88b', rose: '#ff9ecf',
};
const COLOR_NAMES = { sun: 'Amber', coral: 'Coral', teal: 'Teal', sky: 'Sky', grape: 'Grape', mint: 'Mint', rose: 'Rose' };
const HUES = Object.keys(COLOR_NAMES);

/* palette key or hex → hex */
function hueHex(k) { return PALETTE[k] || k || PALETTE.sun; }

/* lighten (+) / darken (−) a hex by a flat amount per channel */
function shade(hex, amt) {
  const n = parseInt(hueHex(hex).slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, (n >> 8 & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function hexTint(key, a = 0.2) {
  const n = parseInt(hueHex(key).slice(1), 16);
  return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`;
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function reducedMotion() { return matchMedia('(prefers-reduced-motion:reduce)').matches; }

/* ---------- feedback ---------- */
let _toastTimer = null;
function toast(msg, ms = 2800) {
  const t = document.getElementById('toast');
  t.innerHTML = msg; t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function fireConfetti() {
  if (reducedMotion()) return;
  const c = document.getElementById('confetti'); const cols = Object.values(PALETTE);
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i'); p.style.left = Math.random() * 100 + 'vw';
    p.style.background = cols[i % cols.length]; p.style.animationDuration = (1.4 + Math.random() * 1.4) + 's';
    p.style.animationDelay = (Math.random() * .3) + 's'; p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p); setTimeout(() => p.remove(), 3200);
  }
}
/* small scoped burst; x/y in vw/vh (default centre) */
function sparkle(x = 50, y = 40) {
  if (reducedMotion()) return;
  const c = document.getElementById('confetti'); const cols = [PALETTE.mint, PALETTE.sun, PALETTE.teal];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i'); p.style.left = (x - 15 + Math.random() * 30) + 'vw'; p.style.top = y + 'vh';
    p.style.background = cols[i % cols.length]; p.style.animationDuration = (1 + Math.random()) + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.appendChild(p); setTimeout(() => p.remove(), 2200);
  }
}
function announce(msg, assertive) { document.getElementById(assertive ? 'alertlive' : 'live').textContent = msg; }

/* ---------- focus-trapped sheet (dialog) ---------- */
let _lastFocused = null, _trapHandler = null, _onClose = null;
/* opts: wide · cls (extra class on the sheet) · onClose() (runs once when it closes) */
function openSheet(contentEl, label, opts = {}) {
  const scrim = document.getElementById('scrim');
  _lastFocused = document.activeElement;
  scrim.innerHTML = '';
  const sheet = document.createElement('div');
  sheet.className = 'sheet' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '');
  _onClose = opts.onClose || null;
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', label || 'Dialog'); sheet.style.position = 'relative';
  sheet.appendChild(contentEl);
  scrim.appendChild(sheet); scrim.hidden = false;
  scrim.onclick = e => { if (e.target === scrim) closeSheet(); };
  const focusables = () => sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]');
  setTimeout(() => { const f = focusables(); if (f.length) f[0].focus(); }, 40);
  _trapHandler = e => {
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables(); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', _trapHandler);
  return sheet;
}
function closeSheet() {
  const scrim = document.getElementById('scrim');
  if (_onClose) { const f = _onClose; _onClose = null; try { f(); } catch (e) { /* ignore */ } }
  scrim.hidden = true; scrim.innerHTML = '';
  if (_trapHandler) { document.removeEventListener('keydown', _trapHandler); _trapHandler = null; }
  if (_lastFocused && _lastFocused.focus) { try { _lastFocused.focus(); } catch (e) { /* gone */ } }
}
function sheetOpen() { return document.getElementById('scrim').hidden === false; }

/* ---------- routing ----------
   Routes are hashes: #projects, #cast, #cast/teams, #access, #blueprint,
   #office/<projectId>[/<sub>], #gallery[/<section>]. go() only changes the
   hash; app.js listens and renders. */
function go(route) {
  const h = '#' + String(route).replace(/^#/, '');
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = h;
}
function currentRoute() { return location.hash.replace(/^#/, '') || 'projects'; }
