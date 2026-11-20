/* A working agent's feature tools: `feature` reads the feature its work serves, sets its pct and status, and adds
   one line on what shipped; `propose_feature` asks the director for a new one. Thin adapters over the features service (office/features.ts), like the director's
   feature-tools.ts, so the office updates live (`feature.changed`). */
import type { Feature } from '../db/features.ts';
import type { WorkRepo } from '../db/work.ts';
import { matchFeatures } from '../domain/feature-match.ts';
import { AGENT_FEATURE_STATUSES, PROPOSED_STATUSES } from '../domain/feature-stages.ts';
import { invalid } from '../errors.ts';
import type { BridgeTool } from '../room/bridge.ts';
import { progressPatch } from './feature-tools.ts';
import type { Features } from './features.ts';

type Caller = { projectId: string; runId: string };
const MAX_LINE = 300;

/** The arguments that read or change one feature; list / find take none of them. */
const ONE_FEATURE_ARGS = ['feature', 'pct', 'status', 'line'] as const;

/** One feature in one line: id, name, status, pct. */
const summary = (f: Feature) => `${f.id} — ${f.name} [${f.status}${f.pct !== null ? `, ${f.pct}%` : ''}]`;
/** What the agent reads back after reading or updating one feature. */
const view = (f: Feature) =>
  [summary(f), f.description ? `Description:\n${f.description}` : ''].filter(Boolean).join('\n');

export function agentFeatureTool(deps: { features: Features; work: WorkRepo }, me: Caller): BridgeTool {
  /** The feature this run's whiteboard goal serves (null: not on the whiteboard, or no feature). */
  const goalFeature = () => {
    const item = deps.work.itemByRun(me.runId);
    return (item && deps.work.goal(item.goalId)?.featureId) ?? null;
  };
  const featureId = (said: unknown) => {
    const id = (typeof said === 'string' && said.trim()) || goalFeature();
    if (!id)
      throw invalid(
        'Your work is not linked to a feature — look one up with "find" (part of its name) or "list", then name it by its id in "feature".',
      );
    return id;
  };
  /** list / find: read-only lookups, so an agent whose work has no linked feature can get an id. */
  const lookup = (a: Record<string, unknown>) => {
    if (ONE_FEATURE_ARGS.some((k) => a[k] !== undefined))
      throw invalid('"list" and "find" only look — update with "feature" set to the id.');
    const all = deps.features.list(me.projectId);
    if (a.list === true) return all.length ? all.map(summary).join('\n') : 'The features list is empty.';
    const query = String(a.find).trim();
    const found = matchFeatures(all, query);
    if (!found.length) return `No feature matches “${query}”.`;
    const head = found.length === 1 ? 'One feature matches' : `${found.length} features match`;
    return `${head} “${query}”:\n${found.map(summary).join('\n')}`;
  };
  const withLine = (f: Feature, said: unknown) => {
    const line = typeof said === 'string' ? said.trim().replace(/\s+/g, ' ').slice(0, MAX_LINE) : '';
    return line ? { description: f.description ? `${f.description}\n${line}` : line } : {};
  };

  return {
    name: 'feature',
    description:
      'The feature your work serves (or "feature" by id): read it, or set its pct (0–100) and status (now, planned, shipped) as your work lands, and add one plain line on what shipped. Set shipped only when the whole feature is done. Not linked to a feature? Look one up with "find" (part of its name) or "list" to get its id.',
    inputSchema: {
      type: 'object',
      properties: {
        feature: { type: 'string', description: 'A feature id; leave out for the one your goal serves.' },
        list: { type: 'boolean', description: 'true = list every feature (id, name, status).' },
        find: {
          type: 'string',
          description: 'Find features by name: any case, part of the name is enough; all matches come back.',
        },
        pct: { type: 'number', description: 'How far along the whole feature is, 0–100.' },
        status: { type: 'string', enum: [...AGENT_FEATURE_STATUSES] },
        line: { type: 'string', description: 'One line added to its description: what shipped.' },
      },
    },
    run: async (a) => {
      if (a.list === true || typeof a.find === 'string') return lookup(a);
      const f = deps.features.get(me.projectId, featureId(a.feature));
      const progress = progressPatch(a, AGENT_FEATURE_STATUSES);
      const done = progress.status === 'shipped' && progress.pct === undefined ? { pct: 100 } : {};
      const patch = { ...progress, ...done, ...withLine(f, a.line) };
      if (!Object.keys(patch).length) return view(f);
      return `Feature updated:\n${view(deps.features.update(me.projectId, f.id, patch))}`;
    },
  };
}

/** A working agent's `propose_feature`: ask for a new feature; it waits for the director's yes (then it is on
    the features list) or no. */
export function proposeFeatureTool(
  features: Features,
  me: { projectId: string; agentId: string },
): BridgeTool {
  return {
    name: 'propose_feature',
    description:
      'Propose a new feature for the Features list (never put feature requests in issues.txt). It waits for the orchestrator, who approves it (it lands in Features) or declines it.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The feature, in a few words.' },
        description: { type: 'string', description: 'What it is and why, in plain words.' },
        status: { type: 'string', enum: ['now', 'planned'], description: 'now (being built) or planned.' },
        pct: { type: 'number', description: 'How far along it already is, 0–100.' },
      },
      required: ['name'],
    },
    run: async (a) => {
      const name = typeof a.name === 'string' ? a.name.trim() : '';
      if (!name) throw invalid('"name" is required.');
      const p = features.propose(me.projectId, {
        name,
        description: typeof a.description === 'string' ? a.description.trim() : '',
        ...progressPatch(a, PROPOSED_STATUSES),
        proposedBy: me.agentId,
      });
      return `Proposed “${p.name}” (${p.id}). The orchestrator approves or declines it; once approved it is in Features.`;
    },
  };
}
