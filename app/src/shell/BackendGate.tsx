/* The A0 health flow, before anything else renders: in the Tauri window the Rust side starts (or
   reuses) the server and returns its /health; in a plain browser (Vite dev in Chrome) we just
   check /health at the API base. Calm "Waking the studio…" while it runs, honest error + Retry. */
import { invoke } from '@tauri-apps/api/core';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { apiBase } from '../api/client';
import { checkServer, type Status, startBackend } from '../api/health';
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

  if (status.kind === 'ready') return <>{children}</>;
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
