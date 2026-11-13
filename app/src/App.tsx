import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';
import logo from '../assets/icon.svg';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { StatusDot } from './components/StatusDot';
import { type Health, type Status, startBackend } from './lib/health';

const headline: Record<Status['kind'], string> = {
  starting: 'Waking the studio…',
  ready: 'Studio is ready',
  error: "The studio couldn't start",
};

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'starting' });

  const start = useCallback(async () => {
    setStatus({ kind: 'starting' });
    setStatus(await startBackend((cmd) => invoke(cmd)));
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3">
        <img src={logo} alt="" className="size-24 drop-shadow-[0_12px_24px_rgba(255,155,61,0.35)]" />
        <h1 className="text-3xl font-extrabold tracking-tight">AI Studio</h1>
      </div>

      <Card className="w-full max-w-md">
        <div className="flex items-center gap-3" aria-live="polite">
          <StatusDot state={status.kind} />
          <p className="text-lg font-bold">{headline[status.kind]}</p>
        </div>
        {status.kind === 'ready' && <HealthInfo health={status.health} />}
        {status.kind === 'error' && (
          <div className="mt-4 flex flex-col gap-4">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/25 p-3 font-mono text-xs text-cream/80">
              {status.message}
            </pre>
            <Button onClick={start} className="self-start">
              Retry
            </Button>
          </div>
        )}
      </Card>
    </main>
  );
}

function HealthInfo({ health }: { health: Health }) {
  const rows: [string, string][] = [
    ['Version', health.version],
    ['Sandbox', health.paths.sandbox],
    ['Data', health.paths.home],
  ];
  return (
    <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-cream/60">{k}</dt>
          <dd className="truncate font-mono text-xs leading-5 text-cream/90" title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
