/* Feature proposals repository: features an agent asked for, waiting for the director's yes or no. A proposal
   is only ever open — approving turns it into a feature, declining drops it; both delete the row. */
import type { ProposedStatus } from '../domain/feature-stages.ts';
import { slugify, uniqueId } from '../domain/ids.ts';
import { notFound } from '../errors.ts';
import type { Db } from './connection.ts';
import { now, type Row, row, rows } from './util.ts';

export type FeatureProposal = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: ProposedStatus;
  pct: number | null;
  /** The agent who proposed it. */
  proposedBy: string;
  createdAt: string;
};
export type ProposalCreate = Pick<FeatureProposal, 'name' | 'proposedBy'> &
  Partial<Pick<FeatureProposal, 'description' | 'status' | 'pct'>>;

const toProposal = (r: Row): FeatureProposal => ({
  id: r.id as string,
  projectId: r.project_id as string,
  name: r.name as string,
  description: r.description as string,
  status: r.status as ProposedStatus,
  pct: (r.pct as number | null) ?? null,
  proposedBy: r.proposed_by as string,
  createdAt: r.created_at as string,
});

export function featureProposalsRepo(db: Db) {
  const repo = {
    /** Oldest first: the order they came in. */
    list: (projectId: string): FeatureProposal[] =>
      rows<Row>(
        db
          .prepare('SELECT * FROM feature_proposals WHERE project_id = ? ORDER BY created_at, rowid')
          .all(projectId),
      ).map(toProposal),
    require(projectId: string, id: string): FeatureProposal {
      const r = row<Row>(
        db.prepare('SELECT * FROM feature_proposals WHERE id = ? AND project_id = ?').get(id, projectId),
      );
      if (!r) throw notFound('Feature proposal', id);
      return toProposal(r);
    },
    create(projectId: string, p: ProposalCreate): FeatureProposal {
      const id = uniqueId(
        `fp-${slugify(p.name, 'feature')}`,
        (x) => db.prepare('SELECT 1 FROM feature_proposals WHERE id = ?').get(x) !== undefined,
      );
      db.prepare(
        `INSERT INTO feature_proposals (id, project_id, name, description, status, pct, proposed_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        projectId,
        p.name,
        p.description ?? '',
        p.status ?? 'planned',
        p.pct ?? null,
        p.proposedBy,
        now(),
      );
      return repo.require(projectId, id);
    },
    remove(projectId: string, id: string): FeatureProposal {
      const cur = repo.require(projectId, id);
      db.prepare('DELETE FROM feature_proposals WHERE id = ?').run(id);
      return cur;
    },
  };
  return repo;
}
