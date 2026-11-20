/* Native Mac builds in the agent shell: what the pure rules allow and refuse, and the real hook script in a Mac
   project, a plain project and the safe shell. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composePrompt } from '../../src/runtime/compose.ts';
import { AGENT_SHELL, MAC_BUILD_TOOLS, macToolsFor } from '../../src/runtime/config.ts';
import { checkMacBuild, type MacContext } from '../../src/runtime/mac-build.ts';
import { isMacProject } from '../../src/runtime/mac-project.ts';
import { hookDecision } from './shell-hook-run.ts';

const ctx: MacContext = { projectDir: '/p/app', cwd: '/p/app', macProject: true, tools: MAC_BUILD_TOOLS };
const SWIFT_OUT = '--cache-path .build/cache --config-path .build/config --security-path .build/security';
const XCODE_OUT = '-derivedDataPath build/DerivedData -packageCachePath build/PackageCache';

describe('Mac build rules', () => {
  it.each([
    `swift build ${SWIFT_OUT}`,
    `swift test ${SWIFT_OUT} --parallel --filter AppTests`,
    `swift build -c release --scratch-path .build/release ${SWIFT_OUT}`,
    `swift build --cache-path=.build/cache --config-path=.build/config --security-path=.build/security`,
    `xcodebuild -scheme App -destination platform=macOS build ${XCODE_OUT}`,
    `xcodebuild test -project App.xcodeproj -scheme App ${XCODE_OUT} -resultBundlePath build/r.xcresult`,
    `xcodebuild build-for-testing ${XCODE_OUT} CODE_SIGNING_ALLOWED=NO SYMROOT=build/sym`,
    'codesign -s - --force --deep build/App.app',
    'codesign -fs - -o runtime --entitlements App.entitlements build/App.app',
    'codesign --sign=- --timestamp=none build/App.app',
    'codesign -dvvv build/App.app',
    'codesign --verify --strict build/App.app',
    'hdiutil create -volname App -srcfolder build/App.app -ov -format UDZO dist/App.dmg',
  ])('allows %s', (cmd) => {
    expect(checkMacBuild(cmd, ctx)).toEqual({ kind: 'allow', tool: cmd.split(' ')[0] });
  });

  it.each([
    [
      'swift build',
      /add --cache-path \.build\/cache --config-path \.build\/config --security-path \.build\/security/,
    ],
    [`swift run ${SWIFT_OUT}`, /Only `swift build` and `swift test`/],
    [`swift package reset ${SWIFT_OUT}`, /Only `swift build`/],
    ['swift', /Only `swift build`/],
    [`swift build ${SWIFT_OUT} --scratch-path /tmp/b`, /'\/tmp\/b' is outside/],
    [
      `swift build --cache-path ../cache --config-path .build/config --security-path .build/security`,
      /'\.\.\/cache' is outside/,
    ],
    [`swift build ${SWIFT_OUT} --package-path ~/other`, /no quotes, \$, ~/],
    [`swift build ${SWIFT_OUT} -Xlinker -o -Xlinker /usr/local/bin/x`, /outside the project/],
    [`swift build ${SWIFT_OUT} -Xswiftc -I/opt/x`, /'\/opt\/x' is outside/],
    [`swift build ${SWIFT_OUT} # gone`, /no quotes/],
    [`swift build ${SWIFT_OUT}; rm -rf /`, /no quotes/],
    [
      'xcodebuild -scheme App build',
      /add -derivedDataPath build\/DerivedData -packageCachePath build\/PackageCache/,
    ],
    [`xcodebuild -scheme App ${XCODE_OUT}`, /Name the xcodebuild action/],
    [`xcodebuild archive -scheme App ${XCODE_OUT}`, /archive isn't allowed/],
    [`xcodebuild -exportArchive -archivePath build/a ${XCODE_OUT}`, /-exportArchive isn't allowed/],
    [`xcodebuild build -allowProvisioningUpdates ${XCODE_OUT}`, /-allowProvisioningUpdates isn't allowed/],
    [
      `xcodebuild build -derivedDataPath /Users/x/Library/DerivedData -packageCachePath build/p`,
      /outside the project/,
    ],
    [`xcodebuild build ${XCODE_OUT} DSTROOT=/Applications`, /'\/Applications' is outside/],
    [`xcodebuild build ${XCODE_OUT} OTHER_CODE_SIGN_FLAGS=--keychain=x`, /keychains/],
    ['xcodebuild -destination "platform=macOS" build', /no quotes/],
    ['codesign -s "Developer ID Application" build/App.app', /no quotes/],
    ['codesign -s ABCDEF1234 build/App.app', /ad-hoc only/],
    ['codesign --sign=Me build/App.app', /ad-hoc only/],
    ['codesign -s - --keychain login.keychain build/App.app', /keychains/],
    ['codesign -s - --timestamp build/App.app', /--timestamp isn't allowed/],
    ['codesign -s - /Applications/Safari.app', /outside the project/],
    ['codesign -s -', /needs a file/],
    ['codesign -fsx - build/App.app', /unknown flags/],
    ['hdiutil attach dist/App.dmg', /Only `hdiutil create`/],
    ['hdiutil create -volname App /tmp/App.dmg', /outside the project/],
    ['hdiutil create -encryption AES-256 -stdinpass dist/App.dmg', /-encryption isn't allowed/],
    ['hdiutil create -attach dist/App.dmg', /-attach isn't allowed/],
    ['hdiutil create -srcfolder ../secrets dist/App.dmg', /outside the project/],
    ['hdiutil create -volname App', /needs one image path/],
  ])('refuses %s', (cmd, why) => {
    const r = checkMacBuild(cmd, ctx);
    expect(r.kind).toBe('deny');
    expect(r.kind === 'deny' && r.reason).toMatch(why);
  });

  it('suggests output paths relative to where the command runs, and refuses running outside the project', () => {
    const sub = checkMacBuild('swift build', { ...ctx, cwd: '/p/app/Sources' });
    expect(sub.kind === 'deny' && sub.reason).toMatch('--cache-path ../.build/cache');
    expect(checkMacBuild(`swift build ${SWIFT_OUT}`, { ...ctx, cwd: '/p' })).toMatchObject({
      reason: 'Run swift from inside the project folder',
    });
  });

  it('a project that is not a Mac project keeps the current rules: the same commands are refused', () => {
    const plain = { ...ctx, macProject: false };
    for (const cmd of [
      `swift build ${SWIFT_OUT}`,
      `xcodebuild build ${XCODE_OUT}`,
      'codesign -s - a.app',
      'hdiutil create a.dmg',
    ])
      expect(checkMacBuild(cmd, plain)).toMatchObject({
        kind: 'deny',
        reason: expect.stringMatching(/only allowed in native Mac projects/),
      });
  });

  it('leaves every other command (and shells without the Mac tools) to the normal rules', () => {
    for (const cmd of [
      'npm test',
      'git status',
      'rm -rf /',
      'swiftc main.swift',
      'xcrun notarytool submit x',
      'security find-identity',
      '',
    ])
      expect(checkMacBuild(cmd, ctx)).toEqual({ kind: 'plain' });
    expect(checkMacBuild(`swift build ${SWIFT_OUT}`, { ...ctx, tools: [] })).toEqual({ kind: 'plain' });
    expect(macToolsFor(AGENT_SHELL.dev)).toEqual(MAC_BUILD_TOOLS);
    expect(macToolsFor(AGENT_SHELL.safe)).toEqual([]);
  });
});

describe('Mac projects', () => {
  const folder = (files: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'mac-project-'));
    for (const f of files)
      if (f.endsWith('.xcodeproj')) mkdirSync(join(dir, f));
      else writeFileSync(join(dir, f), '');
    return dir;
  };

  it('are spotted by a Package.swift or an .xcodeproj in the project folder', () => {
    expect(isMacProject(folder(['Package.swift']))).toBe(true);
    expect(isMacProject(folder(['App.xcodeproj']))).toBe(true);
    expect(isMacProject(folder(['package.json']))).toBe(false);
    expect(isMacProject('/no/such/folder')).toBe(false);
  });

  it('the hook script approves Mac builds only in Mac projects, with the Mac tools granted', () => {
    const decide = hookDecision;
    const mac = folder(['Package.swift']);
    const web = folder(['package.json']);
    expect(decide(mac, `swift test ${SWIFT_OUT}`)).toBe('allow');
    expect(decide(mac, 'swift test')).toBe('deny');
    expect(decide(mac, 'PORT=1 swift test')).toBe('deny'); // settings in front stay limited to the plain shell
    expect(decide(mac, 'npm test')).toBe('normal rules');
    expect(decide(web, `swift test ${SWIFT_OUT}`)).toBe('deny');
    expect(decide(web, 'npm test')).toBe('normal rules');
    expect(decide(mac, `swift test ${SWIFT_OUT}`, [])).toBe('normal rules'); // the safe shell has no Mac tools
  });

  it('agents in Mac projects are told what is approved and where the output goes', () => {
    const base = { agent: { name: 'A', prompt: 'p', role: 'r' }, project: { name: 'P' } };
    const told = composePrompt({ ...base, macBuilds: true });
    expect(told).toContain(`\`swift build\` and \`swift test\` with \`${SWIFT_OUT}\``);
    expect(told).toContain(`\`xcodebuild\` build or test with \`${XCODE_OUT}\``);
    expect(composePrompt(base)).not.toContain('native Mac project');
  });
});
