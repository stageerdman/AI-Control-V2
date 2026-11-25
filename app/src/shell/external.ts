/* External links (docs, report sources, the project's running app): in the desktop window a
   target=_blank link does nothing, so one document-level listener hands http(s) links to the
   system browser through the `open_url` command. In a plain browser links behave normally. */
import { invoke } from '@tauri-apps/api/core';
import { inTauri } from './in-tauri';

export function openExternal(url: string): void {
  if (inTauri()) void invoke('open_url', { url }).catch(() => undefined);
  else window.open(url, '_blank', 'noopener');
}

/** Install once at boot (Tauri only). */
export function routeExternalLinks(): void {
  if (!inTauri()) return;
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (a?.target !== '_blank' || !/^https?:\/\//i.test(a.href)) return;
    e.preventDefault();
    openExternal(a.href);
  });
}
