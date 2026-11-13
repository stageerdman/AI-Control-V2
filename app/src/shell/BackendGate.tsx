/* The A0 health flow, before anything else renders: in the Tauri window the Rust side starts (or
   reuses) the server and returns its /health; in a plain browser (Vite dev in Chrome) we just
   check /health at the API base. Calm "Waking the studio…" while it runs, honest error + Retry.
   Once running, the gate keeps watching (/health every 5 s while visible): if the server stops
   answering, a calm bar says so over the app (nothing unmounts) and, in the app, restarts it once
   on its own; Restart tries again (the Rust side respawns a server that died). */
import { invoke } from '@tauri-apps/api/core';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '../api/client';
import { checkServer, ping, type Status, startBackend, watchStep } from '../api/health';
import { invalidate } from '../api/query';
import { Hero } from '../characters/Hero';
import type { HeroAgent } from '../characters/hero-svg';
import { Button } from '../ui';

const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const RIVET: HeroAgent = {
  name: 'Rivet',
  role: 'Project Setter',
  look: {
    hat: 'hardhat',
    tool: 'clipboard',
    decal: 'Technician',
    body: 'bruiser',
    antenna: 'tuft',
    face: 'none',
    hue: 'sky',
  },
};

export function BackendGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ kind: 'starting' });
  const start = useCallback(async () => {
    setStatus({ kind: 'starting' });
    setStatus(inTauri() ? await startBackend((cmd) => invoke(cmd)) : await checkServer(apiBase()));
  }, []);
  useEffect(() => {
    void start();
  }, [start]);

  if (status.kind === 'ready') return <Watched>{children}</Watched>;
  return (
    <main className="gate" aria-live="polite">
      <Hero agent={RIVET} size={150} pose={status.kind === 'error' ? 'frustrated' : 'pressing'} />
      <h1>{status.kind === 'error' ? "The studio couldn't start" : 'Waking the studio…'}</h1>
      {status.kind === 'error' && (
        <>
          <pre>{status.message}</pre>
          <Button variant="hero" onClick={start}>
            Retry
          </Button>
        </>
      )}
    </main>
  );
}

const WATCH_MS = 5000;
type Watch = 'up' | 'lost' | 'restarting' | 'failed';

/** The running app + the live watch. Children stay mounted whatever happens to the server. */
function Watched({ children }: { children: ReactNode }) {
  const [watch, setWatch] = useState<Watch>('up');
  const [why, setWhy] = useState('');
  const fails = useRef(0);
  const autoTried = useRef(false);
  const busy = useRef(false);

  const restart = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setWatch('restarting');
    const s = inTauri() ? await startBackend((cmd) => invoke(cmd)) : await checkServer(apiBase());
    busy.current = false;
    if (s.kind === 'ready') {
      fails.current = 0;
      autoTried.current = false;
      setWatch('up');
      invalidate('');
    } else {
      setWhy(s.kind === 'error' ? s.message : '');
      setWatch('failed');
    }
  }, []);

  useEffect(() => {
    const t = setInterval(async () => {
      if (busy.current || document.visibilityState !== 'visible') return;
      const ok = await ping(apiBase());
      const next = watchStep(fails.current, ok);
      fails.current = next.fails;
      if (ok) {
        setWatch((w) => (w === 'lost' || w === 'failed' ? 'up' : w));
        return;
      }
      if (!next.lost) return;
      if (inTauri() && !autoTried.current) {
        autoTried.current = true;
        void restart();
      } else setWatch((w) => (w === 'up' ? 'lost' : w));
    }, WATCH_MS);
    return () => clearInterval(t);
  }, [restart]);

  return (
    <>
      {children}
      {watch !== 'up' && (
        <div className="gate-lost" role="alert">
          <span className="gate-lost-t">
            {watch === 'restarting' ? 'Restarting the studio…' : 'The studio stopped answering.'}
          </span>
          {watch === 'failed' && why && <span className="gate-lost-why">{why.split('\n')[0]}</span>}
          {watch !== 'restarting' && (
            <Button small variant="hero" onClick={() => void restart()}>
              Restart
            </Button>
          )}
        </div>
      )}
    </>
  );
}
