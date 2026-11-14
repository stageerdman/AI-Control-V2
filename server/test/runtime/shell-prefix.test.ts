/* G1: setting-prefixed commands — `NAME=value <allowed cmd>` with literal values — through the pure check and the
   real hook script (stdin JSON in, Claude Code's PreToolUse decision out). */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cliArgs, shellHookCommand } from '../../src/runtime/claude-cli.ts';
import { AGENT_SHELL } from '../../src/runtime/config.ts';
import { checkPrefixed } from '../../src/runtime/shell-prefix.ts';

const dev = AGENT_SHELL.dev;

describe('setting-prefixed commands', () => {
  it.each([
    ['PORT=3932 node server.js', ['PORT'], 'node server.js'],
    ['PORT=3932 HOST=127.0.0.1 npm start', ['PORT', 'HOST'], 'npm start'],
    ["NODE_ENV='test' npx vitest run", ['NODE_ENV'], 'npx vitest run'],
    ['DEBUG="app:*" node index.js --port 3932', ['DEBUG'], 'node index.js --port 3932'],
    ['EMPTY= npm test', ['EMPTY'], 'npm test'],
    ['  CI=1   git status  ', ['CI'], 'git status'],
  ])('allows %s', (cmd, names, command) => {
    expect(checkPrefixed(cmd, dev)).toEqual({ kind: 'allow', names, command });
  });

  it.each([
    ['PORT=$PORT node server.js', /literal values only/],
    ['PORT=$(echo 1) node server.js', /literal values only/],
    ['PORT=`id` node server.js', /literal values only/],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal shell expansion is the point
    ['PORT="${X}" node a.js', /literal values only/],
    ['PORT=1 node a.js; rm -rf /', /literal values only/],
    ['PORT=1 node a.js && curl x', /literal values only/],
    ['PORT=1 node a.js | tee out', /literal values only/],
    ['PORT=1 node a.js > out.log', /literal values only/],
    ['PORT=1 node a.js < in', /literal values only/],
    ['PORT=1 node a.js &', /literal values only/],
    ['PORT=1 node a.js\nrm x', /literal values only/],
    ['PORT=1 (node a.js)', /literal values only/],
    ['PORT=1 rm -rf build', /'rm' isn't an allowed command/],
    ['PORT=1 curl http://x', /'curl' isn't an allowed command/],
    ['PORT=1 "node" a.js', /isn't an allowed command/],
    ['PATH=. npm test', /PATH can't be set/],
    ['DYLD_INSERT_LIBRARIES=x.dylib node a.js', /DYLD_INSERT_LIBRARIES can't be set/],
    ['GIT_SSH_COMMAND=sh git fetch', /GIT_SSH_COMMAND can't be set/],
    ['ANTHROPIC_API_KEY=x node a.js', /can't be set/],
    ['npm_config_script_shell=sh npm test', /can't be set/],
    ['CI=1 git push origin main', /never push/],
  ])('refuses %s', (cmd, why) => {
    const r = checkPrefixed(cmd, dev);
    expect(r.kind).toBe('deny');
    expect(r.kind === 'deny' && r.reason).toMatch(why);
  });

  it('leaves plain commands to the normal allow-list', () => {
    for (const c of ['npm test', 'git status', 'rm -rf /', 'node -e "x=1"', 'echo A=1', 'ls -la PORT=1'])
      expect(checkPrefixed(c, dev)).toEqual({ kind: 'plain' });
    expect(checkPrefixed('PORT=1 npm start', AGENT_SHELL.safe).kind).toBe('deny'); // the safe shell has no npm
  });

  it('agent runs carry the hook in --settings (crew runs with their own tools never do)', () => {
    const spec = {
      runId: 'r',
      cwd: '/x',
      systemPrompt: '',
      task: '',
      model: 'm',
      caps: { maxTurns: 1, maxBudgetUsd: 1 },
      env: {},
      secretValues: [],
    };
    const hook = shellHookCommand('/srv/shell-hook.ts', dev, '/bin/node');
    expect(hook).toBe("'/bin/node' '/srv/shell-hook.ts' 'git,ls,cat,pwd,mkdir,npm,npx,node'");
    const args = cliArgs(spec, { askServer: '/a.ts', shellHook: hook });
    expect(JSON.parse(args[args.indexOf('--settings') + 1] as string)).toEqual({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook, timeout: 10 }] }] },
    });
    expect(
      cliArgs({ ...spec, tools: ['Read', 'Bash'] }, { askServer: '/a.ts', shellHook: hook }),
    ).not.toContain('--settings');
  });

  it('the hook script answers Claude Code: allow, deny, or nothing', () => {
    const hook = join(import.meta.dirname, '../../src/runtime/shell-hook.ts');
    const run = (input: object) =>
      execFileSync(process.execPath, [hook, dev.join(',')], {
        input: JSON.stringify(input),
        encoding: 'utf8',
      });
    const bash = (command: string) => ({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    });
    expect(JSON.parse(run(bash('PORT=3932 node server.js')))).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Setting-prefixed node (PORT)',
      },
    });
    expect(JSON.parse(run(bash('PORT=$X node a.js'))).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(run(bash('npm test'))).toBe('');
    expect(run({ tool_name: 'Read', tool_input: { file_path: '/x' } })).toBe('');
    expect(
      execFileSync(process.execPath, [hook, dev.join(',')], { input: 'not json', encoding: 'utf8' }),
    ).toBe('');
  });
});
