/* ============================================================
   office-panel.js — the chat side panel (spec-office §3.2–3.4).
   One thread per agent (WS.threads), Pixel is the default. The office is the
   switcher — no tab strip. One-press (simulated) voice + typed, quick replies,
   "!" ask cards (access asks are masked grant switches), sleeper pokes.

   Public: OP.mount(el), OP.open(id, {from}), OP.refresh(), OP.post(threadId, msg),
           OP.system(text) (quiet line in Pixel's thread), OP.ask(ask) (a new "!"),
           OP.resolveAsk(askId, answer), OP.sleeperPoke(id), OP.thread
   Reads: WS, OE (face/unface/say), OS.onAnswer / OS.wake (story consequences)
   ============================================================ */

const OP = { el: null, thread: 'pixel', voice: 'idle', _seq: 100, _voiceIdx: 0, _pokeIdx: 0, _pixelHold: null };

const OP_MIC = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="18" x2="12" y2="21" stroke="currentColor" stroke-width="2"/></svg>';

OP.mount = function (el) {
  this.el = el; this.thread = 'pixel';
  el.setAttribute('role', 'complementary');
  el.innerHTML = `
    <button class="op-grab" type="button" aria-label="Expand chat" id="opGrab"><i></i></button>
    <header class="op-head" id="opHead"></header>
    <div class="op-wait" id="opWait" hidden></div>
    <div class="op-log" id="opLog" role="log" aria-live="polite"></div>
    <div class="op-quick" id="opQuick"></div>
    <div class="op-composer">
      <button class="mic-btn" id="opMic" type="button" aria-pressed="false"><span class="ring"></span>${OP_MIC}</button>
      <div class="wave" id="opWave" aria-hidden="true">${Array.from({ length: 12 }).map((_, i) => `<i style="--h:${8 + (i * 7) % 18}px"></i>`).join('')}</div>
      <input id="opInput" autocomplete="off" />
      <button class="btn btn-hero btn-sm" id="opSend" type="button">Send</button>
    </div>`;
  el.querySelector('#opMic').onclick = () => this.toggleMic();
  el.querySelector('#opSend').onclick = () => this.sendTyped();
  el.querySelector('#opGrab').onclick = () => document.getElementById('office').classList.toggle('drawer-up');
  const inp = el.querySelector('#opInput');
  inp.onkeydown = e => {
    if (e.key === 'Enter') this.sendTyped();
    if (e.key === 'Escape' && !inp.value && this.thread !== 'pixel' && !OM.layer) { e.stopPropagation(); this.open('pixel'); }
  };
  this._renderThread();
};

/* ------------------------------------------------------------ switching */
OP.open = function (id, o = {}) {
  const a = wsAgent(id); if (!a || !this.el) return;
  const prev = this.thread;
  if (prev !== id && prev !== 'pixel') OE.unface(prev);
  this.thread = id; a.unread = 0; OE.unread(id, false);
  if (id === 'pixel') {
    if (o.from === 'scene') {        /* Pixel stands, faces you, tips his cap — then gets back to it */
      OE.face('pixel'); const r = OE.actors.pixel;
      if (r && !r.walking) setPose(r.hero, 'salute', { seated: false, props: false, holding: 'none' });
      clearTimeout(this._pixelHold); this._pixelHold = setTimeout(() => OE.unface('pixel'), 2600);
    }
  } else if (a.activity.kind !== 'sleeping') {
    OE.face(id);
    if (a.activity.kind === 'needs-input') { if (o.from === 'scene') this._summary(a, true, true); }
    else if (o.from === 'scene' || o.from === 'bell' || o.from === 'wait') this._summary(a, o.from === 'scene');
  }
  this._renderThread();
  OM.showPanel();
  announce('Now talking to ' + this._name(id));
  const card = this.el.querySelector('.op-ask.live');
  if (card) { const f = card.querySelector('button,input'); if (f && o.from !== 'type') setTimeout(() => f.focus(), 60); }
  else if (o.from !== 'scene' && o.from !== 'type') this.el.querySelector('#opInput').focus({ preventScroll: true });
};
OP._name = id => agentById(id === 'pixel' ? 'director' : id).name;
OP._short = id => {
  if (id === 'pixel') return 'Pixel';
  const nick = { 'a-pete': 'Pete', 'a-semic': 'Captain', 'a-lint': 'Lint', 'a-doc': 'Doc', 'a-baron': 'Baron', 'a-merge': 'Madame M', 'a-prof': 'Professor' };
  return nick[id] || agentById(id).name.split(' ')[0];
};

