// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { ErrorState, Sheet, Toaster, toast } from './index';

function T() {
  const [open, setOpen] = useState(true);
  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Edit key">
      <input aria-label="name" />
    </Sheet>
  );
}

describe('ui primitives', () => {
  it('Sheet: dialog with a label, Escape and the ✕ close it', () => {
    render(<T />);
    expect(screen.getByRole('dialog', { name: 'Edit key' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('toast with undo runs the undo and dismisses', () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => toast('Agent deleted', { undo }));
    fireEvent.click(screen.getByText('Undo'));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Agent deleted')).toBeNull();
  });

  it('ErrorState shows the server message and validation issues', () => {
    const e = new ApiError(422, 'invalid', 'Request validation failed', [
      { path: 'name', message: 'Required' },
    ]);
    const retry = vi.fn();
    render(<ErrorState error={e} onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('Request validation failed');
    expect(screen.getByText('name: Required')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalled();
  });
});
