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

  /* Bug: a report filed while the tray list was loading stayed missing until reload — the
     invalidate reused the fetch that had started before the report existed. */
  it('an invalidate during a fetch refetches once that fetch ends (never keeps the older answer)', async () => {
    const pending: ((v: string) => void)[] = [];
    const f = vi.fn(() => new Promise<string>((res) => pending.push(res)));
    render(<Show k="reports:p" f={f} />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const done = invalidate('reports:p'); /* the report.filed event arrives mid-fetch */
    await act(async () => pending[0]('before'));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    await act(async () => pending[1]('after'));
    await act(() => done);
    expect(screen.getByText('after')).toBeTruthy();
  });

  /* Bug: a reply that landed while the user was out of the office never showed — the thread stayed
     cached as "busy" and the event stream resumed past it. Entering the office invalidates its scope. */
  it('an invalidated key nobody shows refetches on the next mount, keeping the old data meanwhile', async () => {
    let reply = 'busy';
    const f = vi.fn(async () => reply);
    const other = vi.fn(async () => 'other');
    const first = render(
      <>
        <Show k="office:p:thread:a" f={f} />
        <Show k="office:p-2:thread:a" f={other} />
      </>,
    );
    await screen.findByText('busy');
    await screen.findByText('other');
    first.unmount(); // the user leaves the office
    reply = 'the reply';
    await act(() => invalidate('office:p:'));
    expect(f).toHaveBeenCalledTimes(1); // nothing on screen: no fetch yet
    render(
      <>
        <Show k="office:p:thread:a" f={f} />
        <Show k="office:p-2:thread:a" f={other} />
      </>,
    );
    expect(screen.getByText('busy')).toBeTruthy(); // old data while it reads again
    await screen.findByText('the reply');
    expect(other).toHaveBeenCalledTimes(1); // another project's cache is left alone
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
