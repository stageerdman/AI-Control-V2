/* The safe behind the director = this project's Access (prototype openProjectAccess, v5):
   U5's ProjectAccessPanel (grant switches, values masked, sync to .env — names only) in a sheet. */
import { Sheet } from '../../ui';
import { ProjectAccessPanel } from '../access';

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
  return (
    <Sheet open={open} onClose={onClose} label={`${name} access`}>
      {open && <ProjectAccessPanel projectId={pid} projectName={name} />}
    </Sheet>
  );
}