/* "tell me what you're doing" — summary bubble in the scene + newest message here */
OP._summary = function (a, bubble, bubbleOnly) {
  const tok = wsTok(a.tokens.total);
  const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
  let text;
  if (a.activity.kind === 'needs-input') { const ask = WS.pending.find(p => p.agentId === a.id); text = `I'm stuck — ${ask ? ask.short.toLowerCase() : 'I need a decision'}. I've spent ${tok} tokens on Aurora so far.`; }
  else if (a.activity.kind === 'idle') text = `Free! ${a.activity.detail.replace(/^Free!\s*/, '')}. ${tok} tokens on Aurora so far.`;
  else text = `${a.activity.detail} — I've spent ${tok} tokens on Aurora.`;
  const last = (WS.threads[a.id] || []).slice(-1)[0];
  if (!bubbleOnly && (!last || last.kind !== 'summary' || last.text !== text)) {
    this.post(a.id, { from: a.id, kind: 'summary', text, stats: `${act.icon} ${act.tag} · ${tok} tokens · ${a.tasksDone} tasks done` });
  }
  if (bubble) {
    const ask = WS.pending.find(p => p.agentId === a.id);
    OE.say(a.id, ask ? `${ask.short}, please! 🙏` : a.activity.kind === 'idle' ? `Free! ${tok} tokens so far` : `${a.activity.detail.split(' — ')[0]} · ${tok} tokens`, { ms: 3600 });
  }
};

/* ------------------------------------------------------------ messages */
OP.post = function (tid, msg) {
  WS.threads[tid] = WS.threads[tid] || [];
  const m = Object.assign({ id: 'm' + (++this._seq), at: Date.now() }, msg);
  WS.threads[tid].push(m);
  if (tid === this.thread && this.el) this._append(m, msg.stream);
  else if (tid !== 'pixel' || msg.kind !== 'system') {
    const a = wsAgent(tid); if (a) { a.unread = (a.unread || 0) + 1; OE.unread(tid, true); }
  }
  return m;
};
OP.system = function (text) { this.post('pixel', { from: 'system', kind: 'system', text }); };

