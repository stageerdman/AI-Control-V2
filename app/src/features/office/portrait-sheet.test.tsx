// @vitest-environment happy-dom
/* OFFICE icon: the picture sheet offers the app's own icon files (one click uses one), and resets to the tile. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../api/types';
import { PortraitBody } from './PortraitSheet';

const tile = { g1: '#ff6f73', g2: '#ffc24b', glyph: 'leaf' };
const proj = (p: Partial<Project> = {}) =>
  ({ id: 'hatch', name: 'Hatch', tile, imageUrl: null, imageSource: null, ...p }) as unknown as Project;
let calls: { method: string; url: string; body?: unknown }[];
let found: string[];
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  calls = [];
  found = ['src-tauri/icons/icon.icns', 'public/favicon.svg'];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input).replace(/^https?:\/\/[^/]+/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url === '/projects/hatch/image/candidates') return json({ paths: found });
      if (url === '/projects/hatch/image/source' && method === 'PUT')
        return json(proj({ imageUrl: '/projects/hatch/image?v=3', imageSource: body.path }));
      if (url === '/projects/hatch/image' && method === 'DELETE') return json(proj());
      return json({ error: { code: 'not_found', message: url } }, 404);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the picture sheet', () => {
  it('shows the app’s icon files and uses one in a click; the chosen one is marked', async () => {
    const saved: Project[] = [];
    const { rerender } = render(<PortraitBody project={proj()} onSaved={(p) => saved.push(p)} />);
    const icns = await screen.findByRole('button', { name: 'Use src-tauri/icons/icon.icns' });
    expect(screen.getByRole('button', { name: 'Use public/favicon.svg' })).toBeTruthy();
    expect(icns.querySelector('img')?.getAttribute('src')).toContain(
      '/projects/hatch/image/preview?path=src-tauri%2Ficons%2Ficon.icns',
    );
    fireEvent.click(icns);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
      url: '/projects/hatch/image/source',
      body: { path: 'src-tauri/icons/icon.icns' },
    });
    expect(screen.getByRole('status').textContent).toMatch(/app’s icon/);
    rerender(<PortraitBody project={saved[0] as Project} onSaved={(p) => saved.push(p)} />);
    expect(
      screen.getByRole('button', { name: 'Use src-tauri/icons/icon.icns' }).getAttribute('aria-pressed'),
    ).toBe('true');
    /* back to the colour tile */
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the tile' }));
    await waitFor(() => expect(saved).toHaveLength(2));
    expect(saved[1]?.imageUrl).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Back to the tile.');
  });

  it('shows no app row when the folder has no icon files; upload stays', async () => {
    found = [];
    render(<PortraitBody project={proj()} onSaved={() => {}} />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/candidates'))).toBe(true));
    expect(screen.queryByText('From the app')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose picture…' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset to the tile' })).toBeNull();
  });

  it('a file that can’t be shown drops out of the row', async () => {
    render(<PortraitBody project={proj()} onSaved={() => {}} />);
    const svg = await screen.findByRole('button', { name: 'Use public/favicon.svg' });
    fireEvent.error(svg.querySelector('img') as HTMLImageElement);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Use public/favicon.svg' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Use src-tauri/icons/icon.icns' })).toBeTruthy();
  });
});
