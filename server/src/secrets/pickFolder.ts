/* The Vault's "Choose…" button: the Mac's own folder picker, opened by the studio server (it runs on the
   user's Mac), so the app gets a real absolute path — a browser picker never gives one. Cancel = null. */
import { execFile } from 'node:child_process';

/** Opens the picker and answers the chosen folder (no trailing slash), or null when the user cancels. */
export type FolderPicker = () => Promise<string | null>;

const SCRIPT = [
  'activate',
  'set f to choose folder with prompt "Choose a folder to share with agents"',
  'POSIX path of f',
];

export const macFolderPicker: FolderPicker = () =>
  new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('The folder picker needs macOS — paste the path instead'));
      return;
    }
    execFile(
      'osascript',
      SCRIPT.flatMap((l) => ['-e', l]),
      { timeout: 10 * 60_000 },
      (err, out, stderr) => {
        if (err) {
          /* -128 = the user pressed Cancel */
          if (/-128|User canceled/i.test(`${stderr}`)) resolve(null);
          else reject(new Error(`The folder picker didn't open: ${`${stderr}`.trim() || err.message}`));
          return;
        }
        const path = out.trim().replace(/(.)\/+$/, '$1');
        resolve(path || null);
      },
    );
  });
