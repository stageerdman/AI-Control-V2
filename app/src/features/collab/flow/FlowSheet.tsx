/* The editor in a sheet — how the office ("How we work") and the Cast (a team's way) open it.
   Closing with unsaved changes asks once: keep editing or discard. */
import { useState } from 'react';
import { Button, Sheet } from '../../../ui';
import { type EditorProps, WorkflowEditor } from './WorkflowEditor';

export function FlowSheet({
  open,
  onClose,
  title,
  sub,
  ...editor
}: EditorProps & { open: boolean; onClose: () => void; title: string; sub?: string }) {
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const close = () => {
    if (dirty && !asking) return setAsking(true);
    setAsking(false);
    setDirty(false);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} label={`${title}: drawing`} wide className="fe-sheet">
      <header className="fe-sheet-head">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </header>
      {asking && (
        <div className="fe-ask" role="alert">
          <span>This drawing isn’t saved.</span>
          <Button small variant="ghost" onClick={() => setAsking(false)}>
            Keep editing
          </Button>
          <Button small variant="ghost" onClick={close}>
            Discard
          </Button>
        </div>
      )}
      <WorkflowEditor {...editor} onDirty={setDirty} />
    </Sheet>
  );
}
