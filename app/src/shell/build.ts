/* The build this window runs (vite.config.ts stamps it) — hover the brand to see it — and whether it is stale. */
import type { BuildReport } from '../api/types';

declare const __BUILD__: { commit: string; builtAt: string };

export const BUILD = __BUILD__;

export const buildLabel = ({ commit, builtAt }: typeof BUILD) =>
  `Build ${commit} · ${builtAt.slice(0, 16).replace('T', ' ')} UTC`;

export const LOG_FILE = '~/.ai-studio/logs/self-install.log';

/** A short and a full hash name the same commit. */
const same = (a: string, b: string) => a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a));

export type StaleNotice = { tone: 'info' | 'error'; text: string };

/** Why this window is older than the code the backend runs, in plain words — or null when it is current
    (or can't tell). The window's UI is baked in at build time, so a feature merged after it never shows. */
export function staleNotice(windowCommit: string, build: BuildReport | undefined): StaleNotice | null {
  if (!build || build.running === 'unknown' || windowCommit === 'unknown') return null;
  if (same(windowCommit, build.running)) return null;
  const latest = build.running.slice(0, 7);
  if (build.install?.state === 'installing')
    return { tone: 'info', text: `Installing the newest AI Studio (${latest})… reopen the app when it’s done.` };
  if (build.install?.state === 'failed')
    return { tone: 'error', text: `The newest AI Studio (${latest}) didn’t install. Details: ${LOG_FILE}` };
  if (build.installed && same(build.installed.commit, build.running))
    return { tone: 'info', text: `A newer AI Studio (${latest}) is installed — quit and reopen to switch to it.` };
  return { tone: 'error', text: `This window is an older build than ${latest} and no update is installed. Details: ${LOG_FILE}` };
}
