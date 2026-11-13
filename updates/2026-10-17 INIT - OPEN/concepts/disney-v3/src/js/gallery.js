/* ============================================================
   gallery.js — #gallery dev route: every role × pose × facing × size,
   all builds / hair / accessories, extras, and every emblem × 7 hues.
   Public: renderGallery(section)   section = '' (all) | roster | poses |
           facings | sizes | zoom | looks | extras | emblems
   Dev-only; not linked from the studio nav.
   ============================================================ */
const GALLERY_SECTIONS = ['roster', 'zoom', 'poses', 'facings', 'sizes', 'looks', 'extras', 'emblems'];

function renderGallery(section = '') {
  const host = document.getElementById('gallery');
  const only = GALLERY_SECTIONS.includes(section) ? [section] : GALLERY_SECTIONS;
  host.innerHTML = `<header class="gal-head"><b>Character gallery</b>
    <nav>${GALLERY_SECTIONS.map(s => `<a href="#gallery/${s}"${s === section ? ' aria-current="page"' : ''}>${s}</a>`).join('')}<a href="#gallery">all</a><a href="#projects">← studio</a></nav></header>
    <main class="gal-body"></main>`;
  const body = host.querySelector('.gal-body');
  const cast = [...AGENTS, DIRECTOR];
  const sec = (id, title, note) => {
    const s = document.createElement('section'); s.className = 'gal-sec'; s.id = 'gal-' + id;
    s.innerHTML = `<h2>${title}</h2>${note ? `<p>${note}</p>` : ''}`; body.appendChild(s); return s;
  };
  const row = (parent, cls = '') => { const r = document.createElement('div'); r.className = 'gal-row ' + cls; parent.appendChild(r); return r; };
  const cell = (r, el, cap) => { const c = document.createElement('figure'); c.className = 'gal-cell'; c.appendChild(el); if (cap) c.insertAdjacentHTML('beforeend', `<figcaption>${cap}</figcaption>`); r.appendChild(c); return c; };

  if (only.includes('roster')) {
    const s = sec('roster', 'Roster at 48px (legibility) · colour / greyscale', 'Each role must be nameable from headgear + tool alone.');
    const r1 = row(s), r2 = row(s, 'gray'), r3 = row(s);
    cast.forEach(a => { cell(r1, hero(a, { size: 'xs' }), a.role); cell(r2, hero(a, { size: 'xs' }), a.role); cell(r3, hero(a, { size: 'sm' }), a.name); });
  }
  if (only.includes('zoom')) {
    const s = sec('zoom', 'Hero zoom size (xl 360) — front, looking at you');
    const r = row(s);
    ['a-pete', 'a-semic', 'a-scar', 'a-lint'].forEach(id => cell(r, hero(agentById(id), id === 'a-semic' ? { size: 'xl', facing: 'front', captain: true, armband: PALETTE.sun } : { size: 'xl', facing: 'front' }), agentById(id).name));
  }
  if (only.includes('poses')) {
    const s = sec('poses', 'Every role × every pose (sm 96, three-quarter)', 'Seated poses (typing, chilling) sit on a desk stub here; the Office supplies real desks.');
    const head = row(s, 'gal-poses-head'); head.innerHTML = '<span></span>' + POSES.map(p => `<span>${p}</span>`).join('');
    cast.forEach(a => {
      const r = row(s, 'gal-poses'); r.insertAdjacentHTML('beforeend', `<span class="gal-rl">${a.role}</span>`);
      POSES.forEach(p => { const c = cell(r, hero(a, { size: 'sm', pose: p })); if (['typing', 'chilling'].includes(p)) c.classList.add('desk'); });
    });
  }
  if (only.includes('facings')) {
    const s = sec('facings', 'Facings × dir (md 128): ¾ right · side right · front · ¾ left · side left');
    cast.forEach(a => {
      const r = row(s); r.insertAdjacentHTML('beforeend', `<span class="gal-rl">${a.role}</span>`);
      [['three-quarter', 'right'], ['side', 'right'], ['front', 'right'], ['three-quarter', 'left'], ['side', 'left']].forEach(([f, d]) => cell(r, hero(a, { size: 128, facing: f, dir: d })));
      cell(r, hero(a, { size: 128, pose: 'walking', facing: 'side' }), 'walk');
      cell(r, hero(a, { size: 128, pose: 'talking', facing: 'side', dir: 'left' }), 'talk ←');
    });
  }
  if (only.includes('sizes')) {
    const s = sec('sizes', 'Sizes: 40 · 48 (xs) · 56 · 64 · 72 · 96 (sm) · 160 (md) · 360 (xl)', 'LOD (lod-xs) applies below 64px: no badge/blush/trim, thicker ink, keeps headgear, tool, eyes, catch-light.');
    ['a-baron', 'a-twinkle'].forEach(id => { const r = row(s, 'gal-bottom'); [40, 48, 56, 64, 72, 96, 160, 360].forEach(px => cell(r, hero(agentById(id), { size: px }), px + 'px')); });
  }
  if (only.includes('looks')) {
    const s = sec('looks', 'Identity: builds × hair (no role gear) · accessories · builds in gear');
    BUILDS.forEach(b => { const r = row(s); r.insertAdjacentHTML('beforeend', `<span class="gal-rl">${b}</span>`);
      HAIR.forEach((h, i) => cell(r, hero({ name: b, hue: HUES[i % 7], build: b, hair: h }, { size: 'sm' }), h)); });
    const r2 = row(s); r2.insertAdjacentHTML('beforeend', '<span class="gal-rl">extra</span>');
    ACCESSORIES.forEach((acc, i) => cell(r2, hero({ name: acc, hue: HUES[(i + 3) % 7], build: 'hero', hair: 'tuft', accessory: acc }, { size: 'sm', facing: 'front' }), acc));
    const r3 = row(s); r3.insertAdjacentHTML('beforeend', '<span class="gal-rl">gear</span>');
    BUILDS.forEach(b => ['Frontend', 'DevOps', 'Quality'].forEach(role => cell(r3, hero({ name: b, hue: 'sky', build: b, hair: 'swoop', role }, { size: 'sm' }), `${b} · ${role}`)));
    const r4 = row(s); r4.insertAdjacentHTML('beforeend', '<span class="gal-rl">hues</span>');
    HUES.forEach(hk => cell(r4, hero({ name: hk, hue: hk, build: 'hero', hair: 'curl', role: 'Research' }, { size: 'sm' }), COLOR_NAMES[hk]));
  }
  if (only.includes('extras')) {
    const s = sec('extras', 'Captain · ghost · holding · seated · role override · turn demo');
    const r = row(s, 'gal-bottom');
    const semi = agentById('a-semic'), tw = agentById('a-twinkle');
    cell(r, hero(semi, { size: 'xs', captain: true, armband: PALETTE.sun }), 'captain xs (pip)');
    cell(r, hero(semi, { size: 'sm', captain: true, armband: PALETTE.sun }), 'captain sm (pip)');
    cell(r, hero(semi, { size: 'md', captain: true, armband: PALETTE.sun, facing: 'front' }), 'captain md (armband)');
    cell(r, hero(agentById('a-lint'), { size: 'md', captain: true, armband: PALETTE.mint, pose: 'salute' }), 'captain salute');
    cell(r, hero({}, { size: 'md', ghost: true }), 'ghost / + New');
    cell(r, hero(tw, { size: 'md' }), 'Twinkle · Design');
    cell(r, hero(tw, { size: 'md', role: 'Research' }), 'role override → Research');
    const r2 = row(s, 'gal-bottom');
    HOLDINGS.forEach(h => cell(r2, hero(agentById('a-scar'), { size: 128, pose: h === 'envelope' ? 'carrying' : h === 'pen' ? 'writing' : h === 'binder' ? 'reading' : 'idle', holding: h }), 'holding ' + h));
    const r3 = row(s, 'gal-bottom');
    ['typing', 'chilling', 'sleeping', 'needs-input'].forEach(p => { const c = cell(r3, hero(agentById('a-pete'), { size: 128, pose: p, seated: true, label: true }), p + ' · seated'); c.classList.add('desk'); });
    const demo = hero(agentById('a-scar'), { size: 160, pose: 'typing', seated: true });
    const c = cell(r3, demo, 'setFacing turn demo'); c.classList.add('desk');
    const btn = document.createElement('button'); btn.className = 'btn btn-ghost on-dark btn-sm'; btn.textContent = 'Turn to me';
    btn.onclick = () => { const f = demo.classList.contains('face-front'); setFacing(demo, f ? 'three-quarter' : 'front'); btn.textContent = f ? 'Turn to me' : 'Back to work'; };
    c.appendChild(btn);
  }
  if (only.includes('emblems')) {
    const s = sec('emblems', 'Emblems × 7 hues (88px) · 24px · 16px · captain pips');
    EMBLEMS.forEach(e => {
      const r = row(s); r.insertAdjacentHTML('beforeend', `<span class="gal-rl">${e.name}</span>`);
      HUES.forEach(hk => cell(r, emblem({ emblem: e.id, color: hk }, 88)));
      const small = document.createElement('div'); small.className = 'gal-small';
      HUES.forEach(hk => { small.appendChild(emblem({ emblem: e.id, color: hk }, 24)); });
      small.appendChild(emblem({ emblem: e.id, color: 'sun' }, 16));
      r.appendChild(small);
    });
    const r = row(s); HUES.forEach(hk => r.appendChild(captainPip(hk)));
  }
}
