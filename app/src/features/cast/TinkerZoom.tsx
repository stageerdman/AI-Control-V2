/* Design a new agent with Tinker (#cast/agent/tinker[/:sid]): Tinker builds the robot on the same
   stage you'd build it on by hand. Left: the stage (big bot + LookRig, a nameplate, "Add to the
   Cast"). Right: Tinker's chat, with a Details tab for direct edits. The server owns the chat —
   a session is made on the first send, a turn runs 10–60 s and GET shows what Tinker is doing
   (polled while waiting). Leaving keeps the draft; it waits in the lineup as a draft slot. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invalidate, isApiError } from '../../api';
import type { Agent, CreatorDraft, CreatorSession, Look, Role, Team } from '../../api/types';
import { Hero, type HeroHandle, LOOK_SLOTS, type LookSlotId, randomLook } from '../../characters';
import { hueHex } from '../../design/palette';
import { formatRoute, go } from '../../shell/router';
import { toast } from '../../ui';
import { ChatLog } from '../collab';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import { castApi, KEYS } from './api';
import { announce, hop, pingSaved, place, reducedMotion, sparkle, trapTab } from './fx';
import { LookRig } from './LookRig';
import {
  cycleLook,
  type DraftDiff,
  diffLine,
  draftDiff,
  draftLook,
  leastUsedHue,
  lookTag,
  roleByName,
  shortName,
  tinkerDoing,
} from './model';
import { takeOpener } from './tinker';
import './tinker.css';

export type TinkerZoomProps = {
  /** The saved chat; null until the first message. */
  sid: string | null;
  animate: boolean;
  closing: boolean;
  onClosed: () => void;
  agents: Agent[];
  roles: Role[];
  teams: Team[];
};

const POLL_MS = 1500;
const SLOW_MS = 20_000;
const sceneOf = (el: Element | null) => el?.closest('.scene') as HTMLElement | null;
const worldOf = (scene: HTMLElement | null) => scene?.querySelector('.cast-world') as HTMLElement | null;
const message = (e: unknown) => {
  const m = e instanceof Error ? e.message : 'Something went wrong';
  const issues = isApiError(e) ? (e.details as { issues?: string[] } | undefined)?.issues : undefined;
  return issues?.length ? `${m.replace(/\.$/, '')}: ${issues[0]}` : m;
};

/** The bot's size on this stage (room under it for the nameplate and the Add button). */
function stagePx(z: HTMLElement) {
  if (window.innerWidth <= 640) return 160;
  const st = z.querySelector('.z-stage') as HTMLElement | null;
  const h = st?.clientHeight || 600;
  const w = st?.clientWidth || 500;
  return Math.round(Math.max(170, Math.min(340, h - 250, (w - 170) / 0.75)));
}

/** Hand edits: debounced per field, sent in order (a turn or accept waits for them). */
function useDraftSaver(onSaved: () => void, onFailed: () => void) {
  const queued = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => void }>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(
    (id: string, patch: CreatorDraft, ms = 500) => {
      const key = Object.keys(patch).join();
      const q = queued.current;
      const run = () => {
        q.delete(key);
        chain.current = chain.current
          .then(() => castApi.tinker.edit(id, patch))
          .then(onSaved, (e: unknown) => {
            toast(`Couldn’t save that edit — ${message(e)}`);
            onFailed();
          });
      };
      const cur = q.get(key);
      if (cur) clearTimeout(cur.t);
      q.set(key, { t: setTimeout(run, ms), run });
    },
    [onSaved, onFailed],
  );
  const flush = useCallback(() => {
    for (const { t, run } of [...queued.current.values()]) {
      clearTimeout(t);
      run();
    }
    return chain.current;
  }, []);
  return { save, flush };
}

