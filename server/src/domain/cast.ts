/* Cast rules (v5): three system kinds always present.
     setter        exactly one — sets up / adopts every project
     orchestrator  one or more — runs a project; the last one can't go
     creator       exactly one — designs new agents/teams
   Everyone else is kind 'agent'. Kinds never change after creation. */
import { conflict } from '../errors.ts';

export const AGENT_KINDS = ['agent', 'setter', 'orchestrator', 'creator'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const KIND_LABEL: Record<AgentKind, string> = {
  agent: 'Agent',
  setter: 'Project Setter',
  orchestrator: 'Orchestrator',
  creator: 'Agent Creator',
};

/** Lineup order everywhere: studio crew first, then everyone else. */
export const KIND_ORDER: Record<AgentKind, number> = { setter: 0, orchestrator: 1, creator: 2, agent: 3 };

type HasKind = { id: string; kind: AgentKind };

export const isSystemKind = (k: AgentKind) => k !== 'agent';
const isSingleton = (k: AgentKind) => k === 'setter' || k === 'creator';

/** Creating a second setter or creator is refused; agents and orchestrators are open. */
export function assertCanCreate(kind: AgentKind, cast: readonly HasKind[]): void {
  if (isSingleton(kind) && cast.some((a) => a.kind === kind)) {
    throw conflict(`The studio already has its ${KIND_LABEL[kind]} — there is exactly one.`, { kind });
  }
}

export type DeleteVerdict = { ok: true; why: '' } | { ok: false; why: string };

export function canDelete(agent: HasKind, cast: readonly HasKind[]): DeleteVerdict {
  if (agent.kind === 'setter')
    return {
      ok: false,
      why: 'Required — the studio always has exactly one Project Setter. It sets up every new project.',
    };
  if (agent.kind === 'creator')
    return {
      ok: false,
      why: 'Required — the studio always has exactly one Agent Creator. Orchestrators call it to design new agents.',
    };
  if (agent.kind === 'orchestrator' && cast.filter((a) => a.kind === 'orchestrator').length <= 1)
    return { ok: false, why: 'At least one orchestrator must exist — every project needs one to run it.' };
  return { ok: true, why: '' };
}

export function assertCanDelete(agent: HasKind, cast: readonly HasKind[]): void {
  const v = canDelete(agent, cast);
  if (!v.ok) throw conflict(v.why, { agentId: agent.id, kind: agent.kind });
}

/** Only regular agents get copies (kin): the crew have one job each. */
export function assertCanCopy(agent: HasKind): void {
  if (isSystemKind(agent.kind))
    throw conflict(`The ${KIND_LABEL[agent.kind]} has one job in the studio; it can't be copied.`, {
      agentId: agent.id,
      kind: agent.kind,
    });
}

/** Who takes over the projects of an orchestrator being deleted: the first other one. */
export function replacementOrchestrator(leaving: HasKind, cast: readonly HasKind[]): string | null {
  return cast.find((a) => a.kind === 'orchestrator' && a.id !== leaving.id)?.id ?? null;
}

/** A project is run by an orchestrator — nobody else. */
export function assertOrchestrator(agent: HasKind): void {
  if (agent.kind !== 'orchestrator')
    throw conflict(`'${agent.id}' is not an orchestrator`, { agentId: agent.id });
}

/** Teams and project specialists are regular agents only — system agents never join. */
export function assertNotSystem(agent: HasKind): void {
  if (isSystemKind(agent.kind))
    throw conflict(
      `${KIND_LABEL[agent.kind]} '${agent.id}' is a system agent and can't join teams or projects`,
      {
        agentId: agent.id,
        kind: agent.kind,
      },
    );
}
