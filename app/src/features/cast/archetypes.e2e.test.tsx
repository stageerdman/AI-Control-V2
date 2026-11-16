// @vitest-environment happy-dom
/* End to end, app ↔ server: the nine archetype agents exactly as the server installs them
   (server/src/cast-packs/archetypes.ts) draw in the app with their own kit, carry readable hat and
   tool labels, can be picked for a team, and the look picker reaches every new hat and tool by
   keyboard (real buttons, named, in tab order). */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Agent, Look, ToolList, Toolset } from '../../api/types';
import { HATS, hatDecal, heroSVG, lookSlot, ROLE_GEAR, TOOLS } from '../../characters/hero-svg';
import { AgentPanel } from './AgentPanel';
import { LookRig } from './LookRig';
import { candidates, cycleLook, lookTag } from './model';

afterEach(cleanup);

/* The server's own pack, loaded by Vite's glob (TypeScript doesn't follow it, so the server stays out of the app's typecheck). */
type PackAgent = {
  id: string;
  name: string;
  nick?: string;
  roleId: string;
  look: Look;
  prompt: string;
  tools: Toolset;
};
type Pack = { roles: { id: string; name: string }[]; agents: PackAgent[] };
const [mod] = Object.values(
  import.meta.glob<{ ARCHETYPES: Pack }>('../../../../server/src/cast-packs/archetypes.ts', { eager: true }),
);
if (!mod) throw new Error('server/src/cast-packs/archetypes.ts not found');
const { ARCHETYPES } = mod;

const NINE = ARCHETYPES.agents;
const team = (ids: string[]) => ({
  captainId: ids[0] ?? null,
  members: ids.map((agentId) => ({ agentId, instr: '' })),
});
const asAgent = (a: PackAgent): Agent => ({
  id: a.id,
  kind: 'agent',
  system: false,
  name: a.name,
  nick: a.nick ?? null,
  roleId: a.roleId,
  role: ARCHETYPES.roles.find((r) => r.id === a.roleId)?.name ?? '',
  look: a.look as Look,
  prompt: a.prompt,
  teamIds: [],
  projectIds: [],
  canDelete: { ok: true } as unknown as Agent['canDelete'],
  createdAt: '',
  updatedAt: '',
});

describe('the nine archetype agents, server pack → app', () => {
  it('there are nine, with unique ids and names, and each one has a role in the pack', () => {
    expect(NINE).toHaveLength(9);
    expect(new Set(NINE.map((a) => a.id)).size).toBe(9);
    expect(new Set(NINE.map((a) => a.name)).size).toBe(9);
    for (const a of NINE) expect(asAgent(a).role, a.name).not.toBe('');
  });

  it('every look uses a hat and tool the app knows, with a readable label, and draws cleanly', () => {
    for (const a of NINE) {
      const { hat, tool } = a.look;
      expect(HATS[hat], `${a.name} hat ${hat}`).toBeDefined();
      expect(TOOLS[tool], `${a.name} tool ${tool}`).toBeDefined();
      expect(lookSlot('hat').name(hat)).not.toBe(hat);
      expect(lookSlot('tool').name(tool)).not.toBe(tool);
      const svg = heroSVG({ name: a.name, look: a.look }, { size: 'md' });
      expect(svg).toContain('<svg');
      expect(svg).not.toMatch(/undefined|NaN/);
    }
  });

  it('every role id is an app kit, and every chassis decal is a kit the app can draw', () => {
    for (const a of NINE) {
      expect(ROLE_GEAR[a.roleId], a.roleId).toBeDefined();
      /* Sola sets it (no hat); the rest take it from the hat (Bramble's mortarboard → Research, by design) */
      const decal = a.look.decal ?? hatDecal(a.look.hat);
      expect(ROLE_GEAR[decal], `${a.name} decal ${decal}`).toBeDefined();
    }
  });

  it('all nine can be picked for a team, and drop out of the list once they joined', () => {
    const agents = NINE.map(asAgent);
    expect(candidates(agents, team([])).map((a) => a.id)).toEqual(NINE.map((a) => a.id));
    const two = team(['a-sola', 'a-bramble']);
    expect(candidates(agents, two).map((a) => a.id)).not.toContain('a-sola');
    expect(candidates(agents, two)).toHaveLength(7);
  });
});

