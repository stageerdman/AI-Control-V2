/* How a project starts (F1c): the `run:` line in its `.project` marker (the Setter's format; agents record it when
   they set up the stack), else the obvious npm script. Plus a cheap "is there any code yet?" look the orchestrator
   uses to start an empty project with its stack. Read-only; never follows a symlinked marker. */
import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type RunCommand = { command: string; source: '.project' | 'package.json' };

const readFile = (abs: string): string | null => {
  try {
    return lstatSync(abs).isFile() ? readFileSync(abs, 'utf8') : null;
  } catch {
    return null;
  }
};

/** A `<key>: <command>` line from `.project` (quotes trimmed), null when absent. */
function readCommandLine(text: string, key: 'run' | 'test'): string | null {
  const m = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(text);
  const v = m?.[1]?.replace(/^(["'])(.*)\1$/, '$2').trim();
  return v ? v : null;
}
/** `run: npm run dev` from `.project`, null when absent. */
export const readRunLine = (text: string): string | null => readCommandLine(text, 'run');

/** `test: npm test` from the folder's `.project`: what must pass before work lands (Always Merged). Never
    guessed: no line, no test step. */
export function testCommandOf(folder: string): string | null {
  const marker = readFile(join(folder, '.project'));
  return marker ? readCommandLine(marker, 'test') : null;
}

export function runCommandOf(folder: string): RunCommand | null {
  const marker = readFile(join(folder, '.project'));
  const line = marker ? readRunLine(marker) : null;
  if (line) return { command: line, source: '.project' };
  const pkg = readFile(join(folder, 'package.json'));
  if (!pkg) return null;
  try {
    const scripts = (JSON.parse(pkg) as { scripts?: Record<string, unknown> }).scripts ?? {};
    if (typeof scripts.dev === 'string') return { command: 'npm run dev', source: 'package.json' };
    if (typeof scripts.start === 'string') return { command: 'npm start', source: 'package.json' };
  } catch {
    /* not JSON yet */
  }
  return null;
}

/** Write (or replace) the `run:` line in `.project`; the file must already be a regular file. */
export function writeRunLine(folder: string, command: string): void {
  const abs = join(folder, '.project');
  const text = readFile(abs);
  if (text === null) throw new Error('This project has no .project marker');
  const line = `run: ${command}`;
  const next = /^run:.*$/m.test(text)
    ? text.replace(/^run:.*$/m, line)
    : `${text.endsWith('\n') || !text ? text : `${text}\n`}${line}\n`;
  writeFileSync(abs, next);
}

/** What the Setter's scaffold puts in a folder (+ files every repo has) — anything else is the project's own code. */
const SCAFFOLD = new Set([
  '.git',
  '.project',
  '.gitignore',
  '.env',
  '.env.example',
  '.DS_Store',
  'CLAUDE.md',
  'README.md',
  'issues.txt',
  'updates',
  'tools',
]);

/** The orchestrator's look before planning: is there code yet, and how does it start? */
export function projectState(folder: string): { hasCode: boolean; run: string | null } {
  let hasCode = false;
  try {
    hasCode = readdirSync(folder).some((f) => !SCAFFOLD.has(f));
  } catch {
    /* a missing folder has no code */
  }
  return { hasCode, run: runCommandOf(folder)?.command ?? null };
}
