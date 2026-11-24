/* Server-Sent Events for one stream: replay what the client missed (after
   Last-Event-ID / ?after=), then live — with no gap and no duplicate: we subscribe
   BEFORE reading the backlog, hold live events until the replay is written, and drop
   anything at or below the last id already sent. Heartbeat comments keep proxies and
   idle timers from closing the pipe. */
import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { type Scope, type StoredEvent, streamKey } from '../events/bus.ts';
import type { EventLog } from '../events/log.ts';

export const HEARTBEAT_MS = 15_000;

/** One SSE frame. Data is single-line JSON (JSON.stringify never emits raw newlines). */
export function frame(e: StoredEvent): string {
  const { id, scope, scopeId, type, payload, at } = e;
  const body = { id, [scope === 'project' ? 'projectId' : 'draftId']: scopeId, type, payload, at };
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(body)}\n\n`;
}

/** Last-Event-ID wins over ?after=; anything unparsable means "from the start". */
export function resumeFrom(req: FastifyRequest): number {
  const header = req.headers['last-event-id'];
  const q = (req.query as { after?: string } | undefined)?.after;
  const raw = (Array.isArray(header) ? header[0] : header) ?? q;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export type OpenStreams = Set<ServerResponse>;

/** Turn the reply into an open SSE pipe with a heartbeat, ended on shutdown (`open`); `onClose` runs once the
    client goes. */
export function openPipe(
  req: FastifyRequest,
  reply: FastifyReply,
  opts: { open: OpenStreams; heartbeatMs?: number; onClose: () => void },
): ServerResponse {
  const res = reply.raw;
  reply.hijack();
  /* headers set by hooks (CORS) must survive the hijack */
  const hooked = Object.fromEntries(Object.entries(reply.getHeaders()).map(([k, v]) => [k, String(v)]));
  res.writeHead(200, {
    ...hooked,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const beat = setInterval(() => res.write(': heartbeat\n\n'), opts.heartbeatMs ?? HEARTBEAT_MS);
  opts.open.add(res);
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(beat);
    opts.open.delete(res);
    opts.onClose();
  };
  res.on('close', cleanup);
  req.raw.on('close', cleanup);
  return res;
}

export function openStream(
  req: FastifyRequest,
  reply: FastifyReply,
  opts: { log: EventLog; scope: Scope; id: string; open: OpenStreams; heartbeatMs?: number },
): void {
  const { log, scope, id, open } = opts;
  let unsubscribe = () => {};
  const res = openPipe(req, reply, {
    open,
    ...(opts.heartbeatMs === undefined ? {} : { heartbeatMs: opts.heartbeatMs }),
    onClose: () => unsubscribe(),
  });

  let last = resumeFrom(req);
  let replaying = true;
  const held: StoredEvent[] = [];
  const send = (e: StoredEvent) => {
    if (e.id <= last) return;
    last = e.id;
    res.write(frame(e));
  };
  unsubscribe = log.bus.subscribe(streamKey(scope, id), (e) => (replaying ? held.push(e) : send(e)));
  for (let batch = log.after(scope, id, last); batch.length; batch = log.after(scope, id, last))
    batch.forEach(send);
  replaying = false;
  held.forEach(send);
}
