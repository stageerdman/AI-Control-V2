/* Rebuild a project's CLAUDE.md from the global modules (G1). Only the generated part is replaced: everything from
   the last `## Project-specific rules` heading on is the project's own and is kept byte for byte. No such heading →
   refused (we never guess where the project's rules start). `.project`'s `claude_md_generated` moves to today. */
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conflict } from '../errors.ts';
import { commitOnly, dirtyOf, isRepo } from '../setter/git.ts';
import { type CompileInput, compileClaudeMd } from './modules.ts';

export const RULES_HEADING = '## Project-specific rules';

/** Pure: the index of the last `## Project-specific rules` line outside code fences, or -1. */
export function rulesStart(md: string): number {
  let fenced = false;
  let at = -1;
  let offset = 0;
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && line.trimEnd() === RULES_HEADING) at = offset;
    offset += line.length + 1;
  }
  return at;
}

/** Pure: the fresh compile with the existing project rules kept; null when `existing` has no rules section. */
export function rebuildText(existing: string, input: CompileInput): string | null {
  const keep = rulesStart(existing);
  if (keep === -1) return null;
  const fresh = compileClaudeMd(input);
  return fresh.slice(0, rulesStart(fresh)) + existing.slice(keep);
}

export type RebuildResult = { file: 'CLAUDE.md'; changed: boolean; modules: string[]; commit: string | null };

export async function rebuildClaudeMd(
  dir: string,
  input: CompileInput,
  date: string,
): Promise<RebuildResult> {
  const path = join(dir, 'CLAUDE.md');
  if (!existsSync(path) || !lstatSync(path).isFile())
    throw conflict('This project has no CLAUDE.md to rebuild');
  const before = readFileSync(path, 'utf8');
  const next = rebuildText(before, input);
  if (next === null)
    throw conflict(
      `CLAUDE.md has no "${RULES_HEADING}" section — add that heading above the project's own rules, then rebuild`,
    );
  const modules = input.modules.map((m) => m.name);
  const changed: string[] = [];
  if (next !== before) {
    writeFileSync(path, next);
    changed.push('CLAUDE.md');
  }
  const marker = join(dir, '.project');
  if (existsSync(marker) && lstatSync(marker).isFile()) {
    const text = readFileSync(marker, 'utf8');
    const stamped = /^claude_md_generated:.*$/m.test(text)
      ? text.replace(/^claude_md_generated:.*$/m, `claude_md_generated: ${date}`)
      : `${text}${text.endsWith('\n') || !text ? '' : '\n'}claude_md_generated: ${date}\n`;
    if (stamped !== text) {
      /* the compile is current even when the text came out the same (a module was touched, not changed) */
      writeFileSync(marker, stamped);
      changed.push('.project');
    }
  }
  const toCommit = isRepo(dir) ? dirtyOf(dir, changed) : [];
  const commit = toCommit.length
    ? await commitOnly(dir, toCommit, 'AI Studio: rebuild CLAUDE.md from the modules')
    : null;
  return { file: 'CLAUDE.md', changed: changed.includes('CLAUDE.md'), modules, commit };
}
