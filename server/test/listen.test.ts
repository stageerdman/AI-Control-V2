import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { listen, PortInUseError } from '../src/listen.ts';
import { testApp } from './helpers.ts';

describe('listen', () => {
  let h: ReturnType<typeof testApp>;
  const blocker = createServer();
  afterEach(async () => {
    blocker.close();
    await h.close();
  });

  it('fails loudly with a clear PortInUseError when the port is taken', async () => {
    h = testApp();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const port = (blocker.address() as { port: number }).port;
    const err = await listen(h.app, '127.0.0.1', port).catch((e) => e);
    expect(err).toBeInstanceOf(PortInUseError);
    expect(err.message).toMatch(new RegExp(`Port ${port} on 127\\.0\\.0\\.1 is already in use.*PORT=`));
  });

  it('returns the address when the port is free', async () => {
    h = testApp();
    expect(await listen(h.app, '127.0.0.1', 0)).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
