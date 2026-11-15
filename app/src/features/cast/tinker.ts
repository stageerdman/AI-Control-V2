/* The voice path into design-with-Tinker: "Tinker, I need a Swift dev" opens #cast/agent/tinker
   with that sentence as the first message. The zoom takes it once on open. */
import { go } from '../../shell/router';

let opener: string | null = null;

/** Open a new design chat with Tinker; with `text`, send it as the first message. */
export function designWithTinker(text?: string): void {
  opener = text?.trim() || null;
  go({ name: 'cast.tinker', sid: null });
}

/** read-once */
export function takeOpener(): string | null {
  const t = opener;
  opener = null;
  return t;
}
