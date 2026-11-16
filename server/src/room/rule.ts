/* Who must OK a call (pure). The orchestrator may bring anyone in; anyone may call someone already in
   the room; anyone else bringing in someone new needs a yes — from their team's captain, or (captains,
   specialists, the Agent Creator) from the orchestrator. */

export type CallCheck = {
  callerId: string;
  calleeId: string;
  /** The orchestrator of this room (the draft's or the project's). */
  orchestratorId: string | null;
  inRoom: (agentId: string) => boolean;
  /** The captain of a team the caller is a plain member of on this project; null otherwise. */
  captainOf: (agentId: string) => string | null;
};

/** The agent who must allow this call, or null when no one has to. */
export function approverFor(c: CallCheck): string | null {
  if (c.inRoom(c.calleeId)) return null;
  return contactOf(c.callerId, c.orchestratorId, c.captainOf);
}

/** The one an agent reports to (and asks first): their captain, else the orchestrator; the orchestrator → nobody. */
export function contactOf(
  agentId: string,
  orchestratorId: string | null,
  captainOf: (agentId: string) => string | null,
): string | null {
  if (agentId === orchestratorId) return null;
  const captain = captainOf(agentId);
  return captain && captain !== agentId ? captain : orchestratorId;
}

/** How deep calls may nest: A calls B calls C — and no further. */
export const MAX_CHAIN = 3;

/** Why this call can't happen at all (before anyone is asked), or null. */
export function callRefusal(c: {
  callerId: string;
  calleeId: string;
  chain: readonly string[];
}): string | null {
  if (c.calleeId === c.callerId) return 'You can’t call yourself.';
  if (c.chain.includes(c.calleeId))
    return 'They are already part of this call — answer them in your reply instead.';
  if (c.chain.length >= MAX_CHAIN)
    return 'Calls can’t go deeper than this — do it yourself or say what’s missing.';
  return null;
}
