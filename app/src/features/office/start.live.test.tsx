// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost:1420/" }
/* Live check (opt-in): the real Start button against a running studio server whose sandbox is ~/dev.
   Run a scratch server (see updates/2026-11-23 READY TO TEST - OPEN/update v1.md), then
   AI_STUDIO_LIVE_API=http://127.0.0.1:<port> npx vitest run src/features/office/start.live.test.tsx
   Erdman Knowledge (a website) opens at its localhost link; MagicCut (a Tauri app) opens its build.
   The page sits at the app's own origin so the studio's CORS lets it in. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, setApiBase } from '../../api';
import { StartButton } from './StartButton';

const opened: string[] = [];
vi.mock('../../shell/external', () => ({ openExternal: (u: string) => opened.push(u) }));

const base = process.env.AI_STUDIO_LIVE_API;
const PROJECTS = {
  site: ['Erdman Knowledge', 'erdman-knowledge'],
  desktop: ['MagicCut', 'supercut'],
} as const;
const ids: Record<string, string> = {};
const call = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

describe.skipIf(!base)('the Start button on real projects', () => {
  beforeAll(async () => {
    setApiBase(base as string);
    const known: { id: string; folder: string | null }[] = await call('GET', '/projects');
    for (const [k, [name, folder]] of Object.entries(PROJECTS))
      ids[k] =
        known.find((p) => p.folder === folder)?.id ?? (await call('POST', '/projects', { name, folder })).id;
  });
  afterAll(async () => {
    for (const id of Object.values(ids)) {
      await call('POST', `/projects/${id}/app/stop`, {});
      await call('DELETE', `/projects/${id}`);
    }
  });
  afterEach(() => {
    cleanup();
    clearQueryCache();
  });

  it('a website: one tap → its localhost link opens and answers', { timeout: 180_000 }, async () => {
    render(<StartButton pid={ids.site as string} />);
    fireEvent.click(await screen.findByRole('button', { name: /Start/ }));
    await waitFor(() => expect(opened).toHaveLength(1), { timeout: 170_000 });
    const url = opened[0] as string;
    expect(url).toMatch(/^http:\/\/localhost:\d+\/$/);
    /* the server answers only once the site does; the studio sees it running at that link */
    expect(await call('GET', `/projects/${ids.site}/app`)).toMatchObject({ status: 'running' });
    expect(await screen.findByRole('link', { name: /Open app/ })).toBeTruthy();
    console.info(`[start.live] Erdman Knowledge opened at ${url}`);
  });

  it('a desktop app: one tap → it opens and the button says Opened', { timeout: 30_000 }, async () => {
    opened.length = 0;
    render(<StartButton pid={ids.desktop as string} />);
    fireEvent.click(await screen.findByRole('button', { name: /Start/ }));
    expect(await screen.findByRole('button', { name: /Opened/ }, { timeout: 25_000 })).toBeTruthy();
    expect(opened).toEqual([]);
    console.info('[start.live] MagicCut opened');
  });
});
