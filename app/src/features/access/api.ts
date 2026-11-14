/* Access endpoints (Key Cabinet + per-project grants, G1 `/accesses`). Secret values are write-only:
   they go out in a request body and never come back — responses carry only hasValue + last4 (a
   non-secret field carries its value). */
import { studio } from '../../api/studio';

export type {
  Access,
  AccessField,
  AccessSync,
  ProjectAccess,
  ProjectAccessItem,
} from '../../api/types';

export const accessApi = {
  list: studio.accesses.list,
  create: studio.accesses.create,
  update: studio.accesses.update,
  remove: studio.accesses.remove,
  addField: studio.accesses.addField,
  updateField: studio.accesses.updateField,
  removeField: studio.accesses.removeField,
  setValue: studio.accesses.setValue,
  project: studio.projects.access,
  grant: studio.projects.grant,
  revoke: studio.projects.revoke,
  seen: studio.projects.accessSeen,
  sync: studio.projects.syncAccess,
};

/** Query keys (invalidate 'accesses' after any cabinet change; it also refreshes project grants). */
export const keys = {
  cabinet: 'accesses',
  project: (id: string) => `accesses:project:${id}`,
};
