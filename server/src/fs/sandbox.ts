/* The sandbox is a wall: every project path the backend touches must resolve
   inside the sandbox root — lexically AND after following symlinks. */
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

const inside = (root: string, p: string) => {
  const r = relative(root, p);
  return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r));
};

/** realpath of the deepest existing ancestor, with the not-yet-existing tail re-appended. */
function realpathLoose(p: string): string {
  const tail: string[] = [];
  let cur = p;
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    tail.unshift(basename(cur));
    cur = parent;
  }
  return join(realpathSync(cur), ...tail);
}

/**
 * Resolve `rel` (relative to the sandbox, or absolute but inside it) to a real absolute path.
 * Rejects `..` segments, absolute paths outside the root, and symlinks that lead outside.
 * The target need not exist yet (for paths about to be created).
 */
export function resolveInSandbox(root: string, rel: string): string {
  if (typeof rel !== 'string' || rel.trim() === '') throw new SandboxError('Empty path');
  if (rel.includes('\0')) throw new SandboxError('Path contains a NUL byte');
  if (rel.split(/[\\/]+/).includes('..')) throw new SandboxError(`Path may not contain '..': ${rel}`);
  const realRoot = realpathSync(root);
  const lexical = isAbsolute(rel) ? resolve(rel) : resolve(realRoot, rel);
  /* absolute paths may name the sandbox by its unresolved spelling too */
  if (!inside(realRoot, lexical) && !inside(resolve(root), lexical)) {
    throw new SandboxError(`Path is outside the sandbox: ${rel}`);
  }
  const real = realpathLoose(lexical);
  if (!inside(realRoot, real)) throw new SandboxError(`Path escapes the sandbox via a symlink: ${rel}`);
  return real;
}

/** Canonical sandbox-relative spelling of `p` ('' = the root itself). Same rules as resolveInSandbox. */
export function toSandboxRelative(root: string, p: string): string {
  return relative(realpathSync(root), resolveInSandbox(root, p));
}
