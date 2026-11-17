// @vitest-environment happy-dom
/* The workflow editor (WORKFLOWS Phase 5b): empty → who starts, read-only for temporary ways, the
   keyboard path (arrow keys move, Enter picks, Connect to… → the arrow form with "only when"), Save,
   the local check (a card with no arrow), teams on the canvas, and 422 / 409 problems pinned to
   their arrow or node. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../characters', () => ({ Hero: () => null }));

import { ApiError } from '../../../api';

type ApiErrorCode = ConstructorParameters<typeof ApiError>[1];

import { type Graph, toDrawing } from './model';
import { WorkflowEditor } from './WorkflowEditor';

const people = [
  { id: 'pete', name: 'Pete' },
  { id: 'semic', name: 'Semic' },
  { id: 'scar', name: 'Scar' },
  { id: 't-ship', name: 'Ship It', team: true },
];
const two: Graph = {
  nodes: [
    { id: 'pete', x: 100, y: 60 },
    { id: 'semic', x: 300, y: 60 },
  ],
  first: 'pete',
  final: null,
  edges: [{ id: 'e1', from: 'pete', to: 'semic', why: 'UI ready' }],
};

afterEach(cleanup);

describe('WorkflowEditor', () => {
  it('empty: the first one picked starts; a lone card is caught before saving', async () => {
    const onSave = vi.fn();
    render(<WorkflowEditor graph={null} people={people} onSave={onSave} />);
    expect(screen.getByText('Start with who picks the work up first.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Who starts'), { target: { value: 'pete' } });
    expect(screen.getByRole('button', { name: /^Pete, Starts here/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Pete: has no arrow yet/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('first-time path: after who starts, + Add someone is right there (the card stays selected)', () => {
    render(<WorkflowEditor graph={null} people={people} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Who starts'), { target: { value: 'pete' } });
    expect(screen.getByRole('button', { name: /^Pete/ }).getAttribute('aria-pressed')).toBe('true');
    /* nothing to connect to yet: no Connect to…, the way forward is adding someone */
    expect(screen.queryByRole('button', { name: 'Connect to…' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Add someone'), { target: { value: 'semic' } });
    expect(screen.getByRole('button', { name: /^Semic/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect to…' })).toBeTruthy();
    expect(screen.getByLabelText('Add someone')).toBeTruthy();
  });

  it('Escape and a click on the empty board clear the selection', () => {
    const { container } = render(<WorkflowEditor graph={two} people={people} onSave={vi.fn()} />);
    const pete = screen.getByRole('button', { name: /^Pete/ });
    fireEvent.click(pete);
    expect(pete.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(pete, { key: 'Escape' });
    expect(pete.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pete);
    fireEvent.click(container.querySelector('.fe-board') as HTMLElement);
    expect(pete.getAttribute('aria-pressed')).toBe('false');
  });

  it('the arrow form says why Add arrow is off', () => {
    render(<WorkflowEditor graph={two} people={people} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Semic/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect to…' }));
    fireEvent.click(screen.getByRole('button', { name: /^Pete.*Connect here/ }));
    const form = screen.getByRole('form', { name: 'Arrow' });
    const add = within(form).getByRole('button', { name: 'Add arrow' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(within(form).getByText('Say why first')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText('Why'), { target: { value: 'back' } });
    expect(within(form).queryByText('Say why first')).toBeNull();
    expect(add.disabled).toBe(false);
  });

  it('someone who signs off every change wears "Checks all work"', () => {
    const g: Graph = {
      ...two,
      final: 'scar',
      nodes: [...two.nodes, { id: 'scar', x: 500, y: 60 }],
      edges: [...two.edges, { id: 'e2', from: '*', to: 'scar', why: 'no crashes', signoff: 'crash-test' }],
    };
    render(<WorkflowEditor graph={g} people={people} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Scar, Checks all work, Signs last' })).toBeTruthy();
  });

  it('a final who signs nothing off saves (a team default way + one sign-off)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const g: Graph = {
      ...two,
      final: 'pete',
      edges: [...two.edges, { id: 'e2', from: 'pete', to: 'semic', why: 'check', signoff: 'review' }],
    };
    render(<WorkflowEditor graph={g} people={people} onSave={onSave} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Pete/ }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it('read-only: one line says who changes it; no tools, no Save', () => {
    render(<WorkflowEditor graph={two} people={people} readOnly="Temporary: ask Pixel to change it." />);
    expect(screen.getByText('Temporary: ask Pixel to change it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByText('Pete hands work to Semic: UI ready')).toBeTruthy();
  });

  it('keyboard: Enter picks, Connect to…, Enter on the other card, a sign-off with "only when", Save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowEditor graph={two} people={people} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /^Pete/ })); // Enter / Space = a click with detail 0
    fireEvent.click(screen.getByRole('button', { name: 'Connect to…' }));
    fireEvent.click(screen.getByRole('button', { name: /^Semic.*Connect here/ }));
    const form = screen.getByRole('form', { name: 'Arrow' });
    /* Pete already hands work to Semic: the arrow left is a sign-off */
    expect((within(form).getByLabelText('Hands work to') as HTMLInputElement).disabled).toBe(true);
    expect((within(form).getByLabelText('Signs off') as HTMLInputElement).checked).toBe(true);
    const add = within(form).getByRole('button', { name: 'Add arrow' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Why'), { target: { value: 'the UI is ready' } });
    fireEvent.change(within(form).getByLabelText('Only when'), { target: { value: 'if it ships' } });
    fireEvent.submit(form);
    expect(screen.getByText('Semic signs off Pete (review), only if it ships: the UI is ready')).toBeTruthy();
    /* Semic signs last */
    fireEvent.click(screen.getByRole('button', { name: /^Semic/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Signs last' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(toDrawing(onSave.mock.calls[0][0])).toEqual({
      gates: [
        { after: 'pete', reviewer: 'semic', kind: 'review', why: 'the UI is ready', when: 'if it ships' },
      ],
      steps: [{ from: 'pete', to: 'semic', why: 'UI ready' }],
      first: 'pete',
      final: 'semic',
      layout: { pete: { x: 100, y: 60 }, semic: { x: 300, y: 60 } },
    });
    await screen.findByText('Saved ✓');
  });

  it('arrow keys move a card (Shift = bigger steps), never off the canvas', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowEditor graph={two} people={people} onSave={onSave} />);
    const pete = screen.getByRole('button', { name: /^Pete/ });
    fireEvent.keyDown(pete, { key: 'ArrowRight' });
    fireEvent.keyDown(pete, { key: 'ArrowDown', shiftKey: true });
    for (let i = 0; i < 4; i++) fireEvent.keyDown(pete, { key: 'ArrowUp', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].nodes[0]).toMatchObject({ x: 120, y: 0 });
  });

  it('a team stands on the canvas: it can start, never sign last or sign off', () => {
    const g: Graph = {
      nodes: [...two.nodes, { id: 't-ship', x: 500, y: 60 }],
      first: 'pete',
      final: null,
      edges: [...two.edges, { id: 'e2', from: 'semic', to: 't-ship', why: 'build it' }],
    };
    render(<WorkflowEditor graph={g} people={people} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ship It, a team/ }));
    expect(screen.getByRole('button', { name: 'Starts here' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Signs last' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect to…' }));
    fireEvent.click(screen.getByRole('button', { name: /^Pete.*Connect here/ }));
    /* a team's work can be signed off by an agent; a team can't sign off */
    const form = screen.getByRole('form', { name: 'Arrow' });
    expect((within(form).getByLabelText('Signs off') as HTMLInputElement).disabled).toBe(false);
  });

  it('a refusal pins each problem to its arrow or card, the rest under the drawing', async () => {
    const g: Graph = {
      ...two,
      edges: [...two.edges, { id: 'e2', from: 'semic', to: 'pete', why: 'check', signoff: 'quality' }],
    };
    const err = new ApiError(409, 'conflict' as ApiErrorCode, 'invalid', [
      { path: 'workflows.0.gates.0.reviewer', message: 'not on this project' },
      { path: 'workflows.0.steps.0.to', message: 'is not an agent or team on this project' },
      { path: 'workflows.0.final', message: 'Scar signs nothing off here' },
      { path: 'workflows.0.layout.semic', message: 'off the canvas' },
    ]);
    const onSave = vi.fn().mockRejectedValue(err);
    render(<WorkflowEditor graph={g} people={people} onSave={onSave} issuePrefix="workflows.0" />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Pete/ }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const gate = (await screen.findByText('not on this project')).closest('li') as HTMLElement;
    expect(within(gate).getByText('Pete signs off Semic (quality): check')).toBeTruthy();
    const step = screen.getByText('is not an agent or team on this project').closest('li') as HTMLElement;
    expect(within(step).getByText('Pete hands work to Semic: UI ready')).toBeTruthy();
    expect(screen.getByText('Signs last: Scar signs nothing off here')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Semic.*problem: off the canvas/ })).toBeTruthy();
  });
});
