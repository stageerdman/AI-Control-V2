/* Bring someone in (STUDIO LIFE): the user brings any Cast agent into a project with their own brief — no director
   approval. The guest joins the room, starts on the brief at once, and stays until sent home. The director may give
   them work only when `orchestratorMay` is on (locked by default). */
import type { Comms } from '../comms/comms.ts';
import type { Guest } from '../db/guests.ts';
import type { Store } from '../db/store.ts';
import { conflict, invalid, notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';
import type { Room } from '../room/room.ts';
import type { Runtime } from '../runtime/service.ts';

export const guestTask = (projectName: string, brief: string) =>
  [
    `The user brought you into "${projectName}" as a guest, with this brief:`,
    '',
    brief,
    '',
    'You are not on a team here: you answer to the user. Use `room` to see who is here, `comms_log` to read how the agents talk to each other, and `send_mail` to write to another project or HQ when the brief asks. Finish with a short plain-words summary.',
  ].join('\n');

export function createGuests(deps: {
  store: Store;
  events: EventLog;
  room: Room;
  comms?: Comms;
  runtime: Runtime;
}) {
  const { store, events, room, runtime } = deps;
  const note = (projectId: string, agentId: string, change: 'joined' | 'updated' | 'left') =>
    events.append('project', projectId, { type: 'guest.changed', payload: { agentId, change } });

  const onStaff = (projectId: string, agentId: string) => {
    const p = store.projects.require(projectId);
    return (
      p.orchestratorId === agentId ||
      p.agentIds.includes(agentId) ||
      p.teamIds.some((t) => store.teams.get(t)?.members.some((m) => m.agentId === agentId))
    );
  };

  return {
    list: (projectId: string): Guest[] => {
      store.projects.require(projectId);
      return store.guests.list(projectId);
    },
    /** Bring them in and start them on the brief (unless `start: false` or they're busy here). */
    add(
      projectId: string,
      input: { agentId: string; brief: string; orchestratorMay?: boolean; start?: boolean },
    ) {
      const p = store.projects.require(projectId);
      const a = store.agents.require(store.agents.ref(input.agentId).id);
      if (a.kind !== 'agent')
        throw invalid(`${a.name} is studio crew — bring in a Cast agent`, { agentId: a.id });
      if (onStaff(projectId, a.id)) throw conflict(`${a.name} is already on ${p.name}`, { agentId: a.id });
      const fresh = !store.guests.get(projectId, a.id);
      room.join({ scope: 'project', ownerId: projectId }, a.id, undefined, input.brief); // first: guests count as present
      const guest = store.guests.put({
        projectId,
        agentId: a.id,
        brief: input.brief,
        orchestratorMay: !!input.orchestratorMay,
      });
      deps.comms?.record({
        scope: 'project',
        scopeId: projectId,
        kind: 'brief',
        from: null,
        to: a.id,
        text: input.brief,
      });
      note(projectId, a.id, fresh ? 'joined' : 'updated');
      let runId: string | null = null;
      if (input.start !== false && !runtime.busy(projectId, a.id))
        runId = runtime.start(projectId, {
          agentId: a.id,
          task: guestTask(p.name, input.brief),
          kind: 'building',
        }).id;
      return { guest, runId };
    },
    update(projectId: string, agentId: string, patch: { brief?: string; orchestratorMay?: boolean }): Guest {
      const g = store.guests.get(projectId, agentId);
      if (!g) throw notFound('Guest', agentId);
      const next = store.guests.put({
        projectId,
        agentId,
        brief: patch.brief ?? g.brief,
        orchestratorMay: patch.orchestratorMay ?? g.orchestratorMay,
      });
      if (patch.brief && patch.brief !== g.brief)
        deps.comms?.record({
          scope: 'project',
          scopeId: projectId,
          kind: 'brief',
          from: null,
          to: agentId,
          text: patch.brief,
        });
      note(projectId, agentId, 'updated');
      return next;
    },
    /** Send them home (a run they're on keeps going to its end). */
    remove(projectId: string, agentId: string): void {
      if (!store.guests.remove(projectId, agentId)) throw notFound('Guest', agentId);
      note(projectId, agentId, 'left');
    },
  };
}
export type Guests = ReturnType<typeof createGuests>;
