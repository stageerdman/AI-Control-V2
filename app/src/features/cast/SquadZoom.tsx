/* Team squad zoom — the roll call pushes away and the crew walks up onto the big stage in
   formation (captain front & centre with the armband, 6th/7th on a back row), the team's
   giant faint emblem behind them. Panel: emblem picker, name, blurb, colour, "What this team
   does", "How this team codes", "Files reports", crew list; a member's panel = job on this team,
   make captain, remove (Undo). "+ Add to crew" raises the lineup strip from the floor.
   A new team (#cast/teams/new) is a draft until it has a name and one member.
   The formation is imperative (walks, FLIPs, cheers); everything else is React. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Agent, Team, TeamPatch } from '../../api/types';
import { Emblem, hero, setFacing, setPose } from '../../characters';
import { hueHex } from '../../design/palette';
import { go } from '../../shell/router';
import { toast } from '../../ui';
import { castApi } from './api';
import {
  after,
  announce,
  fireConfetti,
  flip,
  hop,
  pingSaved,
  place,
  reducedMotion,
  sparkle,
  trapTab,
} from './fx';
import {
  addLocal,
  candidates,
  captainLocal,
  formationSpot,
  jobLocal,
  newTeamLook,
  orderedMembers,
  removeLocal,
  roleText,
  stageDims,
  TEAM_MAX,
} from './model';
import { createTeam, deleteTeam, flushAll, patchTeam, patchTeamSoon, setJobSoon, teamOp } from './store';
import { MemberPanel, TeamPanel } from './TeamPanels';

export type SquadZoomProps = {
  id: string;
  animate: boolean;
  closing: boolean;
  onClosed: () => void;
  onCreated: (id: string) => void;
  agents: Agent[];
  teams: Team[];
};

type Anim = { before?: Map<string, DOMRect>; walkIn?: string; walkFrom?: DOMRect } | null;

function newDraft(teams: Team[]): Team {
  return {
    id: '',
    name: '',
    blurb: '',
    instr: '',
    code: '',
    ...newTeamLook(teams),
    captainId: null,
    members: [],
    reporter: false,
    projectIds: [],
    createdAt: '',
    updatedAt: '',
  };
}
const sceneOf = (el: Element | null) => el?.closest('.scene') as HTMLElement | null;
const worldOf = (scene: HTMLElement | null) => scene?.querySelector('.cast-world') as HTMLElement | null;

export function SquadZoom(p: SquadZoomProps) {
  const zRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Team | null>(() => (p.id === 'new' ? newDraft(p.teams) : null));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [createdId, setCreatedId] = useState<string | null>(null);
  const creating = useRef(false);
  const [dims, setDims] = useState<{ W: number; H: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [drill, setDrill] = useState<'in' | 'out' | null>(null);
  const [strip, setStrip] = useState(false);
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const anim = useRef<Anim>(null);
  const opening = useRef<{ crew: DOMRect | null; em: DOMRect | null; row: HTMLElement | null } | null>(null);

  const realId = p.id === 'new' ? createdId : p.id;
  const live = realId ? p.teams.find((t) => t.id === realId) : undefined;
  const team = live ?? (realId ? undefined : (draft ?? undefined));
  const teamRef = useRef(team);
  teamRef.current = team;
  const byId = new Map(p.agents.map((a) => [a.id, a]));
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const saved = useCallback(() => pingSaved(panelRef.current), []);

  useEffect(() => {
    if (realId && !live && !p.closing) location.replace('#cast/teams');
  }, [realId, live, p.closing]);

  /* ---------- ops: a draft edits itself; a real team saves (optimistic) ---------- */
  const commitDraft = (d: Team) => {
    if (creating.current || !d.name.trim() || !d.members.length) return;
    creating.current = true;
    const { name, blurb, color, emblem, instr, code, reporter, captainId, members } = d;
    void createTeam({ name, blurb, color, emblem, instr, code, reporter, captainId, members }).then((t) => {
      creating.current = false;
      if (!t) return;
      const now = draftRef.current;
      if (now) {
        const diff: TeamPatch = {};
        for (const k of ['name', 'blurb', 'color', 'emblem', 'instr', 'code', 'reporter'] as const)
          if (now[k] !== d[k]) (diff as Record<string, unknown>)[k] = now[k];
        if (Object.keys(diff).length) void patchTeam(t.id, diff);
      }
      setCreatedId(t.id);
      p.onCreated(t.id);
      location.replace(`#cast/teams/${encodeURIComponent(t.id)}`);
      fireConfetti();
      announce(`${t.name} is official.`);
    });
  };
  const editDraft = (fn: (t: Team) => Team) => {
    const d = fn(draftRef.current as Team);
    draftRef.current = d;
    setDraft(d);
    commitDraft(d);
  };
  const op = {
    fields(patch: TeamPatch, soon = false) {
      if (realId) {
        if (soon) patchTeamSoon(realId, patch, saved);
        else void patchTeam(realId, patch, saved);
      } else editDraft((t) => ({ ...t, ...(patch as Partial<Team>) }));
    },
    add(agentId: string) {
      if (realId)
        void teamOp(
          realId,
          (t) => addLocal(t, agentId),
          () => castApi.teams.addMember(realId, agentId),
          {
            onSaved: saved,
            members: true,
          },
        );
      else editDraft((t) => addLocal(t, agentId));
    },
    remove(agentId: string) {
      if (realId)
        void teamOp(
          realId,
          (t) => removeLocal(t, agentId)?.team ?? t,
          () => castApi.teams.removeMember(realId, agentId),
          {
            members: true,
          },
        );
      else editDraft((t) => removeLocal(t, agentId)?.team ?? t);
    },
    readd(agentId: string, instr: string, at: number, cap: boolean) {
      const local = (t: Team) => {
        const back = addLocal(t, agentId, instr, Math.min(at, t.members.length));
        return cap ? captainLocal(back, agentId) : back;
      };
      const tid = realId;
      if (tid)
        void teamOp(
          tid,
          local,
          async () => {
            const t = await castApi.teams.readd(
              tid,
              agentId,
              instr,
              Math.min(at, teamRef.current?.members.length ?? at),
            );
            return cap ? castApi.teams.update(tid, { captainId: agentId }) : t;
          },
          { members: true },
        );
      else editDraft(local);
    },
    captain(agentId: string) {
      if (realId)
        void teamOp(
          realId,
          (t) => captainLocal(t, agentId),
          () => castApi.teams.update(realId, { captainId: agentId }),
          {
            onSaved: saved,
          },
        );
      else editDraft((t) => captainLocal(t, agentId));
    },
    job(agentId: string, instr: string) {
      if (realId) setJobSoon(realId, agentId, instr, saved);
      else editDraft((t) => jobLocal(t, agentId, instr));
    },
  };

  /* ---------- open: measure the row, place the overlay ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useLayoutEffect(() => {
    const z = zRef.current;
    const scene = sceneOf(z);
    if (!z || !scene) return;
    const row = scene.querySelector<HTMLElement>(`.team-row[data-id="${CSS.escape(p.id)}"]`);
    if (row) row.classList.remove('hot');
    opening.current = {
      crew: p.animate && row ? (row.querySelector('.tr-crew')?.getBoundingClientRect() ?? null) : null,
      em: p.animate && row ? (row.querySelector('.tr-emblem')?.getBoundingClientRect() ?? null) : null,
      row,
    };
    place(z, scene);
    const measure = () => {
      const st = stageRef.current;
      setDims({ W: st?.clientWidth || 800, H: st?.clientHeight || 600 });
    };
    measure();
    const onResize = () => {
      place(z, scene);
      measure();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      flushAll();
      const world = worldOf(scene);
      world?.classList.remove('pushing', 'instant');
      scene.classList.remove('zoomed');
      for (const li of scene.querySelectorAll('.tr-li')) li.classList.remove('is-flying', 'up', 'down');
    };
  }, []);

  function rowsAround(scene: HTMLElement, row: HTMLElement | null) {
    const rows = [...scene.querySelectorAll('.rollcall .tr-li')];
    const idx = row ? rows.indexOf(row.parentElement as Element) : -1;
    rows.forEach((li, i) => {
      li.classList.toggle('up', i < idx);
      li.classList.toggle('down', i > idx);
    });
  }

  function runOpen() {
    const z = zRef.current;
    const o = opening.current;
    opening.current = null;
    const scene = sceneOf(z);
    const world = worldOf(scene);
    if (!z || !o || !scene || !world) return;
    rowsAround(scene, o.row);
    const a = !!o.crew && !reducedMotion();
    if (a && o.row) {
      o.row.parentElement?.classList.add('is-flying');
      world.classList.add('pushing');
      flip(z.querySelector('.sq-form'), o.crew, { duration: 520 });
      flip(z.querySelector('.sq-id .emblem'), o.em, { duration: 520 });
    } else {
      world.classList.add('pushing', 'instant');
      if (p.animate) z.classList.add('fade-in');
    }
    setTimeout(
      () => {
        if (!z.isConnected || reducedMotion()) return;
        z.querySelectorAll('.sq-m .hero').forEach((h, i) => {
          setTimeout(() => hop(h), i * 60);
        });
      },
      a ? 520 : 60,
    );
    setTimeout(
      () => {
        if (z.isConnected) z.querySelector<HTMLElement>(p.id === 'new' ? '.zp-title' : '#sqTitle')?.focus();
      },
      a ? 300 : 30,
    );
  }

  /* ---------- the formation ---------- */
  const order = team ? orderedMembers(team) : [];
  const formKey = JSON.stringify([
    order.map((m) => {
      const a = byId.get(m.agentId);
      return [m.agentId, a?.name, a?.look, a ? roleText(a) : ''];
    }),
    team?.captainId,
    team?.color,
    dims,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: rebuilt when the crew, its looks, the colour or the stage size change
  useLayoutEffect(() => {
    const form = formRef.current;
    const t = teamRef.current;
    if (!form || !dims || !t) return;
    const a = anim.current;
    anim.current = null;
    renderFormation(form, t, byIdRef.current, dims, a, {
      select: (id) => selectRef.current(id),
      openStrip: () => openStripRef.current(),
    });
    lookAtSelected(form, selRef.current);
    if (opening.current) runOpen();
  }, [formKey]);
  const selRef = useRef(sel);
  selRef.current = sel;
  useEffect(() => {
    if (formRef.current) lookAtSelected(formRef.current, sel);
  }, [sel]);

  const formationRects = () => {
    const m = new Map<string, DOMRect>();
    formRef.current?.querySelectorAll<HTMLElement>('.sq-m[data-id]').forEach((b) => {
      const h = b.querySelector('.hero');
      if (h && b.dataset.id) m.set(b.dataset.id, h.getBoundingClientRect());
    });
    return m;
  };
  const cheer = (id: string) => {
    const a = byIdRef.current.get(id);
    announce(`${a?.name} is now captain of ${teamRef.current?.name || 'the new team'}.`);
    if (reducedMotion()) return;
    setTimeout(() => {
      const b = formRef.current?.querySelector(`.sq-m[data-id="${CSS.escape(id)}"]`);
      if (!b) return;
      const r = b.getBoundingClientRect();
      sparkle(((r.left + r.width / 2) / innerWidth) * 100, ((r.top + r.height * 0.35) / innerHeight) * 100);
      formRef.current?.querySelectorAll<HTMLElement>('.sq-m[data-id] .hero').forEach((h) => {
        setPose(h, 'celebrating');
        setTimeout(() => h.isConnected && setPose(h, 'idle'), 900);
      });
    }, 460);
  };

  /* ---------- member select / back ---------- */
  const select = (id: string) => {
    if (!teamRef.current?.members.some((m) => m.agentId === id)) return;
    setStrip(false);
    setPicker(false);
    setSel(id);
    setDrill('in');
    hop(formRef.current?.querySelector(`.sq-m[data-id="${CSS.escape(id)}"] .hero`));
    setTimeout(() => zRef.current?.querySelector<HTMLElement>('#sqMember')?.focus(), 30);
  };
  const selectRef = useRef(select);
  selectRef.current = select;
  const backToTeam = (focusAgent?: string | null) => {
    flushAll();
    setSel(null);
    setDrill('out');
    setTimeout(() => {
      const z = zRef.current;
      const name = focusAgent ? byIdRef.current.get(focusAgent)?.name : null;
      const row = name
        ? [...(z?.querySelectorAll<HTMLElement>('.sq-row') ?? [])].find((b) =>
            b.getAttribute('aria-label')?.startsWith(`${name},`),
          )
        : null;
      (row ?? z?.querySelector<HTMLElement>('#sqTitle'))?.focus();
    }, 0);
  };

  const makeCaptain = (id: string) => {
    if (teamRef.current?.captainId === id) return;
    anim.current = { before: formationRects() };
    op.captain(id);
    cheer(id);
  };

  const removeFromCrew = (id: string) => {
    const t = teamRef.current;
    const a = byIdRef.current.get(id);
    if (!t || !a) return;
    const res = removeLocal(t, id);
    if (!res) return;
    const b = formRef.current?.querySelector<HTMLElement>(`.sq-m[data-id="${CSS.escape(id)}"]`);
    const finish = () => {
      anim.current = { before: formationRects() };
      op.remove(id);
      setSel(null);
      setDrill('out');
      setTimeout(() => zRef.current?.querySelector<HTMLElement>('#sqTitle')?.focus(), 0);
      const promoted = res.wasCaptain && res.team.captainId ? byIdRef.current.get(res.team.captainId) : null;
      if (promoted) cheer(promoted.id);
      announce(`${a.name} left the crew.${promoted ? ` ${promoted.name} is now captain.` : ''}`);
      toast(`${a.name} left the crew`, {
        undo: () => {
          const now = teamRef.current;
          if (!now || now.members.some((m) => m.agentId === id) || now.members.length >= TEAM_MAX) return;
          anim.current = { before: formationRects() };
          op.readd(id, res.member.instr, res.index, res.wasCaptain);
          announce(`${a.name} is back on ${now.name || 'the crew'}.`);
        },
      });
    };
    if (!b || reducedMotion()) {
      finish();
      return;
    }
    const h = b.querySelector<HTMLElement>('.hero');
    b.classList.remove('sel');
    setPose(h, 'waving');
    setFacing(h, 'front');
    setTimeout(() => {
      setPose(h, 'walking');
      setFacing(h, 'side', { dir: 'right' });
      const st = stageRef.current?.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      after(
        b.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: `translateX(${(st?.right ?? r.right) - r.left + 40}px)`, opacity: 0 },
          ],
          { duration: 520, easing: 'ease-in', fill: 'forwards' },
        ),
        finish,
      );
    }, 380);
  };

  /* ---------- the add-to-crew strip ---------- */
  const openStrip = () => {
    const t = teamRef.current;
    if (!t) return;
    if (t.members.length >= TEAM_MAX) {
      announce(`Crew full — ${TEAM_MAX} is the max. The director can call more than one team.`);
      return;
    }
    if (selRef.current) {
      setSel(null);
      setDrill('out');
    }
    setPicker(false);
    setStrip(true);
    setTimeout(() => zRef.current?.querySelector<HTMLElement>('.sq-cand, .sq-strip-done')?.focus(), 60);
  };
  const openStripRef = useRef(openStrip);
  openStripRef.current = openStrip;
  const closeStrip = (silent?: boolean) => {
    setStrip(false);
    if (!silent)
      setTimeout(
        () =>
          (
            zRef.current?.querySelector<HTMLElement>('.sq-add') ??
            zRef.current?.querySelector<HTMLElement>('#sqTitle')
          )?.focus(),
        0,
      );
  };
  const closeStripRef = useRef(closeStrip);
  closeStripRef.current = closeStrip;
  const addFromStrip = (id: string, cand: HTMLElement) => {
    const t = teamRef.current;
    const a = byIdRef.current.get(id);
    if (!t || !a || t.members.length >= TEAM_MAX) return;
    const from = cand.querySelector('.hero')?.getBoundingClientRect();
    const first = !t.members.length;
    const li = cand.parentElement;
    const nextId = (li?.nextElementSibling ?? li?.previousElementSibling)?.querySelector<HTMLElement>(
      '.sq-cand',
    )?.dataset.id;
    anim.current = { before: formationRects(), walkIn: id, walkFrom: from };
    op.add(id);
    const n = t.members.length + 1;
    announce(`${a.name} joined ${t.name || 'the crew'}. ${n} of ${TEAM_MAX}.`);
    if (first) cheer(id);
    if (n >= TEAM_MAX) {
      closeStrip();
      toast('Crew full — the director can call more than one team.');
      return;
    }
    setTimeout(() => {
      const z = zRef.current;
      (
        (nextId && z?.querySelector<HTMLElement>(`.sq-cand[data-id="${CSS.escape(nextId)}"]`)) ||
        z?.querySelector<HTMLElement>('.sq-strip-done')
      )?.focus();
    }, 0);
  };

  /* clicking the empty stage closes the strip (Esc does too) */
  const stripRef = useRef(strip);
  stripRef.current = strip;
  useEffect(() => {
    const st = stageRef.current;
    const onClick = (e: MouseEvent) => {
      if (stripRef.current && !(e.target as HTMLElement).closest('.sq-strip,.sq-add,.sq-m'))
        closeStripRef.current();
    };
    st?.addEventListener('click', onClick);
    return () => st?.removeEventListener('click', onClick);
  }, []);

  /* ---------- close: the crew goes back into its row ---------- */
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the route leaves the squad
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
    const id = realId ?? 'new';
    const row = scene.querySelector<HTMLElement>(`.team-row[data-id="${CSS.escape(id)}"]`);
    rowsAround(scene, row);
    const done = () => {
      scene.classList.remove('zoomed');
      world.classList.remove('instant');
      row?.parentElement?.classList.remove('is-flying');
      p.onClosed();
      (row ?? scene.querySelector<HTMLElement>('.team-row'))?.focus({ preventScroll: true });
    };
    if (!p.animate || reducedMotion() || !row) {
      world.classList.remove('pushing');
      if (p.animate) {
        z.classList.add('fade-out');
        setTimeout(done, 170);
      } else done();
      return;
    }
    row.parentElement?.classList.add('is-flying');
    const crewR = row.querySelector('.tr-crew')?.getBoundingClientRect();
    const emR = row.querySelector('.tr-emblem')?.getBoundingClientRect();
    world.classList.remove('instant');
    void world.offsetWidth;
    z.classList.add('leaving');
    world.classList.remove('pushing');
    flip(z.querySelector('.sq-id .emblem'), emR, { reverse: true, duration: 420 });
    after(flip(z.querySelector('.sq-form'), crewR, { reverse: true, duration: 420 }), done);
  }, [p.closing]);

  /* ---------- keyboard: Esc backs out one level (picker → strip → member → team → list) ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = zRef.current;
      if (!z || p.closing) return;
      /* a sheet on top (the team's drawing) owns Esc and Tab */
      if (document.querySelector('.scrim')) return;
      if (e.key === 'Tab') {
        trapTab(e, z);
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      if (picker) {
        setPicker(false);
        setPreview(null);
        setTimeout(() => z.querySelector<HTMLElement>('.sq-em-btn')?.focus(), 0);
        return;
      }
      if (strip) {
        closeStrip();
        return;
      }
      if (sel) {
        backToTeam(sel);
        return;
      }
      go('cast/teams');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!team) return null;
  const hex = hueHex(team.color);
  const full = team.members.length >= TEAM_MAX;
  const selAgent = sel ? byId.get(sel) : undefined;
  const selMember = sel ? team.members.find((m) => m.agentId === sel) : undefined;
  const cands = candidates(p.agents, team);
  return (
    <section
      ref={zRef}
      className="zoom zoom-squad"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sqTitle"
      style={{ '--team': hex } as React.CSSProperties}
    >
      <div className="z-bg" aria-hidden="true" />
      <div
        ref={stageRef}
        className={`z-stage sq-stage${team.members.length ? '' : ' empty'}${strip ? ' strip-open' : ''}${sel ? ' has-sel' : ''}`}
      >
        <button className="z-back" type="button" onClick={() => go('cast/teams')}>
          <span aria-hidden="true">←</span> Teams
        </button>
        <div className="sq-mark" aria-hidden="true">
          <Emblem id={preview ?? team.emblem} color={team.color} size={360} decorative />
        </div>
        <div className="z-cone" aria-hidden="true" />
        <div className="z-floor" aria-hidden="true" />
        <div className="sq-form" ref={formRef} />
        <div className="sq-floorbar" hidden={strip}>
          {full ? (
            <span className="sq-full">
              Crew full · {team.members.length}/{TEAM_MAX}
            </span>
          ) : (
            <button
              type="button"
              className="btn-glass sq-add"
              onClick={(e) => {
                e.stopPropagation();
                openStrip();
              }}
            >
              + Add to crew
            </button>
          )}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: the prototype's labelled strip */}
        <div className="sq-strip" role="region" aria-label="Add to crew" hidden={!strip}>
          {strip && (
            <>
              <div className="sq-strip-head">
                <b>Who joins the crew?</b>
                <span>
                  {team.members.length}/{TEAM_MAX} · max {TEAM_MAX} per crew
                </span>
                <button
                  type="button"
                  className="btn-glass sq-strip-done"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeStrip();
                  }}
                >
                  Done
                </button>
              </div>
              {/* biome-ignore lint/a11y/useSemanticElements: the prototype's strip list */}
              <div className="sq-strip-list" role="list">
                {!cands.length && <p className="zp-empty">Everyone in the cast is already on this crew.</p>}
                {cands.map((a) => (
                  // biome-ignore lint/a11y/useSemanticElements: the prototype's strip list
                  <div key={a.id} className="sq-cand-li" role="listitem">
                    <button
                      type="button"
                      className="sq-cand"
                      data-id={a.id}
                      aria-label={`Add ${a.name}, ${roleText(a)}`}
                      onMouseEnter={(e) => hop(e.currentTarget.querySelector('.hero'))}
                      onClick={(e) => {
                        e.stopPropagation();
                        addFromStrip(a.id, e.currentTarget);
                      }}
                    >
                      <span className="sq-cand-fig">
                        <CandHero agent={a} />
                      </span>
                      <b>{a.name}</b>
                      <span>{roleText(a)}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {sel && selAgent && selMember ? (
        <MemberPanel
          key={`m-${sel}`}
          ref={panelRef}
          team={team}
          agent={selAgent}
          job={selMember.instr}
          onJob={(v) => op.job(sel, v)}
          onBack={() => backToTeam(sel)}
          onCaptain={() => makeCaptain(sel)}
          onRemove={() => removeFromCrew(sel)}
        />
      ) : (
        <TeamPanel
          key={`t-${drill === 'out' ? 'drill' : 'open'}`}
          ref={panelRef}
          team={team}
          teams={p.teams}
          byId={byId}
          drill={drill === 'out'}
          picker={picker}
          setPicker={(on) => {
            setPicker(on);
            if (!on) setPreview(null);
          }}
          onPreview={setPreview}
          onField={(patch, soon) => op.fields(patch, soon)}
          onSelect={select}
          onAdd={openStrip}
          onDelete={() => {
            if (!live) return;
            announce(`${live.name} deleted. Agents stay in your cast.`);
            void deleteTeam(live, () => go('cast/teams'));
          }}
        />
      )}
    </section>
  );
}

function CandHero({ agent }: { agent: Agent }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren(hero(agent, { size: 'sm', facing: 'front' }));
  }, [agent]);
  return <span ref={ref} style={{ display: 'contents' }} />;
}

