import { describe, expect, it } from 'vitest';
import type { Agent, PortsView, Project } from '../../api/types';
import { otherLabel, portRows, portsLine } from './model';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const proj = (id: string, over: Partial<Project> = {}) =>
  ({
    id,
    name: id,
    folder: id,
    status: 'live',
    updatedAt: '2026-11-14T11:00:00Z',
    tile: null,
    ...over,
  }) as unknown as Project;
const block = (projectId: string, app: number, over: Partial<PortsView['projects'][number]> = {}) => ({
  projectId,
  name: projectId[0]?.toUpperCase() + projectId.slice(1),
  block: { app, spares: [app + 1, app + 2, app + 3, app + 4] },
  app: { status: 'stopped' as const, port: null, url: null },
  ports: [app, app + 1, app + 2, app + 3, app + 4].map((port, i) => ({
    port,
    role: i ? ('spare' as const) : ('app' as const),
    listening: false,
    heldBy: null,
  })),
  ...over,
});
const agents = [{ id: 'a1', name: 'Captain Semicolon', nick: 'Captain' }] as Agent[];

describe('the Switchboard', () => {
  it('rows: projects with a folder only, on set first then the back lot (muted), A–Z', () => {
    const view: PortsView = {
      range: { from: 3100, to: 3999 },
      projects: [block('zed', 3300), block('atlas', 3240), block('old', 3410), block('nofolder', 3500)],
    };
    const rows = portRows(
      view,
      [proj('zed'), proj('atlas'), proj('old', { status: 'archived' }), proj('nofolder', { folder: null })],
      agents,
      NOW,
    );
    expect(rows.map((r) => [r.name, r.block, r.muted])).toEqual([
      ['Atlas', '3240–3244', false],
      ['Zed', '3300–3304', false],
      ['Old', '3410–3414', true],
    ]);
  });
  it('also listening: answering spares (with the agent holding them), held-but-quiet spares, never the running app', () => {
    const b = block('tip', 3290, { app: { status: 'running', port: 3290, url: 'http://localhost:3290' } });
    b.ports[0] = { ...b.ports[0], listening: true } as (typeof b.ports)[number];
    b.ports[1] = {
      ...b.ports[1],
      listening: true,
      heldBy: { runId: 'r1', agentId: 'a1' },
    } as (typeof b.ports)[number];
    b.ports[2] = { ...b.ports[2], heldBy: { runId: 'r2', agentId: 'a1' } } as (typeof b.ports)[number];
    b.ports[3] = { ...b.ports[3], listening: true } as (typeof b.ports)[number];
    const [r] = portRows({ range: { from: 3100, to: 3999 }, projects: [b] }, [proj('tip')], agents, NOW);
    expect(r?.app).toEqual({ port: 3290, running: true });
    expect(r?.others.map(otherLabel)).toEqual(['3291 Captain', '3292 held by Captain', '3293']);
    expect(portsLine(b)).toBe('Ports 3290–3294 · app on 3290 · 3291, 3293 also listening');
    expect(portsLine(block('x', 3100))).toBe('Ports 3100–3104 · app on 3100');
  });
  it('something else on the app port while the app is stopped shows up', () => {
    const b = block('tip', 3290);
    b.ports[0] = { ...b.ports[0], listening: true } as (typeof b.ports)[number];
    expect(
      portRows({ range: { from: 3100, to: 3999 }, projects: [b] }, [proj('tip')], [], NOW)[0]?.others,
    ).toEqual([{ port: 3290, who: null, listening: true }]);
  });
});
