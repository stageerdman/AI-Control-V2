/* ============================================================
   office-selftest.js — DEV ONLY. ?demo=selftest drives the real Office UI
   end to end (asks, chat, zoom layers, feature editing, keyboard, layout)
   and logs PASS/FAIL lines to the console. Not reachable from the UI.
   Run: Chrome --headless --enable-logging=stderr --virtual-time-budget=60000
        --dump-dom "…/ai-control-disney-v3.html?demo=selftest#office"
   ============================================================ */
async function officeSelftest() {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  let fails = 0;
  const ok = (cond, name) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
  const key = (k, el = document.activeElement || document.body, extra = {}) => el.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, extra)));

  /* calm scene */
  ok(!$('.o-tag'), 'no status tags above heads');
  ok([...document.querySelectorAll('.o-hot')].map(h => h.dataset.obj).sort().join() === 'door,dossier,health,safe,whiteboard', 'interactive objects: door, features, whiteboard, health, safe — nothing else');
  ok(!$('.o-top') && !$('#oBell') && !$('#oProg'), 'v5: no top bar inside a project');
  ok(!/preview\.|studio\.app|Test ↗/i.test(document.getElementById('office').textContent), 'v5: no online test URL anywhere');
  ok(/Leave office/.test($('.o-hot[data-obj="door"]').textContent) && /Leave office/.test($('.o-hot[data-obj="door"]').getAttribute('aria-label')), 'door is labelled "Leave office"');
  ok(/Access/.test($('.o-hot[data-obj="safe"]').textContent), 'the safe is labelled "Access"');
  const sf = THEME_OFFICE.plan.objects.safe, dd = THEME_OFFICE.plan.director;
  ok(sf.x < dd.x && sf.x + sf.w > dd.x && sf.y + sf.h < dd.y - 150, 'safe hangs on the wall right behind the Director\'s desk');
  ok(OE.art.querySelector('#bossPct').textContent === WS.overall + '%' && OE.art.querySelector('#wbPct').textContent === WS.overall + '%', 'overall % on the whiteboard and the Director\'s plaque');
  const orch = (projById(WS.project) || {}).orchestrator;
  ok(!orch || wsAg('pixel').id === orch, 'the Director is the project\'s orchestrator (' + wsAg('pixel').name + ')');
  ok(!!$('.o-pager') && $('.o-pager').getBoundingClientRect().left < 40 && $('.o-pager').getBoundingClientRect().bottom > innerHeight - 120, 'pager sits bottom-left');
  ok(!$('.c-jacket'), 'no jackets / headless bodies on chairs');
  ok(!$('#opMic') && !$('#opQuick') && !$('#opWait'), 'chat: no mic, no quick replies, no waiting row');
  const ob = THEME_OFFICE.plan.objects;
  ok(ob.outbox.x + ob.outbox.w < ob.dossier.x && ob.console.x + ob.console.w < ob.dossier.x, 'push + deploy sit left, away from the whiteboard');

  /* layout scales from config */
  const p2 = officeLayout({ teams: [{ id: 'a', members: ['x1', 'x2'] }], solo: [] });
  ok(p2.W === 1600 && Object.keys(p2.seats).length === 2 && p2.rows.length === 1, 'layout: 2 agents → one row, base room');
  const big = { teams: Array.from({ length: 5 }, (_, i) => ({ id: 't' + i, members: Array.from({ length: 4 }, (_, j) => `t${i}m${j}`) })), solo: ['s1', 's2'] };
  const p20 = officeLayout(big);
  ok(Object.keys(p20.seats).length === 22 && p20.W > 1600 && p20.rows.length === 2, 'layout: 22 agents → room grows, two rows (W=' + p20.W + ')');
  const inRoom = Object.values(p20.seats).every(s => s.x > 40 && s.x < p20.W - 420);
  ok(inRoom, 'layout: every desk stays inside the floor (no overflow)');
  const overlap = p20.pods.some((a, i) => p20.pods.some((b, j) => j > i && a.row === b.row && a.rug.x < b.rug.x + b.rug.w && b.rug.x < a.rug.x + a.rug.w));
  ok(!overlap, 'layout: pods never overlap');

  /* walking glides (no teleport) */
  OE.instant = false;
  const r = OE.actors['a-baron']; const p0 = r.x + ',' + r.y;
  const walk = OE.walkTo('a-baron', 'console');
  await wait(300);
  const mid = r.x + ',' + r.y;
  await walk;
  const c = OE.anchor('console');
  ok(reducedMotion() || (mid !== p0 && Math.abs(r.x - c.x) < 1 && Math.abs(r.y - c.y) < 1 && mid !== r.x + ',' + r.y), 'walks glide continuously to the target');
  await OE.walkTo('a-baron', wsAgent('a-baron').seat); OE.setActivity('a-baron', 'idle', { detail: 'Feet up' });

  /* the "!" flow */
  await OS.skipTo(25); await wait(50);
  ok(WS.pending.length === 1 && WS.pending[0].agentId === 'a-scar', 'Scarlett raises a "!" at t=23');
  ok(!$('.o-body[data-id="a-scar"] .o-bang').hidden, '"!" badge visible over Scarlett');
  ok(wsPager().length === 1 && /Ship-It/.test($('#opgScreen').textContent) && /Stripe/.test($('#opgScreen').textContent), 'pager pages Ship-It: Scarlett needs a Stripe key');
  /* pager → team focus; leave without doing anything → drops off; a new ask brings it back */
  $('#opgScreen').click(); await wait(50);
  ok(OM.focusKey === 'team:ship-it' && OE.zoom.rect && OE.zoom.z > 1.2 && !OE.box.classList.contains('zoomed'), 'pager → camera focuses Ship-It\'s pod (room stays live, z=' + OE.zoom.z.toFixed(2) + ')');
  ok(!!$('.o-podglow') && !$('#oUnfocus').hidden, 'the pod is highlighted; a way back is offered');
  ok(/here/i.test($('#opgScreen').textContent), 'pager says you\'re there');
  key('Escape', document.body); await wait(50);
  ok(!OM.focusKey && !OE.zoom.rect && $('#oUnfocus').hidden, 'Esc → whole office');
  ok(wsPager().length === 0 && /All quiet/.test($('#opgScreen').textContent), 'visited and did nothing → off the pager');
  ok(!$('.o-body[data-id="a-scar"] .o-bang').hidden, '…but the "!" over Scarlett stays');
  OP.ask({ id: 'ask-scar-2', agentId: 'a-scar', type: 'decision', short: 'Retry flaky test?', q: 'Retry?', ctx: '', options: ['Yes', 'No'], featureId: 'checkout' }); await wait(30);
  ok(wsPager().length === 1 && /Retry flaky/.test($('#opgScreen').textContent), 'a new ask brings the team back to the pager');
  WS.pending = WS.pending.filter(p => p.id !== 'ask-scar-2'); officeRefresh(); await wait(20);
  ok(/Stripe test key/.test($('.o-body[data-id="a-scar"]').getAttribute('aria-label')), 'actor label names the ask');
  ok(/Needs you/.test($('.o-body[data-id="a-scar"] .o-card').textContent), 'hover card says what they need');

  $('.o-body[data-id="a-scar"]').click(); await wait(50);
  ok(OP.thread === 'a-scar', 'click Scarlett → her thread');
  ok(OE.actors['a-scar'].wrap.classList.contains('held'), 'she stops and faces you');
  ok(!!$('.op-ask.live'), 'ask card is live in the chat');
  ok(/••••/.test($('.op-ask.live .vl').textContent), 'credential value is masked');
  ok(/Grant Stripe/.test($('.op-ask.live .btn-hero').textContent), 'one button grants and hands over');
  $('.op-ask.live .btn-hero').click(); await wait(80);
  ok(WS.pending.length === 0 && WS.grants.stripe, 'grant + hand over resolves the ask');
  ok($('.o-body[data-id="a-scar"] .o-bang').hidden, '"!" cleared');
  ok(wsAgent('a-scar').activity.kind === 'testing', 'Scarlett back to testing');
  ok(!/sk_live_[0-9a-z]{4}/i.test(document.getElementById('office').innerHTML), 'only masked secret values in the office DOM');

  OP.open('pixel'); await wait(20);
  ok(!OE.actors['a-scar'].held, 'leaving her thread releases her');
  ok(!(WS.threads.pixel || []).some(m => m.kind === 'system' || m.kind === 'comm'), 'no "office updates" in Pixel\'s chat');
  $('.o-body[data-id="a-query"]').click(); await wait(50);
  ok(OP.thread === 'pixel', 'sleeper click does not open chat');
  ok(!!$('.o-chip'), '"Chat anyway" chip offered');

  const inp = $('#opInput'); inp.value = '@Captain how is checkout going?'; $('#opSend').click(); await wait(1200);
  ok(OP.thread === 'a-semic', '@Captain routes to Captain\'s thread');
  ok((WS.threads['a-semic'] || []).some(m => m.from === 'a-semic' && m.kind === 'text'), 'Captain answers in his thread');

  /* talking shows "…" only */
  OE.say('a-pete', 'secret words', {}); await wait(30);
  const bub = $('.o-body[data-id="a-pete"] .o-bubble');
  ok(!bub.hidden && !/secret/.test(bub.textContent), 'agent talk is a plain "…" bubble');

  /* voice path on the feature text */
  OP.open('pixel'); OP._user('Drop crypto from multi-currency.'); await wait(1600);
  ok(location.hash === '#feature/multicur' && /crypto/i.test(wsFeature('multicur').description) && !/crypto/i.test($('#obDesc').value), 'voice: "drop crypto…" stages the edit in the text block');
  OP._user('Save it'); await wait(1400);
  ok(!/crypto/i.test(wsFeature('multicur').description), 'voice: "Save it" applies the edit');
  go('office'); await wait(400);

  /* whiteboard: just the number, in-progress features, tasks */
  go('board'); await wait(900);
  const card = $('.ob-card');
  ok(card && card.classList.contains('in'), '#board zooms onto the whiteboard');
  ok(/%/.test(card.textContent) && /In progress/.test(card.textContent) && /Tasks/.test(card.textContent), 'board shows %, in progress, tasks');
  ok(!/Who did what|Tokens|Checkup/.test(card.textContent) && !card.querySelector('.ob-as'), 'board has no who-did-what, tokens or A/B/C');
  ok($('#oStage').classList.contains('zooming') && OE.box.classList.contains('zoomed'), 'scene behind is frozen under the scrim');
  key('Escape', document.body); await wait(300);
  ok(location.hash === '#office' && !$('.ob-card'), 'Esc → office');

  /* health report */
  go('health'); await wait(900);
  ok(/Modularity/.test($('.ob-card').textContent) && /Cleanliness/.test($('.ob-card').textContent) && /Reusability/.test($('.ob-card').textContent) && /To fix/.test($('.ob-card').textContent), 'health: three areas, each with good + to fix');
  ok(OE.zoom.obj === 'health', 'health zooms onto the health board');
  go('office'); await wait(300);

  /* features folder + feature page */
  go('features'); await wait(900);
  ok([...document.querySelectorAll('.ob-card h3')].map(h => h.textContent).join() === 'Now,Planned,Shipped', 'features: Now / Planned / Shipped');
  ok(!$('.ob-own') && document.querySelectorAll('.ob-row').length === WS.features.length, 'features: identical rows, no owners');
  ok(document.querySelectorAll('.ob-mark.m-shipped').length === WS.features.filter(f => f.status === 'shipped').length, 'shipped rows carry the green mark');
  $('[data-fid="recs"]').click(); await wait(300);
  ok(location.hash === '#feature/recs' && $('#obDesc') && $('#obDesc').tagName === 'TEXTAREA' && $('#obVis').tagName === 'TEXTAREA', 'feature: description + vision are text blocks');
  ok($('#obSave').disabled, 'save disabled until something changes');
  const ta = $('#obVis'); ta.value = 'Helpful, never pushy. Shows at most three items.'; ta.dispatchEvent(new Event('input'));
  ok(!$('#obSave').disabled, 'typing enables save');
  key('Escape', document.body); await wait(50);
  ok(!!$('.ob-confirm'), 'Esc with unsaved edits asks first');
  $('.ob-confirm [data-c="save"]').click(); await wait(300);
  ok(/three items/.test(wsFeature('recs').vision) && /updated/.test(WS.threads.pixel.slice(-1)[0].text), 'save stores the text and briefs Pixel');
  ok(location.hash === '#features', 'save from confirm → back to features');
  key('Escape', document.body); await wait(300);
  ok(location.hash === '#office', 'Esc → office');

  /* keyboard + list */
  OM.focusActor('pixel'); await wait(10);
  key('ArrowLeft'); await wait(10);
  ok(OM.focusId !== 'pixel', 'arrow keys move between people (' + OM.focusId + ')');
  key('Home'); await wait(10);
  ok(document.activeElement && document.activeElement.dataset.id === 'pixel', 'Home → Pixel');
  ok($('#oList').querySelectorAll('.o-lrow').length === 1 + wsOnProject().length, 'list mirror lists everyone');
  ok(!/Around the office/.test($('#oList').textContent), 'list has no "Around the office"');
  ok($('#oList .o-dev') && $('#oList .o-dev').querySelectorAll('a').length === 4, 'list has the tiny size switch');

  /* decision ask (Twinkle) answered with a chip */
  OP.ask({ id: 'ask-test', agentId: 'a-twinkle', type: 'decision', short: 'Cart button copy', q: 'Which reads better?', ctx: 'Not blocking', options: ['Add to bag', 'Add to cart'], featureId: 'cleanup' });
  OE.setActivity('a-twinkle', 'needs-input', { short: 'Needs you', detail: 'Cart button copy' }); await wait(30);
  ok(/Polish/.test($('#opgScreen').textContent), 'pager pages the Polish Patrol');
  $('#opgScreen').click(); await wait(50);
  ok(OM.focusKey === 'team:polish', 'pager → Polish Patrol pod');
  $('.o-body[data-id="a-twinkle"]').click(); await wait(50);
  ok(OP.thread === 'a-twinkle' && !!$('.op-ask.live .chip'), 'click Twinkle in the pod → her ask (decision chips)');
  $('.op-ask.live .chip').click(); await wait(80);
  ok(!WS.pending.length && wsAgent('a-twinkle').activity.kind === 'coding', 'decision chip answers and unblocks');
  $('#oUnfocus').click(); await wait(50);
  ok(!OM.focusKey && !wsPager().length, '← Whole office; pager is quiet again');

  /* the health report: GitHub + runs locally */
  go('health'); await wait(900);
  const hc = $('.ob-card').textContent;
  ok(/GitHub/.test(hc) && /Connected/.test(hc) && /Private|Public/.test(hc), 'health: GitHub connected · private/public');
  ok(/Runs locally/.test(hc) && /open with/.test(hc), 'health: runs locally — how to open it');
  go('office'); await wait(400);

  /* the safe opens Access (masked values), the door leaves */
  $('.o-hot[data-obj="safe"]').click(); await wait(80);
  ok(sheetOpen() && /can reach/.test(document.querySelector('[role="dialog"]') ? document.body.textContent : ''), 'safe → the project\'s Access sheet');
  ok(!/sk_live_[0-9a-z]{4}|sk-ant-[0-9a-z]{6}/i.test(document.body.innerHTML), 'access values stay masked');
  closeSheet(); await wait(50);

  /* the Agent Creator builds a new bot at the free desk */
  const before = AGENTS.length, inst = OE.instant; OE.instant = true;
  await OS.H.create.call(OS, { id: 'a-testbot', name: 'Testy Bolt', role: 'Tester', hue: 'mint', featureId: 'cleanup', first: 'Reading the brief' });
  OE.instant = inst; await wait(50);
  if (wsAgent('a-testbot')) {
    ok(AGENTS.length === before + 1 && !!agentById('a-testbot'), 'creator: the new agent joins the Cast');
    ok(wsAgent('a-testbot').onProject && !!$('.o-body[data-id="a-testbot"]') && !!OE.desks[wsAgent('a-testbot').seat], 'creator: the new bot sits at the free desk');
    ok([...document.querySelectorAll('#oList .o-lrow')].some(b => b.dataset.id === 'a-testbot'), 'creator: the new agent appears in the List');
    ok(OE.actors['a-creator'].wrap.classList.contains('gone') && !wsOnProject().some(a => a.id === 'a-creator'), 'creator: the Agent Creator left (never on the project)');
  } else ok(!!agentById('a-penny'), 'creator: the story already used the free desk (Penny)');

  /* leave and come back: the story resumes, it does not replay */
  const pend = WS.pending.length; go('projects'); await wait(200); go('office'); await wait(600);
  ok(WS.pending.length === pend && wsAgent('a-scar').activity.kind !== 'needs-input', 'reopening resumes (no replayed asks)');
  ok(!!$('.o-body[data-id="a-merge"]'), 'office rebuilt from state');
  console.log(fails ? `SELFTEST: ${fails} FAILED` : 'SELFTEST: ALL PASS');
}
