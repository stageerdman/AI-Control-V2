/* The features folder (U1): Now / Planned / Shipped / Shelved / Denied, each with a plain description.
   The UI edits them; the director's chat tools (feature-tools.ts) go through the same service.
   Every change is announced as `feature.changed` (after the write commits). */
import type { Db } from '../db/connection.ts';
import { type Feature, type FeatureCreate, type FeaturePatch, featuresRepo } from '../db/features.ts';
import type { Store } from '../db/store.ts';
import type { EventLog } from '../events/log.ts';

export function createFeatures(deps: { db: Db; store: Store; events: EventLog }) {
  const { store, events } = deps;
  const repo = featuresRepo(deps.db);
  const announce = (f: Feature, deleted = false) =>
    events.append('project', f.projectId, {
      type: 'feature.changed',
      payload: {
        featureId: f.id,
        name: f.name.slice(0, 120),
        status: f.status,
        order: f.order,
        closedAt: f.closedAt,
        pct: f.pct,
        owner: f.owner,
        ...(deleted ? { deleted: true as const } : {}),
      },
    });
  /* the write + renumbering is one transaction; the event goes out after it commits */
  const write = (fn: () => Feature, deleted = false) => {
    const f = store.tx(fn);
    announce(f, deleted);
    return f;
  };

  return {
    list(projectId: string): Feature[] {
      store.projects.require(projectId);
      return repo.list(projectId);
    },
    get(projectId: string, id: string): Feature {
      store.projects.require(projectId);
      return repo.require(projectId, id);
    },
    create(projectId: string, f: FeatureCreate): Feature {
      store.projects.require(projectId);
      return write(() => repo.create(projectId, f));
    },
    update(projectId: string, id: string, patch: FeaturePatch): Feature {
      store.projects.require(projectId);
      return write(() => repo.update(projectId, id, patch));
    },
    remove(projectId: string, id: string): Feature {
      store.projects.require(projectId);
      return write(() => repo.remove(projectId, id), true);
    },
    /** Read-only view for other services (the orchestrator's summary). */
    repo,
  };
}
export type Features = ReturnType<typeof createFeatures>;
