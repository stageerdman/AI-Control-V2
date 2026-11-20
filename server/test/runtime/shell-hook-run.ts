/* Runs the real shell hook (src/runtime/shell-hook.ts) the way Claude Code does for one Bash call in a project
   folder → its decision ('allow' | 'deny'), or 'normal rules' when it stays silent. */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { AGENT_SHELL, MAC_BUILD_TOOLS } from '../../src/runtime/config.ts';

const HOOK = join(import.meta.dirname, '../../src/runtime/shell-hook.ts');

export function hookDecision(
  projectDir: string,
  command: string,
  macTools: readonly string[] = MAC_BUILD_TOOLS,
) {
  const out = execFileSync(process.execPath, [HOOK, AGENT_SHELL.dev.join(','), macTools.join(',')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: projectDir }),
    env: { ...process.env, AI_STUDIO_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
  return out ? (JSON.parse(out).hookSpecificOutput.permissionDecision as 'allow' | 'deny') : 'normal rules';
}
