/* Put text on the system clipboard. The Clipboard API first; webviews that refuse it (no secure
   context, no permission) get the old hidden-textarea + execCommand('copy') path. Throws if both fail. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (e) {
    if (!copyViaTextarea(text)) throw new Error(`Clipboard unavailable: ${(e as Error)?.message ?? e}`);
  }
}

function copyViaTextarea(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false; // the caller reports the failure with the Clipboard API's reason
  } finally {
    ta.remove();
  }
}
