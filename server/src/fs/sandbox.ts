/* The sandbox is a wall: every project path the backend touches must resolve
   inside the sandbox root — lexically AND after following symlinks. */
import { lstatSync, readlinkSync, realpathSync } from 'node:fs';
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

/** realpath of the deepest existing ancestor, with the not-yet-existing tail re-appended.
    A dangling symlink on the way is followed to where it WOULD point (writing through it
    would create its target), so a dangling link out of the sandbox is caught too. */
function realpathLoose(p: string, hops = 0): string {
  if (hops > 40) throw new SandboxError('Too many symlinks');
  const tail: string[] = [];
  let cur = p;
  for (;;) {
    try {
      return join(realpathSync(cur), ...tail);
    } catch {
      /* missing or dangling — look closer */
    }
    let link = false;
    try {
      link = lstatSync(cur).isSymbolicLink();
    } catch {
      /* doesn't exist at all */
    }
    if (link) return join(realpathLoose(resolve(dirname(cur), readlinkSync(cur)), hops + 1), ...tail);
    const parent = dirname(cur);
    if (parent === cur) return join(cur, ...tail);
    tail.unshift(basename(cur));
    cur = parent;
  }
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
