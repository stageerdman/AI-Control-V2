/* ============================================================
   office-panel.js — the chat side panel (spec-office §3.2–3.4).
   Calm: header + conversation + a text composer. Nothing else.
   One thread per agent (WS.threads), Pixel is the default; the office is the
   switcher (click an agent). "!" asks arrive as cards in the agent's thread
   (access asks show a masked credential + one button).

   Public: OP.mount(el), OP.open(id, {from}), OP.refresh(), OP.post(threadId, msg),
           OP.ask(ask) (a new "!"), OP.resolveAsk(askId, answer),
           OP.sleeperPoke(id), OP.thread, OP._name(id), OP._short(id)
   Reads: WS, OE (face/unface/say), OS.onAnswer / OS.wake, OB (voice edits)
   ============================================================ */

const OP = { el: null, thread: 'pixel', _seq: 100, _pokeIdx: 0, _pixelHold: null };

OP.mount = function (el) {
  this.el = el; this.thread = 'pixel';
  el.setAttribute('role', 'complementary');
  el.innerHTML = `
    <button class="op-grab" type="button" aria-label="Expand chat" id="opGrab"><i></i></button>
    <header class="op-head" id="opHead"></header>
    <div class="op-log" id="opLog" role="log" aria-live="polite"></div>
    <form class="op-composer" id="opForm">
      <input id="opInput" autocomplete="off" />
      <button class="btn btn-hero btn-sm" id="opSend" type="submit">Send</button>
    </form>`;
  el.querySelector('#opForm').onsubmit = e => { e.preventDefault(); this.sendTyped(); };
  el.querySelector('#opGrab').onclick = () => { document.getElementById('office').classList.toggle('drawer-up'); setTimeout(() => OE.fit(), 340); };
  const inp = el.querySelector('#opInput');
  inp.onkeydown = e => {
    if (e.key === 'Escape' && !inp.value && this.thread !== 'pixel' && !OM.layer) { e.stopPropagation(); this.open('pixel'); }
  };
  this._renderThread();
};

/* ------------------------------------------------------------ switching */
OP.open = function (id, o = {}) {
  const a = wsAgent(id); if (!a || !this.el) return;
  const prev = this.thread;
  if (prev !== id && prev !== 'pixel') OE.unface(prev);
  this.thread = id; a.unread = 0;
  if (id === 'pixel') {
    if (o.from === 'scene') {        /* Pixel turns to you for a moment, then gets back to it */
      OE.face('pixel');
      clearTimeout(this._pixelHold); this._pixelHold = setTimeout(() => OE.unface('pixel'), 2600);
    }
  } else if (a.activity.kind !== 'sleeping') {
    OE.face(id);
    if (a.activity.kind !== 'needs-input' && ['scene', 'bell', 'list'].includes(o.from)) this._summary(a);
  }
  this._renderThread();
  OM.showPanel();
  announce('Now talking to ' + this._name(id));
  const card = this.el.querySelector('.op-ask.live');
  if (card) { const f = card.querySelector('button,input'); if (f && o.from !== 'type') setTimeout(() => f.focus(), 60); }
  else if (o.from !== 'scene' && o.from !== 'type') this.el.querySelector('#opInput').focus({ preventScroll: true });
};
/* 'pixel' = the Director actor = this project's orchestrator (wsAg resolves it) */
OP._name = id => wsAg(id).name;
OP._short = id => { const ag = wsAg(id); return id === 'pixel' ? (ag.nick || ag.name.split(' ')[0]) : shortName(ag); };
OP._dir = () => OP._short('pixel');

/* "tell me what you're doing" — one plain message, only if it changed */
OP._summary = function (a) {
  const text = a.activity.kind === 'idle' ? `Free right now. ${a.activity.detail.replace(/^Free!\s*/, '')}.` : `${a.activity.detail}.`;
  const last = (WS.threads[a.id] || []).slice(-1)[0];
  if (!last || last.kind !== 'summary' || last.text !== text) this.post(a.id, { from: a.id, kind: 'summary', text });
};

/* ------------------------------------------------------------ messages */
OP.post = function (tid, msg) {
  WS.threads[tid] = WS.threads[tid] || [];
  const m = Object.assign({ id: 'm' + (++this._seq), at: Date.now() }, msg);
  WS.threads[tid].push(m);
  if (tid === this.thread && this.el) this._append(m, msg.stream);
  else { const a = wsAgent(tid); if (a) a.unread = (a.unread || 0) + 1; }
  return m;
};

