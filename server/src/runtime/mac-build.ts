/* Native Mac builds in the agent shell (pure). In a Mac project (a Package.swift or .xcodeproj in the project
   folder) the shell hook approves `swift build|test`, `xcodebuild` build/test, ad-hoc `codesign -s -` and
   `hdiutil create` — and only with every output inside the project folder: SwiftPM's caches and Xcode's
   DerivedData / package cache must be pointed there (the default is ~/Library). Anything else these tools
   do — keychains, certificates, archives, mounting images, paths outside the project — is refused.
   Paths are checked lexically against the project folder. */
import { isAbsolute, join, relative, resolve } from 'node:path';

export type MacBuildCheck =
  /** Not one of the Mac build tools: the normal rules decide. */
  { kind: 'plain' } | { kind: 'allow'; tool: string } | { kind: 'deny'; reason: string };

export type MacContext = {
  /** The project folder (absolute). */
  projectDir: string;
  /** Where the command runs (absolute). */
  cwd: string;
  /** A Package.swift or .xcodeproj sits in the project folder (mac-project.ts). */
  macProject: boolean;
  /** The Mac build tools this shell grants ([] = none, e.g. the safe shell). */
  tools: readonly string[];
};

/** Where each tool's output goes, relative to the project folder — the flags a command must carry. */
export const OUTPUT_FLAGS = {
  swift: [
    ['--cache-path', '.build/cache'],
    ['--config-path', '.build/config'],
    ['--security-path', '.build/security'],
  ],
  xcodebuild: [
    ['-derivedDataPath', 'build/DerivedData'],
    ['-packageCachePath', 'build/PackageCache'],
  ],
} as const;

/** One program with literal arguments: no shell syntax, quoting, home (`~`), globs or comments. */
const UNSAFE = /[$`;&|<>()\\\n\r'"~*?[\]{}#!]/;

export function checkMacBuild(raw: string, ctx: MacContext): MacBuildCheck {
  const [tool, ...args] = raw.trim().split(/\s+/);
  if (!tool || !ctx.tools.includes(tool)) return { kind: 'plain' };
  const why = refusal(tool, args, ctx);
  return why ? { kind: 'deny', reason: why } : { kind: 'allow', tool };
}

function refusal(tool: string, args: string[], ctx: MacContext): string | null {
  if (!ctx.macProject)
    return `${tool} is only allowed in native Mac projects (a Package.swift or .xcodeproj in the project folder)`;
  const line = [tool, ...args].join(' ');
  if (UNSAFE.test(line))
    return `Run ${tool} as one plain command with literal arguments — no quotes, $, ~, globs, #, ;, &, |, <, >, ( ) or \\`;
  if (/keychain/i.test(line)) return `${tool} may not use keychains here`;
  if (!inside(ctx.projectDir, ctx.cwd)) return `Run ${tool} from inside the project folder`;
  const outside = args.flatMap(pathsIn).find((p) => !inside(ctx.projectDir, resolve(ctx.cwd, p)));
  if (outside !== undefined)
    return `'${outside}' is outside the project folder — keep ${tool}'s files inside it`;
  return TOOL_RULES[tool]?.(args, ctx) ?? null;
}

const inside = (dir: string, p: string) => {
  const r = relative(dir, p);
  return r === '' || (r !== '..' && !r.startsWith('../') && !isAbsolute(r));
};

/** Everything in an argument that could name a path: `a/b`, `KEY=/x`, `--flag=../x`, `-I/x`, `-opt:a,b`. */
function pathsIn(arg: string): string[] {
  const body = arg.startsWith('-') ? arg.replace(/^-+[A-Za-z0-9_-]*/, '') : arg;
  return body.split(/[=:,]/).filter(Boolean);
}

const TOOL_RULES: Record<string, (args: string[], ctx: MacContext) => string | null> = {
  swift: swiftRule,
  xcodebuild: xcodebuildRule,
  codesign: codesignRule,
  hdiutil: hdiutilRule,
};

const hasFlag = (args: string[], flag: string) => args.some((a) => a === flag || a.startsWith(`${flag}=`));

/** The output flags a command lacks, written out ready to paste (paths relative to where it runs). */
function missingOutput(tool: keyof typeof OUTPUT_FLAGS, args: string[], ctx: MacContext): string | null {
  const missing = OUTPUT_FLAGS[tool].filter(([flag]) => !hasFlag(args, flag));
  if (!missing.length) return null;
  const add = missing
    .map(([flag, dir]) => `${flag} ${relative(ctx.cwd, join(ctx.projectDir, dir))}`)
    .join(' ');
  return `Keep ${tool}'s output inside the project folder: add ${add}`;
}

