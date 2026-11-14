/* The agent shell's PreToolUse hook (G1), run by Claude Code before every Bash call:
   `node shell-hook.ts <allowed,commands>` with the hook JSON on stdin. A setting-prefixed command
   (`PORT=3932 node server.js`) is approved or refused here (shell-prefix.ts); anything else gets no answer,
   so the run's normal allow-list decides. Never prints a value. */
import { checkPrefixed } from './shell-prefix.ts';

const allowed = (process.argv[2] ?? '').split(',').filter(Boolean);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  input += d;
});
process.stdin.on('end', () => {
  let command = '';
  try {
    const hook = JSON.parse(input) as { tool_name?: string; tool_input?: { command?: unknown } };
    if (hook.tool_name === 'Bash' && typeof hook.tool_input?.command === 'string')
      command = hook.tool_input.command;
  } catch {
    process.exit(0); // not ours to judge
  }
  const r = checkPrefixed(command, allowed);
  if (r.kind === 'plain') process.exit(0);
  const decision =
    r.kind === 'allow'
      ? {
          permissionDecision: 'allow',
          permissionDecisionReason: `Setting-prefixed ${r.command.split(/\s+/)[0]} (${r.names.join(', ')})`,
        }
      : { permissionDecision: 'deny', permissionDecisionReason: r.reason };
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...decision } }));
  process.exit(0);
});
