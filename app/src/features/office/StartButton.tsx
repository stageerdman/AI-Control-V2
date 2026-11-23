/* Ready to Test: the office's Start button (bottom-right of the stage). One tap opens the project —
   a desktop app opens its newest build, a website starts and opens at http://localhost:<PORT>/.
   A website already running shows as the "Open app" link instead. While it starts the button says so
   (Starting… → Still building…); if it can't, a small note says why, with the app's last lines. */
import { useEffect, useState } from 'react';
import { openExternal } from '../../shell/external';
import { officeApi } from './api';
import { useApp } from './Board';
import { failureOf, OPENED_MS, SLOW_MS, type StartPhase, startLabel } from './start-button';

export function StartButton({ pid }: { pid: string }) {
  const app = useApp(pid);
  const [phase, setPhase] = useState<StartPhase>({ k: 'idle' });

  /* Starting… → Still building… after a while; Opened → Start after a moment */
  useEffect(() => {
    if (phase.k === 'starting' && !phase.slow) {
      const t = setTimeout(
        () => setPhase((p) => (p.k === 'starting' ? { k: 'starting', slow: true } : p)),
        SLOW_MS,
      );
      return () => clearTimeout(t);
    }
    if (phase.k === 'opened') {
      const t = setTimeout(() => setPhase((p) => (p.k === 'opened' ? { k: 'idle' } : p)), OPENED_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const start = async () => {
    setPhase({ k: 'starting', slow: false });
    try {
      const r = await officeApi.start(pid);
      if (r.kind === 'website') {
        openExternal(r.url);
        setPhase({ k: 'idle' });
      } else setPhase({ k: 'opened' });
    } catch (e) {
      setPhase({ k: 'failed', ...failureOf(e) });
    } finally {
      void app.refetch();
    }
  };

  const a = app.data;
  const url = a?.status === 'running' ? a.url : null;
  const starting = phase.k === 'starting';
  const label = startLabel(phase);

  if (url && !starting)
    return (
      <a
        className="o-ctl o-openapp"
        href={url}
        target="_blank"
        rel="noreferrer"
        title={a?.port ? `Open the app (port ${a.port})` : 'Open the app'}
      >
        ▶ <span>Open app</span>
      </a>
    );

  return (
    <>
      <button
        type="button"
        className={`o-ctl o-start${phase.k === 'failed' ? ' failed' : ''}`}
        aria-busy={starting}
        disabled={starting}
        onClick={() => void start()}
      >
        <span aria-hidden="true">{phase.k === 'opened' ? '✓' : starting ? '…' : '▶'}</span>{' '}
        <span>{label}</span>
      </button>
      <span className="sr-only" role="status">
        {starting || phase.k === 'opened' ? label : ''}
      </span>
      {phase.k === 'failed' && (
        <div className="o-startnote" role="alert">
          <p>{phase.message}</p>
          {phase.log.length > 0 && <pre>{phase.log.join('\n')}</pre>}
          <button
            type="button"
            className="o-startnote-x"
            aria-label="Dismiss"
            onClick={() => setPhase({ k: 'idle' })}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
