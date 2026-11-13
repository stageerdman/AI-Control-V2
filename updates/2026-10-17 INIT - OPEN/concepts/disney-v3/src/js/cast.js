/* ============================================================
   cast.js — Cast → Agents roster + hero zoom (spec-cast §2–3).
   PLACEHOLDER from Foundation; the Cast builder (phase C) owns this file.
   Contract the router relies on:
     renderCast(tab)   tab = 'agents' | 'teams'; renders into #scene-cast
   ============================================================ */
function renderCast(tab = 'agents') {
  const el = document.getElementById('scene-cast');
  el.innerHTML = `
    <div class="scene-head">
      <h1>The Cast</h1>
      <div class="spacer"></div>
      <div class="lib-tabs" role="tablist" aria-label="Cast">
        <a role="tab" href="#cast" aria-selected="${tab === 'agents'}">Agents</a>
        <a role="tab" href="#cast/teams" aria-selected="${tab === 'teams'}">Teams</a>
      </div>
    </div>
    <div id="castBody"></div>`;
  const body = el.querySelector('#castBody');
  if (tab === 'teams' && typeof renderTeams === 'function') { renderTeams(body); return; }
  body.innerHTML = '<p class="cast-stub-note">Building the hero-select lineup…</p><ul class="cast-stub" role="list"></ul>';
  const ul = body.querySelector('ul');
  AGENTS.forEach((a, i) => {
    const li = document.createElement('li');
    li.appendChild(hero(a, { size: 'md', dir: i % 5 < 2.5 ? 'right' : 'left', label: true }));
    li.insertAdjacentHTML('beforeend', `<b>${escapeHtml(a.name)}</b><span>${escapeHtml(a.role)}</span>`);
    ul.appendChild(li);
  });
}
