/* One report, read like a letter (spec-reports §3): title → meta → question → summary lead →
   body → sources → Archive · Ask <author> a follow-up. Opening it marks it read (once). */
import { useEffect, useRef } from 'react';
import { isApiError, studio, useQuery } from '../../api';
import { Button, toast } from '../../ui';
import { invalidateReports, type Report, reportKey, reportsApi } from './api';
import { Markdown, safeUrl } from './markdown';
import { fullWhen, KIND_LABEL, shortName } from './model';
import { AuthorLine, useCast } from './parts';
import './reports.css';

export function ReportView({
  projectId,
  reportId,
  onBack,
  onFollowUp,
  onArchived,
  projectName,
}: {
  projectId: string;
  reportId: string;
  onBack: () => void;
  /** agentId = who to ask: the author, or the project's orchestrator when the author is gone. */
  onFollowUp: (r: Report, agentId: string) => void;
  onArchived?: () => void;
  /** Studio-wide view: the meta line names the project and links to its office. */
  projectName?: string;
}) {
  const q = useQuery(reportKey(projectId, reportId), () => reportsApi.get(projectId, reportId));
  const project = useQuery(`project:${projectId}`, () => studio.projects.get(projectId));
  const { agents, teams } = useCast();
  const title = useRef<HTMLHeadingElement>(null);
  const marked = useRef(false);
  const r = q.data;

  useEffect(() => {
    if (!r || marked.current) return;
    marked.current = true;
    title.current?.focus({ preventScroll: true });
    if (r.readAt === null)
      void reportsApi
        .patch(projectId, r.id, { read: true })
        .then(() => invalidateReports(projectId))
        .catch(() => undefined);
  }, [r, projectId]);

  const back = (
    <div className="rp-top">
      <button type="button" className="ob-back" data-key="back" aria-label="Back to reports" onClick={onBack}>
        ← Reports
      </button>
    </div>
  );

  if (q.error && !r) {
    const gone = isApiError(q.error) && q.error.status === 404;
    return (
      <div className="rp-page">
        {back}
        {gone ? (
          <p className="rp-gone">This report isn't here any more.</p>
        ) : (
          <div className="rp-error" role="alert" style={{ marginTop: 18 }}>
            <span>Couldn't load this report.</span>
            <Button small onClick={() => void q.refetch()}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }
  if (!r)
    return (
      <div className="rp-page" aria-busy="true">
        {back}
        <span className="rp-bar" style={{ width: '62%', height: 22, margin: '18px 0 14px' }} />
        {[92, 88, 95, 60].map((w) => (
          <span key={w} className="rp-bar" style={{ width: `${w}%`, margin: '8px 0' }} />
        ))}
      </div>
    );

  const author = agents.find((a) => a.id === r.author.agentId);
  const orch = agents.find((a) => a.id === project.data?.orchestratorId);
  const asker = author ?? orch;
  const archived = r.archivedAt !== null;

  const setArchived = async (on: boolean) => {
    try {
      await reportsApi.patch(projectId, r.id, { archived: on });
    } catch (e) {
      toast(`Couldn't ${on ? 'archive' : 'unarchive'}: ${(e as Error).message}`);
      return;
    }
    void invalidateReports(projectId);
    if (on) {
      toast('Archived', {
        undo: () =>
          void reportsApi
            .patch(projectId, r.id, { archived: false })
            .then(() => invalidateReports(projectId))
            .catch(() => undefined),
      });
      (onArchived ?? onBack)();
    } else toast('Back in Reports');
  };

  return (
    <article className="rp-page" aria-labelledby="rpTitle">
      {back}
      <h2 id="rpTitle" ref={title} tabIndex={-1}>
        {r.title}
      </h2>
      <div className="rp-meta">
        <AuthorLine
          author={r.author}
          agents={agents}
          teams={teams}
          tail={
            <>
              <span className="rp-sep" aria-hidden="true">
                ·
              </span>
              <span>{KIND_LABEL[r.kind] ?? 'Report'}</span>
              <span className="rp-sep" aria-hidden="true">
                ·
              </span>
              <time dateTime={r.createdAt}>{fullWhen(r.createdAt)}</time>
              {projectName && (
                <>
                  <span className="rp-sep" aria-hidden="true">
                    ·
                  </span>
                  <a href={`#office/${encodeURIComponent(projectId)}`}>{projectName}</a>
                </>
              )}
            </>
          }
        />
      </div>
      {r.question && (
        <blockquote className="rp-q">
          <p>“{r.question}”</p>
        </blockquote>
      )}
      <p className="rp-lead">{r.summary}</p>
      <hr className="rp-hair" />
      <div className="rp-body">
        <Markdown source={r.body} />
      </div>
      {r.sources.length > 0 && (
        <section className="rp-srcs" aria-labelledby="rpSrc">
          <h3 id="rpSrc">Sources</h3>
          <ol>
            {r.sources.map((s, i) => {
              const href = s.url ? safeUrl(s.url) : null;
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: static list
                <li key={i}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {s.title} ↗
                    </a>
                  ) : (
                    <span>{s.title}</span>
                  )}
                  {s.path && (
                    <>
                      {' '}
                      <code>{s.path}</code>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      <footer className="rp-actions">
        <Button small onClick={() => void setArchived(!archived)}>
          {archived ? 'Unarchive' : 'Archive'}
        </Button>
        {asker && (
          <Button small variant="hero" onClick={() => onFollowUp(r, asker.id)}>
            {author ? `Ask ${shortName(author)} a follow-up` : `Ask ${shortName(asker)}`}
          </Button>
        )}
      </footer>
    </article>
  );
}
