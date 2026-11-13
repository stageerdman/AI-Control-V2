/* Studio-wide Reports: #reports (every project, newest first) and #reports/<projectId>/<id>
   (one report, opened in place). A plain scene — no office. */
import { useEffect } from 'react';
import { getQueryData } from '../../api';
import type { PageProps } from '../../shell/pages';
import { go } from '../../shell/router';
import { STUDIO_REPORTS_KEY, type StudioReportList } from './api';
import { setPendingFollowUp } from './followup';
import { ReportsList } from './ReportsList';
import { ReportView } from './ReportView';
import './reports.css';

export function ReportsPage({ route }: PageProps<'reports'>) {
  const { projectId, id } = route;
  const open = !!(projectId && id);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('.scrim'))
        go({ name: 'reports' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const projectName =
    projectId &&
    getQueryData<StudioReportList>(STUDIO_REPORTS_KEY)?.reports.find((r) => r.projectId === projectId)
      ?.projectName;

  return (
    <div className="rp-scene">
      <section className={`rp-card${open ? ' wide' : ''}`} aria-label="Reports">
        {open ? (
          <ReportView
            projectId={projectId as string}
            reportId={id as string}
            projectName={projectName || projectId}
            onBack={() => go({ name: 'reports' })}
            onFollowUp={(r, agentId) => {
              setPendingFollowUp({ projectId: r.projectId, agentId, title: r.title });
              go({ name: 'office', projectId: r.projectId, sub: 'room' });
            }}
          />
        ) : (
          <ReportsList
            projectId={null}
            onOpen={(r) => go({ name: 'reports', projectId: r.projectId, id: r.id })}
          />
        )}
      </section>
    </div>
  );
}