OP._renderThread = function () {
  const log = this.el.querySelector('#opLog'); log.innerHTML = '';
  (WS.threads[this.thread] || []).forEach(m => this._append(m, false));
  this.refresh(); this._quick();
};
OP._append = function (m, stream) {
  const log = this.el.querySelector('#opLog');
  const who = m.from === 'user' ? 'You' + (m.voice ? ' (voice)' : '') : m.from === 'system' ? '' : this._name(m.from);
  let el;
  if (m.kind === 'system') {
    /* consecutive office updates fold into one quiet group so Pixel's own words stay on top */
    const prev = log.lastElementChild;
    if (prev && prev.classList.contains('op-sysg')) { prev.querySelector('ul').insertAdjacentHTML('beforeend', `<li>${escapeHtml(m.text)}</li>`); const n = prev.querySelectorAll('li').length; prev.querySelector('.op-sysn').textContent = `${n} office updates`; prev.querySelector('.op-syslast').textContent = m.text; log.scrollTop = log.scrollHeight; return; }
    if (prev && prev.classList.contains('op-sys')) {
      const g = document.createElement('details'); g.className = 'op-sysg';
      g.innerHTML = `<summary><span class="op-sysn">2 office updates</span><span class="op-syslast"></span></summary><ul><li>${escapeHtml(prev.textContent)}</li><li>${escapeHtml(m.text)}</li></ul>`;
      g.querySelector('.op-syslast').textContent = m.text; prev.replaceWith(g); log.scrollTop = log.scrollHeight; return;
    }
    el = document.createElement('div'); el.className = 'op-sys'; el.textContent = m.text;
  }
  else if (m.kind === 'comm') {
    el = document.createElement('div'); el.className = 'op-comm';
    const c = m.comm || {};
    el.innerHTML = `<span class="op-ck">overheard</span><button type="button" class="op-cfrom">${escapeHtml(this._name(c.from))}</button> → ${escapeHtml(this._name(c.to))}: “${escapeHtml(c.text).replace(/`([^`]+)`/g, '<code>$1</code>')}”`;
    el.querySelector('.op-cfrom').onclick = () => OP.open(c.from, { from: 'comm' });
  } else if (m.kind === 'ask') el = this._askCard(m);
  else {
    el = document.createElement('div'); el.className = 'bubble ' + (m.from === 'user' ? 'me' : 'them');
    el.innerHTML = `<span class="who">${escapeHtml(who)}</span><span class="t"></span>${m.stats ? `<span class="op-stats">${escapeHtml(m.stats)}</span>` : ''}${m.files ? `<ul class="op-files">${m.files.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}`;
    const t = el.querySelector('.t'); const html = this._fmt(m.text);
    if (stream && !reducedMotion() && m.from !== 'user') {
      el.classList.add('streaming'); let i = 0; const plain = m.text;
      const iv = setInterval(() => { t.textContent = plain.slice(0, ++i); log.scrollTop = log.scrollHeight; if (i >= plain.length) { clearInterval(iv); el.classList.remove('streaming'); t.innerHTML = html; } }, 14);
    } else t.innerHTML = html;
  }
  log.appendChild(el); log.scrollTop = log.scrollHeight;
};
OP._fmt = s => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>');

/* ------------------------------------------------------------ header + waiting row */
OP.refresh = function () {
  if (!this.el) return;
  const id = this.thread; const a = wsAgent(id); const ag = agentById(id === 'pixel' ? 'director' : id);
  const team = a.teamId ? teamById(a.teamId) : null; const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
  const head = this.el.querySelector('#opHead');
  const key = [id, a.activity.kind, a.activity.label, a.tokens.total, a.session].join('|');
  if (head.dataset.key !== key) {
    head.dataset.key = key;
    const isCap = team && team.captain === id;
    const status = id === 'pixel' ? `<span class="op-live"><i></i>Always here</span> · ${wsTok(a.tokens.total)} tokens`
      : `${act.icon} ${escapeHtml(a.activity.kind === 'needs-input' ? 'Needs you' : a.activity.detail || a.activity.label)} · <b>${wsTok(a.tokens.total)}</b> tokens`;
    const honest = id === 'pixel' ? 'Your manager · big picture only'
      : a.session === 'asleep' ? `${escapeHtml(ag.name.split(' ')[0])} is off shift — Pixel can bring them in`
      : 'Pixel sees a summary of this chat' + (['coding', 'reading', 'testing', 'reviewing', 'planning'].includes(a.activity.kind) ? ' · still working in the background' : '');
    head.innerHTML = `<div class="op-portrait"><span class="op-spot"></span></div>
      <div class="op-who"><b>${escapeHtml(ag.name)}</b>
        <span class="op-role">${escapeHtml(ag.role)}${team ? ` · ${emblemSVG(team, 16, { decorative: true })} ${escapeHtml(team.name.replace(/^The /, ''))}` : id === 'pixel' ? '' : ' · Solo'}${isCap ? ' · ★ Captain' : ''}</span>
        <span class="op-status">${status}</span>
        <span class="op-honest">${honest}</span></div>
      ${id !== 'pixel' ? `<button type="button" class="op-backpix" id="opBack">← Pixel</button>` : ''}`;
    const portrait = hero(ag, { size: 92, pose: a.activity.kind === 'sleeping' ? 'sleeping' : id === 'pixel' ? 'talking' : a.activity.kind === 'needs-input' ? 'needs-input' : 'talking', facing: 'front',
      captain: isCap, armband: isCap ? team.color : null, props: false });
    head.querySelector('.op-portrait').appendChild(portrait);
    const b = head.querySelector('#opBack'); if (b) b.onclick = () => this.open('pixel');
    this.el.setAttribute('aria-label', 'Chat with ' + ag.name);
    const inp = this.el.querySelector('#opInput');
    inp.placeholder = `Talk or type to ${this._short(id)}…`; inp.setAttribute('aria-label', 'Message ' + ag.name);
    const mic = this.el.querySelector('#opMic'); if (this.voice === 'idle') mic.setAttribute('aria-label', 'Press to talk to ' + ag.name);
  }
  /* waiting on you */
  const w = this.el.querySelector('#opWait');
  const pend = WS.pending.filter(p => p.agentId !== id || true);
  const wkey = pend.map(p => p.id).join(',');
  if (w.dataset.key !== wkey) {
    w.dataset.key = wkey; w.hidden = !pend.length; w.innerHTML = '';
    if (pend.length) {
      w.innerHTML = '<span class="op-wl">Waiting on you</span>';
      pend.forEach(p => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'op-wface';
        b.setAttribute('aria-label', `${this._name(p.agentId)} needs you: ${p.short}`);
        b.appendChild(hero(agentById(p.agentId), { size: 46, pose: 'needs-input', facing: 'front', props: false }));
        b.insertAdjacentHTML('beforeend', `<span>${escapeHtml(this._short(p.agentId))}</span>`);
        b.onclick = () => this.open(p.agentId, { from: 'wait' });
        w.appendChild(b);
      });
    }
  }
};

