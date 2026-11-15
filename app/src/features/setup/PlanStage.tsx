/* The plan on stage: the orchestrator, then each team as a squad under its emblem (captains from
   the team's own design), the specialists, and — until accepted — the Agent Creator's briefs as
   ghosts. AGENT MCP: the floor is the room — whoever is present (the orchestrator, then the Agent
   Creator and any guest a call brought in) stands bare beside the lead; the cards are the plan. */
import { useEffect, useState } from 'react';
import type { Agent } from '../../api';
import { Emblem } from '../../characters/Emblem';
import { Hero } from '../../characters/Hero';
import { reducedMotion } from '../../design/palette';
import { nickOf } from '../projects/model';
import type { Doing, PlanView } from './flow';
import { Actor } from './parts';

const short = (name: string) => name.replace(/^The /, '');

export type StageRoom = {
  guests: { agent: Agent; why?: string }[];
  doing: Record<string, Doing>;
  /** Guests who joined while you watched (they walk in); the rest are simply there. */
  entering: ReadonlySet<string>;
  label: string;
  announce: string;
};
const SHOWN = 3;

export function PlanStage({
  view,
  orch,
  busy,
  room,
}: {
  view: PlanView | null;
  orch: Agent | undefined;
  busy: false | 'orch' | 'creator';
  room: StageRoom;
}) {
  const ghostAgents = view?.newAgents ?? [];
  const shown = room.guests.slice(-SHOWN);
  const hidden = room.guests.slice(0, -SHOWN);
  const orchPose = orch && room.doing[orch.id]?.pose === 'thinking' ? 'thinking' : undefined;
  return (
    <>
      <div className="np-room" role="group" aria-label={room.label}>
        <Actor
          agent={orch}
          pose={orchPose ?? (busy === 'orch' || !view ? 'thinking' : 'talking')}
          dir="right"
          size={116}
          className="np-lead"
          plate={orch?.name}
          kind="Orchestrator"
        />
        {hidden.length > 0 && (
          <span className="np-plate np-more" title={hidden.map((g) => g.agent.name).join(', ')}>
            +{hidden.length}
          </span>
        )}
        {shown.map((g) => (
          <Guest
            key={g.agent.id}
            agent={g.agent}
            why={g.why}
            doing={room.doing[g.agent.id]}
            entering={room.entering.has(g.agent.id)}
          />
        ))}
        <p className="sr-only" aria-live="polite">
          {room.announce}
        </p>
      </div>
      <div className="np-groups">
        {view?.teams.map(({ team, why, members, fresh }) => (
          <div key={team.id} className={`np-group${fresh ? ' np-newteam' : ''}`} title={why}>
            <div className="np-ghead">
              <span className="np-emb">
                <Emblem team={team} size={26} decorative />
              </span>
              <b>{short(team.name)}</b>
              {fresh && <i>new</i>}
            </div>
            <div className="np-gmem">
              {members.map((m) => (
                <Actor
                  key={m.agent.id}
                  agent={m.agent}
                  size={76}
                  dir="left"
                  pose={fresh ? 'celebrating' : 'idle'}
                  captain={m.captain}
                  ghost={m.dup}
                  plate={nickOf(m.agent)}
                />
              ))}
            </div>
          </div>
        ))}
        {view?.newTeams.map((brief, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: briefs have no id until minted
          <div key={`nt${i}`} className="np-group" title={brief}>
            <div className="np-ghead">
              <b>New team</b>
              <i>new</i>
            </div>
            <span className="np-brief">{brief}</span>
            <div className="np-gmem" style={{ paddingTop: 0 }}>
              <Hero ghost size={76} />
              <Hero ghost size={76} />
            </div>
          </div>
        ))}
        {view && (view.specialists.length > 0 || ghostAgents.length > 0) && (
          <div className="np-group np-spec">
            <div className="np-ghead">
              <b>Specialists</b>
            </div>
            <div className="np-gmem">
              {view.specialists.map(({ agent, why, fresh }) => (
                <div key={agent.id} title={why} style={{ display: 'contents' }}>
                  <Actor
                    agent={agent}
                    size={76}
                    dir="left"
                    pose={fresh ? 'celebrating' : 'idle'}
                    plate={
                      <>
                        {nickOf(agent)}
                        {fresh && <i>new</i>}
                      </>
                    }
                  />
                </div>
              ))}
              {ghostAgents.map((brief, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: briefs have no id until minted
                <div key={`na${i}`} className="np-actor" title={brief}>
                  <Hero ghost size={76} />
                  <span className="np-plate">
                    <i>new</i>
                  </span>
                  <span className="np-brief">{brief}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** A guest in the room: walks in and waves when they join while you watch, then shows what they're doing. */
function Guest({
  agent,
  why,
  doing,
  entering,
}: {
  agent: Agent;
  why?: string;
  doing?: Doing;
  entering: boolean;
}) {
  const [arrive, setArrive] = useState<'walking' | 'waving' | null>(() =>
    entering && !reducedMotion() ? 'walking' : null,
  );
  useEffect(() => {
    if (!arrive) return;
    const t = setTimeout(
      () => setArrive(arrive === 'walking' ? 'waving' : null),
      arrive === 'walking' ? 600 : 900,
    );
    return () => clearTimeout(t);
  }, [arrive]);
  return (
    <div title={why}>
      <Actor
        agent={agent}
        size={84}
        dir="left"
        pose={arrive ?? doing?.pose ?? 'idle'}
        className={`np-guest${entering ? ' is-joining' : ''}`}
        plate={nickOf(agent)}
        {...(doing?.label ? { kind: doing.label } : {})}
      />
    </div>
  );
}
