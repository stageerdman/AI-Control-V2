/* Apps the studio opened through macOS (`open`): LaunchServices starts them outside our process tree and without
   our tag, so their bundle paths are written down — in a file, so a crash doesn't forget them. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function openedApps(file: string) {
  const list = (): string[] => {
    if (!existsSync(file)) return [];
    try {
      const v: unknown = JSON.parse(readFileSync(file, 'utf8'));
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch (e) {
      console.error(`[reaper] ignoring unreadable ${file}: ${(e as Error).message}`);
      return [];
    }
  };
  const save = (apps: string[]) => writeFileSync(file, JSON.stringify(apps));
  return {
    list,
    add(app: string) {
      const now = list();
      if (!now.includes(app)) save([...now, app]);
    },
    clear: () => save([]),
  };
}
export type OpenedApps = ReturnType<typeof openedApps>;
