/* Delete a draft with Undo (the trash restore token) — from the setup page or a Projects card.
   The server never touches the disk: a set-up draft's folder stays, and the toast says so. */
import { invalidate, studio } from '../../api';
import { toast } from '../../ui';

export const DRAFTS_KEY = 'drafts';

export async function deleteDraft(id: string, name: string, before?: () => void): Promise<void> {
  try {
    const { restoreToken, keptFolder } = (await studio.drafts.remove(id)) as Awaited<
      ReturnType<typeof studio.drafts.remove>
    > & { keptFolder?: string | null };
    before?.();
    void invalidate(DRAFTS_KEY);
    /* never delete user files: a set-up folder stays in the sandbox (adopt it any time) */
    const title = `Draft “${name.trim() || 'Untitled'}” deleted`;
    toast(
      keptFolder ? `${title} — its folder ${keptFolder} stays in the sandbox (adopt it any time)` : title,
      {
        undo: () => {
          studio
            .restore(restoreToken)
            .then(() => {
              void invalidate(DRAFTS_KEY);
              toast('Draft restored');
            })
            .catch((e: Error) => toast(`Couldn’t restore the draft — ${e.message}`));
        },
      },
    );
  } catch (e) {
    toast(`Couldn’t delete the draft — ${(e as Error).message}`);
  }
}