/* ------------------------------------------------------------ quick replies (max 3, context-aware) */
OP._quick = function (override) {
  const q = this.el.querySelector('#opQuick'); q.innerHTML = '';
  const id = this.thread; const a = wsAgent(id);
  let chips = override;
  if (!chips) {
    if (id === 'pixel') chips = ['Show me the board', WS.pending.length ? 'Who needs me?' : 'What shipped?', 'Start Multi-currency'];
    else if (a.session === 'asleep') chips = [`Ask Pixel to wake ${this._short(id)}`];
    else if (a.activity.kind === 'needs-input') chips = ['What’s left?', 'Ask Pixel instead'];
    else if (a.activity.kind === 'idle') chips = ['What’s next?', 'Show me what changed'];
    else chips = ['What’s left?', 'Show me what changed', 'Take a break'];
  }
  chips.slice(0, 3).forEach(c => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = c;
    b.onclick = () => { q.innerHTML = ''; this._user(c, false); };
    q.appendChild(b);
  });
};

/* ------------------------------------------------------------ talking */
OP.sendTyped = function () {
  const inp = this.el.querySelector('#opInput'); const v = (inp.value || '').trim();
  if (!v) { const mb = this.el.querySelector('#opMic'); mb.classList.add('err'); setTimeout(() => mb.classList.remove('err'), 400); return; }
  inp.value = ''; this._user(v, false);
};
const OP_VOICE = {
  pixel: ['Hey Captain, how’s checkout going?', 'Pixel, show me the board.', 'Drop crypto from multi-currency.', 'Let’s start multi-currency right after checkout.'],
  agent: ['What’s left on your plate?', 'Show me what changed.'],
};
OP.toggleMic = function () {
  const mb = this.el.querySelector('#opMic'), wave = this.el.querySelector('#opWave'), inp = this.el.querySelector('#opInput');
  if (this.voice === 'idle') {
    this.voice = 'listening'; mb.setAttribute('aria-pressed', 'true'); mb.setAttribute('aria-label', 'Listening — press to stop');
    wave.classList.add('live'); inp.placeholder = 'Listening… press to stop'; announce('Listening.');
    this._lt = setTimeout(() => { if (this.voice === 'listening') this._stopMic(); }, 2400);
  } else if (this.voice === 'listening') this._stopMic();
};
OP._stopMic = function () {
  clearTimeout(this._lt);
  const mb = this.el.querySelector('#opMic'), wave = this.el.querySelector('#opWave');
  this.voice = 'idle'; mb.setAttribute('aria-pressed', 'false'); wave.classList.remove('live');
  mb.setAttribute('aria-label', 'Press to talk to ' + this._name(this.thread));
  const pool = this.thread === 'pixel' ? OP_VOICE.pixel : OP_VOICE.agent;
  const said = pool[this._voiceIdx++ % pool.length];
  announce('Heard: ' + said);
  this.refresh(); this.el.querySelector('#opHead').dataset.key = ''; this.refresh();
  this._user(said, true);
};

