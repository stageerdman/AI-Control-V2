/* The squad zoom's panels: the team (emblem picker, name, blurb, colour, the two team prompts,
   "Files reports", crew list, delete) and one member (job on this team, make captain, remove).
   Auto-save everywhere; the parent decides how a change is saved (draft vs real team). */
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Agent, Team, TeamPatch } from '../../api/types';
import { EMBLEMS, Emblem, emblemById, Hero } from '../../characters';
import { COLOR_NAMES, type Hue, hueHex } from '../../design/palette';
import { Switch } from '../../ui';
import { announce, reducedMotion } from './fx';
import { orderedMembers, roleText, shortName, TEAM_MAX } from './model';
import { HueSwatches, Radios } from './Radios';
import { STAR } from './RollCall';

/** Auto-growing textarea that keeps its own text while focused (saves go up through onText). */
function Grow({
  id,
  value,
  onText,
  rows,
  max,
  placeholder,
}: {
  id: string;
  value: string;
  onText: (v: string) => void;
  rows: number;
  max: number;
  placeholder: string;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const grow = () => {
    const a = ref.current;
    if (!a) return;
    a.style.height = 'auto';
    a.style.height = `${Math.min(a.scrollHeight + 2, max)}px`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: grow on mount and when the text changes
  useLayoutEffect(() => {
    requestAnimationFrame(grow);
  }, [v]);
  return (
    <textarea
      ref={ref}
      className="zp-area"
      id={id}
      rows={rows}
      placeholder={placeholder}
      value={v}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onChange={(e) => {
        setV(e.target.value);
        onText(e.target.value);
      }}
    />
  );
}

export const TeamPanel = forwardRef<
  HTMLDivElement,
  {
    team: Team;
    teams: Team[];
    byId: Map<string, Agent>;
    drill: boolean;
    picker: boolean;
    setPicker: (on: boolean) => void;
    onPreview: (emblem: string | null) => void;
    onField: (patch: TeamPatch, soon?: boolean) => void;
    onSelect: (agentId: string) => void;
    onAdd: () => void;
    onDelete: () => void;
  }
>(function TeamPanel(p, ref) {
  const t = p.team;
  const [name, setName] = useState(t.name);
  const [err, setErr] = useState(false);
  const [blurb, setBlurb] = useState(t.blurb);
  const emBtn = useRef<HTMLButtonElement>(null);
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setName(t.name);
  }, [t.name]);
  const n = t.members.length;
  const ord = orderedMembers(t);
  const usedBy = (id: string) => p.teams.filter((x) => x.id !== t.id && x.emblem === id).map((x) => x.name);

  return (
    <div className={`z-panel${p.drill ? ' drill-out' : ''}`} ref={ref}>
      <div className="zp-scroll">
        <div className="zp-top">
          <span className="zp-kicker">{t.id ? 'Team' : 'New team'}</span>
          <span className="zp-saved" aria-hidden="true">
            Saved ✓
          </span>
        </div>
        <div className="sq-id">
          <button
            ref={emBtn}
            type="button"
            className="sq-em-btn"
            aria-haspopup="true"
            aria-expanded={p.picker}
            aria-label={`Change emblem (now ${emblemById(t.emblem).name})`}
            onClick={() => {
              p.setPicker(!p.picker);
              if (p.picker) emBtn.current?.focus();
            }}
          >
            <Emblem team={t} size={64} decorative />
          </button>
          <div className="sq-id-text">
            <h2 className="sr-only" id="sqTitle" tabIndex={-1}>
              {t.name || 'New team'}: squad details
            </h2>
            <input
              className="zp-title"
              maxLength={32}
              placeholder="Name your crew"
              aria-label="Team name"
              aria-describedby="sqNameErr"
              autoComplete="off"
              spellCheck={false}
              value={name}
              onFocus={() => {
                typing.current = true;
              }}
              onChange={(e) => {
                setName(e.target.value);
                const v = e.target.value.trim();
                if (!v) {
                  setErr(!!t.id);
                  return;
                }
                setErr(false);
                p.onField({ name: v }, true);
              }}
              onBlur={() => {
                typing.current = false;
                if (!name.trim() && t.id) {
                  setName(t.name);
                  setErr(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
            />
            <p className="zp-err" id="sqNameErr" hidden={!err}>
              Teams need a name
            </p>
          </div>
        </div>
        {p.picker && (
          <div className="sq-picker">
            <p className="zp-sub">Choose an emblem</p>
            <Radios
              label="Team emblem"
              className="em-grid"
              value={t.emblem}
              autoFocus
              onHover={(v) => p.onPreview(v)}
              onLeave={() => p.onPreview(null)}
              onPick={(v) => {
                p.onField({ emblem: v });
                p.onPreview(null);
                const em = emBtn.current?.querySelector('.emblem') as HTMLElement | null;
                if (em && !reducedMotion())
                  em.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], {
                    duration: 220,
                    easing: 'cubic-bezier(.34,1.56,.64,1)',
                  });
                announce(`Emblem: ${emblemById(v).name}`);
              }}
              items={EMBLEMS.map((e) => {
                const u = usedBy(e.id);
                return {
                  value: e.id,
                  label: `${e.name}${u.length ? `, in use by ${u.join(', ')}` : ''}`,
                  title: u.length ? `${e.name} · in use by ${u.join(', ')}` : e.name,
                  content: (
                    <>
                      <Emblem id={e.id} color={t.color} size={52} decorative />
                      <span>{e.name}</span>
                      {u.length > 0 && <i className="em-used" aria-hidden="true" />}
                    </>
                  ),
                };
              })}
            />
          </div>
        )}
        <label className="zp-field">
          <span className="zp-sub">Blurb</span>
          <input
            className="zp-input sq-blurb"
            maxLength={90}
            placeholder="What is this crew for, in one breath?"
            aria-describedby="sqCount"
            autoComplete="off"
            value={blurb}
            onChange={(e) => {
              setBlurb(e.target.value);
              p.onField({ blurb: e.target.value }, true);
            }}
          />
          <span className="sq-count" id="sqCount" aria-live="polite">
            {blurb.length >= 70 ? `${blurb.length}/90` : ''}
          </span>
        </label>
        <div className="look-row sq-colour">
          <span className="zp-sub">Colour</span>
          <HueSwatches
            value={t.color}
            onPick={(v) => {
              p.onField({ color: v });
              announce(`${t.name || 'Team'} colour: ${COLOR_NAMES[v as Hue]}`);
            }}
          />
        </div>
        <section className="zp-sec">
          <h3 className="zp-label">
            <label htmlFor="sqRules">What this team does</label>
          </h3>
          <p className="zp-hint-line">
            Their mission and rules. Every member reads this on top of their own brain.
          </p>
          <Grow
            id="sqRules"
            rows={4}
            max={12 * 21 + 28}
            value={t.instr}
            onText={(v) => p.onField({ instr: v }, true)}
            placeholder="e.g. Takes one feature from idea to demo. Ships behind a flag, keeps main green."
          />
        </section>
        <section className="zp-sec">
          <h3 className="zp-label">
            <label htmlFor="sqCode">How this team codes</label>
          </h3>
          <p className="zp-hint-line">
            Code structure and design they follow, folders they create, what they touch and where.
          </p>
          <Grow
            id="sqCode"
            rows={5}
            max={12 * 21 + 28}
            value={t.code}
            onText={(v) => p.onField({ code: v }, true)}
            placeholder="e.g. Feature folders in src/features/<name>/ with UI, API and tests together. Shared code moves to src/shared/ only when a second feature needs it."
          />
        </section>
        <section className="zp-sec zp-reports">
          <div>
            <h3 className="zp-label" id="sqRepLbl">
              Files reports
            </h3>
            <p className="zp-hint-line">
              Research, reviews and write-ups from this crew land in the project’s Reports.
            </p>
          </div>
          <Switch
            checked={t.reporter}
            label="Files reports"
            onChange={(on) => {
              p.onField({ reporter: on });
              announce(`${t.name || 'This team'} ${on ? 'files reports' : 'no longer files reports'}`);
            }}
          />
        </section>
        <section className="zp-sec">
          <h3 className="zp-label">
            Crew{' '}
            <span className="sq-count-crew">
              {n}/{TEAM_MAX}
            </span>
            <span className="zp-hint">max {TEAM_MAX}</span>
          </h3>
          <ul className="sq-crew">
            {!ord.length && <li className="zp-empty">No crew yet. The first one you add becomes captain.</li>}
            {ord.map((m) => {
              const a = p.byId.get(m.agentId);
              if (!a) return null;
              const isCap = t.captainId === m.agentId;
              const eff = roleText(a);
              return (
                <li key={m.agentId}>
                  <button
                    type="button"
                    className="sq-row"
                    aria-label={`${a.name}, ${eff}${isCap ? ', Captain' : ''}. Edit on this team`}
                    onClick={() => p.onSelect(m.agentId)}
                  >
                    <span className="sq-row-fig">
                      <Hero agent={a} size="xs" facing="front" />
                    </span>
                    <span className="sq-row-text">
                      <b>
                        {a.name}
                        {isCap && (
                          <>
                            {' '}
                            <em>{STAR} Captain</em>
                          </>
                        )}
                      </b>
                      <span>{eff}</span>
                      {!m.instr && <span className="sq-nudge">Give {shortName(a)} a job</span>}
                    </span>
                    <i className="chev" aria-hidden="true">
                      ›
                    </i>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn-glass sq-add sq-add-panel"
            hidden={n >= TEAM_MAX}
            onClick={p.onAdd}
          >
            + Add to crew
          </button>
        </section>
        <p className="zp-foot">The director briefs this team through its captain.</p>
        {t.id && (
          <div className="sq-danger">
            <button type="button" className="zp-link danger sq-del" onClick={p.onDelete}>
              Delete team
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export const MemberPanel = forwardRef<
  HTMLDivElement,
  {
    team: Team;
    agent: Agent;
    job: string;
    onJob: (v: string) => void;
    onBack: () => void;
    onCaptain: () => void;
    onRemove: () => void;
  }
>(function MemberPanel({ team: t, agent: a, job, onJob, onBack, onCaptain, onRemove }, ref) {
  const first = shortName(a);
  const isCap = t.captainId === a.id;
  const [v, setV] = useState(job);
  const badge = useRef<HTMLSpanElement>(null);
  const wasCap = useRef(isCap);
  useEffect(() => {
    if (isCap && !wasCap.current) badge.current?.focus();
    wasCap.current = isCap;
  }, [isCap]);
  return (
    <div className="z-panel drill-in" ref={ref}>
      <div className="zp-scroll">
        <div className="zp-top">
          <button type="button" className="zp-crumb" onClick={onBack}>
            <span aria-hidden="true">←</span> {t.name || 'New team'}
          </button>
          <span className="zp-saved" aria-hidden="true">
            Saved ✓
          </span>
        </div>
        <div className="sq-mhead">
          <span className="sq-mfig">
            <Hero
              agent={a}
              size={72}
              facing="front"
              captain={isCap}
              armband={isCap ? hueHex(t.color) : null}
            />
          </span>
          <div>
            <h2 id="sqMember" tabIndex={-1}>
              {a.name}
            </h2>
            <p>
              {roleText(a)} in the cast ·{' '}
              <a href={`#cast/agent/${encodeURIComponent(a.id)}`} className="zp-link">
                Open agent page
              </a>
            </p>
          </div>
        </div>
        <section className="zp-sec">
          <h3 className="zp-label">
            <label htmlFor="sqJob">Job on this team</label>
          </h3>
          <textarea
            className="zp-area"
            id="sqJob"
            rows={4}
            placeholder={`What is ${first}’s job on this crew?`}
            value={v}
            onChange={(e) => {
              setV(e.target.value);
              onJob(e.target.value);
            }}
          />
          <p className="zp-hint-line">
            {first} runs with: their own brain <span aria-hidden="true">▸</span> what the team does{' '}
            <span aria-hidden="true">▸</span> how the team codes <span aria-hidden="true">▸</span> this job.
          </p>
        </section>
        <div className="sq-mactions">
          {isCap ? (
            <span className="sq-capbadge" ref={badge} tabIndex={-1}>
              {STAR} Captain of this crew
            </span>
          ) : (
            <button type="button" className="btn-team sq-mkcap" onClick={onCaptain}>
              {STAR} Make captain
            </button>
          )}
          <button type="button" className="zp-link danger sq-remove" onClick={onRemove}>
            Remove from team
          </button>
        </div>
      </div>
    </div>
  );
});
