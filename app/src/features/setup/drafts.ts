/* Delete a draft with Undo (the trash restore token) — from the setup page or a Projects card. */
import { invalidate, studio } from '../../api';
import { toast } from '../../ui';

export const DRAFTS_KEY = 'drafts';

export async function deleteDraft(id: string, name: string, before?: () => void): Promise<void> {
  try {
    const { restoreToken } = await studio.drafts.remove(id);
    before?.();
    void invalidate(DRAFTS_KEY);
    toast(`Draft “${name.trim() || 'Untitled'}” deleted`, {
      undo: () => {
        studio
          .restore(restoreToken)
          .then(() => {
            void invalidate(DRAFTS_KEY);
            toast('Draft restored');
          })
          .catch((e: Error) => toast(`Couldn’t restore the draft — ${e.message}`));
      },
    });
  } catch (e) {
    toast(`Couldn’t delete the draft — ${(e as Error).message}`);
  }
}
