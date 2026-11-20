/* `cant_do`: a builder says at once that it can't do its item because it lacks a tool, access or permission.
   The item stops and goes straight back to the director with the reason (dispatch.declineFromRun) — no review
   round, no resubmitting work that can never pass. The director reads why on the whiteboard and in its chat. */
import type { ChecklistItem } from '../db/work.ts';
import { invalid } from '../errors.ts';
import type { BridgeTool } from '../room/bridge.ts';
import { cantDoNote, LACKS, type Lack } from './handover.ts';

const MAX_REASON = 600;

export type CantDoPort = {
  /** Hand the run's own item back to the director with this note → the item, or null (not the caller's build). */
  decline: (runId: string, byId: string, note: string) => ChecklistItem | null;
  /** One line in the director's chat, so it sees why without asking. */
  tell: (item: ChecklistItem, line: string) => void;
  name: (agentId: string) => string;
};

const isLack = (v: unknown): v is Lack => LACKS.includes(v as Lack);

export function cantDoTool(port: CantDoPort, me: { agentId: string; runId: string }): BridgeTool {
  return {
    name: 'cant_do',
    description:
      "Your checklist item can't be done because you lack a tool, access or permission (a refused command, a missing credential, a place you can't reach)? Say so at once: the item stops and goes back to the orchestrator with your reason — no review round. Then end your turn.",
    inputSchema: {
      type: 'object',
      properties: {
        lacks: { type: 'string', enum: [...LACKS], description: 'What you lack.' },
        reason: {
          type: 'string',
          description: 'Exactly what is missing and what it blocks, in plain words.',
        },
      },
      required: ['lacks', 'reason'],
    },
    run: async (a) => {
      const reason =
        typeof a.reason === 'string' ? a.reason.trim().replace(/\s+/g, ' ').slice(0, MAX_REASON) : '';
      if (!isLack(a.lacks)) throw invalid(`"lacks" must be one of: ${LACKS.join(', ')}.`);
      if (!reason) throw invalid('"reason" is required: say what is missing and what it blocks.');
      const note = cantDoNote(port.name(me.agentId), a.lacks, reason);
      const item = port.decline(me.runId, me.agentId, note);
      if (!item)
        throw invalid(
          'cant_do is for the checklist item you are building in this run. Elsewhere, tell whoever asked you.',
        );
      port.tell(item, `“${item.text}” is back with me, waiting for a new owner. ${note}`);
      return `“${item.text}” is stopped and back with ${port.name(item.agentId)}, with your reason. Commit what you have and end your turn.`;
    },
  };
}
