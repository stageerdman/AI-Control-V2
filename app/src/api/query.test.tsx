// @vitest-environment happy-dom
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearQueryCache, invalidate, setQueryData, useMutation, useQuery } from './query';

function Show({ k, f }: { k: string; f: () => Promise<string> }) {
  const q = useQuery(k, f);
  return <p>{q.loading ? 'loading' : q.error ? `err:${q.error.message}` : q.data}</p>;
}

let m!: ReturnType<typeof useMutation<number, number>>;
function M() {
  m = useMutation(
    async (x: number) => {
      if (x < 0) throw new Error('neg');
      return x * 2;
    },
    { invalidate: ['list'] },
  );
  return <i>{m.pending ? 'pending' : m.error ? m.error.message : String(m.data ?? '')}</i>;
}

describe('useQuery / useMutation', () => {
  afterEach(() => clearQueryCache());

  it('loads once for many readers, then serves from cache', async () => {
    const f = vi.fn(async () => 'hi');
    render(
      <>
        <Show k="a" f={f} />
        <Show k="a" f={f} />
      </>,
    );
    expect(screen.getAllByText('loading')).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText('hi')).toHaveLength(2));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('shows errors, refetches on invalidate (prefix), keeps data while refreshing', async () => {
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error('boom');
      return `v${n}`;
    });
    render(<Show k="project:p:work" f={f} />);
    await screen.findByText('err:boom');
    await act(() => invalidate('project:p'));
    await screen.findByText('v2');
    await act(() => invalidate('project:'));
    await screen.findByText('v3');
    act(() => setQueryData('project:p:work', 'pushed'));
    expect(screen.getByText('pushed')).toBeTruthy();
  });

  it('mutation runs, records errors without throwing from mutate, invalidates', async () => {
    const f = vi.fn(async () => 'list');
    render(
      <>
        <Show k="list" f={f} />
        <M />
      </>,
    );
    await screen.findByText('list');
    await act(async () => {
      expect(await m.mutate(-1)).toBeUndefined();
    });
    expect(screen.getByText('neg')).toBeTruthy();
    await act(async () => {
      expect(await m.mutate(4)).toBe(8);
    });
    expect(screen.getByText('8')).toBeTruthy();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
