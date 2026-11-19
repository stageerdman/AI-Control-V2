/* A working agent's `feature` tool: read the feature its work serves, set its pct and status, and add one line
   on what shipped. A thin adapter over the features service (office/features.ts), like the director's
   feature-tools.ts, so the office updates live (`feature.changed`). */
import type { Feature } from '../db/features.ts';
import type { WorkRepo } from '../db/work.ts';
import { AGENT_FEATURE_STATUSES } from '../domain/feature-stages.ts';
import { invalid } from '../errors.ts';
import type { BridgeTool } from '../room/bridge.ts';
import { progressPatch } from './feature-tools.ts';
import type { Features } from './features.ts';

type Caller = { projectId: string; runId: string };
const MAX_LINE = 300;

/** What the agent reads back after every call. */
const view = (f: Feature) =>
  [
    `${f.id} — ${f.name} [${f.status}${f.pct !== null ? `, ${f.pct}%` : ''}]`,
    f.description ? `Description:\n${f.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');

export function agentFeatureTool(deps: { features: Features; work: WorkRepo }, me: Caller): BridgeTool {
  /** The feature this run's whiteboard goal serves (null: not on the whiteboard, or no feature). */
  const goalFeature = () => {
    const item = deps.work.itemByRun(me.runId);
    return (item && deps.work.goal(item.goalId)?.featureId) ?? null;
  };
  const featureId = (said: unknown) => {
    const id = (typeof said === 'string' && said.trim()) || goalFeature();
    if (!id) throw invalid('Your work is not linked to a feature — name one by its id.');
    return id;
  };
  const withLine = (f: Feature, said: unknown) => {
    const line = typeof said === 'string' ? said.trim().replace(/\s+/g, ' ').slice(0, MAX_LINE) : '';
    return line ? { description: f.description ? `${f.description}\n${line}` : line } : {};
  };

  return {
    name: 'feature',
    description:
      'The feature your work serves (or "feature" by id): read it, or set its pct (0–100) and status (now, planned, shipped) as your work lands, and add one plain line on what shipped. Set shipped only when the whole feature is done.',
    inputSchema: {
      type: 'object',
      properties: {
        feature: { type: 'string', description: 'A feature id; leave out for the one your goal serves.' },
        pct: { type: 'number', description: 'How far along the whole feature is, 0–100.' },
        status: { type: 'string', enum: [...AGENT_FEATURE_STATUSES] },
        line: { type: 'string', description: 'One line added to its description: what shipped.' },
      },
    },
    run: async (a) => {
      const f = deps.features.get(me.projectId, featureId(a.feature));
      const progress = progressPatch(a, AGENT_FEATURE_STATUSES);
      const done = progress.status === 'shipped' && progress.pct === undefined ? { pct: 100 } : {};
      const patch = { ...progress, ...done, ...withLine(f, a.line) };
      if (!Object.keys(patch).length) return view(f);
      return `Feature updated:\n${view(deps.features.update(me.projectId, f.id, patch))}`;
    },
  };
}
