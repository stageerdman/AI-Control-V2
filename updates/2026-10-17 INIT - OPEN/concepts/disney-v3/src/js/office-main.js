/* ============================================================
   office-main.js — The Office (spec-office). PLACEHOLDER from Foundation;
   the Office builder (phase O) owns office-*.js and may split this file
   (office-theme.js, office-engine.js, office-panel.js, office-board.js) —
   add new files to src/manifest.txt.
   Contract the router relies on:
     openOffice(projectId, sub)  sub = '' | 'board' | 'features' | 'feature/<id>'
                                 renders into #office (already un-hidden)
     closeOffice()               called when the route leaves the office
   ============================================================ */
function openOffice(projectId, sub = '') {
  const p = projById(projectId) || PROJECTS[0];
  const host = document.getElementById('office');
  host.innerHTML = `<div class="office-stub">
      <a class="btn btn-ghost on-dark btn-sm" href="#projects">← All projects</a>
      <div class="office-stub-cast"></div>
      <h1>${escapeHtml(p.name)} — The Office</h1>
      <p>Building… the office scene and chat panel land in phase O.</p>
    </div>`;
  host.querySelector('.office-stub-cast').appendChild(hero(DIRECTOR, { size: 'md', pose: 'waving', facing: 'front', label: true }));
}
function closeOffice() { document.getElementById('office').innerHTML = ''; }
