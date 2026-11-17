/* People and teams in a workflow as the director says them (names, nicks or ids) → the ids the rules check.
   Shared by the workflow tools and temporary workflows on the board. Unknown names pass through unchanged, so
   the rules (src/domain/workflows.ts) refuse them by the field. */
import type { Store } from '../db/store.ts';
import type { Gate } from '../domain/workflows.ts';
import { agentByName } from './people.ts';

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : undefined);

export function workflowRefs(store: Store, projectId: string) {
  const agentId = (said: string) => agentByName(store, said)?.id ?? said;
  /** A gate's `after`: anyone ("*" / "any"), a team of the project by name or id, else an agent. */
  const afterId = (said: string) => {
    if (said === '*' || said.toLowerCase() === 'any') return '*';
    const team = store.projects
      .require(projectId)
      .teamIds.map((t) => store.teams.get(t))
      .find((t) => t && (t.id === said || t.name.toLowerCase() === said.toLowerCase()));
    return team?.id ?? agentId(said);
  };
  const gate = (g: Args): Gate => ({
    after: afterId(str(g, 'after') ?? '*'),
    reviewer: agentId(str(g, 'reviewer') ?? ''),
    kind: (str(g, 'kind') ?? 'review') as Gate['kind'],
    why: str(g, 'why') ?? '',
  });
  return { agentId, afterId, gate };
}
