/* Builder preflight: before a fresh build starts, check its checkout can be built and tested at all — it is a
   git checkout, and the tools its project files call for are on PATH. A build that can't work stops at once with
   why, instead of spending a session finding out. The rules are pure (preflightProblems); gatherFacts does the I/O. */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** A project file → the commands building and testing it needs. */
export const TOOLS_FOR: Record<string, string[]> = {
  'package.json': ['node', 'npm'],
  'Cargo.toml': ['cargo'],
  'Package.swift': ['swift'],
  'pyproject.toml': ['python3'],
  'go.mod': ['go'],
};

export type PreflightFacts = {
  gitRepo: boolean;
  /** Project files found at the checkout's root (keys of TOOLS_FOR). */
  manifests: string[];
  /** Commands from TOOLS_FOR that are not on PATH. */
  missingTools: string[];
};

/** What stops a build before it starts, one plain line each; empty = good to go. */
export function preflightProblems(f: PreflightFacts): string[] {
  const problems: string[] = [];
  if (!f.gitRepo) problems.push("The checkout isn't a git repository, so work can't be committed.");
  for (const m of f.manifests) {
    const missing = (TOOLS_FOR[m] ?? []).filter((t) => f.missingTools.includes(t));
    if (missing.length) problems.push(`${m} needs ${missing.join(' and ')}, but it isn't on PATH.`);
  }
  return problems;
}

const onPath = (tool: string, path: string) =>
  path.split(delimiter).some((d) => d && existsSync(join(d, tool)));

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 5000 });
    return stdout.trim() === 'true';
  } catch {
    return false; // not a repo, or git itself is missing: either way nothing can be committed
  }
}

export async function gatherFacts(cwd: string, path = process.env.PATH ?? ''): Promise<PreflightFacts> {
  const manifests = Object.keys(TOOLS_FOR).filter((m) => existsSync(join(cwd, m)));
  const tools = [...new Set(manifests.flatMap((m) => TOOLS_FOR[m] ?? []))];
  return { gitRepo: await isGitRepo(cwd), manifests, missingTools: tools.filter((t) => !onPath(t, path)) };
}

/** The checkout's problems, ready for dispatch's `preflight` dependency. */
export const preflight = async (cwd: string): Promise<string[]> => preflightProblems(await gatherFacts(cwd));
