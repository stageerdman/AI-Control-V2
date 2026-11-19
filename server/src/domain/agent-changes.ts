/* What an edit changed on a Cast agent, so the offices that show them know what to redraw.
   Pure: compares two snapshots of the same agent. */
import type { Look } from './look.ts';

export const AGENT_FIELDS = ['name', 'nick', 'role', 'look', 'prompt', 'canMail', 'thinking'] as const;
export type AgentField = (typeof AGENT_FIELDS)[number];

type Snapshot = {
  name: string;
  nick: string | null;
  roleId: string | null;
  look: Look;
  prompt: string;
  canMail: boolean;
  thinking?: string | null;
};

const LOOK_KEYS = ['hat', 'tool', 'body', 'antenna', 'face', 'hue', 'decal'] as const;

/** Same costume, whatever the key order (a missing decal equals a missing decal). */
export const sameLook = (a: Look, b: Look): boolean => LOOK_KEYS.every((k) => a[k] === b[k]);

export function changedFields(before: Snapshot, after: Snapshot): AgentField[] {
  const changed: Record<AgentField, boolean> = {
    name: before.name !== after.name,
    nick: before.nick !== after.nick,
    role: before.roleId !== after.roleId,
    look: !sameLook(before.look, after.look),
    prompt: before.prompt !== after.prompt,
    canMail: before.canMail !== after.canMail,
    thinking: (before.thinking ?? null) !== (after.thinking ?? null),
  };
  return AGENT_FIELDS.filter((f) => changed[f]);
}