OP._renderThread = function () {
  const log = this.el.querySelector('#opLog'); log.innerHTML = '';
  (WS.threads[this.thread] || []).forEach(m => this._append(m, false));
  this.refresh();
};
OP._append = function (m, stream) {
  const log = this.el.querySelector('#opLog');
  let el;
  if (m.kind === 'ask') el = this._askCard(m);
  else {
    const who = m.from === 'user' ? 'You' : this._name(m.from);
    el = document.createElement('div'); el.className = 'bubble ' + (m.from === 'user' ? 'me' : 'them');
    el.innerHTML = `<span class="who">${escapeHtml(who)}</span><span class="t"></span>${m.files ? `<ul class="op-files">${m.files.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>` : ''}`;
    const t = el.querySelector('.t'); const html = this._fmt(m.text);
    if (stream && !reducedMotion() && m.from !== 'user') {
      el.classList.add('streaming'); let i = 0; const plain = m.text;
      const iv = setInterval(() => { t.textContent = plain.slice(0, ++i); log.scrollTop = log.scrollHeight; if (i >= plain.length) { clearInterval(iv); el.classList.remove('streaming'); t.innerHTML = html; } }, 14);
    } else t.innerHTML = html;
  }
  log.appendChild(el); log.scrollTop = log.scrollHeight;
};
OP._fmt = s => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>');

/* ------------------------------------------------------------ header */
OP.refresh = function () {
  if (!this.el) return;
  const id = this.thread; const a = wsAgent(id); const ag = wsAg(id);
  const team = a.teamId ? teamById(a.teamId) : null; const act = ACTIVITY[a.activity.kind] || ACTIVITY.idle;
  const head = this.el.querySelector('#opHead');
  const key = [id, a.activity.kind, a.activity.detail, a.session].join('|');
  if (head.dataset.key === key) return;
  head.dataset.key = key;
  const status = id === 'pixel' ? 'Your director · big picture only'
    : a.activity.kind === 'needs-input' ? '❗ Needs you'
    : a.session === 'asleep' ? `💤 Off shift — ${escapeHtml(this._dir())} can bring them in`
    : `${act.icon} ${escapeHtml(a.activity.detail || a.activity.label)}`;
  head.innerHTML = `<div class="op-portrait"></div>
    <div class="op-who"><b>${escapeHtml(ag.name)}</b>
      <span class="op-role">${escapeHtml(id === 'pixel' ? 'Orchestrator' : wsRole(ag))}${team ? ` · ${escapeHtml(team.name.replace(/^The /, ''))}` : id === 'pixel' ? '' : ' · Solo'}</span>
      <span class="op-status">${status}</span></div>
    ${id !== 'pixel' ? `<button type="button" class="op-backpix" id="opBack" aria-label="Back to ${escapeAttr(this._dir())}">← ${escapeHtml(this._dir())}</button>` : ''}`;
  head.querySelector('.op-portrait').appendChild(hero(ag, { size: 72, pose: a.activity.kind === 'sleeping' ? 'sleeping' : a.activity.kind === 'needs-input' ? 'needs-input' : 'talking', facing: 'front', props: false }));
  const b = head.querySelector('#opBack'); if (b) b.onclick = () => this.open('pixel');
  this.el.setAttribute('aria-label', 'Chat with ' + ag.name);
  const inp = this.el.querySelector('#opInput');
  inp.placeholder = `Message ${this._short(id)}…`; inp.setAttribute('aria-label', 'Message ' + ag.name);
};

/* ------------------------------------------------------------ talking */
OP.sendTyped = function () {
  const inp = this.el.querySelector('#opInput'); const v = (inp.value || '').trim();
  if (!v) { inp.focus(); return; }
  inp.value = ''; this._user(v);
};

/* a user utterance (typed, or voice from the app). Saying a name first routes the thread. */
OP._user = function (text) {
  const route = this._routeName(text);
  if (route && route.id !== this.thread) {
    this.post(this.thread, { from: 'user', kind: 'text', text });
    this.open(route.id, { from: 'type' });
    this.post(route.id, { from: 'user', kind: 'text', text: route.rest || text });
    this._typing(() => this._reply(route.id, route.rest || text));
    return;
  }
  this.post(this.thread, { from: 'user', kind: 'text', text });
  const tid = this.thread;
  this._typing(() => this._reply(tid, text));
};
OP._routeName = function (text) {
  const m = /^\s*(?:@|hey\s+|hi\s+|ok\s+)?([a-z][a-z-]+)[\s,:]+(.*)$/i.exec(text); if (!m) return null;
  const word = m[1].toLowerCase(); const dir = this._dir().toLowerCase();
  if ((word === 'pixel' || word === dir || word === 'director') && /^\s*(?:@|hey\s+)?[a-z]+\b/i.test(text)) return { id: 'pixel', rest: m[2] };
  const hit = wsOnProject().find(a => { const n = wsAg(a.id).name.toLowerCase(); return n.split(/[\s-]/).includes(word) && !['pixel', 'von', 'sir', 'the'].includes(word); });
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
    if (/^(\w+,?\s*)?(close|back|go back|back to the office)\b/.test(t)) { if (OM.layer) { this._say('pixel', 'Closing that.'); OB.escape(); } else this._say('pixel', 'You’re already in the office.'); return; }
    const drop = /(?:drop|remove|cut|strike)\s+(.+?)\s+from\s+(?:the\s+)?(.+?)[.!?]*$/.exec(t);
    if (drop) {
      const f = WS.features.find(x => x.name.toLowerCase().includes(drop[2].trim().split(' ')[0]));
      const word = drop[1].replace(/^the\s+/, '').trim();
      if (f && OB.stageDrop(f.id, word)) { this._say('pixel', `Took “${word}” out of the ${f.name} description — it’s on the page. Save it?`); return; }
      this._say('pixel', 'I couldn’t find that — open the feature and edit the text there?'); return;
    }
    if (/^save it/.test(t)) { this._say('pixel', OB.saveStaged() ? 'Saved — I’ll brief whoever picks it up.' : 'Nothing staged to save.'); return; }
    if (/^never mind/.test(t)) { OB.discardStaged(); this._say('pixel', 'Okay — left it as it was.'); return; }
    if (/health|modular|clean|reus/.test(t)) { this._say('pixel', 'Here’s the health report.'); setTimeout(() => omGo('health'), 400); return; }
    if (/board|whiteboard|progress|checklist|task/.test(t)) { this._say('pixel', 'Here’s the board.'); setTimeout(() => omGo('board'), 400); return; }
    if (/feature|shipped|what shipped|plan/.test(t)) { this._say('pixel', `${WS.features.filter(f => f.status === 'shipped').length} features shipped so far. Opening the folder.`); setTimeout(() => omGo('features'), 400); return; }
    if (/who needs|waiting/.test(t)) { const p = WS.pending[0]; this._say('pixel', p ? `${this._name(p.agentId)} — ${p.short.toLowerCase()}. Tap the “!”.` : 'Nobody right now — everyone’s unblocked.'); return; }
    if (/currenc|start it/.test(t)) { this._say('pixel', 'On it — Multi-currency is in progress. Checkout stays the priority.'); const f = wsFeature('multicur'); if (f && f.status === 'planned') { f.status = 'now'; f.pct = 2; officeChanged(); } return; }
    const wake = /wake\s+(\w+)/.exec(t);
    if (wake) { const who = wsOnProject().find(x => wsAg(x.id).name.toLowerCase().includes(wake[1]) && x.session === 'asleep'); if (who) { this._say('pixel', `Bringing ${this._name(who.id)} in.`); OS.wake(who.id); return; } }
    if (/deploy|preview|build|run it|test it/.test(t)) { this._say('pixel', `Baron handles builds — the app runs locally: \`${WS.run.cmd}\` in ${WS.run.where}. I’ll ask him for a fresh build after the next green run.`); return; }
    this._say('pixel', 'Got it — I’ll take that to the crew and keep you posted here.'); return;
  }
  if (/wake|come in/.test(t) && a.session === 'asleep') { this.open('pixel'); this._say('pixel', `Waking ${this._name(tid)} — give them a sec.`); OS.wake(tid); return; }
  if (a.session === 'asleep') { this._say(tid, `zzz… (off shift — ask ${this._dir()} to bring me in)`); return; }
  if (/left|remain|plate|how.?s|going/.test(t)) { this._say(tid, a.brief ? a.brief.left : 'Nearly there.'); return; }
  if (/chang|diff|touch/.test(t)) { this._say(tid, 'Here’s what I touched:', { files: a.brief ? a.brief.changed : [] }); return; }
  if (/token/.test(t)) { this._say(tid, `${wsTok(a.tokens.total)} tokens on this project so far.`); return; }
  if (/next/.test(t)) { this._say(tid, a.activity.kind === 'idle' ? `Whatever ${this._dir()} hands me — I’m free.` : `After ${a.activity.target || 'this'}: ${a.brief ? a.brief.left : `whatever ${this._dir()} says.`}`); return; }
  if (/priority|plan|scope|deadline|should we|roadmap|launch/.test(t)) { this._say(tid, `That’s ${this._dir()}’s call — ask and they’ll steer us.`); return; }
  this._say(tid, `Noted — I’ll keep that in mind for ${a.activity.target ? '`' + a.activity.target + '`' : 'this task'}.`);
};

