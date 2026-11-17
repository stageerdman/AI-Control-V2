/* A team's own way of working (WORKFLOWS Phase 5b): one row on the team panel that opens the
   drawing — who hands work to whom, who signs it off. Saved with PUT /teams/:id/workflow. */
import { useState } from 'react';
import { setQueryData, useQuery } from '../../api';
import type { Agent, Team, TeamWorkflow } from '../../api/types';
import { FlowSheet, type Person } from '../collab';
import { castApi } from './api';
import { shortName } from './model';

export const teamWayKey = (id: string) => `teams:${id}:workflow`;

export function TeamWay({ team, byId }: { team: Team; byId: Map<string, Agent> }) {
  const key = teamWayKey(team.id);
  const q = useQuery<{ workflow: TeamWorkflow | null }>(key, () => castApi.teams.workflow(team.id));
  const [open, setOpen] = useState(false);
  const way = q.data?.workflow ?? null;
  const people: Person[] = team.members.flatMap((m) => {
    const a = byId.get(m.agentId);
    return a ? [{ id: a.id, name: shortName(a), look: a.look }] : [];
  });
  return (
    <section className="zp-sec sq-way">
      <div>
        <h3 className="zp-label">How this team works</h3>
        <p className="zp-hint-line">
          {way ? way.summary || way.name : 'Who hands work to whom, and who signs it off.'}
        </p>
      </div>
      <button
        type="button"
        className="btn-glass sq-way-btn"
        disabled={!q.data && !q.error}
        onClick={() => setOpen(true)}
      >
        {way ? 'Open drawing' : 'Draw it'}
      </button>
      {open && (
        <FlowSheet
          open
          onClose={() => setOpen(false)}
          title={way?.name ?? `${team.name} way`}
          sub={team.name}
          graph={way?.graph ?? null}
          people={people}
          issuePrefix="graph"
          onSave={async (graph) => {
            const r = await castApi.teams.saveWorkflow(team.id, {
              name: way?.name ?? `${team.name} way`.slice(0, 60),
              ...(way?.summary ? { summary: way.summary } : {}),
              graph,
            });
            setQueryData(key, r);
          }}
        />
      )}
    </section>
  );
}
