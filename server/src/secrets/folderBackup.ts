/* Backups before an agent changes a shared folder. The copy goes to the studio's data dir
   (`<data>/backups/<project>/`): outside the project (never committed) and outside the shared folder (the app
   never sees it). Only a path inside one of the project's granted folders is copied — symlinks followed, so a
   link can't smuggle something from elsewhere in; links inside the copy stay links. */
import { cpSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { conflict, invalid } from '../errors.ts';
import { resolveInSandbox, SandboxError } from '../fs/sandbox.ts';
import type { BridgeTool } from '../room/bridge.ts';

export type Backup = { from: string; to: string };

/** The real path of `target` if it lies inside one of `roots`, else a 422 (none shared, or outside them). */
export function insideShared(roots: readonly string[], target: string): string {
  if (!roots.length) throw conflict('No folder is shared with this project');
  for (const root of roots) {
    try {
      return resolveInSandbox(root, target);
    } catch (e) {
      if (!(e instanceof SandboxError)) throw e;
    }
  }
  throw invalid(`${target} is outside the folders shared with this project (${roots.join(', ')})`, {
    target,
  });
}

/** Copy `target` (a file or folder inside a shared folder) to `<backupsDir>/<stamp>-<name>`. */
export function backUp(roots: readonly string[], target: string, backupsDir: string, stamp: string): Backup {
  const from = insideShared(roots, target);
  if (!existsSync(from)) throw invalid(`Nothing to back up: ${target} doesn't exist`, { target });
  const to = join(backupsDir, `${stamp}-${basename(from)}`);
  cpSync(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
  return { from, to };
}

export const backupStamp = (at: Date) => at.toISOString().replace(/[:.]/g, '-');

/** The `backup_folder` studio tool for one project's runs. */
export function backupTool({
  foldersFor,
  backupsDir,
  now = () => new Date(),
}: {
  foldersFor: () => string[];
  backupsDir: string;
  now?: () => Date;
}): BridgeTool {
  return {
    name: 'backup_folder',
    description:
      'Back up a file or folder inside a folder shared with this project (see "Access you have") before you change it. The copy is kept by the studio, outside the project and the shared folder; you get its path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the file or folder to back up.' },
      },
      required: ['path'],
    },
    run: async (a) => {
      const b = backUp(foldersFor(), String(a.path ?? ''), backupsDir, backupStamp(now()));
      return `Backed up ${b.from} to ${b.to}. To undo a change, tell the user this backup path.`;
    },
  };
}
