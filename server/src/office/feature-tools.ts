/* The director's features tools: thin adapters from MCP arguments to the features service (office/features.ts),
   so a change from the chat behaves exactly like one from the UI (same rules, same `feature.changed`). */
import { FEATURE_STATUSES, type Feature, type FeaturePatch } from '../db/features.ts';
import type { Store } from '../db/store.ts';
import { invalid } from '../errors.ts';
import type { BridgeTool } from '../room/bridge.ts';
import { agentByName } from './director-stop.ts';
import type { Features } from './features.ts';

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
const num = (a: Args, k: string) => (typeof a[k] === 'number' ? (a[k] as number) : undefined);
function need(a: Args, k: string): string {
  const v = str(a, k)?.trim();
  if (!v) throw invalid(`"${k}" is required.`);
  return v;
}

/** The fields add_feature and edit_feature share. */
const FIELDS = {
  name: { type: 'string', description: 'The feature, in a few words.' },
  description: { type: 'string', description: 'What it is, in plain words.' },
  vision: { type: 'string', description: 'Where it is heading.' },
  status: { type: 'string', enum: [...FEATURE_STATUSES], description: 'now, planned or shipped.' },
  order: { type: 'number', description: 'Place inside its status group; 1 = first. Leave out for last.' },
  pct: { type: 'number', description: 'How far along, 0–100.' },
  owner: { type: 'string', description: 'Who carries it: a person or team (name or id); "" for nobody.' },
};

export function featureTools(features: Features, store: Store, projectId: string): BridgeTool[] {
  const nameOf = (id: string | null) =>
    id ? (store.agents.get(id)?.name ?? store.teams.get(id)?.name ?? id) : null;
  /** The voice says a name; the features folder keeps an agent or team id. */
  const ownerId = (said: string): string | null => {
    const k = said.trim().toLowerCase();
    if (!k || k === 'nobody') return null;
    const id =
      agentByName(store, said)?.id ??
      store.teams.list().find((t) => t.id === said.trim() || t.name.toLowerCase() === k)?.id;
    if (!id) throw invalid(`Nobody and no team called '${said}' — use a name from the summary's people.`);
    return id;
  };
  const line = (f: Feature) => {
    const extra = [f.pct !== null ? `${f.pct}%` : '', nameOf(f.owner) ?? ''].filter(Boolean).join(', ');
    return `${f.id} — ${f.name} [${f.status} #${f.order}${extra ? `, ${extra}` : ''}]`;
  };
  const fields = (a: Args): FeaturePatch => {
    const status = str(a, 'status');
    if (status !== undefined && !FEATURE_STATUSES.includes(status as Feature['status']))
      throw invalid(`"status" is one of: ${FEATURE_STATUSES.join(', ')}.`);
    const pct = num(a, 'pct');
    if (pct !== undefined && (pct < 0 || pct > 100)) throw invalid('"pct" is 0–100.');
    const owner = str(a, 'owner');
    return {
      ...(str(a, 'name')?.trim() ? { name: str(a, 'name')?.trim() } : {}),
      ...(str(a, 'description') !== undefined ? { description: str(a, 'description') } : {}),
      ...(str(a, 'vision') !== undefined ? { vision: str(a, 'vision') } : {}),
      ...(status ? { status: status as Feature['status'] } : {}),
      ...(num(a, 'order') !== undefined ? { order: num(a, 'order') } : {}),
      ...(pct !== undefined ? { pct } : {}),
      ...(owner !== undefined ? { owner: ownerId(owner) } : {}),
    };
  };

  return [
    {
      name: 'features',
      description: 'See the features list (Now, Planned, Shipped): every feature with its id, place, pct and owner.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const all = features.list(projectId);
        return all.length ? all.map(line).join('\n') : 'The features list is empty.';
      },
    },
    {
      name: 'add_feature',
      description:
        'Add a feature to the features list (Planned unless told otherwise). This does not put anything on the whiteboard or start work.',
      inputSchema: { type: 'object', properties: FIELDS, required: ['name'] },
      run: async (a) => {
        const f = features.create(projectId, { ...fields(a), name: need(a, 'name') });
        return `Added to the features list: ${line(f)}`;
      },
    },
    {
      name: 'edit_feature',
      description:
        'Change a feature: name, description, vision, status (move between now, planned and shipped), order, pct or owner.',
      inputSchema: {
        type: 'object',
        properties: { feature: { type: 'string', description: 'The feature id.' }, ...FIELDS },
        required: ['feature'],
      },
      run: async (a) => `Feature updated: ${line(features.update(projectId, need(a, 'feature'), fields(a)))}`,
    },
    {
      name: 'remove_feature',
      description: 'Take a feature off the features list (wrong, duplicate or no longer wanted). It cannot be undone.',
      inputSchema: {
        type: 'object',
        properties: { feature: { type: 'string', description: 'The feature id.' } },
        required: ['feature'],
      },
      run: async (a) => `Removed from the features list: ${features.remove(projectId, need(a, 'feature')).name}`,
    },
  ];
}
