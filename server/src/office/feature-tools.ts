/* The director's features tools: thin adapters from MCP arguments to the features service (office/features.ts),
   so a change from the chat behaves exactly like one from the UI (same rules, same `feature.changed`). */
import { FEATURE_STATUSES, type Feature, type FeaturePatch, type FeatureStatus } from '../db/features.ts';
import type { Store } from '../db/store.ts';
import { invalid } from '../errors.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { Features } from './features.ts';
import { agentByName } from './people.ts';

type Args = Record<string, unknown>;
const str = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
const num = (a: Args, k: string) => (typeof a[k] === 'number' ? (a[k] as number) : undefined);
function need(a: Args, k: string): string {
  const v = str(a, k)?.trim();
  if (!v) throw invalid(`"${k}" is required.`);
  return v;
}

/** A feature's status (one of `allowed`) and pct from tool arguments, checked (the director's and the agents'
    feature tools). */
export function progressPatch(
  a: Args,
  allowed: readonly FeatureStatus[] = FEATURE_STATUSES,
): Pick<FeaturePatch, 'status' | 'pct'> {
  const status = str(a, 'status');
  if (status !== undefined && !allowed.includes(status as FeatureStatus))
    throw invalid(`"status" is one of: ${allowed.join(', ')}.`);
  const pct = num(a, 'pct');
  if (pct !== undefined && (pct < 0 || pct > 100)) throw invalid('"pct" is 0–100.');
  return {
    ...(status ? { status: status as Feature['status'] } : {}),
    ...(pct !== undefined ? { pct } : {}),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "3 Nov" this year, "3 Nov 2025" another (UTC, like every stored time). */
export function featureDay(iso: string, today: Date): string {
  const d = new Date(iso);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === today.getUTCFullYear() ? day : `${day} ${d.getUTCFullYear()}`;
}
/** "added 3 Nov" while open, "shipped 19 Nov" / "shelved …" / "denied …" once closed. */
export const featureDate = (f: Feature, today: Date) =>
  f.closedAt ? `${f.status} ${featureDay(f.closedAt, today)}` : `added ${featureDay(f.createdAt, today)}`;

/** The fields add_feature and edit_feature share. */
const FIELDS = {
  name: { type: 'string', description: 'The feature, in a few words.' },
  description: { type: 'string', description: 'What it is and where it is heading, in plain words.' },
  status: {
    type: 'string',
    enum: [...FEATURE_STATUSES],
    description:
      'now (in progress), planned, shipped (done), shelved (paused, may come back) or denied (decided not to build).',
  },
  order: { type: 'number', description: 'Place inside its status group; 1 = first. Leave out for last.' },
  pct: { type: 'number', description: 'How far along, 0–100.' },
  owner: { type: 'string', description: 'Who carries it: a person or team (name or id); "" for nobody.' },
};

export function featureTools(features: Features, store: Store, projectId: string): CapableTool[] {
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
    const extra = [f.pct !== null ? `${f.pct}%` : '', nameOf(f.owner) ?? '', featureDate(f, new Date())]
      .filter(Boolean)
      .join(', ');
    return `${f.id} — ${f.name} [${f.status} #${f.order}, ${extra}]`;
  };
  const fields = (a: Args): FeaturePatch => {
    const owner = str(a, 'owner');
    return {
      ...(str(a, 'name')?.trim() ? { name: str(a, 'name')?.trim() } : {}),
      ...(str(a, 'description') !== undefined ? { description: str(a, 'description') } : {}),
      ...progressPatch(a),
      ...(num(a, 'order') !== undefined ? { order: num(a, 'order') } : {}),
      ...(owner !== undefined ? { owner: ownerId(owner) } : {}),
    };
  };

  return [
    {
      name: 'features',
      can: 'look at the features list (Now / Planned / Shipped / Shelved / Denied) — what the product has, will have and dropped, separate from the whiteboard, with the day each was added or finished ("what did we ship this week?"); look first to get ids',
      description:
        'See the features list (Now, Planned, Shipped, Shelved, Denied): every feature with its id, place, pct, owner and the day it was added (open) or shipped / shelved / denied.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const all = features.list(projectId);
        return all.length ? all.map(line).join('\n') : 'The features list is empty.';
      },
    },
    {
      name: 'add_feature',
      can: '"add X to the features list" / "put X on the roadmap": add a feature (Planned unless the user says otherwise). It starts no work — never also put it on the whiteboard unless the user asks for the work',
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
      can: 'rename or describe a feature, move it between Now / Planned / Shipped / Shelved / Denied ("shelve X" = paused, "deny X" = we decided not to build it, "bring X back" = planned), reorder it, or set its progress or owner',
      description:
        'Change a feature: name, description, status (now, planned, shipped, shelved or denied), order, pct or owner. Shelve or deny instead of removing, so the decision stays on record.',
      inputSchema: {
        type: 'object',
        properties: { feature: { type: 'string', description: 'The feature id.' }, ...FIELDS },
        required: ['feature'],
      },
      run: async (a) => `Feature updated: ${line(features.update(projectId, need(a, 'feature'), fields(a)))}`,
    },
    {
      name: 'remove_feature',
      can: 'take a mistaken or duplicate feature off the features list (it can’t be undone; for "not now" or "no" shelve or deny it instead)',
      description:
        'Take a feature off the features list (a mistake or a duplicate). It cannot be undone; to drop a real idea, shelve or deny it with edit_feature.',
      inputSchema: {
        type: 'object',
        properties: { feature: { type: 'string', description: 'The feature id.' } },
        required: ['feature'],
      },
      run: async (a) =>
        `Removed from the features list: ${features.remove(projectId, need(a, 'feature')).name}`,
    },
  ];
}
