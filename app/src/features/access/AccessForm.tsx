/* Add / edit / replace-key sheet (prototype: openAccessForm). The key field is UNCONTROLLED:
   the value is read from the input once on submit, the input is cleared before the request goes
   out, and it never enters React state, the DOM as text, logs or the toast. Close also clears it. */
import { type FormEvent, useRef, useState } from 'react';
import { isApiError } from '../../api/client';
import { invalidate, useQuery } from '../../api/query';
import { studio } from '../../api/studio';
import { Button, Field, Sheet, TextArea, toast } from '../../ui';
import { accessApi, type Credential, keys } from './api';
import { envVarFor } from './mark';

export type AccessFormMode =
  | { kind: 'add' }
  | { kind: 'edit'; cred: Credential }
  | { kind: 'replace'; cred: Credential };

type Meta = { name: string; envVar: string; serves: string; docsUrl: string; instructions: string };
const metaOf = (c?: Credential): Meta => ({
  name: c?.name ?? '',
  envVar: c?.envVar ?? '',
  serves: c?.serves ?? '',
  docsUrl: c?.docsUrl ?? '',
  instructions: c?.instructions ?? '',
});

/** Human message for a failed save — never echoes what was typed into the key field. */
export function formError(e: unknown): string {
  if (!isApiError(e)) return 'Something went wrong — try again.';
  if (e.code === 'network') return "Can't reach the studio server — nothing was saved.";
  return e.issues[0] ?? e.message;
}

export function AccessForm({ mode, onClose }: { mode: AccessFormMode | null; onClose: () => void }) {
  const cred = mode && mode.kind !== 'add' ? mode.cred : undefined;
  const title = mode?.kind === 'replace' ? 'Replace key' : cred ? 'Edit access' : 'Add access';
  return (
    <Sheet open={mode !== null} onClose={onClose} label={title}>
      {/* keyed per opening: fresh state, and closing unmounts the key input with whatever was in it */}
      {mode && (
        <FormBody key={`${mode.kind}:${cred?.id ?? ''}`} mode={mode} title={title} onClose={onClose} />
      )}
    </Sheet>
  );
}

function FormBody({ mode, title, onClose }: { mode: AccessFormMode; title: string; onClose: () => void }) {
  const cred = mode.kind !== 'add' ? mode.cred : undefined;
  const replaceOnly = mode.kind === 'replace';
  const keyRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<Meta>(() => metaOf(cred));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const clearKey = () => {
    if (keyRef.current) keyRef.current.value = '';
  };
  const close = () => {
    clearKey();
    onClose();
  };
  const set = (k: keyof Meta) => (e: { target: { value: string } }) =>
    setMeta((m) => ({ ...m, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    let value: string | undefined = keyRef.current?.value ?? '';
    clearKey(); // the value now lives only in this call
    if (!value.trim()) value = undefined;
    if (replaceOnly && !value) {
      setError('Paste the new key first.');
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      name: meta.name.trim(),
      serves: meta.serves.trim(),
      docsUrl: meta.docsUrl.trim() || null,
      instructions: meta.instructions.trim(),
    };
    try {
      if (mode.kind === 'add') {
        const envVar = meta.envVar.trim();
        await accessApi.create({ ...body, ...(envVar ? { envVar } : {}), ...(value ? { value } : {}) });
        toast('🔑 Saved to the Key Cabinet');
      } else if (mode.kind === 'replace') {
        await accessApi.replaceKey(mode.cred.id, value as string);
        toast('🔑 Key replaced — still masked');
      } else {
        await accessApi.update(mode.cred.id, body);
        if (value) await accessApi.replaceKey(mode.cred.id, value);
        toast(value ? '🔑 Saved — new key in, still masked' : '🔑 Saved to the Key Cabinet');
      }
      value = undefined;
      await invalidate(keys.cabinet);
      onClose();
    } catch (err) {
      value = undefined;
      setError(formError(err));
    } finally {
      setBusy(false);
    }
  }

  if (confirmDelete && cred)
    return <DeleteConfirm cred={cred} onCancel={() => setConfirmDelete(false)} onDone={close} />;
  return (
    <form onSubmit={submit} autoComplete="off">
      <h2>{title}</h2>
      <div className="stack" style={{ marginTop: 14 }}>
        <Field
          label="Name"
          value={meta.name}
          onChange={set('name')}
          disabled={replaceOnly}
          placeholder="e.g. Stripe"
          required
        />
        <div className="field">
          <label htmlFor="afKey">
            {replaceOnly
              ? 'New key (write-only)'
              : cred
                ? 'New key (optional, write-only)'
                : 'Key (write-only, stored masked)'}
          </label>
          <input
            id="afKey"
            ref={keyRef}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder="Paste the secret — we only keep the last 4"
          />
        </div>
        {mode.kind === 'add' ? (
          <Field
            label="Env var (optional)"
            value={meta.envVar}
            onChange={set('envVar')}
            placeholder={envVarFor(meta.name || 'Stripe')}
            hint="The name it gets in every .env — fixed once saved."
          />
        ) : (
          <Field label="Env var" value={meta.envVar} disabled readOnly />
        )}
        <Field
          label="What it serves"
          value={meta.serves}
          onChange={set('serves')}
          disabled={replaceOnly}
          placeholder="One line"
        />
        <Field
          label="Docs link (optional)"
          type="url"
          value={meta.docsUrl}
          onChange={set('docsUrl')}
          disabled={replaceOnly}
          placeholder="https://…"
        />
        <TextArea
          label="Extra instructions (optional)"
          rows={2}
          value={meta.instructions}
          onChange={set('instructions')}
          disabled={replaceOnly}
          placeholder="e.g. Test key only outside production."
        />
        {error && (
          <p className="af-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="hero" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save to cabinet'}
        </Button>
        <span className="masklock" style={{ color: 'var(--ink-soft)' }}>
          🔒 The previous value is never shown — you can only paste a new one.
        </span>
        {mode.kind === 'edit' && (
          <div className="af-danger">
            <Button small onClick={() => setConfirmDelete(true)}>
              Delete from cabinet…
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

function DeleteConfirm({
  cred,
  onCancel,
  onDone,
}: {
  cred: Credential;
  onCancel: () => void;
  onDone: () => void;
}) {
  const projects = useQuery('projects', studio.projects.list);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? id;
  const holders = cred.projectIds.map(nameOf);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const r = await accessApi.remove(cred.id);
      const still = r.projectIds.map(nameOf);
      toast(
        still.length
          ? `🗑 ${cred.name} deleted — still in the .env of ${still.join(', ')} until their next sync`
          : `🗑 ${cred.name} deleted from the cabinet`,
        { ms: 5000 },
      );
      await invalidate(keys.cabinet);
      onDone();
    } catch (e) {
      setError(formError(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Delete {cred.name}?</h2>
      <div className="stack" style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          This removes the key from the cabinet and from the global .env. <b>It can't be restored</b> —
          keeping an undo would mean keeping the key.
        </p>
        {holders.length > 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            Still held by {holders.join(', ')} — their project .env keeps <code>{cred.envVar}</code> until
            their next access sync.
          </p>
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            No project holds it.
          </p>
        )}
        {error && (
          <p className="af-error" role="alert">
            {error}
          </p>
        )}
        <div className="row" style={{ gap: 10 }}>
          <Button variant="dark" onClick={remove} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete for good'}
          </Button>
          <Button onClick={onCancel} disabled={busy}>
            Keep it
          </Button>
        </div>
      </div>
    </div>
  );
}
