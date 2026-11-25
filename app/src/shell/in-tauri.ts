/** True inside the desktop window (false in a plain browser, e.g. Vite dev in Chrome). */
export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