/* ---------- imperative stage pieces (ported from teams.js) ---------- */

function renderFormation(
  form: HTMLElement,
  t: Team,
  byId: Map<string, Agent>,
  { W, H }: { W: number; H: number },
  a: Anim,
  cb: { select: (id: string) => void; openStrip: () => void },
) {
  const { cap, crew } = stageDims(W, H);
  const ord = orderedMembers(t);
  form.innerHTML = '';
  form.style.height = `${Math.round(cap + W * 0.22 * 0.5 + 60)}px`;
  const tx = hueHex(t.color);
  if (!ord.length) {
    (
      [
        [-22, 8],
        [0, 0],
        [22, 8],
      ] as const
    ).forEach(([x, y], i) => {
      const px = i === 1 ? cap * 0.8 : crew;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sq-m sq-empty';
      b.setAttribute(
        'aria-label',
        i === 1 ? 'Add the first crew member (becomes captain)' : 'Add a crew member',
      );
      b.style.cssText = `left:${W / 2 + (x / 100) * W - px * 0.375}px;bottom:${(y / 100) * W * 0.5}px;z-index:${10 - (y ? 1 : 0)}`;
      b.appendChild(hero({}, { size: Math.round(px), ghost: true, facing: 'front' }));
      if (i === 1) b.insertAdjacentHTML('beforeend', '<span class="sq-plus" aria-hidden="true">+</span>');
      b.onclick = (e) => {
        e.stopPropagation();
        cb.openStrip();
      };
      form.appendChild(b);
    });
  }
  ord.forEach((m, i) => {
    const ag = byId.get(m.agentId);
    if (!ag) return;
    const s = formationSpot(i, W, cap, crew);
    const isCap = t.captainId === m.agentId;
    const eff = roleText(ag);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sq-m${s.back ? ' back' : ''}${isCap ? ' is-cap' : ''}`;
    b.dataset.id = m.agentId;
    b.dataset.x = String(s.x);
    b.setAttribute('aria-label', `${ag.name}, ${eff}${isCap ? ', Captain' : ''}. Edit on this team`);
    b.style.cssText = `left:${s.left}px;bottom:${s.bottom}px;width:${Math.round(s.px * 0.75)}px;z-index:${s.z}`;
    b.appendChild(hero(ag, { size: s.px, facing: 'front', captain: isCap, armband: isCap ? tx : null }));
    const plate = document.createElement('span');
    plate.className = 'sq-plate';
    const nb = document.createElement('b');
    nb.textContent = ag.name;
    const line = document.createElement('span');
    if (isCap)
      line.innerHTML =
        '<svg class="star" viewBox="-10 -10 20 20" aria-hidden="true" focusable="false"><path d="M0 -8 L2.4 -2.6 L8 -2.5 L3.7 1.2 L5 6.8 L0 3.8 L-5 6.8 L-3.7 1.2 L-8 -2.5 L-2.4 -2.6Z"/></svg> Captain · ';
    line.append(document.createTextNode(eff));
    plate.append(nb, line);
    b.appendChild(plate);
    b.onclick = (e) => {
      e.stopPropagation();
      cb.select(m.agentId);
    };
    b.addEventListener('mouseenter', () => hop(b.querySelector('.hero')));
    form.appendChild(b);
    const h = b.querySelector<HTMLElement>('.hero');
    if (!h) return;
    if (a?.walkIn === m.agentId && a.walkFrom) {
      setPose(h, 'walking');
      setFacing(h, 'side', {
        dir: a.walkFrom.left + a.walkFrom.width / 2 > h.getBoundingClientRect().left ? 'left' : 'right',
      });
      after(flip(h, a.walkFrom, { duration: 520 }), () => {
        setPose(h, 'idle');
        setFacing(h, 'front');
        hop(h);
      });
    } else if (a?.before?.has(m.agentId)) {
      const r = a.before.get(m.agentId) as DOMRect;
      const now = h.getBoundingClientRect();
      if (Math.abs(r.left - now.left) > 4 || Math.abs(r.height - now.height) > 4) {
        if (!reducedMotion()) {
          setPose(h, 'walking');
          setFacing(h, 'side', { dir: r.left > now.left ? 'left' : 'right' });
        }
        after(flip(h, r, { duration: 440, easing: 'cubic-bezier(.34,1.3,.64,1)' }), () => {
          setPose(h, 'idle');
          setFacing(h, 'front');
        });
      }
    }
  });
}

/** the crew looks at whoever you picked */
function lookAtSelected(form: HTMLElement, sel: string | null) {
  const selB = sel ? form.querySelector<HTMLElement>(`.sq-m[data-id="${CSS.escape(sel)}"]`) : null;
  form.querySelectorAll<HTMLElement>('.sq-m[data-id]').forEach((b) => {
    const h = b.querySelector<HTMLElement>('.hero');
    if (!h || h.classList.contains('pose-walking')) return;
    b.classList.toggle('sel', b === selB);
    if (!selB || b === selB) setFacing(h, 'front');
    else
      setFacing(h, 'three-quarter', { dir: Number(b.dataset.x) < Number(selB.dataset.x) ? 'right' : 'left' });
  });
}
