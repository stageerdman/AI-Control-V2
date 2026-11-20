/* The agent shell's PreToolUse hook (G1), run by Claude Code before every Bash call:
   `node shell-hook.ts <allowed,commands> [mac,build,tools]` with the hook JSON on stdin. A setting-prefixed command
   (`PORT=3932 node server.js`) is approved or refused here (shell-prefix.ts), and so is a Mac build tool in a native
   Mac project (mac-build.ts; the project folder comes from AI_STUDIO_PROJECT_DIR). Anything else gets no answer,
   so the run's normal allow-list decides. Never prints a value. */
import { checkMacBuild } from './mac-build.ts';
import { isMacProject } from './mac-project.ts';
import { checkPrefixed } from './shell-prefix.ts';

const list = (arg: string | undefined) => (arg ?? '').split(',').filter(Boolean);
const allowed = list(process.argv[2]);
const macTools = list(process.argv[3]);
const projectDir = process.env.AI_STUDIO_PROJECT_DIR;

type Decision = { permissionDecision: 'allow' | 'deny'; permissionDecisionReason: string } | null;

function decide(command: string, cwd: string): Decision {
  const prefixed = checkPrefixed(command, allowed);
  if (prefixed.kind === 'allow')
    return allow(`Setting-prefixed ${prefixed.command.split(/\s+/)[0]} (${prefixed.names.join(', ')})`);
  if (prefixed.kind === 'deny') return deny(prefixed.reason);
  if (!projectDir) return null;
  const mac = checkMacBuild(command, {
    projectDir,
    cwd,
    macProject: isMacProject(projectDir),
    tools: macTools,
  });
  if (mac.kind === 'allow') return allow(`Mac build: ${mac.tool}, output inside the project`);
  return mac.kind === 'deny' ? deny(mac.reason) : null;
}
const allow = (reason: string): Decision => ({
  permissionDecision: 'allow',
  permissionDecisionReason: reason,
});
const deny = (reason: string): Decision => ({ permissionDecision: 'deny', permissionDecisionReason: reason });

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', () => {
  let command = '';
  let cwd = process.cwd();
  try {
    const hook = JSON.parse(input) as {
      tool_name?: string;
      tool_input?: { command?: unknown };
      cwd?: unknown;
    };
    if (hook.tool_name === 'Bash' && typeof hook.tool_input?.command === 'string')
      command = hook.tool_input.command;
    if (typeof hook.cwd === 'string') cwd = hook.cwd;
  } catch {
    process.exit(0); // not ours to judge
  }
  const decision = decide(command, cwd);
  if (decision)
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }),
    );
  process.exit(0);
});