/* ------------------------------------------------------------ "!" asks */
OP.ask = function (ask) {
  if (WS.pending.find(p => p.id === ask.id)) return;
  WS.pending.push(ask);
  this.post(ask.agentId, { from: ask.agentId, kind: 'ask', askId: ask.id, text: ask.q });
  announce(`${this._name(ask.agentId)} needs your input: ${ask.short}.`, true);
  officeChanged();
  if (this.thread === ask.agentId) this._renderThread();
};
OP._askCard = function (m) {
  const ask = WS.pending.find(p => p.id === m.askId); const live = !!ask;
  const el = document.createElement('div'); el.className = 'op-ask' + (live ? ' live' : ' done');
  if (!live) {
    el.innerHTML = `<div class="op-aq">${m.text.replace(/<(?!\/?b>)[^>]*>/g, '')}</div><div class="op-adone">✓ ${escapeHtml((WS.answered || {})[m.askId] || 'Answered')}</div>`;
    return el;
  }
  el.setAttribute('role', 'group'); el.setAttribute('aria-label', `${this._name(ask.agentId)} is asking: ${ask.short}`);
  el.innerHTML = `<div class="op-aq">${m.text.replace(/<(?!\/?b>)[^>]*>/g, '')}</div><div class="op-actx">${escapeHtml(ask.ctx)}</div><div class="op-ain"></div>`;
  const inp = el.querySelector('.op-ain');
  if (ask.type === 'access') {
    const cred = credById(ask.want);
    inp.innerHTML = `<div class="op-cred"><span class="ic" style="background:${cred.color}" aria-hidden="true">${escapeHtml(cred.mark)}</span><b>${escapeHtml(cred.name)}</b><span class="vl">${escapeHtml(cred.val)}</span></div>`;
    const hand = document.createElement('button'); hand.type = 'button'; hand.className = 'btn btn-hero btn-sm';
    hand.textContent = WS.grants[ask.want] ? 'Hand it over' : `Grant ${cred.name} & hand over`;
    hand.onclick = () => { if (!WS.grants[ask.want]) WS.grants[ask.want] = true; this.resolveAsk(ask.id, `${cred.name} granted`); };
    inp.appendChild(hand);
  } else {
    const r = document.createElement('div'); r.className = 'op-arow';
    (ask.options || []).forEach(o => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = o; b.onclick = () => this.resolveAsk(ask.id, `“${o}”`); r.appendChild(b); });
    inp.appendChild(r);
  }
  return el;
};
OP.resolveAsk = function (askId, answer) {
  const i = WS.pending.findIndex(p => p.id === askId); if (i < 0) return;
  const ask = WS.pending.splice(i, 1)[0];
  WS.answered = WS.answered || {}; WS.answered[askId] = answer;
  this.post(ask.agentId, { from: 'user', kind: 'text', text: ask.type === 'access' ? `Granted — ${answer.replace(/ granted$/, '')} (value stays masked).` : `Go with ${answer}.` });
  if (typeof OS !== 'undefined') OS.onAnswer(ask, answer);
  if (this.thread === ask.agentId) this._renderThread();
  officeChanged();
  announce(`Handed to ${this._name(ask.agentId)}.`);
};

/* ------------------------------------------------------------ sleepers: chill, don't wake */
const OP_POKES = ['roll', 'snug', 'stretch', 'pop-z'];
OP.sleeperPoke = function (id) {
  OE.react(id, OP_POKES[this._pokeIdx++ % OP_POKES.length]);
  OE.chip(id, 'Chat anyway', () => this.open(id, { from: 'chat-anyway' }));
  announce(`${this._name(id)} is asleep — off shift. Chat anyway is available.`);
};
