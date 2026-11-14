/* The hero zoom's dark-glass panel: name (auto-save; a new recruit is created on its first valid
   name), role (pick or type), brain (its own system prompt), teams, and the delete rules
   (setter/creator never; orchestrators down to one — the server's canDelete). No Save button:
   a quiet "Saved ✓" pip answers every save. */
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Agent, Role, Team } from '../../api/types';
import { Emblem } from '../../characters';
import { go } from '../../shell/router';
import { isCrew, KIND_ABOUT, KIND_LABEL } from './model';
import { RoleCombo } from './RoleCombo';

export type PanelAgent = Pick<
  Agent,
  'id' | 'kind' | 'name' | 'roleId' | 'role' | 'prompt' | 'teamIds' | 'projectIds' | 'canDelete'
>;

export const AgentPanel = forwardRef<
  HTMLDivElement,
  {
    agent: PanelAgent;
    isNew: boolean;
    roles: Role[];
    teams: Team[];
    onName: (name: string) => void;
    onRole: (role: Role | null) => void;
    onPrompt: (prompt: string) => void;
    onDelete: () => void;
    onSaved: () => void;
  }
>(function AgentPanel({ agent, isNew, roles, teams, onName, onRole, onPrompt, onDelete, onSaved }, ref) {
  const crew = isCrew(agent);
  const kind = agent.kind;
  const [name, setName] = useState(agent.name);
  const [err, setErr] = useState(false);
  const [prompt, setPrompt] = useState(agent.prompt);
  const area = useRef<HTMLTextAreaElement>(null);

  const grow = () => {
    const a = area.current;
    if (!a) return;
    a.style.height = 'auto';
    a.style.height = `${Math.min(a.scrollHeight + 2, 16 * 20 + 28)}px`;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: grow once the panel is laid out
  useLayoutEffect(() => {
    requestAnimationFrame(grow);
  }, []);

  const exists = !!agent.id;
  const n = exists ? agent.projectIds.length : 0;
  const myTeams = exists ? teams.filter((t) => t.members.some((m) => m.agentId === agent.id)) : [];
  const roleShown = (agent.roleId && roles.find((r) => r.id === agent.roleId)?.name) || '';

  /* keep the name field in step when it changes elsewhere (e.g. restored by Undo) */
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current) setName(agent.name);
  }, [agent.name]);

  return (
    <div className="z-panel" ref={ref}>
      <div className="zp-scroll">
        <h2 className="sr-only" id="zhTitle" tabIndex={-1}>
          {agent.name || 'New agent'}: hero details
        </h2>
        <div className="zp-top">
          <span className="zp-kicker">
            {crew ? 'Studio crew' : isNew && !exists ? 'New recruit' : 'Agent'}
          </span>
          <span className="zp-saved" aria-hidden="true">
            Saved ✓
          </span>
        </div>
        <div className="zp-name">
          <input
            className="zp-title"
            id="zpName"
            maxLength={22}
            placeholder={`Name your ${crew ? KIND_LABEL[kind].toLowerCase() : 'agent'}`}
            aria-label={`${crew ? KIND_LABEL[kind] : 'Agent'} name`}
            aria-describedby="zpNameErr"
            autoComplete="off"
            spellCheck={false}
            value={name}
            onFocus={() => {
              typing.current = true;
            }}
            onChange={(e) => {
              setName(e.target.value);
              const t = e.target.value.trim();
              if (!t) {
                setErr(exists);
                return;
              }
              setErr(false);
              onName(t);
            }}
            onBlur={() => {
              typing.current = false;
              if (!name.trim() && exists) {
                setName(agent.name);
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
        </div>
        <p className="zp-err" id="zpNameErr" hidden={!err}>
          Give them a name first
        </p>
        <p className="zp-caption">
          {crew ? (
            <>
              <span>{KIND_LABEL[kind]}</span>
              <span className="zp-req">Required</span>
            </>
          ) : (
            <span className={roleShown ? '' : 'none'}>{roleShown || 'No role yet'}</span>
          )}
        </p>
        {crew ? (
          <p className="zp-about">{KIND_ABOUT[kind as Exclude<typeof kind, 'agent'>]}</p>
        ) : (
          <RoleCombo roles={roles} roleId={agent.roleId} onRole={onRole} onSaved={onSaved} />
        )}
        <section className="zp-sec">
          <h3 className="zp-label">
            <label htmlFor="zpPrompt">Brain</label>
            <span className="zp-hint">its own system prompt</span>
          </h3>
          <textarea
            ref={area}
            className="zp-area mono"
            id="zpPrompt"
            rows={6}
            spellCheck={false}
            placeholder={crew ? '' : 'How should this agent think and work?'}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              grow();
              onPrompt(e.target.value);
            }}
          />
        </section>
        {!crew && (
          <section className="zp-sec zp-teams-sec">
            <h3 className="zp-label">Teams</h3>
            <ul className="zp-teams">
              {myTeams.length ? (
                myTeams.map((t) => (
                  <li key={t.id}>
                    <a href={`#cast/teams/${encodeURIComponent(t.id)}`} className="zp-team">
                      <Emblem team={t} size={32} decorative />
                      <span>
                        <b>{t.name}</b>
                        {t.captainId === agent.id && <em>★ Captain</em>}
                      </span>
                      <i aria-hidden="true">›</i>
                    </a>
                  </li>
                ))
              ) : (
                <li className="zp-empty">No team yet — add them from a team’s crew.</li>
              )}
            </ul>
          </section>
        )}
        <div className="zp-danger">
          {exists && kind === 'orchestrator' && (
            <button
              type="button"
              className="zp-link zp-more-orch"
              onClick={() => go('cast/agent/new-orchestrator')}
            >
              + Another orchestrator
            </button>
          )}
          {exists && agent.canDelete.ok && kind === 'orchestrator' && n > 0 && (
            <p className="zp-why">
              Runs {n} project{n === 1 ? '' : 's'} — deleting it hands {n === 1 ? 'it' : 'them'} to another
              orchestrator.
            </p>
          )}
          {exists && agent.canDelete.ok && (
            <button type="button" className="zp-link danger zp-del" onClick={onDelete}>
              Delete {crew ? 'orchestrator' : 'agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
