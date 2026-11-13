/* Projects-home endpoints beyond api/studio.ts. */
import { http } from '../../api';

/** GET /reports — the studio-wide Reports list; the header button only needs the unread count. */
export type StudioReports = { reports: { id: string; projectId: string; title: string }[]; unread: number };
export const studioReports = () => http.get<StudioReports>('/reports?limit=1');
