/* Invite another (updates/2026-11-16 INVITE ANOTHER): suggest and make a copy of a Cast agent. The suggestion is a
   free family name and the family look (same kit, a colour no kin wears); the copy shares the instructions. */
import type { Agent } from '../db/agents.ts';
import type { Store } from '../db/store.ts';
import { assertCanCopy } from '../domain/cast.ts';
import { familyLook, type Rand, suggestKinName } from '../domain/kin.ts';
import type { Look } from '../domain/look.ts';

export type CopyDraft = { name: string; look: Look };

export function createKinCopies({ store, rand = Math.random }: { store: Store; rand?: Rand }) {
  /** A fresh suggestion each call: the card, its name dice and "↺ Family look" all use it. */
  function draft(id: string): CopyDraft {
    const original = store.agents.require(id);
    assertCanCopy(original);
    const kinLooks = store.agents.kinOf(id).map((k) => JSON.parse(k.look) as Look);
    const taken = store.agents.records().flatMap((a) => (a.nick ? [a.name, a.nick] : [a.name]));
    return {
      name: suggestKinName(original.name, taken, rand),
      look: familyLook(original.look, kinLooks, rand),
    };
  }

  /** The copy, with whatever the user didn't choose filled in from a draft. */
  function invite(id: string, chosen: Partial<CopyDraft>): Agent {
    return store.tx(() => {
      const suggested = draft(id);
      return store.agents.copy(id, {
        name: chosen.name ?? suggested.name,
        look: chosen.look ?? suggested.look,
      });
    });
  }

  return { draft, invite };
}
export type KinCopies = ReturnType<typeof createKinCopies>;
