/* The office scene — the prototype's office-engine.js (spec-office §7) as a class. Moves robots
   around the floor plan and dresses them for what they're doing; never decides the story (the
   backend's events do, via state.ts → OfficePage). Imperative DOM inside one React-owned box:
   the room is art (theme.ts), robots are hero() elements, overlays are plain spans.

   Calm rules (v4–v6): robots stay at their desks; talk is a "…" bubble (never words); what someone
   is doing shows only on hover/focus; the "!" is the one badge over a head; walking is rare and
   purposeful (waking up from the couch, carrying a report to the tray).

   Camera perf (kept from the prototype): during a zoom the GPU slides the room as ONE flat layer
   (.moving = will-change); the restyle-heavy work (--z feeds every overlay's size, pausing every
   animation) waits until the camera lands. */
import { emblemSVG, type HeroAgent, hero, setFacing, setPose } from '../../characters';
import { escapeHtml, hueHex, reducedMotion } from '../../design/palette';
import { binderSeat, depth, deskSpot, type ObjectId, type Plan, type Pt } from './layout';
import type { Tray } from './life';
import { type Actor, activityOf } from './state';
import { type BoardFacts, chair, couchFront, desk, deskSync, officeArt, setDoor, syncArt } from './theme';

export type SceneAgent = HeroAgent & { id: string; name: string; nick?: string | null; role?: string };
export type SceneTeam = { id: string; name: string; color: string; emblem: string; captain: string | null };
export type SceneConfig = {
  plan: Plan;
  title: string;
  director: string;
  /** Everyone in the office (director first). */
  ids: string[];
  agents: Record<string, SceneAgent>;
  teams: Record<string, SceneTeam>;
  /** agentId → teamId (null = solo / director). */
  teamOf: Record<string, string | null>;
  /** STUDIO LIFE: guests the user brought in (agentId → their brief). */
  guests?: Record<string, string>;
  /** The HQ office (the mailbox wears a plaque). */
  hq?: boolean;
  /** The stage wrapper (zoom state classes) and the chat panel (narrow-screen drawer height). */
  stage: () => HTMLElement | null;
  drawer: () => number;
};
type Rec = {
  id: string;
  wrap: HTMLDivElement;
  btn: HTMLButtonElement;
  hero: HTMLElement;
  x: number;
  y: number;
  at: string;
  seat: string;
  actor: Actor;
  held: boolean;
  walking: boolean;
  walkTok: number;
  dir: 'left' | 'right';
  cardKey?: string;
  rt?: ReturnType<typeof setTimeout>;
  question?: string;
  /** Just forgot: the card says so until the next status. */
  fresh?: boolean;
  /** The monitor blinks off for a moment (the forget reset). */
  blank?: boolean;
};
type DeskRec = { el: HTMLDivElement; chair: HTMLDivElement; hue: string | null; tray: Tray | null };

const ROOM_H = 1062;
const OBJECT_ANCHORS = new Set(['door', 'outbox', 'console', 'whiteboard', 'reports']);

export class OfficeEngine {
  readonly plan: Plan;
  actors: Record<string, Rec> = {};
  private desks: Record<string, DeskRec> = {};
  private cam!: HTMLDivElement;
  private art!: SVGSVGElement;
  private layer!: HTMLDivElement;
  private fx!: HTMLDivElement;
  private k = 1;
  private ox = 0;
  private oy = 0;
  private zt?: ReturnType<typeof setTimeout>;
  private chipT?: ReturnType<typeof setTimeout>;
  private alive = true;
  zoom: { obj: ObjectId | null } = { obj: null };
  /** teamId → the seat whose desk carries the team's principles binder. */
  readonly binders: Record<string, string> = {};

  constructor(
    private box: HTMLElement,
    private cfg: SceneConfig,
  ) {
    this.plan = cfg.plan;
    for (const t of Object.values(cfg.teams)) {
      const seat = binderSeat(cfg.plan, t.id, t.captain);
      if (seat) this.binders[t.id] = seat;
    }
  }

