// @vitest-environment happy-dom
/* The workflow editor (WORKFLOWS Phase 5b): empty → first agent, read-only for temporary ways, the
   keyboard path (arrow keys move, Enter picks, Connect to… → the arrow form), Save, and 422 problems
   pinned to their arrow. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../characters', () => ({ Hero: () => null }));

import { ApiError, type ApiErrorCode } from '../../../api';
import type { Graph } from './model';
import { WorkflowEditor } from './WorkflowEditor';

const people = [
  { id: 'pete', name: 'Pete' },
  { id: 'semic', name: 'Semic' },
];
const two: Graph = {
  nodes: [
    { id: 'n1', type: 'agent', agent: 'pete', x: 0, y: 0 },
    { id: 'n2', type: 'agent', agent: 'semic', x: 200, y: 0 },
  ],
  start: 'n1',
  end: 'n2',
  edges: [{ id: 'e1', from: 'n1', to: 'n2', why: 'UI ready' }],
};

afterEach(cleanup);

describe('WorkflowEditor', () => {
  it('empty: the first agent picked starts and signs last', () => {
    render(<WorkflowEditor graph={null} people={people} onSave={vi.fn()} />);
    expect(screen.getByText('Start with who picks the work up first.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('First agent'), { target: { value: 'pete' } });
    expect(screen.getByRole('button', { name: /^Pete, Starts here, Signs last/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('read-only: one line says who changes it; no tools, no Save', () => {
    render(<WorkflowEditor graph={two} people={people} readOnly="Temporary: ask Pixel to change it." />);
    expect(screen.getByText('Temporary: ask Pixel to change it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByText('Pete hands work to Semic: UI ready')).toBeTruthy();
  });

  it('keyboard: Enter picks, Connect to…, Enter on the other node, the arrow form, Save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowEditor graph={{ ...two, edges: [] }} people={people} onSave={onSave} />);
    const pete = screen.getByRole('button', { name: /^Pete/ });
    fireEvent.click(pete); // Enter / Space on a button = a click with detail 0
    fireEvent.click(screen.getByRole('button', { name: 'Connect to…' }));
    fireEvent.click(screen.getByRole('button', { name: /^Semic.*Connect here/ }));
    const form = screen.getByRole('form', { name: 'Arrow' });
    const add = within(form).getByRole('button', { name: 'Add arrow' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Why'), { target: { value: 'the UI is ready' } });
    fireEvent.click(within(form).getByLabelText('Signs off'));
    fireEvent.submit(form);
    expect(screen.getByText('Semic signs off Pete (review): the UI is ready')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].edges).toEqual([
      { id: 'e1', from: 'n1', to: 'n2', why: 'the UI is ready', signoff: 'review' },
    ]);
    await screen.findByText('Saved ✓');
  });

  it('arrow keys move a node (Shift = bigger steps)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<WorkflowEditor graph={two} people={people} onSave={onSave} />);
    const pete = screen.getByRole('button', { name: /^Pete/ });
    fireEvent.keyDown(pete, { key: 'ArrowRight' });
    fireEvent.keyDown(pete, { key: 'ArrowDown', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].nodes[0]).toMatchObject({ x: 20, y: 60 });
  });

  it('a refusal pins each problem to its arrow, the rest under the drawing', async () => {
    const err = new ApiError(422, 'validation' as ApiErrorCode, 'invalid', [
      { path: 'workflows.0.graph.edges.0.why', message: 'say why the work goes this way' },
      { path: 'workflows.0.graph.nodes.1.agent', message: 'not on the project' },
    ]);
    const onSave = vi.fn().mockRejectedValue(err);
    render(<WorkflowEditor graph={two} people={people} onSave={onSave} issuePrefix="workflows.0.graph" />);
    fireEvent.keyDown(screen.getByRole('button', { name: /^Pete/ }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const row = (await screen.findByText('say why the work goes this way')).closest('li') as HTMLElement;
    expect(within(row).getByText('Pete hands work to Semic: UI ready')).toBeTruthy();
    expect(screen.getByText(/Semic\s*: not on the project/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Semic.*problem: not on the project/ })).toBeTruthy();
  });
});
