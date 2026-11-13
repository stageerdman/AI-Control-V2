/* The plan on stage: the orchestrator, then each team as a squad under its emblem (captains from
   the team's own design), the specialists, and — until accepted — the Agent Creator's briefs as
   ghosts. While the Creator works it steps onto the stage. */
import type { Agent } from '../../api';
import { Emblem } from '../../characters/Emblem';
import { Hero } from '../../characters/Hero';
import { nickOf } from '../projects/model';
import type { PlanView } from './flow';
import { Actor } from './parts';

const short = (name: string) => name.replace(/^The /, '');

export function PlanStage({
  view,
  orch,
  creator,
  busy,
}: {
  view: PlanView | null;
  orch: Agent | undefined;
  creator: Agent | undefined;
  busy: false | 'orch' | 'creator';
}) {
  const ghostAgents = view?.newAgents ?? [];
  return (
    <>
      <Actor
        agent={orch}
        pose={busy === 'orch' || !view ? 'thinking' : 'talking'}
        dir="right"
        size={116}
        className="np-lead"
        plate={orch?.name}
        kind="Orchestrator"
      />
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
        {busy === 'creator' && (
          <Actor
            agent={creator}
            size={84}
            dir="left"
            pose="pressing"
            className="np-creator"
            plate={creator ? nickOf(creator) : undefined}
          />
        )}
      </div>
    </>
  );
}
