/* Work a module starts and doesn't wait for (a checkout being made, a merge, a deferred alert), kept in one
   place so shutdown can wait for all of it before the database closes. */
export function createBackground() {
  const pending = new Set<Promise<unknown>>();
  return {
    /** Run `p` in the background; drain() waits for it. → `p` itself. */
    track<T>(p: Promise<T>): Promise<T> {
      pending.add(p);
      const off = () => pending.delete(p);
      p.then(off, off);
      return p;
    },
    /** Next tick, in the background (a callback that must run after the current settle chain). A throw
        stays loud (uncaught, as from any setImmediate) and never leaves drain() waiting. */
    soon(fn: () => void): void {
      this.track(
        new Promise<void>((resolve) =>
          setImmediate(() => {
            try {
              fn();
            } finally {
              resolve();
            }
          }),
        ),
      );
    },
    /** Resolves once nothing is pending — including work started by the work it waited for. */
    async drain(): Promise<void> {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    size: () => pending.size,
  };
}
export type Background = ReturnType<typeof createBackground>;
