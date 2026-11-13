/* ============================================================
   office-selftest.js — DEV ONLY. ?demo=selftest drives the real Office UI
   end to end (asks, chat, board layers, feature editing, keyboard, voice)
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

  await OS.skipTo(25); await wait(50);
  ok(WS.pending.length === 1 && WS.pending[0].agentId === 'a-scar', 'Scarlett raises a "!" at t=23');
  ok(!$('.o-body[data-id="a-scar"] .o-bang').hidden, '"!" badge visible over Scarlett');
  ok(/1/.test($('#oBell').textContent), 'bell shows 1');
  ok(!$('#opWait').hidden, 'panel "Waiting on you" row shows');
  ok(/Stripe test key/.test($('.o-body[data-id="a-scar"]').getAttribute('aria-label')), 'actor label names the ask');

  $('.o-body[data-id="a-scar"]').click(); await wait(50);
  ok(OP.thread === 'a-scar', 'click Scarlett → her thread');
  ok(OE.actors['a-scar'].wrap.classList.contains('held'), 'she stops and faces you');
  ok(OE.actors['a-scar'].hero.classList.contains('face-front'), 'facing front (looks at you)');
  ok(!!$('.op-ask.live'), 'ask card is live');
  ok(/••••/.test($('.op-ask.live .vl').textContent), 'credential value is masked');
  ok(/Grant Stripe/.test($('.op-ask.live .btn-hero').textContent), 'one button grants and hands over');
  $('.op-ask.live .btn-hero').click(); await wait(80);
  ok(WS.pending.length === 0 && WS.grants.stripe, 'grant + hand over resolves the ask');
  ok($('.o-body[data-id="a-scar"] .o-bang').hidden, '"!" cleared');
  ok(!/\d/.test($('#oBell').textContent), 'bell cleared');
  ok(wsAgent('a-scar').activity.kind === 'testing', 'Scarlett back to testing');
  ok(!/sk_live_[0-9a-z]{4}/i.test(document.getElementById('office').innerHTML), 'only masked secret values in the office DOM');

  OP.open('pixel'); await wait(20);
  ok(!OE.actors['a-scar'].held, 'leaving her thread releases her');
  $('.o-body[data-id="a-query"]').click(); await wait(50);
  ok(OP.thread === 'pixel', 'sleeper click does not open chat');
  ok(!!$('.o-chip'), '"Chat anyway" chip offered');

  const inp = $('#opInput'); inp.value = '@Captain how is checkout going?'; $('#opSend').click(); await wait(1200);
  ok(OP.thread === 'a-semic', '@Captain routes to Captain\'s thread');
  ok((WS.threads['a-semic'] || []).some(m => m.from === 'a-semic' && m.kind === 'text'), 'Captain answers in his thread');

  $('#opMic').click(); ok($('#opMic').getAttribute('aria-pressed') === 'true', 'mic is one press');
  await wait(3600);
  ok((WS.threads['a-semic'] || []).some(m => m.voice), 'voice utterance lands as a message');

  OP.open('pixel'); OP._user('Drop crypto from multi-currency.', true); await wait(1800);
  ok(location.hash === '#feature/multicur' && !!document.querySelector('.ob-line.staged'), 'voice: "drop crypto…" stages a strike on the page');
  OP._user('Save it', false); await wait(1500);
  ok(!wsFeature('multicur').description.some(l => /crypto/i.test(l.text)), 'voice: "Save it" applies the edit');
  OP._user('close', false); await wait(1500);
  go('office'); await wait(400);
  go('board'); await wait(900);
  ok(!!$('.ob-board.in'), '#board shows the whiteboard');
  ok(/Tokens/.test($('.ob-board').textContent) && /Who did what/.test($('.ob-board').textContent), 'board has tokens + who did what');
  $('[data-mode="tokens"]').click(); await wait(20);
  ok(/More tokens/.test($('.ob-board').textContent), 'who-did-what toggles to tokens with caption');
  go('features'); await wait(300);
  ok($('.ob-sheet') && $('.ob-sheet').dataset.kind === 'dossier', '#features shows the dossier');
  $('[data-fid="multicur"]').click(); await wait(300);
  ok(location.hash === '#feature/multicur', 'feature row → #feature/multicur');
  $('.ob-line[data-sec="description"][data-i="1"] [data-act="strike"]').click(); await wait(20);
  ok($('.ob-line[data-sec="description"][data-i="1"]').classList.contains('struck'), 'strike marks a line');
  $('[data-add="vision"]').click(); await wait(20);
  const li = $('.ob-line.added input'); li.value = 'Prices round like locals expect.'; li.dispatchEvent(new Event('input'));
  li.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(20);
  key('Escape', $('.ob-line.added input')); await wait(20);
  key('Escape', $('.ob-sheet')); await wait(50);
  ok(!!$('.ob-confirm'), 'Esc with unsaved edits asks first');
  $('.ob-confirm [data-c="keep"]').click(); await wait(20);
  $('#obSave').click(); await wait(80);
  const f = wsFeature('multicur');
  ok(f.description.length === 1 && f.vision.length === 3 && f.revisedAt, 'save removes struck, keeps added');
  ok(/updated/.test(WS.threads.pixel.slice(-1)[0].text), 'Pixel is briefed');
  key('Escape', $('.ob-sheet')); await wait(300);
  ok(location.hash === '#features', 'Esc → dossier');
  key('Escape', document.body); await wait(300);
  ok(location.hash === '#board', 'Esc → board');
  key('Escape', document.body); await wait(400);
  ok(location.hash === '#office' && !$('.ob-board'), 'Esc → office');

  OM.focusActor('pixel'); await wait(10);
  key('ArrowLeft'); await wait(10);
  ok(OM.focusId !== 'pixel', 'arrow keys move between people (' + OM.focusId + ')');
  key('Home'); await wait(10);
  ok(document.activeElement && document.activeElement.dataset.id === 'pixel', 'Home → Pixel');
  ok($('#oList').querySelectorAll('.o-lrow').length >= 10, 'list mirror lists everyone');
  console.log(fails ? `SELFTEST: ${fails} FAILED` : 'SELFTEST: ALL PASS');
}
