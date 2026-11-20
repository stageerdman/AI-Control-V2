/* Honest task completion: a task counts as done only when its run did real work — a command run, a file
   changed, a commit made or a report filed. A reply that is only a plan (or only reading and asking) is not
   work: the task stays open and its agent carries on, up to MAX_PLAN_ONLY times, then it stops as failed.
   The runtime gathers the evidence (WorkEvidence), dispatch decides with workVerdict. Pure: no I/O here. */

/** What a run did, across all its sessions. */
export type WorkEvidence = {
  /** Tool steps that do work (commands, edits, writes, reports) — never reads, searches, asks or calls. */
  steps: number;
  /** The checkout moved during the run: a new commit, or a report filed. */
  changed: boolean;
  /** A report was filed for this run. */
  reportFiled: boolean;
};

export const NO_WORK: WorkEvidence = { steps: 0, changed: false, reportFiled: false };

/** Activity kinds (runtime/stream.ts) that are real work: running a command, editing or writing a file, filing. */
const WORK_KINDS: ReadonlySet<string> = new Set(['running', 'editing', 'writing']);
export const isWorkStep = (activityKind: string): boolean => WORK_KINDS.has(activityKind);

export const didRealWork = (e: WorkEvidence): boolean => e.steps > 0 || e.changed || e.reportFiled;

/** Plan-only replies a task may carry on from before it stops as failed. */
export const MAX_PLAN_ONLY = 2;

export type WorkVerdict =
  | { kind: 'done' }
  /** Nothing real happened: carry on in the same session (`round` = this carry-on, 1-based). */
  | { kind: 'carry-on'; round: number }
  | { kind: 'failed'; note: string };

/** How a succeeded run ends its task. `needsReport`: a report task is done only with its report filed.
    `planOnlySoFar`: plan-only replies this task already carried on from. */
export function workVerdict(e: WorkEvidence, needsReport: boolean, planOnlySoFar: number): WorkVerdict {
  if (needsReport && !e.reportFiled) return { kind: 'failed', note: 'Finished without filing the report' };
  if (didRealWork(e)) return { kind: 'done' };
  if (planOnlySoFar < MAX_PLAN_ONLY) return { kind: 'carry-on', round: planOnlySoFar + 1 };
  return {
    kind: 'failed',
    note: `Stopped: it replied ${planOnlySoFar + 1} times without doing the work (no command run, no file changed, no report filed).`,
  };
}

/** What the agent reads when its plan-only reply sends it back to work, in the same session. */
export function planOnlyBrief(text: string): string {
  return [
    `Your last reply on "${text}" did no work: no command was run, no file changed, nothing committed or filed. A plan is not the work, so the task is still open.`,
    'Do the work now, in this session: run the commands, change the files, commit as you go.',
    'If you cannot do it, say exactly what blocks you instead of replying with a plan.',
    'When you are done, reply with a short plain-words summary of what you did.',
  ].join('\n\n');
}
