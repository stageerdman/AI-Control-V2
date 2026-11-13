/* A tiny real SSE client for tests: connects over HTTP, parses frames, lets a test
   wait for N events. (inject() can't do streams — it waits for the response to end.) */
import { get, type IncomingMessage } from 'node:http';

export type Frame = { id?: string; event?: string; data?: string; comment?: string; retry?: string };

export function parseFrames(text: string): Frame[] {
  return text
    .split('\n\n')
    .filter((b) => b.trim() !== '')
    .map((block) => {
      const f: Frame = {};
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) f.comment = line.slice(1).trim();
        else {
          const i = line.indexOf(':');
          const k = line.slice(0, i) as keyof Frame;
          f[k] = line.slice(i + 1).trimStart();
        }
      }
      return f;
    });
}

export type SseClient = {
  res: IncomingMessage;
  raw: () => string;
  frames: () => Frame[];
  events: () => { id: number; type: string; body: Record<string, unknown> }[];
  waitFor: (pred: (c: SseClient) => boolean, ms?: number) => Promise<void>;
  close: () => void;
};

export function connect(url: string, headers: Record<string, string> = {}): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { accept: 'text/event-stream', ...headers } }, (res) => {
      let buf = '';
      const waiters = new Set<() => void>();
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        for (const w of [...waiters]) w();
      });
      const client: SseClient = {
        res,
        raw: () => buf,
        frames: () => parseFrames(buf),
        events: () =>
          parseFrames(buf)
            .filter((f) => f.data !== undefined)
            .map((f) => ({ id: Number(f.id), type: f.event ?? '', body: JSON.parse(f.data as string) })),
        waitFor: (pred, ms = 2000) =>
          new Promise((ok, fail) => {
            const check = () => {
              if (pred(client)) {
                waiters.delete(check);
                clearTimeout(timer);
                ok();
              }
            };
            const timer = setTimeout(() => {
              waiters.delete(check);
              fail(new Error(`SSE wait timed out; got:\n${buf}`));
            }, ms);
            waiters.add(check);
            check();
          }),
        close: () => req.destroy(),
      };
      resolve(client);
    });
    req.on('error', reject);
  });
}