  /* ---------------------------------------------------------- build */
  mount(actors: Actor[], facts: BoardFacts): void {
    const { plan, cfg } = this;
    const box = this.box;
    box.style.width = `${plan.W}px`;
    const artTeams = Object.fromEntries(
      Object.values(cfg.teams).map((t) => [t.id, { name: t.name, color: t.color }]),
    );
    box.innerHTML = `<div class="o-cam"><div class="o-world" style="width:${plan.W}px">${officeArt(plan, { teams: artTeams, title: cfg.title, hq: cfg.hq })}<div class="o-layer"></div><div class="o-fx"></div></div></div>`;
    this.cam = box.querySelector('.o-cam') as HTMLDivElement;
    this.art = box.querySelector('.ot-art') as SVGSVGElement;
    this.layer = box.querySelector('.o-layer') as HTMLDivElement;
    this.fx = box.querySelector('.o-fx') as HTMLDivElement;
    syncArt(this.art, facts);
    /* team pods: every member's desk; solo desks appear where someone sits */
    for (const p of plan.pods) {
      const team = p.teamId ? cfg.teams[p.teamId] : null;
      for (const sid of p.seats) {
        const owner = Object.keys(plan.home).find((id) => plan.home[id] === sid);
        if (team || owner) this.desk(sid, team ? 'pod' : 'hot', plan.seats[sid], team?.color ?? null, owner);
      }
    }
    this.desk('director', 'boss', plan.director, 'sun', cfg.director);
    const cf = document.createElement('div');
    cf.className = 'o-prop o-couchfront';
    cf.innerHTML = couchFront(plan);
    cf.style.zIndex = '818';
    this.layer.appendChild(cf);
    /* sleepers take the couch (3 seats), the rest nap at their desks */
    let couch = 0;
    for (const a of actors) {
      const seat = a.id === cfg.director ? 'director' : plan.home[a.id];
      if (!seat) continue;
      const at = a.session === 'asleep' && couch < plan.couch.length ? `couch-${++couch}` : seat;
      this.actor(a, seat, at);
    }
    this.deskSync();
    this.fit();
  }

  unmount(): void {
    this.alive = false;
    for (const r of Object.values(this.actors)) {
      r.walkTok = -1;
      clearTimeout(r.rt);
    }
    clearTimeout(this.zt);
    clearTimeout(this.chipT);
    this.actors = {};
    this.desks = {};
    this.rings = {};
    this.box.innerHTML = '';
  }

