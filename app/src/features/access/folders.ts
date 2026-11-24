/* Folder accesses in the Vault — the plain words and the one request each choice becomes. */
import type { Access, FolderMode } from './api';

export type FolderScope = 'project' | 'all';
export type FolderDraft = { path: string; mode: FolderMode; scope: FolderScope };

/** The safest start: read only, this project only — the user widens it on purpose. */
export const emptyFolderDraft = (): FolderDraft => ({ path: '', mode: 'read', scope: 'project' });

/** "/Users/me/dev/" → "/Users/me/dev"; quotes around a pasted path go. */
export const cleanPath = (p: string) =>
  p
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .replace(/(.)\/+$/, '$1');

/** A folder's own name is the access's name: "/Users/me/dev" → "dev". */
export const folderName = (path: string) => cleanPath(path).split('/').filter(Boolean).at(-1) ?? path;

/** Why "Add folder" can't go yet (null = it can). The server checks the rest (exists, not too broad). */
export function folderBlocker(d: FolderDraft): string | null {
  const p = cleanPath(d.path);
  if (!p) return 'Choose a folder or paste its path.';
  if (!p.startsWith('/')) return 'Use the full path, starting with /.';
  return null;
}

export const modeLabel = (m: FolderMode | null) => (m === 'read' ? 'Read only' : 'Read & write');

/** "Read only · All projects" / "Read & write · Only Aurora". */
export const folderLine = (a: Pick<Access, 'folderMode' | 'localTo'>, projectName: string) =>
  `${modeLabel(a.folderMode)} · ${a.localTo ? `Only ${projectName}` : 'All projects'}`;

export const isFolder = (a: Pick<Access, 'folder'>) => a.folder !== null;
