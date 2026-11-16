/* Agent hero zoom — the camera pushes into the lineup and the bot flies up onto its own stage
   (FLIP from its slot), with the in-game look editor (LookRig) and the detail panel. ‹ 1 / 14 › and [ / ] step through the cast.
   Create mode (#cast/agent/new | new-orchestrator) becomes a real agent on its first valid name.
   The stage figure is imperative (crossfades, FLIP); everything else is React. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Agent, AgentBusy, Look, Role, Team } from '../../api/types';
import { hero, LOOK_SLOTS, type LookSlotId, randomLook, setPose } from '../../characters';
import { hueHex } from '../../design/palette';
import { go } from '../../shell/router';
import { AgentPanel, type PanelAgent } from './AgentPanel';
import {
  after,
  announce,
  flip,
  hop,
  pingSaved,
  place,
  poof,
  rectUnpushed,
  reducedMotion,
  trapTab,
} from './fx';
import { LookRig } from './LookRig';
import { castOrder, cycleLook, leastUsedHue, lookTag, roleText, sameLook } from './model';
import { busyReason, createAgent, deleteAgent, fetchBusy, flushAll, saveAgent, saveAgentSoon } from './store';

const BUSY_POLL_MS = 15_000;

export type HeroZoomProps = {
  id: string;
  animate: boolean;
  closing: boolean;
  onClosed: () => void;
  onCreated: (id: string) => void;
  prefill: { name?: string } | null;
  agents: Agent[];
  roles: Role[];
  teams: Team[];
};

type Draft = PanelAgent & { look: Look };
const isNewId = (id: string) => id === 'new' || id === 'new-orchestrator';

function makeDraft(id: string, prefill: { name?: string } | null, agents: Agent[]): Draft {
  const orch = id === 'new-orchestrator';
  const look: Look = orch
    ? { ...randomLook(), hat: 'director', tool: 'megaphone', decal: 'Director' }
    : { ...randomLook(), hue: leastUsedHue(agents) };
  return {
    id: '',
    kind: orch ? 'orchestrator' : 'agent',
    name: prefill?.name ?? '',
    roleId: null,
    role: '',
    prompt: orch ? (agents.find((a) => a.kind === 'orchestrator')?.prompt ?? '') : '',
    teamIds: [],
    projectIds: [],
    canDelete: { ok: false, why: '' } as PanelAgent['canDelete'],
    look,
  };
}

function bigPx(z: HTMLElement) {
  const st = z.querySelector('.z-stage') as HTMLElement | null;
  const h = st?.clientHeight || 600;
  const w = st?.clientWidth || 500;
  /* leave room either side for the look arrows */
  return Math.round(Math.max(200, Math.min(380, h * 0.6, (w - 170) / 0.75)));
}
const sceneOf = (el: Element | null) => el?.closest('.scene') as HTMLElement | null;
const worldOf = (scene: HTMLElement | null) => scene?.querySelector('.cast-world') as HTMLElement | null;
const slotOf = (scene: HTMLElement | null, id: string) =>
  scene?.querySelector<HTMLElement>(`.slot[data-id="${CSS.escape(id)}"]`) ?? null;

type Change =
  | { kind: 'slot'; slot: LookSlotId }
  | { kind: 'dice' }
  | { kind: 'try' }
  | { kind: 'undo' }
  | { kind: 'step'; d: number }
  | null;

