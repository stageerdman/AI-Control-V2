/* The installed app says so when it is older than the code its backend runs (a merged feature, like chat
   History, would otherwise just be missing) — and whether the newer build is installing, installed or failed.
   Only in a production build: a dev window runs straight from the source, so it is never stale. */
import { useEffect, useState } from 'react';
import { apiBase } from '../api/client';
import { parseHealth } from '../api/health';
import { Button } from '../ui';
import { BUILD, type StaleNotice as Notice, staleNotice } from './build';

const CHECK_MS = 30_000;

export function StaleNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hidden, setHidden] = useState('');
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const check = async () => {
      try {
        const res = await fetch(`${apiBase()}/health`);
        setNotice(staleNotice(BUILD.commit, parseHealth(await res.text()).build));
      } catch {
        /* the backend gate already says when the server is gone */
      }
    };
    void check();
    const t = setInterval(check, CHECK_MS);
    return () => clearInterval(t);
  }, []);
  if (!notice || notice.text === hidden) return null;
  return (
    <div className="gate-lost stale-note" role={notice.tone === 'error' ? 'alert' : 'status'}>
      <span className="gate-lost-t">{notice.text}</span>
      <Button small onClick={() => setHidden(notice.text)}>
        Hide
      </Button>
    </div>
  );
}
