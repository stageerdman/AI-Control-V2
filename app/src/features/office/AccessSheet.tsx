/* The safe behind the director = this project's Access (prototype openProjectAccess, v5):
   the ProjectAccessPanel (grant switches, names only, sync to .env) in a sheet. Closing refetches the
   project's access view so the safe's "new" dot clears (the panel marked everything seen on open). */
import { Sheet } from '../../ui';
import { ProjectAccessPanel, refreshProjectAccess } from '../access';

export function AccessSheet({
  pid,
  name,
  open,
  onClose,
}: {
  pid: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const close = () => {
    onClose();
    void refreshProjectAccess(pid);
  };
  return (
    <Sheet open={open} onClose={close} label={`${name} access`} wide>
      {open && <ProjectAccessPanel projectId={pid} projectName={name} />}
    </Sheet>
  );
}
