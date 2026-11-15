/* Config — resolved once from the environment, validated with zod.
   The backend owns two dirs (data home + sandbox) and only reads AI Control home. */
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

export type Config = {
  /** Data dir: SQLite db, logs. */
  home: string;
  /** Root for every project folder the backend may write into. */
  sandbox: string;
  /** Global AI Control home (modules, global .env). Read-only for B0/B1. */
  controlHome: string;
  dbPath: string;
  port: number;
  host: string;
};

const EnvSchema = z.object({
  AI_STUDIO_HOME: z.string().trim().min(1).default('~/.ai-studio'),
  AI_STUDIO_SANDBOX: z.string().trim().min(1).default('~/dev'),
  AI_CONTROL_HOME: z.string().trim().min(1).default('~/.ai-control'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4319),
  /* local-only by default: this server can touch the file system */
  HOST: z.string().trim().min(1).default('127.0.0.1'),
});

/** `~` / `~/x` → home-relative; anything else resolved to an absolute path. */
export function expandPath(p: string, home: string = homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return resolve(p);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration — ${issues}`);
  }
  const e = parsed.data;
  const studioHome = expandPath(e.AI_STUDIO_HOME, home);
  return {
    home: studioHome,
    sandbox: expandPath(e.AI_STUDIO_SANDBOX, home),
    controlHome: expandPath(e.AI_CONTROL_HOME, home),
    dbPath: join(studioHome, 'studio.db'),
    port: e.PORT,
    host: e.HOST,
  };
}

/** Create the dirs this backend owns (never AI Control home — that one is the user's). */
export function ensureDirs(config: Config): void {
  mkdirSync(config.home, { recursive: true, mode: 0o700 });
  mkdirSync(config.sandbox, { recursive: true });
}