/* The server's own toolList (what GET /agents sends), so the panel is checked against real data. */
type ToolListFn = (
  a: { tools: Toolset | null; canMail: boolean; reporter: boolean },
  shell: readonly string[],
) => ToolList;
const [tl] = Object.values(
  import.meta.glob<{ toolList: ToolListFn }>('../../../../server/src/domain/tool-list.ts', { eager: true }),
);
if (!tl) throw new Error('server/src/domain/tool-list.ts not found');
const DEV_SHELL = ['git', 'ls', 'cat', 'pwd', 'mkdir', 'npm', 'npx', 'node'];

/** The Tools region's rows as the user reads them: "Edit" → its lines. */
const rows = (region: HTMLElement) =>
  Object.fromEntries(
    [...region.querySelectorAll('.tl-row')].map((r) => [
      r.querySelector('dt')?.textContent,
      [...r.querySelectorAll('dd')].map((d) => d.textContent),
    ]),
  );

describe('the agent panel shows its working tools', () => {
  it("shows every archetype's real Edit / Run / Reach, as the Cast API sends them", () => {
    for (const a of NINE) {
      const toolList = tl.toolList({ tools: a.tools, canMail: true, reporter: false }, DEV_SHELL);
      const agent = { ...asAgent(a), canMail: true, toolList };
      const roles = ARCHETYPES.roles.map((r) => ({ ...r, agentCount: 1, reporter: false }));
      const noop = () => {};
      render(
        <AgentPanel
          agent={agent}
          isNew={false}
          roles={roles}
          teams={[]}
          onName={noop}
          onRole={noop}
          onPrompt={noop}
          onDelete={noop}
          onSaved={noop}
        />,
      );
      const got = rows(screen.getByRole('region', { name: 'Tools' }));
      const or = (xs: string[], none: string) => (xs.length ? xs : [none]);
      expect(got, a.name).toEqual({
        Edit: or(toolList.edit, 'Nothing — reads only'),
        Run: [toolList.run.length ? toolList.run.join(' · ') : 'Nothing'],
        Reach: toolList.reach,
      });
      /* the old prose "works with" lines are gone — one truth, shown once */
      for (const w of a.tools.works) expect(screen.queryByText(w), w).toBeNull();
      cleanup();
    }
  });
});

describe('the look picker, by keyboard', () => {
  it('every arrow is a named button in tab order; the hat and tool rows read their labels', () => {
    const brisk = NINE.find((a) => a.id === 'a-brisk')?.look as Look;
    render(<LookRig look={brisk} px={200} onSlot={() => {}} onDice={() => {}} />);
    const rig = screen.getByRole('group', { name: 'Look' });
    expect(within(rig).getByRole('group', { name: 'Hat: Launch visor' })).toBeTruthy();
    expect(within(rig).getByRole('group', { name: 'Tool: Toy rocket' })).toBeTruthy();
    for (const b of within(rig).getAllByRole('button')) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('tabindex')).not.toBe('-1');
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('Next hat / Next tool step through every new hat and tool, each with a readable tag', () => {
    let look = { ...(NINE[0]?.look as Look), hat: 'none', tool: 'none' };
    const seen = { hat: new Set<string>(), tool: new Set<string>() };
    const step = (slot: 'hat' | 'tool') => {
      look = cycleLook(look, slot, 1);
      seen[slot].add(look[slot]);
      expect(lookTag(look, slot)).not.toMatch(new RegExp(`: ${look[slot]}$`));
    };
    const onSlot = (slot: string) => step(slot as 'hat' | 'tool');
    const { rerender } = render(<LookRig look={look} px={200} onSlot={onSlot} onDice={() => {}} />);
    for (const slot of ['hat', 'tool'] as const) {
      const n = lookSlot(slot).options.length;
      for (let i = 0; i < n; i++) {
        const next = screen.getByRole('button', { name: `Next ${slot}` });
        next.focus();
        expect(document.activeElement).toBe(next);
        fireEvent.click(next); // Enter / Space on a native button
        rerender(<LookRig look={look} px={200} onSlot={onSlot} onDice={() => {}} />);
      }
    }
    for (const a of NINE) {
      expect(seen.hat.has(a.look.hat), a.look.hat).toBe(true);
      expect(seen.tool.has(a.look.tool), a.look.tool).toBe(true);
    }
  });
});
