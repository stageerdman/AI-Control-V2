/* Desk notes (STUDIO LIFE): an agent that chooses to forget leaves a note to its future self on its desk —
   where it is, what it's doing, the next step — and continues with a fresh memory from that note. The office shows
   the latest note on the desk; every note stays readable. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Comms } from '../comms/comms.ts';
import type { Db } from '../db/connection.ts';
import { rows } from '../db/util.ts';
import { notFound } from '../errors.ts';
import type { EventLog } from '../events/log.ts';

export const DeskNoteSchema = z.strictObject({
  where: z.string().trim().min(1).max(2000),
  doing: z.string().trim().min(1).max(2000),
  next: z.string().trim().min(1).max(2000),
  notes: z.string().trim().max(6000).optional(),
});
export type DeskNoteBody = z.output<typeof DeskNoteSchema>;
export type DeskNote = DeskNoteBody & {
  id: string;
  projectId: string;
  agentId: string;
  runId: string | null;
  at: string;
};
type Row = {
  id: string;
  project_id: string;
  agent_id: string;
  run_id: string | null;
  body: string;
  at: string;
};
const toNote = (r: Row): DeskNote => ({
  id: r.id,
  projectId: r.project_id,
  agentId: r.agent_id,
  runId: r.run_id,
  at: r.at,
  ...(JSON.parse(r.body) as DeskNoteBody),
});

/** What the agent reads when it starts again. */
export function deskBrief(note: DeskNoteBody, task: string): string {
  return [
    'You chose to forget to clear your head. Your memory is fresh; this note on your desk is from you:',
    '',
    `Where I am: ${note.where}`,
    `What I'm doing: ${note.doing}`,
    `Next step: ${note.next}`,
    ...(note.notes ? [`Notes: ${note.notes}`] : []),
    '',
    'Your original brief, for reference:',
    task,
    '',
    'Continue from the next step. Check the files and `git log` rather than trusting memory.',
  ].join('\n');
}

export function createDesk(deps: { db: Db; events: EventLog; comms?: Comms }) {
  const { db, events } = deps;
  return {
    save(
      projectId: string,
      agentId: string,
      runId: string | null,
      body: DeskNoteBody,
      secrets: readonly string[] = [],
    ): DeskNote {
      const note: DeskNote = {
        id: randomUUID(),
        projectId,
        agentId,
        runId,
        at: new Date().toISOString(),
        ...body,
      };
      const { id, at, projectId: _p, agentId: _a, runId: _r, ...text } = note;
      db.prepare(
        'INSERT INTO desk_notes (id, project_id, agent_id, run_id, body, at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(id, projectId, agentId, runId, JSON.stringify(text), at);
      events.append(
        'project',
        projectId,
        { type: 'desk.note', payload: { agentId, noteId: id, ...(runId ? { runId } : {}) } },
        secrets,
      );
      deps.comms?.record({
        scope: 'project',
        scopeId: projectId,
        kind: 'desk-note',
        from: agentId,
        to: agentId,
        text: deskBrief(body, '(see the run)').split('\n\nYour original brief')[0] ?? '',
        refs: { noteId: id, runId },
      });
      return note;
    },
    /** Newest first; one agent's or everyone's. */
    list(projectId: string, agentId?: string): DeskNote[] {
      return rows<Row>(
        agentId
          ? db
              .prepare(
                'SELECT * FROM desk_notes WHERE project_id = ? AND agent_id = ? ORDER BY at DESC, rowid DESC',
              )
              .all(projectId, agentId)
          : db
              .prepare('SELECT * FROM desk_notes WHERE project_id = ? ORDER BY at DESC, rowid DESC')
              .all(projectId),
      ).map(toNote);
    },
    get(projectId: string, noteId: string): DeskNote {
      const r = db
        .prepare('SELECT * FROM desk_notes WHERE id = ? AND project_id = ?')
        .get(noteId, projectId) as Row | undefined;
      if (!r) throw notFound('Desk note', noteId);
      return toNote(r);
    },
  };
}
export type Desk = ReturnType<typeof createDesk>;
