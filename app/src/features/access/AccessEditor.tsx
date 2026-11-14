/* "Add new access" / "Edit <name>" (spec-ux-G2 §1b) — one sheet for both. An access is a name plus
   1–20 fields (label, env var, secret?, value). Secret inputs are UNCONTROLLED: on Save every one is
   read once into a map that lives only for the requests, all are cleared first, and no secret ever
   enters React state, the DOM as text, a toast or a log. Closing unmounts them with whatever was in
   them. Non-secret values (a username, a URL) are ordinary controlled inputs. */
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { isApiError } from '../../api/client';
import { invalidate, useQuery } from '../../api/query';
import { studio } from '../../api/studio';
import type { Access } from '../../api/types';
import { Button, Field, Sheet, TextArea, toast } from '../../ui';
import { accessApi, keys } from './api';
import {
  blocker,
  emptyRow,
  flipsOffSavedSecret,
  type Meta,
  metaOf,
  type Op,
  planSave,
  type Row,
  removalNote,
  rowsOf,
  suggestEnvVar,
  TEMPLATES,
  type TemplateId,
  templateRows,
  valuePlaceholder,
  withLabel,
} from './editor';
import { plural } from './mark';

export type EditorMode = { kind: 'add' } | { kind: 'edit'; access: Access };

/** Human message for a failed save — never echoes anything typed into a secret field. */
export function formError(e: unknown): string {
  if (!isApiError(e)) return 'Something went wrong — try again.';
  if (e.code === 'network') return "Can't reach the studio server — nothing was saved.";
  return e.issues[0] ?? e.message;
}

/** A server error, said for the field row it belongs to (spec copy). */
export function fieldError(e: unknown): string {
  if (!isApiError(e)) return 'That didn’t save.';
  const clash = /already in the cabinet as '(.+)'/.exec(e.message);
  if (clash) return `Already used by ${clash[1]}`;
  const issue = Array.isArray(e.details)
    ? (e.details as { path?: string; message?: string }[]).find((d) => /envVar/.test(d.path ?? ''))
    : undefined;
  if (issue) return 'Letters, digits and _ only';
  return formError(e);
}
/** 422 on create: `fields.2.envVar` → row 2. */
const rowIndexOf = (e: unknown): number | null => {
  if (!isApiError(e) || !Array.isArray(e.details)) return null;
  for (const d of e.details as { path?: string }[]) {
    const m = /^fields\.(\d+)/.exec(d.path ?? '');
    if (m) return Number(m[1]);
  }
  return null;
};

export function AccessEditor({ mode, onClose }: { mode: EditorMode | null; onClose: () => void }) {
  const access = mode?.kind === 'edit' ? mode.access : undefined;
  const title = access ? `Edit ${access.name}` : 'Add new access';
  return (
    <Sheet open={mode !== null} onClose={onClose} label={title} wide className="ae-sheet">
      {/* keyed per opening: fresh rows, and closing unmounts every secret input with its contents */}
      {mode && <Body key={access?.id ?? 'new'} access={access} title={title} onClose={onClose} />}
    </Sheet>
  );
}

