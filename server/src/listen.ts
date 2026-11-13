/* Listen, or fail loudly. A second backend on the same port must never look like it
   started: the desktop app may already run one on 4319 (requests would silently go there). */
import type { FastifyInstance } from 'fastify';

export class PortInUseError extends Error {
  constructor(
    readonly host: string,
    readonly port: number,
  ) {
    super(
      `Port ${port} on ${host} is already in use — another AI Studio backend (e.g. the desktop app's) is probably running. ` +
        'Stop it, or start this one with PORT=<free port>.',
    );
    this.name = 'PortInUseError';
  }
}

export async function listen(app: FastifyInstance, host: string, port: number): Promise<string> {
  try {
    return await app.listen({ host, port });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new PortInUseError(host, port);
    throw e;
  }
}
