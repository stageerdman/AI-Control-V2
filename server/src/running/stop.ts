/* RUNNING: stop whole agents, at once — never waiting for a turn to finish.
   - One agent: every session and code run of theirs in this project is stopped now.
   - The whole project: its work queue first (running goals are cancelled, so nothing new starts as the
     stopped runs end), then every session and code run in it. The project's app is the user's own and
     stays up. Other projects are never touched.
   Stopped runs end as cancelled through their own source, so their chat and session stay saved and the
   work can be continued later. */
import type { Running, RunningItem } from './registry.ts';

export type Stopped = { stopped: RunningItem[] };

export function createStopper(deps: {
  running: Running;
  /** Cancel the project's running goals (dispatch), so its queue starts nothing new. */
  cancelGoals: (projectId: string) => void;
}) {
  return {
    agent: (projectId: string, agentId: string): Stopped => ({
      stopped: deps.running.stop({ projectId, agentId }),
    }),
    project(projectId: string): Stopped {
      deps.cancelGoals(projectId);
      return { stopped: deps.running.stop({ projectId }) };
    },
  };
}
export type Stopper = ReturnType<typeof createStopper>;
