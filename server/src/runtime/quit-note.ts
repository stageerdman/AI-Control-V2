/* MENU BAR STUDIO & CLEAN QUIT: when the studio quits, every live agent gets a note on its desk. The studio writes
   it from what it already knows (asking the model for one would cost a whole turn, and a quit must be quick). The
   resumed session keeps its context; the note is the map on the table, in the office, for the user and the agent. */
import type { DeskNoteBody } from '../office/desk.ts';

export type QuitFacts = {
  /** The run's brief. */
  task: string;
  /** Where it works. */
  cwd: string;
  /** The agent's latest words in the chat, if any. */
  said?: string;
  /** The latest note it left itself this run, if any. */
  note?: DeskNoteBody;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: string) => s.trim().split('\n')[0] ?? '';

export function quitNote(f: QuitFacts): DeskNoteBody {
  const earlier = f.note ? `\nMy last note said: ${f.note.where}` : '';
  const notes = [
    f.said ? `My last words before the quit: ${clip(f.said.trim(), 1500)}` : '',
    f.note?.notes ? clip(f.note.notes, 3000) : '',
  ].filter(Boolean);
  return {
    where: clip(
      `The studio quit while I worked in ${f.cwd}. My files and session are as I left them.${earlier}`,
      2000,
    ),
    doing: clip(f.note?.doing ?? (firstLine(f.task) || 'My task'), 2000),
    next: clip(
      f.note?.next ??
        'Check `git status` and `git log`, commit what is done, then carry on from where I stopped.',
      2000,
    ),
    ...(notes.length ? { notes: notes.join('\n') } : {}),
  };
}
