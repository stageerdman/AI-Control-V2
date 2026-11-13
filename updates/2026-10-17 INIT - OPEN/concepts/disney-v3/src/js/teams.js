/* ============================================================
   teams.js — Cast → Teams roll call + squad zoom (spec-teams §1–2).
   PLACEHOLDER from Foundation; the Cast builder (phase C) owns this file.
   Contract: renderTeams(host) renders the Teams tab body into host.
   ============================================================ */
function renderTeams(host) {
  host.innerHTML = '<p class="cast-stub-note">Building the roll call…</p><div class="teams-stub"></div>';
  const wrap = host.querySelector('.teams-stub');
  TEAMS.forEach(t => {
    const row = document.createElement('div'); row.className = 'teams-stub-row';
    const crew = document.createElement('div'); crew.className = 'teams-stub-crew';
    t.members.forEach(m => crew.appendChild(hero(agentById(m.agent), { size: 'sm', role: m.role || undefined, captain: t.captain === m.agent, armband: t.captain === m.agent ? PALETTE[t.color] : null })));
    row.appendChild(crew);
    row.appendChild(emblem(t, 64));
    row.insertAdjacentHTML('beforeend', `<div><b>${escapeHtml(t.name)}</b><p>${escapeHtml(t.blurb)}</p></div>`);
    wrap.appendChild(row);
  });
}
