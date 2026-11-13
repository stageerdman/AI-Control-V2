/* "Ask <author> a follow-up" from the studio-wide #reports: the office isn't mounted yet, so the
   request waits here until that project's office opens and takes it (once). */
export type FollowUp = { projectId: string; agentId: string; title: string };
let pending: FollowUp | null = null;

export function setPendingFollowUp(f: FollowUp): void {
  pending = f;
}
/** The follow-up waiting for this office, consumed on read. */
export function takePendingFollowUp(projectId: string): { agentId: string; title: string } | null {
  if (!pending || pending.projectId !== projectId) return null;
  const { agentId, title } = pending;
  pending = null;
  return { agentId, title };
}