export function HeroZoom(p: HeroZoomProps) {
  const zRef = useRef<HTMLElement>(null);
  const bigHost = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(() =>
    isNewId(p.id) ? makeDraft(p.id, p.prefill, p.agents) : null,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const creating = useRef(false);
  const change = useRef<Change>(null);
  const opening = useRef<{ from: DOMRect | null; slot: HTMLElement | null } | null>(null);
  const returnGhost = useRef(isNewId(p.id));

  const realId = isNewId(p.id) ? createdId : p.id;
  const live = realId ? p.agents.find((a) => a.id === realId) : undefined;
  const agent: Draft | undefined = live ?? (realId ? undefined : (draft ?? undefined));
  const saved = useCallback(() => pingSaved(panel.current), []);

  /* an id that doesn't exist (deleted, bad link) → back to the lineup */
  useEffect(() => {
    if (realId && !live && !p.closing) location.replace('#cast');
  }, [realId, live, p.closing]);
  /* a recruit that just got its id keeps its panel (focus stays in the name field) */
  const panelKey = realId && realId !== createdId ? realId : 'draft';

  /* ---------- open: measure the slot, place the overlay, size the big bot ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useLayoutEffect(() => {
    const z = zRef.current;
    const scene = sceneOf(z);
    if (!z || !scene) return;
    const slot = slotOf(scene, isNewId(p.id) ? 'new' : p.id);
    const sh = slot?.querySelector('.hero');
    const from = sh && !slot?.closest('.away') ? sh.getBoundingClientRect() : null;
    slot?.classList.remove('hot');
    opening.current = { from: p.animate ? from : null, slot };
    place(z, scene);
    setPx(bigPx(z));
    const onResize = () => {
      place(z, scene);
      setPx(bigPx(z));
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      flushAll();
      /* leaving without the close animation (tab switch, another stage) */
      worldOf(scene)?.classList.remove('camera-push', 'instant');
      scene.classList.remove('zoomed');
      for (const li of scene.querySelectorAll('.is-flying')) li.classList.remove('is-flying');
    };
  }, []);

  /* ---------- a tray option tried on (shown, never saved) ---------- */
  const [trying, setTrying] = useState<Look | null>(null);
  const onTry = (l: Look | null) => {
    change.current = { kind: 'try' };
    setTrying(l);
  };

  /* ---------- the big bot: build / crossfade / slide; first build runs the camera push ---------- */
  const look = trying ?? agent?.look;
  const heroKey = JSON.stringify([panelKey, look]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt when the costume, the agent or the size changes
  useLayoutEffect(() => {
    const host = bigHost.current;
    const z = zRef.current;
    if (!host || !z || !px || !agent) return;
    const old = host.querySelector<HTMLElement>('.hero');
    const n = hero({ id: agent.id, name: agent.name, look }, { size: px, facing: 'front' });
    const c = change.current;
    change.current = null;
    if (!old) {
      host.appendChild(n);
      if (opening.current) runOpen(z, n);
      return;
    }
    if (c?.kind === 'try' || c?.kind === 'undo') {
      for (const h of host.querySelectorAll('.hero.lk-out')) h.remove();
      if (reducedMotion()) old.remove();
      else {
        old.classList.add('lk-out');
        old.style.cssText += ';position:absolute;left:0;bottom:0';
        after(old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }), () =>
          old.remove(),
        );
      }
      host.prepend(n);
      if (c.kind === 'undo') hop(n);
      return;
    }
    if (c && (c.kind === 'slot' || c.kind === 'dice') && !reducedMotion()) {
      n.style.setProperty('--dl', old.style.getPropertyValue('--dl'));
      old.classList.add('lk-out');
      old.style.cssText += ';position:absolute;left:0;bottom:0';
      host.prepend(n);
      n.animate(
        [
          { opacity: 0, transform: c.kind === 'slot' ? 'none' : 'scale(.94)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: c.kind === 'slot' ? 200 : 320, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
      after(old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }), () =>
        old.remove(),
      );
      if (c.kind === 'dice') poof(z.querySelector('.z-fig'));
      return;
    }
    for (const h of host.querySelectorAll('.hero')) h.remove();
    host.appendChild(n);
    if (c?.kind === 'step' && !reducedMotion()) {
      n.animate(
        [
          { transform: `translateX(${c.d * 40}px)`, opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        {
          duration: 300,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        },
      );
      panel.current?.animate(
        [
          { opacity: 0, transform: 'translateX(12px)' },
          { opacity: 1, transform: 'none' },
        ],
        {
          duration: 260,
          easing: 'ease-out',
        },
      );
    } else if (!c) hop(n);
  }, [heroKey, px]);

  function runOpen(z: HTMLElement, big: HTMLElement) {
    const o = opening.current;
    opening.current = null;
    const scene = sceneOf(z);
    const world = worldOf(scene);
    if (!o || !world) return;
    const anim = !!o.from && !reducedMotion();
    if (anim && o.slot) {
      const sr = o.slot.getBoundingClientRect();
      const wr = world.getBoundingClientRect();
      world.style.transformOrigin = `${sr.left - wr.left + sr.width / 2}px ${sr.top - wr.top + sr.height / 2}px`;
      o.slot.parentElement?.classList.add('is-flying');
      z.classList.add('entering');
      void z.offsetWidth;
      world.classList.add('camera-push');
      z.classList.remove('entering');
      flip(big, o.from, { duration: 560 });
    } else {
      world.classList.add('camera-push', 'instant');
      if (p.animate) z.classList.add('fade-in');
    }
    setTimeout(
      () => {
        const b = z.querySelector<HTMLElement>('.z-fig .hero');
        if (!b || reducedMotion()) return;
        setPose(b, 'celebrating');
        setTimeout(() => b.isConnected && setPose(b, 'idle'), 900);
      },
      anim ? 560 : 60,
    );
    setTimeout(
      () => {
        if (!z.isConnected) return;
        z.querySelector<HTMLElement>(isNewId(p.id) ? '.zp-title' : '#zhTitle')?.focus();
      },
      anim ? 300 : 30,
    );
  }

  /* ---------- close: the bot flies back into its slot as the camera pulls out ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the route leaves the zoom
  useLayoutEffect(() => {
    if (!p.closing) return;
    flushAll();
    const z = zRef.current;
    const scene = sceneOf(z);
    const world = worldOf(scene);
    if (!z || !scene || !world) {
      p.onClosed();
      return;
    }
    const slot = realId ? slotOf(scene, realId) : null;
    const li = slot?.parentElement;
    const done = () => {
      world.classList.remove('instant');
      li?.classList.remove('is-flying');
      scene.classList.remove('zoomed');
      p.onClosed();
      if (slot?.isConnected && !slot.closest('.away')) {
        slot.focus({ preventScroll: true });
        if (returnGhost.current) hop(slot.querySelector('.hero'));
      } else scene.querySelector<HTMLElement>('.slot')?.focus({ preventScroll: true });
    };
    const big = z.querySelector<HTMLElement>('.z-fig .hero');
    if (reducedMotion() || !slot || slot.closest('.away') || !p.animate) {
      world.classList.remove('camera-push');
      if (p.animate) {
        z.classList.add('fade-out');
        setTimeout(done, 170);
      } else done();
      return;
    }
    const sh = slot.querySelector('.hero') as Element;
    const r = rectUnpushed(world, sh, ['camera-push', 'instant']);
    const sr = rectUnpushed(world, slot, ['camera-push', 'instant']);
    const wr = rectUnpushed(world, world, ['camera-push', 'instant']);
    world.style.transformOrigin = `${sr.left - wr.left + sr.width / 2}px ${sr.top - wr.top + sr.height / 2}px`;
    world.classList.remove('instant');
    void world.offsetWidth;
    li?.classList.add('is-flying');
    if (big) setPose(big, 'idle');
    z.classList.add('leaving');
    world.classList.remove('camera-push');
    after(flip(big, r, { reverse: true, duration: 480 }), done);
  }, [p.closing]);

  /* ---------- stepping through the cast ---------- */
  const order = castOrder(p.agents);
  const idx = live ? order.findIndex((a) => a.id === live.id) : -1;
  const step = useCallback(
    (d: number) => {
      if (!live || idx < 0) return;
      const next = order[(idx + d + order.length) % order.length] as Agent;
      flushAll();
      change.current = { kind: 'step', d };
      returnGhost.current = false;
      location.replace(`#cast/agent/${encodeURIComponent(next.id)}`);
      announce(`${next.name}, ${roleText(next)}. ${order.indexOf(next) + 1} of ${order.length}`);
      setTimeout(() => zRef.current?.querySelector<HTMLElement>('#zhTitle')?.focus(), 0);
    },
    [live, idx, order],
  );

  /* keyboard: Esc = back, Tab trapped, [ / ] prev / next */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = zRef.current;
      if (!z || p.closing) return;
      if (e.key === 'Tab') {
        trapTab(e, z);
        return;
      }
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        go('cast');
        return;
      }
      const typing = /input|textarea|select/i.test((e.target as HTMLElement).tagName);
      if (!typing && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        step(e.key === ']' ? 1 : -1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, p.closing]);

  /* ---------- busy: in a running session → Delete is blocked, with the reason ---------- */
  const [busy, setBusy] = useState<AgentBusy | null>(null);
  const busyOf = useRef<string | null>(null);
  const checking = useRef(false);
  const liveId = live && !isNewId(p.id) ? live.id : null;
  useEffect(() => {
    busyOf.current = liveId;
    setBusy(null);
    if (!liveId) return;
    let off = false;
    void fetchBusy(liveId).then((b) => !off && setBusy(b));
    return () => {
      off = true;
    };
  }, [liveId]);
  /* while blocked, look again now and then so Delete frees itself when the session ends */
  useEffect(() => {
    if (!liveId || !busy?.busy) return;
    const t = setInterval(() => {
      void fetchBusy(liveId).then((b) => busyOf.current === liveId && setBusy(b));
    }, BUSY_POLL_MS);
    return () => clearInterval(t);
  }, [liveId, busy?.busy]);

  /* ---------- edits (auto-save; a draft is created on its first valid name) ---------- */
  const create = (d: Draft) => {
    if (creating.current) return;
    creating.current = true;
    const sent = { name: d.name, roleId: d.roleId, look: d.look, prompt: d.prompt };
    void createAgent({ kind: d.kind, ...sent }).then((a) => {
      creating.current = false;
      if (!a) return;
      const now = draftRef.current;
      const diff: Record<string, unknown> = {};
      if (now)
        for (const k of ['name', 'roleId', 'look', 'prompt'] as const)
          if (now[k] !== sent[k]) diff[k] = now[k];
      if (Object.keys(diff).length) void saveAgent(a.id, diff);
      setCreatedId(a.id);
      p.onCreated(a.id);
      location.replace(`#cast/agent/${encodeURIComponent(a.id)}`);
      announce(`${a.name} joined the cast`);
      setTimeout(saved, 0);
    });
  };
  const editDraft = (patch: Partial<Draft>) => {
    const d = { ...(draftRef.current as Draft), ...patch };
    draftRef.current = d;
    setDraft(d);
    return d;
  };
  const onName = (name: string) => {
    if (realId) saveAgentSoon(realId, { name }, { onSaved: saved });
    else {
      const d = editDraft({ name });
      if (name.trim()) create(d);
    }
  };
  const onPrompt = (prompt: string) => {
    if (realId) saveAgentSoon(realId, { prompt }, { onSaved: saved }, 600);
    else editDraft({ prompt });
  };
  const onRole = (role: Role | null) => {
    if (realId)
      void saveAgent(
        realId,
        { roleId: role?.id ?? null },
        { onSaved: saved, view: { role: role?.name ?? '' } },
      );
    else editDraft({ roleId: role?.id ?? null, role: role?.name ?? '' });
  };
  const setLook = (next: Look, c: Change) => {
    change.current = c;
    if (realId) saveAgentSoon(realId, { look: next }, { onSaved: saved }, 250);
    else editDraft({ look: next });
  };
  const onSlot = (slot: LookSlotId, d: 1 | -1) => {
    if (!agent) return;
    const next = cycleLook(agent.look, slot, d);
    setLook(next, { kind: 'slot', slot });
    announce(lookTag(next, slot));
    flashRow(slot);
  };
  const flashRow = (slot: LookSlotId) => {
    const row = zRef.current?.querySelector(`.lk-row[data-slot="${slot}"]`);
    if (row) {
      row.classList.remove('flash');
      void (row as HTMLElement).offsetWidth;
      row.classList.add('flash');
    }
  };
  const onDice = () => {
    if (!agent) return;
    const next = randomLook(agent.look);
    setLook(next, { kind: 'dice' });
    announce(`New look: ${LOOK_SLOTS.map((sl) => sl.name(next[sl.id])).join(', ')}`);
  };
  /* a tray pick: the bot already wears it (tried on), so no crossfade — the row flashes, one hop */
  const onPick = (slot: LookSlotId, next: Look) => {
    if (!agent) return;
    setTrying(null);
    setLook(next, { kind: 'try' });
    announce(lookTag(next, slot));
    flashRow(slot);
    setTimeout(() => hop(bigHost.current?.querySelector('.hero')), 0);
  };

  /* ---------- ↺ Undo look: back to the look they had when you opened them (or stepped to them) ---------- */
  const [start, setStart] = useState<{ id: string; look: Look } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new starting point per agent, not per edit
  useEffect(() => {
    setStart(liveId && live ? { id: liveId, look: live.look } : null);
    setTrying(null);
  }, [liveId]);
  const undo =
    live && start?.id === live.id && !sameLook(start.look, live.look)
      ? {
          label: `Undo look changes — back to how ${live.name} looked when you opened them`,
          onUndo: () => {
            setLook(start.look, { kind: 'undo' });
            announce(`${live.name}'s look is back`);
            setTimeout(() => zRef.current?.querySelector<HTMLElement>('.lk-dice')?.focus(), 0);
          },
        }
      : undefined;
  /* Delete while busy is refused: ask again on Delete, so a session that just started blocks it
     and one that just ended frees it (the button lights up; the next press deletes). */
  const onDelete = async () => {
    if (!live || checking.current) return;
    const a = live;
    checking.current = true;
    const b = await fetchBusy(a.id);
    checking.current = false;
    if (busyOf.current !== a.id) return; // stepped to another agent meanwhile
    const wasBusy = busy?.busy ?? false;
    setBusy(b);
    if (b.busy || wasBusy) {
      if (b.busy) announce(busyReason(a.name, b.sessions));
      return;
    }
    const ok = await deleteAgent(a, () => go('cast'));
    if (ok) announce(`${a.name} deleted.`);
    else if (busyOf.current === a.id) setBusy(await fetchBusy(a.id));
  };

  if (!agent) return null;
  const accent = hueHex(agent.look.hue);
  return (
    <section
      ref={zRef}
      className="zoom zoom-agent"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zhTitle"
      style={{ '--accent': accent } as React.CSSProperties}
    >
      <div className="z-bg" aria-hidden="true" />
      <div className="z-stage">
        <button className="z-back" type="button" onClick={() => go('cast')}>
          <span aria-hidden="true">←</span> Cast
        </button>
        <div className="z-cone" aria-hidden="true" />
        <div className="z-floor" aria-hidden="true" />
        <div className="z-fig">
          <span ref={bigHost} style={{ display: 'contents' }} />
          {px > 0 && (
            <LookRig
              key={panelKey}
              look={agent.look}
              px={px}
              name={agent.name}
              onSlot={onSlot}
              onDice={onDice}
              onTry={onTry}
              onPick={onPick}
              undo={undo}
            />
          )}
        </div>
        <div className="z-nav">
          {idx >= 0 && (
            <>
              <button
                type="button"
                className="z-step"
                aria-label="Previous agent"
                title="Previous ( [ )"
                onClick={() => step(-1)}
              >
                ‹
              </button>
              <span>
                {idx + 1} / {order.length}
              </span>
              <button
                type="button"
                className="z-step"
                aria-label="Next agent"
                title="Next ( ] )"
                onClick={() => step(1)}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>
      <AgentPanel
        key={panelKey}
        ref={panel}
        agent={agent}
        isNew={isNewId(p.id)}
        roles={p.roles}
        teams={p.teams}
        onName={onName}
        onRole={onRole}
        onPrompt={onPrompt}
        onDelete={() => void onDelete()}
        busy={busy?.busy ? busy.sessions : undefined}
        onSaved={saved}
        onTinker={p.id === 'new' ? () => go('cast/agent/tinker') : undefined}
      />
    </section>
  );
}