function Body({ access, title, onClose }: { access?: Access; title: string; onClose: () => void }) {
  const [meta, setMeta] = useState<Meta>(() => metaOf(access));
  const [rows, setRows] = useState<Row[]>(() => (access ? rowsOf(access) : templateRows('api')));
  const [template, setTemplate] = useState<TemplateId | null>(access ? null : 'api');
  const [typed, setTyped] = useState(false); // any value typed → the templates step aside
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const secretInputs = useRef(new Map<string, HTMLInputElement>());
  const focusNext = useRef<string | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);

  /* initial focus: the first template when creating, else the name */
  useEffect(() => {
    const t = setTimeout(() => {
      const el = rootRef.current?.querySelector<HTMLElement>(
        access ? '#aeName' : '.ae-templates [aria-checked="true"]',
      );
      el?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [access]);
  /* after add / remove: move focus where the spec says */
  useEffect(() => {
    const sel = focusNext.current;
    if (!sel) return;
    focusNext.current = null;
    rootRef.current?.querySelector<HTMLElement>(sel)?.focus();
  });

  const clearSecrets = () => {
    for (const el of secretInputs.current.values()) el.value = '';
  };
  const close = () => {
    clearSecrets();
    onClose();
  };
  const setRow = (key: string, fn: (r: Row) => Row) =>
    setRows((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));
  const pickTemplate = (id: TemplateId) => {
    setTemplate(id);
    setRows(templateRows(id));
  };
  const onTemplateKeys = (e: KeyboardEvent, i: number) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key];
    if (!d) return;
    e.preventDefault();
    const next = TEMPLATES[(i + d + TEMPLATES.length) % TEMPLATES.length];
    if (!next) return;
    pickTemplate(next.id);
    focusNext.current = `.ae-templates [data-t="${next.id}"]`;
  };
  const addRow = () => {
    const r = emptyRow();
    setRows((rs) => [...rs, r]);
    setTemplate(null);
    focusNext.current = `[data-row="${r.key}"] .ae-label`;
  };
  const removeRow = (i: number) => {
    const prev = rows[i - 1];
    setRows((rs) => rs.filter((_, j) => j !== i));
    setTemplate(null);
    focusNext.current = prev ? `[data-row="${prev.key}"] .ae-x` : '.ae-add';
  };

  const why = blocker(meta, rows);
  const note = removalNote(access, rows);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (why) {
      setError(why);
      return;
    }
    /* read every secret once, clear them all, then (and only then) send */
    let secrets: Map<string, string> | null = new Map();
    for (const r of rows) {
      const el = secretInputs.current.get(r.key);
      if (r.secret && el?.value.trim()) secrets.set(r.key, el.value);
    }
    clearSecrets();
    setTyped(false);
    const pasted = secrets.size;
    const ops = planSave(access, meta, rows, secrets);
    secrets = null;
    setBusy(true);
    setError(null);
    setRowErr({});
    let done = 0;
    let id = access?.id;
    try {
      for (const op of ops) {
        id = (await run(op, id)).id;
        done++;
      }
      ops.length = 0; // drop the values with the plan
      await invalidate(keys.cabinet);
      const name = meta.name.trim();
      toast(
        pasted
          ? `🔑 ${name} saved — ${plural(pasted, 'new secret')} in, still masked`
          : `🔑 ${name} saved to the cabinet`,
      );
      onClose();
    } catch (err) {
      const op = ops[done];
      ops.length = 0;
      const rowKey =
        op?.op === 'addField'
          ? op.key
          : op && 'fieldId' in op
            ? rows.find((r) => r.fieldId === op.fieldId)?.key
            : op?.op === 'create'
              ? rows[rowIndexOf(err) ?? -1]?.key
              : undefined;
      if (rowKey) setRowErr({ [rowKey]: fieldError(err) });
      const lead = done === 0 ? 'Nothing was saved' : 'Only part of it was saved';
      setError(
        pasted
          ? `${lead} — paste the secrets again.${rowKey ? '' : ` ${formError(err)}`}`
          : rowKey
            ? `${lead} — see the field below.`
            : formError(err),
      );
      if (done > 0 && id) {
        /* the cabinet moved: start again from what's really saved */
        await invalidate(keys.cabinet);
        const fresh = await studio.accesses.list().then((l) => l.find((a) => a.id === id));
        if (fresh) setRows(rowsOf(fresh));
      }
    } finally {
      setBusy(false);
    }
  }

  if (confirmDelete && access)
    return <DeleteConfirm access={access} onCancel={() => setConfirmDelete(false)} onDone={close} />;
  return (
    <form ref={rootRef} className="ae" onSubmit={submit} autoComplete="off" noValidate>
      <h2>{title}</h2>
      {!access && !typed && (
        <div className="ae-start">
          <span className="ae-k" id="aeStart">
            Start from
          </span>
          <div className="ae-templates" role="radiogroup" aria-labelledby="aeStart">
            {TEMPLATES.map((t, i) => (
              // biome-ignore lint/a11y/useSemanticElements: a segmented control with roving focus
              <button
                key={t.id}
                type="button"
                role="radio"
                className="ae-tpl"
                data-t={t.id}
                aria-checked={template === t.id}
                tabIndex={template === t.id || (!template && i === 0) ? 0 : -1}
                onClick={() => pickTemplate(t.id)}
                onKeyDown={(e) => onTemplateKeys(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="ae-meta">
        <Field
          id="aeName"
          label="Name"
          value={meta.name}
          maxLength={60}
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          placeholder="e.g. Stripe"
        />
        <Field
          label="What it serves"
          value={meta.serves}
          maxLength={200}
          onChange={(e) => setMeta((m) => ({ ...m, serves: e.target.value }))}
          placeholder="e.g. Payments: checkout, refunds"
        />
      </div>

      <fieldset className="ae-fields">
        <legend>Fields</legend>
        <div className="ae-head" aria-hidden="true">
          <span>Label</span>
          <span>Env var</span>
          <span>Secret</span>
          <span>Value</span>
          <span />
        </div>
        {rows.map((r, i) => {
          const name = r.label.trim() || `field ${i + 1}`;
          const errId = `ae-err-${r.key}`;
          const msg = rowErr[r.key];
          const flipped = flipsOffSavedSecret(r);
          return (
            <div key={r.key} className="ae-row" data-row={r.key}>
              <label className="sr-only" htmlFor={`ae-l-${r.key}`}>
                Label for field {i + 1}
              </label>
              <input
                id={`ae-l-${r.key}`}
                className="ae-label"
                value={r.label}
                maxLength={60}
                placeholder="e.g. Secret key"
                onChange={(e) => setRow(r.key, (x) => withLabel(x, e.target.value))}
              />
              <label className="sr-only" htmlFor={`ae-e-${r.key}`}>
                Env var for {name}
              </label>
              <input
                id={`ae-e-${r.key}`}
                className="ae-env"
                value={r.envVar}
                readOnly={!!r.saved}
                aria-describedby={msg ? errId : r.saved ? 'aeFixed' : undefined}
                aria-invalid={msg ? true : undefined}
                spellCheck={false}
                placeholder={suggestEnvVar(meta.name, r.label)}
                onChange={(e) => setRow(r.key, (x) => ({ ...x, envVar: e.target.value.toUpperCase() }))}
              />
              <button
                type="button"
                className="ae-secret"
                aria-pressed={r.secret}
                aria-label={`Secret: ${name}`}
                title={r.secret ? 'Secret — masked everywhere' : 'Not secret — shown in full'}
                onClick={() => setRow(r.key, (x) => ({ ...x, secret: !x.secret, secretSet: true }))}
              >
                {r.secret ? '🔒' : '🔓'}
              </button>
              <label className="sr-only" htmlFor={`ae-v-${r.key}`}>
                Value for {name}
              </label>
              {r.secret ? (
                <input
                  id={`ae-v-${r.key}`}
                  key="secret"
                  ref={(el) => {
                    if (el) secretInputs.current.set(r.key, el);
                    else secretInputs.current.delete(r.key);
                  }}
                  className="ae-val"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={valuePlaceholder(r)}
                  onInput={() => !typed && setTyped(true)}
                />
              ) : (
                <input
                  id={`ae-v-${r.key}`}
                  key="plain"
                  className="ae-val"
                  value={r.value}
                  spellCheck={false}
                  placeholder={valuePlaceholder(r)}
                  onChange={(e) => {
                    if (!typed) setTyped(true);
                    setRow(r.key, (x) => ({ ...x, value: e.target.value }));
                  }}
                />
              )}
              <button
                type="button"
                className="ae-x"
                aria-label={`Remove ${name}`}
                disabled={rows.length === 1}
                onClick={() => removeRow(i)}
              >
                ✕
              </button>
              {(msg || flipped) && (
                <p className={msg ? 'ae-rowerr' : 'ae-rownote'} id={msg ? errId : undefined}>
                  {msg ?? 'Not secret any more — paste the value again so it can be shown.'}
                </p>
              )}
            </div>
          );
        })}
        {rows.length < 20 && (
          <button type="button" className="ae-add" onClick={addRow}>
            ＋ Add field
          </button>
        )}
        {access && (
          <p className="hint ae-fixed" id="aeFixed">
            Env vars are fixed once saved — they're the names agents see.
          </p>
        )}
      </fieldset>

      <div className="ae-meta">
        <Field
          label="Docs link"
          type="url"
          value={meta.docsUrl}
          onChange={(e) => setMeta((m) => ({ ...m, docsUrl: e.target.value }))}
          placeholder="https://…"
        />
        <TextArea
          label="Instructions for agents"
          rows={2}
          value={meta.instructions}
          onChange={(e) => setMeta((m) => ({ ...m, instructions: e.target.value }))}
          placeholder="e.g. Test keys only outside production."
        />
      </div>

      {error && (
        <p className="af-error" role="alert">
          {error}
        </p>
      )}
      {note && <p className="hint ae-note">{note}</p>}
      <div className="ae-foot">
        <Button variant="hero" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save access'}
        </Button>
        <span className="ae-lock">
          🔒 Saved secrets are never shown again — you can only paste a new one.
        </span>
        {access && (
          <Button small className="ae-del" onClick={() => setConfirmDelete(true)}>
            Delete access…
          </Button>
        )}
      </div>
    </form>
  );
}

/** One request; returns the access as the server now has it. */
function run(op: Op, id: string | undefined): Promise<Access> {
  const need = () => id as string;
  switch (op.op) {
    case 'create':
      return accessApi.create(op.body);
    case 'meta':
      return accessApi.update(need(), op.body);
    case 'patchField':
      return accessApi.updateField(need(), op.fieldId, op.body);
    case 'setValue':
      return accessApi.setValue(need(), op.fieldId, op.value);
    case 'addField':
      return accessApi.addField(need(), op.body);
    case 'removeField':
      return accessApi.removeField(need(), op.fieldId);
  }
}

function DeleteConfirm({
  access,
  onCancel,
  onDone,
}: {
  access: Access;
  onCancel: () => void;
  onDone: () => void;
}) {
  const projects = useQuery('projects', studio.projects.list);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameOf = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? id;
  const holders = access.projectIds.map(nameOf);
  const envs = access.fields.map((f) => f.envVar).join(', ');
  const n = access.fields.length;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const r = await accessApi.remove(access.id);
      const still = r.projectIds.map(nameOf);
      toast(
        still.length
          ? `🗑 ${access.name} deleted — still in the .env of ${still.join(', ')} until their next sync`
          : `🗑 ${access.name} deleted from the cabinet`,
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
      <h2>Delete {access.name}?</h2>
      <div className="stack" style={{ marginTop: 14 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          This removes {n === 1 ? 'its field' : `all ${n} fields`} from the cabinet and the global .env.{' '}
          <b>It can't be restored</b> — keeping an undo would mean keeping the secrets.
        </p>
        <p className="hint" style={{ margin: 0 }}>
          {holders.length > 0 ? (
            <>
              Still held by {holders.join(', ')} — their .env keeps <code>{envs}</code> until their next
              access sync.
            </>
          ) : (
            'No project holds it.'
          )}
        </p>
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