/* a user utterance (typed, chip, or voice). Saying a name first routes the thread. */
OP._user = function (text, voice) {
  const route = this._routeName(text);
  if (route && route.id !== this.thread) {
    this.post(this.thread, { from: 'user', kind: 'text', text, voice });
    this.open(route.id, { from: 'type' });
    OE.react(route.id, 'hop');
    this.post(route.id, { from: 'user', kind: 'text', text: route.rest || text, voice });
    this._typing(() => this._reply(route.id, route.rest || text));
    return;
  }
  this.post(this.thread, { from: 'user', kind: 'text', text, voice });
  const tid = this.thread;
  this._typing(() => this._reply(tid, text));
};
OP._routeName = function (text) {
  const m = /^\s*(?:@|hey\s+|hi\s+|ok\s+)?([a-z][a-z-]+)[\s,:]+(.*)$/i.exec(text); if (!m) return null;
  const word = m[1].toLowerCase(); if (word === 'pixel' && /^\s*(?:@|hey\s+)?pixel\b/i.test(text)) return { id: 'pixel', rest: m[2] };
  const hit = wsOnProject().find(a => { const n = agentById(a.id).name.toLowerCase(); return n.split(/[\s-]/).includes(word) && !['pixel', 'von', 'sir', 'the'].includes(word); });
  if (!hit || !(/^\s*(@|hey|hi|ok)/i.test(text))) return null;
  return { id: hit.id, rest: m[2] };
};
OP._typing = function (done) {
  const log = this.el.querySelector('#opLog');
  const b = document.createElement('div'); b.className = 'bubble them'; b.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  log.appendChild(b); log.scrollTop = log.scrollHeight;
  setTimeout(() => { b.remove(); done(); }, reducedMotion() ? 200 : 800);
};
OP._say = function (tid, text, extra = {}) { this.post(tid, Object.assign({ from: tid, kind: 'text', text, stream: true }, extra)); };