  /* ---------------------------------------------------------- crew rings (WORKFLOWS Phase 5) */
  private rings: Record<string, HTMLDivElement> = {};
  /** One dashed ring around a temporary workflow's lead + crew desks, its goal on a small pill. Rings no
      longer listed fade out (reduced motion: they just go). Under the robots, over the floor. */
  setRings(rings: { goalId: string; label: string; lead: string; crew: string[] }[]): void {
    if (!this.layer) return;
    const keep = new Set<string>();
    for (const r of rings) {
      const pts = [r.lead, ...r.crew]
        .map((id) =>
          id === this.cfg.director ? this.plan.director : this.plan.seats[this.plan.home[id] ?? ''],
        )
        .filter((p): p is Pt => !!p);
      if (!pts.length) continue;
      keep.add(r.goalId);
      const minX = Math.min(...pts.map((p) => p.x)) - 80;
      const maxX = Math.max(...pts.map((p) => p.x)) + 80;
      const minY = Math.min(...pts.map((p) => p.y)) - 190;
      const maxY = Math.max(...pts.map((p) => p.y)) + 50;
      let el = this.rings[r.goalId];
      if (!el) {
        el = document.createElement('div');
        el.className = 'o-ring';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = '<span class="o-ring-pill"></span>';
        this.layer.appendChild(el);
        this.rings[r.goalId] = el;
        requestAnimationFrame(() => el?.classList.add('in'));
      }
      el.classList.remove('out');
      Object.assign(el.style, {
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${maxX - minX}px`,
        height: `${maxY - minY}px`,
      });
      const pill = el.firstElementChild as HTMLElement;
      pill.textContent = r.label;
    }
    for (const [id, el] of Object.entries(this.rings)) {
      if (keep.has(id)) continue;
      delete this.rings[id];
      el.classList.remove('in');
      el.classList.add('out');
      const quick = matchMedia('(prefers-reduced-motion:reduce)').matches;
      setTimeout(() => el.remove(), quick ? 0 : 700);
    }
  }

  private desk(
    id: string,
    kind: 'pod' | 'hot' | 'boss',
    s: Pt | undefined,
    hue: string | null,
    owner?: string,
  ) {
    if (!s) return;
    const ag = owner ? this.cfg.agents[owner] : undefined;
    const el = document.createElement('div');
    el.className = 'o-prop o-desk';
    el.dataset.seat = id;
    const items = ['mug', 'plant', null] as const;
    const item =
      id === 'director'
        ? 'telescope'
        : Object.values(this.binders).includes(id)
          ? 'binder'
          : owner && this.cfg.guests?.[owner] !== undefined
            ? 'tent'
            : items[Object.keys(this.desks).length % 3];
    el.innerHTML = desk(kind, { hue, accent: ag?.look?.hue, item });
    const sc = depth(s.y);
    this.place(el, s.x, s.y, s.y + 7, sc);
    const ch = document.createElement('div');
    ch.className = 'o-prop o-chair';
    ch.dataset.seat = id;
    ch.innerHTML = chair(ag?.look?.hue ?? hue ?? 'grape');
    this.place(ch, s.x, s.y, s.y - 3, sc);
    this.layer.append(ch, el);
    this.desks[id] = { el, chair: ch, hue, tray: null };
  }
  private place(el: HTMLElement, x: number, y: number, z: number, s = 1) {
    el.style.transform = `translate(${x}px,${y}px) scale(${s})`;
    el.style.zIndex = String(Math.round(z));
  }

  private actor(a: Actor, seat: string, at: string) {
    const { cfg } = this;
    const ag = cfg.agents[a.id];
    if (!ag) return;
    const teamId = cfg.teamOf[a.id];
    const team = teamId ? cfg.teams[teamId] : null;
    const captain = !!team && team.captain === a.id;
    const act = activityOf(a.kind);
    const H = a.id === cfg.director ? 184 : 176;
    const wrap = document.createElement('div');
    wrap.className = 'o-actor';
    wrap.dataset.id = a.id;
    const btn = document.createElement('button');
    btn.className = 'o-body';
    btn.type = 'button';
    btn.dataset.id = a.id;
    btn.tabIndex = -1;
    btn.style.setProperty('--H', `${H}px`);
    const h = hero(ag, {
      size: H,
      pose: act.pose,
      facing: 'three-quarter',
      seated: act.seated,
      props: false,
      holding: act.holding ?? 'none',
      captain,
      armband: captain && team ? team.color : null,
    });
    btn.appendChild(h);
    btn.insertAdjacentHTML(
      'beforeend',
      `<span class="o-blanket" style="--bk:${hueHex(ag.look?.hue)}" aria-hidden="true"></span>
      <span class="o-over" aria-hidden="true">
        <span class="o-bubble" hidden><i></i><i></i><i></i></span>
        <span class="o-bang" hidden><b>!</b></span>
        <span class="o-card"></span>
      </span>`,
    );
    wrap.appendChild(btn);
    this.layer.appendChild(wrap);
    const p = this.anchor(at);
    const rec: Rec = {
      id: a.id,
      wrap,
      btn,
      hero: h,
      x: p.x,
      y: p.y,
      at,
      seat,
      actor: a,
      held: false,
      walking: false,
      walkTok: 0,
      dir: 'right',
    };
    this.actors[a.id] = rec;
    this.moveNow(rec, p.x, p.y);
    this.dress(rec);
  }

  /* ---------------------------------------------------------- state → look */
  /** A robot's state changed (from the backend). Waking up = walking from the couch to the desk. */
  async apply(a: Actor, question?: string): Promise<void> {
    const rec = this.actors[a.id];
    if (!rec) return;
    const was = rec.actor;
    rec.actor = a;
    rec.question = question;
    rec.fresh = false;
    if (was.session === 'asleep' && a.session !== 'asleep' && rec.at !== rec.seat) {
      this.dress(rec); /* card + aria first; the pose waits until they sit */
      await this.walkTo(a.id, rec.seat);
    }
    this.dress(rec);
    this.deskSync(rec.seat);
  }

  /** Someone was edited in the Cast (a new look, name or role): swap their robot in place — same seat, same
      pose, same overlays — tint their chair, and rewrite the card and the accessible name.
      True when they were in the room and something they show changed. */
  restyle(id: string, ag: SceneAgent): boolean {
    const was = this.cfg.agents[id];
    const shows = (a: SceneAgent | undefined) => JSON.stringify([a?.look, a?.name, a?.nick, a?.role]);
    if (!was || shows(was) === shows(ag)) return false;
    this.cfg.agents[id] = ag;
    const rec = this.actors[id];
    if (!rec) return false;
    const teamId = this.cfg.teamOf[id];
    const team = teamId ? this.cfg.teams[teamId] : null;
    const captain = !!team && team.captain === id;
    const act = activityOf(rec.actor.kind);
    const h = hero(ag, {
      size: id === this.cfg.director ? 184 : 176,
      pose: act.pose,
      facing: 'three-quarter',
      seated: act.seated,
      props: false,
      holding: act.holding ?? 'none',
      captain,
      armband: captain && team ? team.color : null,
    });
    rec.hero.replaceWith(h);
    rec.hero = h;
    rec.btn.querySelector<HTMLElement>('.o-blanket')?.style.setProperty('--bk', hueHex(ag.look?.hue));
    const d = this.desks[rec.seat];
    if (d) {
      d.chair.innerHTML = chair(ag.look?.hue ?? d.hue ?? 'grape');
      /* the nameplate and the mug band wear the owner's colour */
      if (ag.look?.hue)
        for (const r of d.el.querySelectorAll('.d-acc')) r.setAttribute('fill', hueHex(ag.look.hue));
    }
    rec.cardKey = undefined;
    this.dress(rec);
    this.deskSync(rec.seat);
    return true;
  }

  private dress(rec: Rec, o: { facing?: 'front' } = {}) {
    const a = rec.actor;
    const act = activityOf(a.kind);
    const atDesk = rec.at === rec.seat;
    const onCouch = rec.at.startsWith('couch-');
    const seated = act.seated && (atDesk || onCouch);
    if (!rec.walking) {
      setPose(rec.hero, act.pose, { seated, holding: act.holding ?? 'none', props: false, moving: false });
      if (!rec.held) {
        if (o.facing) setFacing(rec.hero, o.facing);
        else if (act.pose === 'sleeping') setFacing(rec.hero, 'front');
        else setFacing(rec.hero, 'three-quarter', { dir: rec.at === 'director' ? 'left' : 'right' });
      }
      rec.btn.style.setProperty('--lift', `${seated && atDesk ? 16 : 0}px`);
    }
    rec.btn.style.setProperty('--hy', rec.hero.style.getPropertyValue('--head-y') || '10%');
    rec.wrap.dataset.kind = a.kind;
    rec.wrap.classList.toggle('asleep', a.kind === 'sleeping');
    this.bang(rec.id, a.kind === 'needs-input');
    this.card(rec);
    rec.btn.setAttribute('aria-label', this.label(rec));
  }

  /** The hover/focus card: who, where, and — only here — what they're doing. */
  private card(rec: Rec) {
    const a = rec.actor;
    const ag = this.cfg.agents[a.id];
    const act = activityOf(a.kind);
    const team = this.teamOf(a.id);
    const director = a.id === this.cfg.director;
    const brief = this.cfg.guests?.[a.id];
    const where = team
      ? `${emblemSVG(team, 16, { decorative: true })}<span>${escapeHtml(team.name.replace(/^The /, ''))}</span>`
      : `<span>${director ? 'Director' : brief !== undefined ? 'Guest' : 'Solo'}</span>`;
    const doing = this.doing(rec);
    const key = `${a.kind}|${doing}|${rec.fresh ? 1 : 0}`;
    if (rec.cardKey === key) return;
    rec.cardKey = key;
    const card = rec.btn.querySelector('.o-card');
    const line = rec.fresh ? '↺ Fresh start — reading my note' : `${act.icon} ${doing}`;
    if (card)
      card.innerHTML = `<b>${escapeHtml(ag.name)}</b><span class="o-cmeta">${escapeHtml(director ? 'Big picture' : ag.role || '')} · ${where}</span>${brief ? `<span class="o-cbrief">“${escapeHtml(clip(brief, 80))}”</span>` : ''}<span class="o-cact">${escapeHtml(line)}</span>`;
  }
  private doing(rec: Rec): string {
    const a = rec.actor;
    if (a.kind === 'needs-input') return `Needs you${rec.question ? ` — ${clip(rec.question, 70)}` : ''}`;
    if (a.kind === 'sleeping') return 'Off shift';
    return a.label;
  }
  /** The accessible name — a full sentence, never colour-only. */
  label(rec: Rec): string {
    const a = rec.actor;
    const ag = this.cfg.agents[a.id];
    const team = this.teamOf(a.id);
    const director = a.id === this.cfg.director;
    let st = a.label;
    if (a.kind === 'needs-input') st = `needs your input${rec.question ? `: ${rec.question}` : ''}`;
    if (a.kind === 'sleeping')
      st = rec.at.startsWith('couch-') ? 'off shift, asleep on the couch' : 'off shift, asleep';
    const brief = this.cfg.guests?.[a.id];
    const guest = brief !== undefined ? `, guest — brief: ${brief}` : '';
    return `${ag.name}, ${director ? 'Director (orchestrator)' : ag.role || 'Agent'}, ${director ? 'Director' : team ? team.name : brief !== undefined ? 'Guest' : 'Solo'} — ${st}${guest}`;
  }
  private teamOf(id: string) {
    const t = this.cfg.teamOf[id];
    return t ? this.cfg.teams[t] : null;
  }

  bang(id: string, on: boolean): void {
    const r = this.actors[id];
    if (!r) return;
    const b = r.btn.querySelector<HTMLElement>('.o-bang');
    if (b) b.hidden = !on;
    r.wrap.classList.toggle('has-bang', on);
  }

  /** Desks read their owner's state: the monitor glyph, the chair tucked in when they're away. */
  deskSync(seatId?: string): void {
    const ids = seatId ? [seatId] : Object.keys(this.desks);
    for (const sid of ids) {
      const d = this.desks[sid];
      if (!d) continue;
      const owner = Object.values(this.actors).find((r) => r.seat === sid);
      const s = { glyph: 'off', hue: d.hue ?? 'grape', tray: d.tray };
      if (owner) {
        s.hue = this.cfg.agents[owner.id]?.look?.hue ?? s.hue;
        s.glyph =
          owner.actor.session === 'asleep' || owner.blank ? 'off' : activityOf(owner.actor.kind).glyph;
        d.chair.classList.toggle('empty', owner.at !== sid);
      } else d.chair.classList.add('empty');
      deskSync(d.el, s);
    }
  }

  /* ---------------------------------------------------------- STUDIO LIFE */
  /** The paper on someone's desk: one sheet while they have notes here ('new' glows). */
  setTray(id: string, tray: Tray | null): void {
    const seat = this.plan.home[id]; /* the director's desk keeps no paper */
    const d = seat ? this.desks[seat] : undefined;
    if (!d || d.tray === tray) return;
    d.tray = tray;
    this.deskSync(seat);
  }
  /** The forget moment (≈ 2 s, seated): a line written, the paper drops onto the desk, a reset blink (monitor off,
      a brief brightening — a reboot, not a faint), back to work. Walking / held / reduced motion: the paper just
      appears and the glyph flips. */
  async forgot(id: string): Promise<void> {
    const rec = this.actors[id];
    if (!rec) return;
    const d = this.desks[rec.seat];
    const calm = rec.walking || rec.held || reducedMotion();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    rec.fresh = true;
    this.card(rec);
    if (!calm) {
      setPose(rec.hero, 'writing', { seated: true, holding: 'pen', props: false, moving: false });
      await wait(600);
      if (!this.alive) return;
    }
    if (d) {
      d.tray = 'new';
      this.deskSync(rec.seat);
      const t = d.el.querySelector('.d-tray');
      if (t && !calm) {
        t.classList.remove('drop');
        void (t as SVGGraphicsElement).getBBox?.();
        t.classList.add('drop');
      }
    }
    rec.blank = true;
    this.deskSync(rec.seat);
    if (!calm) {
      rec.wrap.classList.add('r-reset');
      setTimeout(() => rec.wrap.classList.remove('r-reset'), 500);
    }
    await wait(400);
    rec.blank = false;
    if (!this.alive) return;
    this.deskSync(rec.seat);
    if (!calm) await wait(300);
    if (this.alive && !rec.walking) this.dress(rec);
  }
  /** A guest came in: the door opens, they walk from the door to their desk, wave, then get to it. */
  async arrive(id: string): Promise<void> {
    const rec = this.actors[id];
    if (!rec) return;
    if (reducedMotion()) {
      rec.wrap.classList.add('fade-in');
      setTimeout(() => rec.wrap.classList.remove('fade-in'), 200);
      return;
    }
    const door = this.anchor('door');
    this.moveNow(rec, door.x, door.y);
    rec.at = 'door';
    this.door(true);
    const ok = await this.walkTo(id, rec.seat);
    this.door(false);
    if (!ok) return;
    setPose(rec.hero, 'waving', { seated: false, holding: 'none', props: false, moving: false });
    setFacing(rec.hero, 'front');
    await new Promise((r) => setTimeout(r, 900));
    if (this.alive && !rec.walking) this.dress(rec);
  }
  /** A guest went home: they stand, walk to the door, the door opens and closes behind them. */
  async depart(id: string): Promise<void> {
    const rec = this.actors[id];
    if (!rec) return;
    if (reducedMotion()) {
      rec.wrap.classList.add('blink-out');
      await new Promise((r) => setTimeout(r, 160));
      rec.wrap.classList.add('gone');
      return;
    }
    const ok = await this.walkTo(id, 'door');
    if (!ok || !this.alive) return;
    this.door(true);
    rec.wrap.classList.add('gone');
    await new Promise((r) => setTimeout(r, 360));
    this.door(false);
  }
  /** The bell plate wiggles once (art: reduced motion drops it). */
  ringBell(): void {
    const b = this.art?.querySelector('#otBell');
    if (!b) return;
    b.classList.remove('wiggle');
    void (b as SVGGraphicsElement).getBBox?.();
    b.classList.add('wiggle');
  }
  /** Desk-level hotspots: a note on someone's desk, a team's binder (world coordinates). */
  deskSpot(key: string): { x: number; y: number; w: number; h: number; z: number } | null {
    const m = /^(note|binder):(.+)$/.exec(key);
    if (!m) return null;
    const seat = m[1] === 'note' ? this.plan.home[m[2]] : this.binders[m[2]];
    const b = seat ? deskSpot(this.plan, seat, m[1] as 'note' | 'binder') : null;
    return b && seat ? { x: b.x, y: b.y, w: b.w, h: b.h, z: Math.round(this.plan.seats[seat].y) + 8 } : null;
  }

  /** The wall's live bits (whiteboard, health grades, outbox flag, work clock, tray sheets). */
  syncFacts(facts: BoardFacts): void {
    syncArt(this.art, facts);
  }
  door(open: boolean): void {
    setDoor(this.art, open);
  }
  spinDial(): void {
    const dial = this.art?.querySelector('#safeDial');
    if (!dial || reducedMotion()) return;
    dial.classList.remove('spin');
    void (dial as SVGGraphicsElement).getBBox?.();
    dial.classList.add('spin');
  }

  /* ---------------------------------------------------------- anchors + walking */
  anchor(id: string): Pt {
    const P = this.plan;
    if (id === 'director') return { ...P.director };
    if (P.seats[id]) return { x: P.seats[id].x, y: P.seats[id].y };
    const near = /^near:(.+)$/.exec(id);
    if (near) {
      /* standing beside someone's desk (a handoff), on the room's inner side */
      /* beside their desk (where they'll do the review — a sleeper wakes up and walks there) */
      const r = this.actors[near[1]];
      const at = r ? (P.seats[r.seat] ?? { x: r.x, y: r.y }) : null;
      if (at) return { x: at.x + (at.x > P.W / 2 ? -78 : 78), y: at.y + 14 };
    }
    const m = /^couch-(\d)$/.exec(id);
    if (m) return { ...P.couch[(+m[1] - 1) % P.couch.length] };
    const o = OBJECT_ANCHORS.has(id) ? P.objects[id as ObjectId] : undefined;
    if (o?.stand) return { ...o.stand };
    return { x: P.W / 2, y: 600 };
  }
  private lane(p: Pt) {
    const P = this.plan;
    return P.rows.length > 1 && p.y > (P.rows[0] + P.rows[1]) / 2 ? P.lanes.mid : P.lanes.back;
  }
  private route(a: Pt, b: Pt): Pt[] {
    const P = this.plan;
    const la = this.lane(a);
    const lb = this.lane(b);
    const pts: Pt[] = [];
    const push = (x: number, y: number) => {
      const l = pts[pts.length - 1] ?? a;
      if (Math.abs(l.x - x) > 1 || Math.abs(l.y - y) > 1) pts.push({ x, y });
    };
    if (la === lb || !P.gaps.length) {
      if (Math.abs(a.y - la) < 24 && Math.abs(b.y - lb) < 24) {
        push(b.x, b.y);
        return pts;
      }
      push(a.x, la);
      push(b.x, la);
      push(b.x, b.y);
    } else {
      const g = P.gaps.reduce(
        (best, x) =>
          Math.abs(a.x - x) + Math.abs(b.x - x) < Math.abs(a.x - best) + Math.abs(b.x - best) ? x : best,
        P.gaps[0],
      );
      push(a.x, la);
      push(g, la);
      push(g, lb);
      push(b.x, lb);
      push(b.x, b.y);
    }
    return pts;
  }
  private moveNow(rec: Rec, x: number, y: number) {
    rec.x = x;
    rec.y = y;
    rec.wrap.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    rec.wrap.style.zIndex = String(Math.round(y));
    rec.btn.style.setProperty('--s', (depth(y) * (rec.id === this.cfg.director ? 1.04 : 1)).toFixed(3));
  }
  private faceTo(rec: Rec, p: Pt) {
    const dx = p.x - rec.x;
    const dy = p.y - rec.y;
    if (Math.abs(dx) > 2) {
      rec.dir = dx < 0 ? 'left' : 'right';
      setFacing(rec.hero, 'side', { dir: rec.dir });
    } else if (dy > 0) setFacing(rec.hero, 'front');
    else setFacing(rec.hero, 'side', { dir: rec.dir });
  }
  /** One continuous glide at constant speed; a newer walk cancels an older one from where the robot is. */
  async walkTo(id: string, target: string, o: { pose?: string; holding?: string } = {}): Promise<boolean> {
    const rec = this.actors[id];
    if (!rec) return false;
    const to = this.anchor(target);
    const tok = ++rec.walkTok;
    rec.walking = true;
    setPose(rec.hero, o.pose ?? 'walking', {
      seated: false,
      holding: o.holding ?? 'none',
      props: false,
      moving: true,
    });
    rec.btn.style.setProperty('--lift', '0px');
    rec.wrap.classList.add('walking');
    if (reducedMotion()) {
      rec.wrap.classList.add('blink-out');
      await new Promise((r) => setTimeout(r, 160));
      if (rec.walkTok !== tok) return false;
      this.moveNow(rec, to.x, to.y);
      rec.wrap.classList.remove('blink-out');
    } else await this.glide(rec, this.route({ x: rec.x, y: rec.y }, to), tok);
    if (rec.walkTok !== tok || !this.alive) return false;
    rec.walking = false;
    rec.wrap.classList.remove('walking');
    rec.at = target;
    return true;
  }
  private glide(rec: Rec, pts: Pt[], tok: number): Promise<void> {
    return new Promise((res) => {
      if (!pts.length) return res();
      const v = 230;
      let i = 0;
      let last = 0;
      this.faceTo(rec, pts[0]);
      const step = (now: number) => {
        if (rec.walkTok !== tok || !this.alive) return res();
        const dt = last ? Math.min(50, now - last) / 1000 : 0;
        last = now;
        let move = v * dt;
        while (move > 0 && i < pts.length) {
          const p = pts[i];
          const dx = p.x - rec.x;
          const dy = p.y - rec.y;
          const d = Math.hypot(dx, dy);
          if (d <= move) {
            this.moveNow(rec, p.x, p.y);
            move -= d;
            if (++i < pts.length) this.faceTo(rec, pts[i]);
          } else {
            this.moveNow(rec, rec.x + (dx / d) * move, rec.y + (dy / d) * move);
            move = 0;
          }
        }
        if (i >= pts.length) return res();
        tick();
      };
      /* rAF when frames paint; a timer fallback when they don't (hidden tab, headless) */
      const tick = () => {
        let done = false;
        const go = () => {
          if (!done) {
            done = true;
            step(performance.now());
          }
        };
        requestAnimationFrame(go);
        setTimeout(go, 48);
      };
      tick();
    });
  }

  /** A filed report: the author carries it to the tray and back (≈ 4 s; reduced motion: no walk). */
  async deliver(id: string, onDrop: () => void): Promise<void> {
    const rec = this.actors[id];
    if (!rec || reducedMotion() || rec.walking || rec.held) return onDrop();
    const home = rec.at;
    const ok = await this.walkTo(id, 'reports', { pose: 'carrying', holding: 'paper' });
    onDrop();
    if (!ok) return;
    await new Promise((r) => setTimeout(r, 350));
    if (await this.walkTo(id, home)) this.dress(rec);
  }

  /** A handoff: `from` carries the work to `to`'s desk, `to` turns to take it, `from` walks home
      (≈ 3–5 s). Calm: at most two at once; reduced motion / busy walker = no walk (the whiteboard
      and the robots' own poses still say it). */
  private handing = 0;
  async handoff(from: string, to: string): Promise<void> {
    const a = this.actors[from];
    const b = this.actors[to];
    if (!a || !b || from === to || reducedMotion() || a.walking || a.held || this.handing >= 2) return;
    this.handing++;
    try {
      const home = a.at;
      const ok = await this.walkTo(from, `near:${to}`, { pose: 'carrying', holding: 'paper' });
      if (!ok) return;
      if (!b.walking && !b.held) {
        setFacing(b.hero, 'three-quarter', { dir: a.x < b.x ? 'left' : 'right' });
      }
      await new Promise((r) => setTimeout(r, 650));
      if (await this.walkTo(from, home)) this.dress(a);
      setTimeout(() => {
        if (!b.walking && !b.held) this.dress(b);
      }, 900);
    } finally {
      this.handing--;
    }
  }
  /** A reviewer approved: one small hop. */
  approve(id: string): void {
    this.react(id, 'hop');
  }

  /* ---------------------------------------------------------- talk: "…" only */
  async say(id: string, o: { to?: string; ms?: number } = {}): Promise<void> {
    const rec = this.actors[id];
    if (!rec) return;
    const b = rec.btn.querySelector<HTMLElement>('.o-bubble');
    if (!b) return;
    b.hidden = false;
    b.classList.remove('to-left', 'to-right');
    const to = o.to ? this.actors[o.to] : undefined;
    if (to) {
      b.classList.add(to.x < rec.x ? 'to-left' : 'to-right');
      if (!rec.walking && !rec.held)
        setFacing(rec.hero, 'three-quarter', { dir: to.x < rec.x ? 'left' : 'right' });
    }
    rec.wrap.classList.add('speaking');
    await new Promise((r) => setTimeout(r, o.ms ?? 1500));
    b.hidden = true;
    rec.wrap.classList.remove('speaking');
  }

  /* ---------------------------------------------------------- facing the viewer */
  face(id: string): void {
    const r = this.actors[id];
    if (!r) return;
    r.held = true;
    r.wrap.classList.add('held');
    if (r.actor.kind !== 'sleeping' && !r.walking) setFacing(r.hero, 'front');
  }
  unface(id: string): void {
    const r = this.actors[id];
    if (!r?.held) return;
    r.held = false;
    r.wrap.classList.remove('held');
    this.dress(r);
  }
  react(id: string, kind: 'hop' | 'roll' | 'snug' | 'stretch'): void {
    const r = this.actors[id];
    if (!r || reducedMotion()) return;
    const cls = `r-${kind}`;
    r.wrap.classList.remove(cls);
    void r.wrap.offsetWidth;
    r.wrap.classList.add(cls);
    clearTimeout(r.rt);
    r.rt = setTimeout(() => r.wrap.classList.remove(cls), 1400);
  }
  /** A small real button floating by a robot (e.g. "Chat anyway" on a sleeper). */
  chip(id: string, label: string, onClick: () => void): void {
    const r = this.actors[id];
    if (!r) return;
    for (const c of this.fx.querySelectorAll('.o-chip')) c.remove();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'o-chip';
    b.textContent = label;
    const H = parseFloat(r.btn.style.getPropertyValue('--H')) || 176;
    b.style.transform = `translate(${r.x}px,${r.y - H * depth(r.y) * 0.8}px)`;
    b.onclick = (e) => {
      e.stopPropagation();
      b.remove();
      onClick();
    };
    this.fx.appendChild(b);
    clearTimeout(this.chipT);
    this.chipT = setTimeout(() => b.remove(), 6000);
  }

  /* ---------------------------------------------------------- camera */
  fit(): void {
    const vp = this.box.parentElement;
    if (!vp) return;
    const Wv = vp.clientWidth;
    const H = Math.max(120, vp.clientHeight - this.cfg.drawer());
    const k = Math.min(Wv / this.plan.W, H / ROOM_H) || 1;
    this.k = k;
    this.ox = (Wv - this.plan.W * k) / 2;
    this.oy = (H - ROOM_H * k) / 2;
    this.box.style.transform = `translate(${this.ox}px,${this.oy}px) scale(${k})`;
    this.box.style.setProperty('--k', String(k));
    if (this.zoom.obj) this.zoomTo(this.zoom.obj, true);
  }
  /** Fit an object's bounds into the viewport; null = back to the whole office. */
  zoomTo(obj: ObjectId | null, quiet = false): void {
    const o = obj ? this.plan.objects[obj] : null;
    const b = o ? { x: o.x - 16, y: o.y - 16, w: o.w + 32, h: o.h + 32 } : null;
    const vp = this.box.parentElement;
    if (!vp) return;
    const Wv = vp.clientWidth;
    const H = vp.clientHeight;
    let z = 1;
    let tx = 0;
    let ty = 0;
    if (b) {
      const by = b.y + 70; /* world → box (the world sits 70 px down the box) */
      z = Math.min((Wv * 0.94) / (b.w * this.k), (H * 0.9) / (b.h * this.k));
      const ccx = (Wv / 2 - this.ox) / this.k;
      const ccy = (H / 2 - this.oy) / this.k;
      tx = ccx - z * (b.x + b.w / 2);
      ty = ccy - z * (by + b.h / 2);
    }
    this.zoom = { obj };
    this.box.classList.toggle('zoomed', !!obj);
    const cam = this.cam;
    const box = this.box;
    const settle = () => {
      cam.classList.remove('moving');
      box.style.setProperty('--z', String(z));
      this.cfg.stage()?.classList.toggle('settled', !!obj);
    };
    clearTimeout(this.zt);
    cam.classList.toggle('quiet', quiet);
    const tf = b ? `translate(${tx}px,${ty}px) scale(${z})` : '';
    if (quiet || reducedMotion()) {
      cam.style.transform = tf;
      settle();
    } else {
      this.cfg.stage()?.classList.remove('settled');
      cam.classList.add('moving');
      requestAnimationFrame(() => {
        cam.style.transform = tf;
      });
      this.zt = setTimeout(settle, 560);
    }
  }

  /** Where a robot or object is (keyboard arrow navigation). */
  pos(key: string): Pt {
    if (key.startsWith('obj:')) {
      const o = this.plan.objects[key.slice(4) as ObjectId] ?? this.deskSpot(key.slice(4));
      return o ? { x: o.x + o.w / 2, y: o.y + o.h / 2 } : { x: 0, y: 0 };
    }
    const r = this.actors[key];
    return r ? { x: r.x, y: r.y - 50 } : { x: 0, y: 0 };
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