function swiftRule(args: string[], ctx: MacContext): string | null {
  if (args[0] !== 'build' && args[0] !== 'test') return 'Only `swift build` and `swift test` are allowed';
  return missingOutput('swift', args, ctx);
}

const XCODE_ACTIONS = ['build', 'test', 'build-for-testing', 'test-without-building'];
const XCODE_REFUSED = new Set([
  'archive',
  'install',
  'installsrc',
  'docbuild',
  '-exportArchive',
  '-exportNotarizedApp',
  '-exportLocalizations',
  '-importLocalizations',
  '-create-xcframework',
  '-archivePath',
  '-exportPath',
  '-allowProvisioningUpdates',
  '-allowProvisioningDeviceRegistration',
  '-authenticationKeyPath',
  '-authenticationKeyID',
  '-authenticationKeyIssuerID',
  '-runFirstLaunch',
  '-downloadPlatform',
  '-downloadAllPlatforms',
  '-downloadComponent',
  '-importPlatform',
  '-license',
]);

function xcodebuildRule(args: string[], ctx: MacContext): string | null {
  const refused = args.find((a) => XCODE_REFUSED.has(a));
  if (refused) return `xcodebuild ${refused} isn't allowed here — only build and test`;
  if (!args.some((a) => XCODE_ACTIONS.includes(a)))
    return `Name the xcodebuild action: ${XCODE_ACTIONS.join(', ')}`;
  return missingOutput('xcodebuild', args, ctx);
}

/** codesign: ad-hoc signing (`-s -`), verifying and displaying — nothing that needs an identity. */
const SIGN_BOOL = new Set([
  '-f',
  '--force',
  '--deep',
  '-v',
  '--verify',
  '-d',
  '--display',
  '--strict',
  '--timestamp=none',
]);
const SIGN_VALUE = new Set(['-s', '--sign', '-o', '--options', '--entitlements', '-i', '--identifier']);

function codesignRule(args: string[]): string | null {
  const flags = expandShort(args);
  if (!flags)
    return 'codesign: unknown flags — allowed are -s -, -f, -v, -d, --deep, -o, -i, --entitlements, --strict';
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i] as string;
    const [name, inline] = f.startsWith('--') ? splitLong(f) : [f, undefined];
    if (SIGN_BOOL.has(f) || !f.startsWith('-')) continue;
    if (!SIGN_VALUE.has(name)) return `codesign ${name} isn't allowed here — ad-hoc or local signing only`;
    const value = inline ?? flags[++i];
    if (value === undefined) return `codesign ${name} needs a value`;
    if ((name === '-s' || name === '--sign') && value !== '-')
      return 'codesign signs ad-hoc only here: use -s - (no identities or certificates)';
  }
  return flags.some((f) => !f.startsWith('-')) ? null : 'codesign needs a file inside the project to work on';
}

const splitLong = (f: string): [string, string | undefined] => {
  const eq = f.indexOf('=');
  return eq < 0 ? [f, undefined] : [f.slice(0, eq), f.slice(eq + 1)];
};

/** `-fs -` → `-f -s -`, `-dvvv` → `-d -v -v -v`; null when a short flag is unknown. A lone `-` is a value. */
function expandShort(args: string[]): string[] | null {
  const out: string[] = [];
  for (const a of args) {
    if (!/^-[A-Za-z]{2,}$/.test(a)) {
      out.push(a);
      continue;
    }
    const letters = [...a.slice(1)].map((c) => `-${c}`);
    if (letters.some((l, i) => !SIGN_BOOL.has(l) && !(SIGN_VALUE.has(l) && i === letters.length - 1)))
      return null;
    out.push(...letters);
  }
  return out;
}

/** hdiutil: `create` only — no attaching, mounting, encryption or certificates. */
const DMG_BOOL = new Set(['-ov', '-quiet', '-verbose', '-nospotlight']);
const DMG_VALUE = new Set([
  '-volname',
  '-srcfolder',
  '-srcdir',
  '-format',
  '-fs',
  '-size',
  '-type',
  '-layout',
  '-megabytes',
]);

function hdiutilRule(args: string[]): string | null {
  if (args[0] !== 'create')
    return 'Only `hdiutil create` is allowed (a disk image inside the project folder)';
  let images = 0;
  for (let i = 1; i < args.length; i++) {
    const a = args[i] as string;
    if (DMG_VALUE.has(a)) i++;
    else if (a.startsWith('-') && !DMG_BOOL.has(a))
      return `hdiutil create ${a} isn't allowed here — allowed: ${[...DMG_VALUE, ...DMG_BOOL].join(' ')}`;
    else if (!a.startsWith('-')) images++;
  }
  return images === 1 ? null : 'hdiutil create needs one image path inside the project folder';
}