/* simulated replies — agents stay scoped to their task; big picture goes to Pixel */
OP._reply = function (tid, text) {
  const t = text.toLowerCase(); const a = wsAgent(tid);
  if (tid === 'pixel') {
    if (/^(pixel,?\s*)?(close|back|go back|back to the office)\b/.test(t)) { if (OM.layer) { this._say('pixel', 'Closing that.'); OB.escape(); } else this._say('pixel', 'You’re already in the office.'); return this._quick(); }
    const drop = /(?:drop|remove|cut|strike)\s+(.+?)\s+from\s+(?:the\s+)?(.+?)[.!?]*$/.exec(t);
    if (drop) {
      const f = WS.features.find(x => x.name.toLowerCase().includes(drop[2].trim().split(' ')[0]));
      const word = drop[1].replace(/^the\s+/, '').trim();
      const line = f && [...f.description, ...f.vision].find(l => l.text.toLowerCase().includes(word));
      if (f && line) {
        go('feature/' + f.id);
        setTimeout(() => { OB.stageStrike(f.id, line.id); }, 450);
        this._say('pixel', `Staged it — “${line.text}” is struck on the ${f.name} page. Save it?`);
        this._quick(['Save it', 'Never mind']); return;
      }
      this._say('pixel', 'I couldn’t find that line — open the feature and strike it there?'); return this._quick();
    }
    const sl = /strike (?:line )?(\d+)/.exec(t);
    if (sl && OB.sheetEl && OB.sheetEl.dataset.kind === 'feature') {
      const all = [...OB.draft.description, ...OB.draft.vision]; const l = all[+sl[1] - 1];
      if (l) { OB.stageStrike(OB.feature, l.id); this._say('pixel', `Struck line ${sl[1]} — “${l.text}”. Save it?`); this._quick(['Save it', 'Never mind']); return; }
    }
    if (/^save it/.test(t)) { if (OB.saveStaged()) this._say('pixel', 'Saved — I’ll brief whoever picks it up.'); else this._say('pixel', 'Nothing staged to save.'); return this._quick(); }
    if (/^never mind/.test(t)) { OB.discardStaged(); this._say('pixel', 'Okay — left it as it was.'); return this._quick(); }
    if (/board|whiteboard|progress|checklist/.test(t)) { this._say('pixel', 'Here’s the board — progress, the live checklist, and who’s done what.'); setTimeout(() => go('board'), 500); return this._quick(); }
    if (/feature|dossier|shipped|what shipped/.test(t)) { this._say('pixel', `${WS.features.filter(f => f.status === 'shipped').length} features shipped so far. Opening the dossier.`); setTimeout(() => go('features'), 500); return this._quick(); }
    if (/who needs|waiting/.test(t)) { const p = WS.pending[0]; this._say('pixel', p ? `${this._name(p.agentId)} — ${p.short.toLowerCase()}. Tap the “!” over their head.` : 'Nobody right now — everyone’s unblocked.'); return this._quick(); }
    if (/currenc/.test(t)) {
      this._say('pixel', 'Good call. I’ll queue Multi-currency right behind Checkout and wake Querious for the rates research.');
      this._quick(['Start it now', 'Wait for checkout', 'Show me the plan']); return;
    }
    if (/start it now/.test(t)) { this._say('pixel', 'On it — Multi-currency is in progress. Checkout stays the priority.'); const f = wsFeature('multicur'); if (f && f.status === 'planned') { f.status = 'now'; f.pct = 2; officeChanged(); } return this._quick(); }
    if (/wait for checkout/.test(t)) { this._say('pixel', 'Sensible. I’ll hold Multi-currency until Checkout ships, then kick it off.'); return this._quick(); }
    if (/plan/.test(t)) { this._say('pixel', 'Opening the features — Multi-currency is first in the planned pile.'); setTimeout(() => go('features'), 500); return this._quick(); }
    const wake = /wake\s+(\w+)/.exec(t);
    if (wake) { const who = wsOnProject().find(x => agentById(x.id).name.toLowerCase().includes(wake[1]) && x.session === 'asleep'); if (who) { this._say('pixel', `Bringing ${this._name(who.id)} in.`); OS.wake(who.id); return this._quick(); } }
    if (/deploy|preview/.test(t)) { this._say('pixel', 'Baron handles deploys — I’ll ask him to push a fresh preview after the next green run.'); return this._quick(); }
    this._say('pixel', 'Got it — I’ll take that to the crew and keep you posted here.'); return this._quick();
  }
  const short = this._short(tid);
  if (/ask pixel to wake/.test(t)) { this.open('pixel'); this._say('pixel', `Waking ${this._name(tid)} — give them a sec.`); OS.wake(tid); return; }
  if (a.session === 'asleep') { this._say(tid, 'zzz… (off shift — Pixel can bring me in)'); return this._quick(); }
  if (/ask pixel instead|that's pixel|pixel's call|ask him/.test(t)) {
    this.post('pixel', { from: 'system', kind: 'system', text: `${this._name(tid)} asked Pixel for a hand.` });
    this._say(tid, 'Passing it up to Pixel — he’ll pick it up in his thread.'); return this._quick();
  }
  if (/left|remain|plate|how.?s|going/.test(t)) { this._say(tid, a.brief ? a.brief.left : 'Nearly there.'); return this._quick(); }
  if (/chang|diff|touch/.test(t)) { this._say(tid, 'Here’s what I touched — plain words, no diffs:', { files: a.brief ? a.brief.changed : [] }); return this._quick(); }
  if (/break|rest|coffee/.test(t)) {
    if (a.activity.kind === 'idle') { this._say(tid, 'Already on one ☕'); return this._quick(); }
    this._say(tid, 'Finishing this file first, then grabbing a coffee. Pixel decides the shifts.'); return this._quick();
  }
  if (/token/.test(t)) { this._say(tid, `${wsTok(a.tokens.total)} tokens on Aurora so far — mostly ${Object.keys(a.tokens.byFeature || {})[0] || 'reading'}.`); return this._quick(); }
  if (/next/.test(t)) { this._say(tid, a.activity.kind === 'idle' ? 'Whatever Pixel hands me — I’m free.' : `After ${a.activity.target || 'this'}: ${a.brief ? a.brief.left : 'whatever Pixel says.'}`); return this._quick(); }
  if (/priority|plan|scope|deadline|should we|roadmap|launch/.test(t)) {
    this._say(tid, 'That’s Pixel’s call — want me to ask him?'); return this._quick(['Ask Pixel instead', 'What’s left?']);
  }
  this._say(tid, `Noted — I’ll keep that in mind for ${a.activity.target ? '`' + a.activity.target + '`' : 'this task'}.`); return this._quick();
};