export function TinkerZoom(p: TinkerZoomProps) {
  const zRef = useRef<HTMLElement>(null);
  const bot = useRef<HeroHandle>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const live = useRef(true);
  const [px, setPx] = useState(0);
  const [base] = useState<Look>(() => ({ ...randomLook(), hue: leastUsedHue(p.agents) }));

  const [session, setSession] = useState<CreatorSession | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [busy, setBusy] = useState(false); // my turn is running
  const [remote, setRemote] = useState(false); // a turn from before (resumed mid-answer)
  const [activity, setActivity] = useState<CreatorSession['activity']>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [diff, setDiff] = useState<DraftDiff | null>(null);
  const [rev, setRev] = useState(0);
  const [arrived, setArrived] = useState(false); // the first draft just landed (cross-fade + wave)
  const [tab, setTab] = useState<'chat' | 'details'>('chat');
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  const tinker = p.agents.find((a) => a.kind === 'creator');
  const tName = tinker ? shortName(tinker) : 'Tinker';
  const draft = session?.draft ?? null;
  const name = draft?.name?.trim() ?? '';
  const look = draftLook(base, draft);
  const working = busy || remote;
  /* a tray option tried on: shown on the bot, never saved */
  const [trying, setTrying] = useState<Look | null>(null);
  if (working && trying) setTrying(null);
  const doing = tinkerDoing(working ? (activity ?? { kind: 'thinking', label: '' }) : null);

  useEffect(() => {
    live.current = true; // (StrictMode unmounts + remounts the same instance)
    return () => {
      live.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    const id = sessionRef.current?.id;
    if (id)
      void castApi.tinker.get(id).then(
        (s) => live.current && setSession(s),
        () => undefined,
      );
  }, []);
  const { save, flush } = useDraftSaver(
    useCallback(() => {
      pingSaved(panel.current);
      void invalidate(KEYS.tinker);
    }, []),
    refresh,
  );

  /* what Tinker changed: tint it once, flash changed look slots, tell screen readers */
  const showChanges = (prev: CreatorDraft | null, next: CreatorDraft | null) => {
    const d = draftDiff(prev, next);
    const line = diffLine(d);
    if (!line) return;
    setDiff(d);
    setRev((r) => r + 1);
    if (!prev && next) setArrived(true);
    announce(line);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: one beat per reply
  useEffect(() => {
    if (!rev || !diff?.look.length || arrived) return;
    for (const slot of diff.look) flashRow(zRef.current, slot);
    hop(bot.current?.el);
  }, [rev]);
  useEffect(() => {
    if (!arrived) return;
    const t = setTimeout(() => live.current && setArrived(false), 1400);
    return () => clearTimeout(t);
  }, [arrived]);

  /* ---------- open / close (no camera move: the stage swaps in place) ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useLayoutEffect(() => {
    const z = zRef.current;
    const scene = sceneOf(z);
    if (!z || !scene) return;
    worldOf(scene)?.classList.add('camera-push', 'instant');
    if (p.animate) z.classList.add('fade-in');
    place(z, scene);
    setPx(stagePx(z));
    const onResize = () => {
      place(z, scene);
      setPx(stagePx(z));
    };
    window.addEventListener('resize', onResize);
    setTimeout(() => z.isConnected && input.current?.focus(), 30);
    return () => {
      window.removeEventListener('resize', onResize);
      void flush();
      worldOf(scene)?.classList.remove('camera-push', 'instant');
      scene.classList.remove('zoomed');
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the route leaves the zoom
  useLayoutEffect(() => {
    if (!p.closing) return;
    const z = zRef.current;
    const scene = sceneOf(z);
    const world = worldOf(scene);
    if (!z || !scene || !world) {
      p.onClosed();
      return;
    }
    const sid = sessionRef.current?.id;
    const done = () => {
      world.classList.remove('instant');
      scene.classList.remove('zoomed');
      p.onClosed();
      const slot =
        (sid && scene.querySelector<HTMLElement>(`.slot[data-id="${CSS.escape(`tinker:${sid}`)}"]`)) ||
        scene.querySelector<HTMLElement>('.slot[data-id="new"]');
      slot?.focus({ preventScroll: true });
    };
    world.classList.remove('camera-push');
    if (p.animate && !reducedMotion()) {
      z.classList.add('fade-out');
      setTimeout(done, 170);
    } else done();
  }, [p.closing]);

  /* ---------- load a saved chat (resume); a turn may still be running ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only — later sids are ones we made
  useEffect(() => {
    if (!p.sid) {
      const first = takeOpener();
      if (first) void send(first);
      return;
    }
    castApi.tinker.get(p.sid).then(
      (s) => {
        if (!live.current) return;
        setSession(s);
        if (s.activity) {
          setRemote(true);
          setActivity(s.activity);
        }
      },
      () => live.current && location.replace(formatRoute({ name: 'cast.tinker', sid: null })),
    );
  }, []);

  /* while Tinker works: poll what he's doing; a resumed turn ends when the activity clears */
  const sid = session?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: showChanges only reads refs + setters
  useEffect(() => {
    if (!sid || !working) return;
    const t = setInterval(() => {
      castApi.tinker.get(sid).then(
        (s) => {
          if (!live.current) return;
          setActivity(s.activity);
          if (remote && !s.activity) {
            showChanges(sessionRef.current?.draft ?? null, s.draft);
            setSession(s);
            setRemote(false);
          }
        },
        () => undefined,
      );
    }, POLL_MS);
    return () => clearInterval(t);
  }, [sid, working, remote]);

  /* one quiet line after 20 s with nothing new */
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart the quiet timer whenever Tinker moves on
  useEffect(() => {
    setSlow(false);
    if (!working) return;
    const t = setTimeout(() => live.current && setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [working, activity?.label]);

  /* ---------- the chat ---------- */
  async function send(v: string) {
    if (working || adding) return;
    setBusy(true);
    setMine(v);
    setChatErr(null);
    setDiff(null);
    try {
      let id = sessionRef.current?.id;
      if (!id) {
        const s = await castApi.tinker.create();
        id = s.id;
        sessionRef.current = s;
        if (live.current) setSession(s);
        location.replace(formatRoute({ name: 'cast.tinker', sid: id }));
      }
      await flush();
      const prev = sessionRef.current?.draft ?? null;
      const r = await castApi.tinker.say(id, v);
      if (!live.current) return;
      setSession((s) => (s ? { ...s, chat: r.chat, draft: r.draft, activity: null } : s));
      showChanges(prev, r.draft);
    } catch (e) {
      if (!live.current) return;
      setText((t) => t || v); // your text goes back in the box
      setChatErr(`${tName} couldn’t answer — ${message(e)}`);
    } finally {
      if (live.current) {
        setBusy(false);
        setMine(null);
        setActivity(null);
      }
      void invalidate(KEYS.tinker);
    }
  }

  /* ---------- direct edits (Details tab, look arrows, dice) — locked while Tinker works:
     the turn saves his whole draft and would drop an edit made meanwhile ---------- */
  const patch = (d: CreatorDraft, ms?: number) => {
    const s = sessionRef.current;
    if (!s || working) return;
    const next = { ...s.draft, ...d, ...(d.look ? { look: { ...s.draft?.look, ...d.look } } : {}) };
    const ns = { ...s, draft: next };
    sessionRef.current = ns;
    setSession(ns);
    save(s.id, d, ms);
  };
  const setLook = (next: Look) => patch({ look: next }, 250);
  const onSlot = (slot: LookSlotId, d: 1 | -1) => {
    const next = cycleLook(look, slot, d);
    setLook(next);
    announce(lookTag(next, slot));
    flashRow(zRef.current, slot);
  };
  const onDice = () => {
    const next = randomLook(look);
    setLook(next);
    announce(`New look: ${LOOK_SLOTS.map((sl) => sl.name(next[sl.id])).join(', ')}`);
  };
  const onPick = (slot: LookSlotId, next: Look) => {
    setTrying(null);
    setLook(next);
    announce(lookTag(next, slot));
    flashRow(zRef.current, slot);
    setTimeout(() => hop(bot.current?.el), 0);
  };

  /* ---------- add to the Cast / discard ---------- */
  const add = async () => {
    const s = sessionRef.current;
    if (!s || !name || adding || working) return;
    setAdding(true);
    setAddErr(null);
    try {
      await flush();
      const { agent } = await castApi.tinker.accept(s.id);
      await invalidate(KEYS.agents);
      void invalidate(KEYS.roles);
      void invalidate(KEYS.tinker);
      if (!live.current) return;
      setJoined(`${agent.name} joined the Cast.`);
      announce(`${agent.name} joined the Cast.`);
      sparkle(32, 40);
      bot.current?.setPose('celebrating');
      setTimeout(
        () => location.replace(`#cast/agent/${encodeURIComponent(agent.id)}`),
        reducedMotion() ? 250 : 900,
      );
    } catch (e) {
      if (!live.current) return;
      setAddErr(`Couldn’t add ${name} — ${message(e)}`);
      setAdding(false);
      setTimeout(() => addBtn.current?.focus(), 0);
    }
  };
  const discard = async () => {
    const s = sessionRef.current;
    if (s) {
      await castApi.tinker.drop(s.id).catch(() => undefined);
      void invalidate(KEYS.tinker);
    }
    go('cast');
  };

  /* keyboard: Esc = back (draft kept), Tab trapped; no [ / ] stepping here */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = zRef.current;
      if (!z || p.closing) return;
      if (e.key === 'Tab') trapTab(e, z);
      else if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        go('cast');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [p.closing]);

  const changed = new Set<string>(diff?.fields ?? []);
  const tint = (f: string) => (changed.has(f) ? ' tk-changed' : '');
  const chat = [
    { from: 'creator', text: `Hi, I’m ${tName}. Who do you need?` },
    ...(session?.chat ?? []),
    ...(joined ? [{ from: 'creator', text: joined }] : []),
  ];
  const draftRole = draft?.role?.trim() ?? '';
  const known = roleByName(p.roles, draftRole);
  /* a role Tinker proposes that doesn't exist yet still shows (it's made on Add) */
  const roles =
    known || !draftRole
      ? p.roles
      : [...p.roles, { id: 'tk-role', name: draftRole, agentCount: 0, reporter: false }];
  const panelAgent: PanelAgent = {
    id: '',
    kind: 'agent',
    name: draft?.name ?? '',
    roleId: known?.id ?? (draftRole ? 'tk-role' : null),
    role: draftRole,
    prompt: draft?.prompt ?? '',
    teamIds: [],
    projectIds: [],
    canDelete: { ok: false, why: '' } as PanelAgent['canDelete'],
  };
  const tabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tab === 'chat' ? 'details' : 'chat';
    setTab(next);
    document.getElementById(next === 'chat' ? 'tkTabChat' : 'tkTabDetails')?.focus();
  };

  return (
    <section
      ref={zRef}
      className="zoom zoom-agent zoom-tinker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tkTitle"
      style={{ '--accent': hueHex(draft ? look.hue : 'sun') } as React.CSSProperties}
    >
      <h2 className="sr-only" id="tkTitle" tabIndex={-1}>
        New agent: design with {tName}
      </h2>
      <div className="z-bg" aria-hidden="true" />
      <div className="z-stage">
        <button className="z-back" type="button" onClick={() => go('cast')}>
          <span aria-hidden="true">←</span> Cast
        </button>
        <div className="z-cone" aria-hidden="true" />
        <div className="z-floor" aria-hidden="true" />
        <div className="z-fig">
          {px > 0 &&
            (draft ? (
              <>
                <span className={arrived && !reducedMotion() ? 'tk-arrive' : undefined}>
                  <Hero
                    ref={bot}
                    agent={{ name, look: trying ?? look }}
                    size={px}
                    facing="front"
                    pose={arrived ? 'waving' : 'idle'}
                  />
                </span>
                {!working && (
                  <LookRig
                    look={look}
                    px={px}
                    name={name}
                    onSlot={onSlot}
                    onDice={onDice}
                    onTry={setTrying}
                    onPick={onPick}
                  />
                )}
              </>
            ) : (
              <Hero ghost agent={{ hue: 'sun' }} size={px} facing="front" />
            ))}
        </div>
        <div className="tk-plate" aria-live="off">
          <b key={`n${rev}`} className={`tk-name${tint('name')}`}>
            {name || 'New agent'}
          </b>
          {draftRole && (
            <span key={`r${rev}`} className={`tk-role${tint('role')}`}>
              {draftRole}
            </span>
          )}
          <span key={`s${rev}`} className={`tk-sum${tint('summary')}`}>
            {draft ? draft.summary : `${tName} sketches here as you talk.`}
          </span>
        </div>
        <div className="z-nav">
          <button
            ref={addBtn}
            type="button"
            className="btn btn-hero tk-add"
            disabled={!name || adding || working || !!joined}
            title={name ? undefined : 'Needs a name first'}
            onClick={() => void add()}
          >
            {adding ? 'Adding…' : addErr ? 'Try again' : 'Add to the Cast'}
          </button>
          {addErr ? (
            <p className="tk-err" role="alert">
              {addErr}
            </p>
          ) : (
            !name && <span className="zp-hint">Needs a name first</span>
          )}
        </div>
      </div>
      <aside className="np-chat tk-chat" aria-label={`Design with ${tName}`}>
        <header className="op-head">
          <div className="op-portrait">
            <Hero
              agent={tinker}
              size={72}
              pose={working ? (doing.research ? 'reading' : 'thinking') : 'talking'}
              facing="front"
              props={false}
            />
          </div>
          <div className="op-who">
            <b>{tinker?.name ?? 'Tinker'}</b>
            <span className="op-role">Agent Creator</span>
            <span className="op-status">
              {working ? doing.status : name ? `Designing ${name}` : 'Ready when you are'}
            </span>
          </div>
        </header>
        <div className="tk-tabs">
          <div className="lib-tabs" role="tablist" aria-label="Design" onKeyDown={tabKey}>
            {(['chat', 'details'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={t === 'chat' ? 'tkTabChat' : 'tkTabDetails'}
                aria-controls={t === 'chat' ? 'tkChat' : 'tkDetails'}
                aria-selected={tab === t}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
              >
                {t === 'chat' ? 'Chat' : 'Details'}
              </button>
            ))}
          </div>
        </div>
        <div
          className="tk-pane"
          role="tabpanel"
          id="tkChat"
          aria-labelledby="tkTabChat"
          hidden={tab !== 'chat'}
        >
          <ChatLog
            chat={chat}
            who={(m) => (m.from === 'user' ? 'You' : tName)}
            mine={mine}
            typing={working}
            typingLabel={`${tName} is thinking`}
            aside={doing.research ? { text: doing.research, className: 'tk-research' } : null}
            error={chatErr}
          />
          {slow && <p className="tk-slow">Real AI can take a minute — you can leave, I’ll keep the draft.</p>}
          <form
            className="op-composer"
            onSubmit={(e) => {
              e.preventDefault();
              const v = text.trim();
              if (!v || working || adding) return input.current?.focus();
              setText('');
              void send(v);
            }}
          >
            <input
              ref={input}
              autoComplete="off"
              placeholder="Describe them — what they do, how they work…"
              aria-label={`Message ${tName}`}
              value={text}
              maxLength={4000}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-hero btn-sm" type="submit">
              Send
            </button>
          </form>
        </div>
        <div
          className="tk-pane tk-details"
          role="tabpanel"
          id="tkDetails"
          aria-labelledby="tkTabDetails"
          hidden={tab !== 'details'}
        >
          {draft ? (
            <fieldset className="tk-lock" disabled={working}>
              <AgentPanel
                key={rev}
                ref={panel}
                agent={panelAgent}
                isNew
                draft
                changed={changed}
                roles={roles}
                teams={p.teams}
                onName={(v) => patch({ name: v })}
                onRole={(r) => r && patch({ role: r.name })}
                onPrompt={(v) => patch({ prompt: v }, 600)}
                onDelete={() => undefined}
                onSaved={() => pingSaved(panel.current)}
              />
            </fieldset>
          ) : (
            <p className="tk-empty">Details show up once {tName} has a first sketch.</p>
          )}
        </div>
        {session && (
          <div className="tk-foot">
            {discarding ? (
              <>
                <span>Discard {name || 'this draft'}?</span>
                <button type="button" className="zp-link danger" onClick={() => void discard()}>
                  Discard
                </button>
                <button type="button" className="zp-link" onClick={() => setDiscarding(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="zp-link danger" onClick={() => setDiscarding(true)}>
                Discard draft
              </button>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}

/** Restart the rig's tag flash on one look slot. */
function flashRow(z: HTMLElement | null, slot: LookSlotId) {
  const row = z?.querySelector<HTMLElement>(`.lk-row[data-slot="${slot}"]`);
  if (!row) return;
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}