/* ------------------------------------------------------------ "!" asks */
OP.ask = function (ask) {
  if (WS.pending.find(p => p.id === ask.id)) return;
  WS.pending.push(ask);
  this.post(ask.agentId, { from: ask.agentId, kind: 'ask', askId: ask.id, text: ask.q });
  this.system(`${this._name(ask.agentId)} needs you — ${ask.short.toLowerCase()}. Tap them to answer.`);
  announce(`${this._name(ask.agentId)} needs your input: ${ask.short}.`, true);
  officeChanged();
  if (this.thread === ask.agentId) this._renderThread();
};
OP._askCard = function (m) {
  const ask = WS.pending.find(p => p.id === m.askId); const live = !!ask;
  const el = document.createElement('div'); el.className = 'op-ask' + (live ? ' live' : ' done');
  const a = agentById(m.from);
  if (!live) {
    const res = (WS.answered || {})[m.askId];
    el.innerHTML = `<div class="op-aq">${OP._fmt(m.text)}</div><div class="op-adone">✓ ${escapeHtml(res || 'Answered')}</div>`;
    return el;
  }
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', `${a.name} is asking: ${ask.short}`);
  el.innerHTML = `<div class="op-ak">❗ ${escapeHtml(a.name.split(' ')[0])} needs you</div><div class="op-aq">${m.text.replace(/<(?!\/?b>)[^>]*>/g, '')}</div><div class="op-actx">${escapeHtml(ask.ctx)}</div><div class="op-ain"></div>`;
  const inp = el.querySelector('.op-ain');
  if (ask.type === 'access') {
    const cred = credById(ask.want); const on = !!WS.grants[ask.want];
    const row = document.createElement('div'); row.className = 'toggle-row' + (on ? ' on' : '');
    row.innerHTML = `<div class="ic" style="background:${cred.color}">${cred.mark}</div>
      <div class="t"><b>${escapeHtml(cred.name)}</b> <span class="vl">${escapeHtml(cred.val)}</span><div class="sv">${cred.instr ? 'Rule: ' + escapeHtml(cred.instr) : 'You grant reach — the value stays masked.'}</div></div>`;
    const sw = document.createElement('button'); sw.type = 'button'; sw.className = 'switch'; sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', on); sw.setAttribute('aria-label', `Grant ${cred.name} to Aurora`);
    sw.onclick = () => { WS.grants[ask.want] = !WS.grants[ask.want]; const v = WS.grants[ask.want]; sw.setAttribute('aria-checked', v); row.classList.toggle('on', v); };
    row.appendChild(sw); inp.appendChild(row);
    const hand = document.createElement('button'); hand.type = 'button'; hand.className = 'btn btn-hero btn-sm'; hand.textContent = on ? 'Hand it over' : `Grant ${cred.name} & hand over`;
    sw.addEventListener('click', () => { hand.textContent = WS.grants[ask.want] ? 'Hand it over' : `Grant ${cred.name} & hand over`; });
    hand.onclick = () => { if (!WS.grants[ask.want]) { WS.grants[ask.want] = true; sw.setAttribute('aria-checked', true); row.classList.add('on'); toast(`🔑 ${escapeHtml(cred.name)} granted to Aurora`); } this.resolveAsk(ask.id, `${cred.name} granted`); };
    const manage = document.createElement('button'); manage.type = 'button'; manage.className = 'op-link'; manage.textContent = 'Manage all access →';
    manage.onclick = () => openProjectAccess(WS.grants, 'Aurora');
    const r = document.createElement('div'); r.className = 'op-arow'; r.append(hand, manage); inp.appendChild(r);
  } else {
    const r = document.createElement('div'); r.className = 'op-arow';
    (ask.options || []).forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o; b.onclick = () => this.resolveAsk(ask.id, `“${o}”`); r.appendChild(b); });
    inp.appendChild(r);
    const f = document.createElement('div'); f.className = 'op-afree';
    f.innerHTML = `<input aria-label="Or type your answer" placeholder="Or type your own…"><button type="button" class="btn btn-dark btn-sm">Hand it over</button>`;
    f.querySelector('button').onclick = () => { const v = f.querySelector('input').value.trim(); if (!v) { f.querySelector('input').focus(); return; } this.resolveAsk(ask.id, `“${v}”`); };
    f.querySelector('input').onkeydown = e => { if (e.key === 'Enter') f.querySelector('button').click(); };
    inp.appendChild(f);
  }
  const next = WS.pending.find(p => p.id !== ask.id);
  if (next) {
    const nb = document.createElement('button'); nb.type = 'button'; nb.className = 'op-next';
    nb.textContent = `Next: ${this._short(next.agentId)} is waiting on ${next.type === 'access' ? 'an access grant' : 'a quick decision'} →`;
    nb.onclick = () => this.open(next.agentId, { from: 'wait' }); el.appendChild(nb);
  }
  return el;
};
OP.resolveAsk = function (askId, answer) {
  const i = WS.pending.findIndex(p => p.id === askId); if (i < 0) return;
  const ask = WS.pending.splice(i, 1)[0];
  WS.answered = WS.answered || {}; WS.answered[askId] = answer;
  const name = this._name(ask.agentId);
  this.post(ask.agentId, { from: 'user', kind: 'text', text: ask.type === 'access' ? `Granted — ${answer.replace(/ granted$/, '')} (masked).` : `Go with ${answer}.` });
  toast(`Handed to ${escapeHtml(name.split(' ')[0])} ✓`);
  this.system(`${name} is unblocked — back to work.`);
  if (typeof OS !== 'undefined') OS.onAnswer(ask, answer);
  if (this.thread === ask.agentId) this._renderThread();
  officeChanged();
  announce(`Handed to ${name}.`);
};

/* ------------------------------------------------------------ sleepers: chill, don't wake */
const OP_POKES = [
  { say: 'five more minutes…', react: 'roll' },
  { say: 'mmh… *pulls blanket up*', react: 'snug' },
  { say: '*stretches like a cat* …zzz', react: 'stretch' },
  { say: 'zzz… (pop)', react: 'pop-z' },
];
OP.sleeperPoke = function (id) {
  const p = OP_POKES[this._pokeIdx++ % OP_POKES.length];
  OE.react(id, p.react);
  OE.say(id, p.say, { ms: 2600 });
  OE.chip(id, 'Chat anyway', () => {
    this.post(id, { from: 'system', kind: 'system', text: `${this._name(id)} is off shift — Pixel can bring them in.` });
    this.open(id, { from: 'chat-anyway' });
  });
  announce(`${this._name(id)} is asleep — off shift. Chat anyway is available.`);
};
