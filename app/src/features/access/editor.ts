/* The access editor's model, pure (spec-ux-G2 §1b): templates, field rows, the secret default, and
   the save plan — the list of requests that turns the cabinet's access into what's on screen.
   Secret values never live here: the sheet reads them from uncontrolled inputs at save time and
   hands them to `planSave` as a map that dies with the call. */
import type { Access, AccessCreate, AccessField } from '../../api/types';
import { envVarFor } from './mark';

export type TemplateId = 'api' | 'userpass' | 'urltoken';
export const TEMPLATES: { id: TemplateId; label: string; fields: { label: string; secret: boolean }[] }[] = [
  { id: 'api', label: 'API key', fields: [{ label: 'API key', secret: true }] },
  {
    id: 'userpass',
    label: 'Username + password',
    fields: [
      { label: 'Username', secret: false },
      { label: 'Password', secret: true },
    ],
  },
  {
    id: 'urltoken',
    label: 'URL + token',
    fields: [
      { label: 'URL', secret: false },
      { label: 'Token', secret: true },
    ],
  },
];

/** A label that names a secret turns Secret on (the user can always override it). */
export const secretByDefault = (label: string): boolean => /key|token|secret|pass|pwd/i.test(label);

/** The env var an unsaved field would get (the server derives the same from name + label). */
export const suggestEnvVar = (name: string, label: string): string =>
  envVarFor(`${name.trim() || 'Access'} ${label.trim() || 'Key'}`);

export type Row = {
  /** Stable React key (also used to find the row's secret input). */
  key: string;
  /** Saved field id; undefined = a new row. */
  fieldId?: string;
  label: string;
  /** '' = not typed: the suggestion is shown as a placeholder and the server derives it. */
  envVar: string;
  secret: boolean;
  /** The user pressed the toggle — the label no longer decides. */
  secretSet: boolean;
  /** Non-secret value (controlled). A secret's value is never here. */
  value: string;
  /** What's saved (for placeholders and the plan). */
  saved?: {
    label: string;
    envVar: string;
    secret: boolean;
    hasValue: boolean;
    last4: string | null;
    /** A plain field's saved value (never a secret's). */
    value?: string;
  };
};

let n = 0;
const nextKey = () => `r${++n}`;

export const rowsOf = (a: Access): Row[] =>
  a.fields.map((f: AccessField) => ({
    key: nextKey(),
    fieldId: f.id,
    label: f.label,
    envVar: f.envVar,
    secret: f.secret,
    secretSet: true,
    value: f.secret ? '' : (f.value ?? ''),
    saved: {
      label: f.label,
      envVar: f.envVar,
      secret: f.secret,
      hasValue: f.hasValue,
      last4: f.last4,
      ...(!f.secret && f.value !== undefined ? { value: f.value } : {}),
    },
  }));

export const templateRows = (id: TemplateId): Row[] =>
  (TEMPLATES.find((t) => t.id === id)?.fields ?? []).map((f) => ({
    key: nextKey(),
    label: f.label,
    envVar: '',
    secret: f.secret,
    secretSet: true,
    value: '',
  }));

export const emptyRow = (): Row => ({
  key: nextKey(),
  label: '',
  envVar: '',
  secret: false,
  secretSet: false,
  value: '',
});

/** Typing a label: the secret default follows it until the user touches the toggle. */
export const withLabel = (r: Row, label: string): Row => ({
  ...r,
  label,
  secret: r.secretSet ? r.secret : secretByDefault(label),
});

/** Turning Secret off on a saved secret can't reveal it: the value is gone (paste it again). */
export const flipsOffSavedSecret = (r: Row): boolean => !!r.saved?.secret && !r.secret;

/** The placeholder a value input shows. */
export function valuePlaceholder(r: Row): string {
  if (!r.secret) return r.saved?.secret ? 'Paste the value again' : 'Value (optional)';
  if (r.saved?.secret && r.saved.hasValue)
    return `${r.saved.last4 ? `••••${r.saved.last4}` : '••••'} — paste to replace`;
  if (r.saved) return 'No value yet — paste one';
  return 'Paste the secret';
}

export type Meta = { name: string; serves: string; docsUrl: string; instructions: string };
export const metaOf = (a?: Access): Meta => ({
  name: a?.name ?? '',
  serves: a?.serves ?? '',
  docsUrl: a?.docsUrl ?? '',
  instructions: a?.instructions ?? '',
});

/** Why Save can't go yet (null = it can). A folder access shares its folder, so it may have no field. */
export function blocker(meta: Meta, rows: Row[], folder: string | null = null): string | null {
  if (!meta.name.trim()) return 'Give the access a name.';
  if (!rows.length && !folder) return 'An access needs at least one field.';
  if (rows.some((r) => !r.label.trim())) return 'Every field needs a label.';
  return null;
}

/** One request of the save, in order. Values are only ever in `value` of these, for one call. */
export type Op =
  | { op: 'create'; body: AccessCreate }
  | { op: 'meta'; body: Partial<Pick<Access, 'name' | 'serves' | 'docsUrl' | 'instructions'>> }
  | { op: 'patchField'; fieldId: string; body: { label?: string; envVar?: string; secret?: boolean } }
  | { op: 'setValue'; fieldId: string; value: string }
  | { op: 'addField'; key: string; body: { label: string; envVar?: string; secret: boolean; value?: string } }
  | { op: 'removeField'; fieldId: string };

const cleanMeta = (m: Meta) => ({
  name: m.name.trim(),
  serves: m.serves.trim(),
  docsUrl: m.docsUrl.trim() || null,
  instructions: m.instructions.trim(),
});

/** A row's value for this save: a secret's from `secrets` (by row key), a plain one from the row. */
const valueFor = (r: Row, secrets: ReadonlyMap<string, string>): string | undefined => {
  const v = (r.secret ? secrets.get(r.key) : r.value)?.trim();
  return v ? v : undefined;
};

/**
 * The requests that make `before` (undefined = a new access) look like `meta` + `rows`.
 * - Removals go first (frees their env vars), but never the last field before something is added.
 * - Secret → not secret on a saved field: move it aside, add the plain field under its env var, drop
 *   the old one — the old secret value is never read back.
 */
export function planSave(
  before: Access | undefined,
  meta: Meta,
  rows: Row[],
  secrets: ReadonlyMap<string, string>,
): Op[] {
  const m = cleanMeta(meta);
  if (!before)
    return [
      {
        op: 'create',
        body: {
          ...m,
          fields: rows.map((r) => {
            const value = valueFor(r, secrets);
            const envVar = r.envVar.trim();
            return {
              label: r.label.trim(),
              secret: r.secret,
              ...(envVar ? { envVar } : {}),
              ...(value ? { value } : {}),
            };
          }),
        },
      },
    ];

  const ops: Op[] = [];
  const changedMeta = Object.fromEntries(
    (Object.keys(m) as (keyof typeof m)[])
      .filter((k) => (m[k] ?? null) !== ((before[k] as string | null) ?? null))
      .map((k) => [k, m[k]]),
  );
  if (Object.keys(changedMeta).length) ops.push({ op: 'meta', body: changedMeta });

  const kept = new Set(rows.map((r) => r.fieldId).filter(Boolean));
  const removed = before.fields.filter((f) => !kept.has(f.id)).map((f) => f.id);
  const adds: Op[] = [];
  const later: Op[] = [];
  for (const r of rows) {
    const value = valueFor(r, secrets);
    const label = r.label.trim();
    if (!r.fieldId || !r.saved) {
      const envVar = r.envVar.trim();
      adds.push({
        op: 'addField',
        key: r.key,
        body: { label, secret: r.secret, ...(envVar ? { envVar } : {}), ...(value ? { value } : {}) },
      });
      continue;
    }
    if (flipsOffSavedSecret(r)) {
      const aside = `${r.saved.envVar}_OLD`.slice(0, 100);
      ops.push({ op: 'patchField', fieldId: r.fieldId, body: { envVar: aside } });
      adds.push({
        op: 'addField',
        key: r.key,
        body: { label, envVar: r.saved.envVar, secret: false, ...(value ? { value } : {}) },
      });
      later.push({ op: 'removeField', fieldId: r.fieldId });
      continue;
    }
    const patch: { label?: string; secret?: boolean } = {};
    if (label !== r.saved.label) patch.label = label;
    if (r.secret !== r.saved.secret) patch.secret = r.secret;
    if (Object.keys(patch).length) ops.push({ op: 'patchField', fieldId: r.fieldId, body: patch });
    /* a pasted secret always goes in; a plain value only when it changed (it can't be emptied) */
    if (value && (r.secret || value !== r.saved.value))
      ops.push({ op: 'setValue', fieldId: r.fieldId, value });
  }
  /* removals first — except, when nothing saved survives, the last one waits for the adds */
  const survivors = rows.filter((r) => r.fieldId && !flipsOffSavedSecret(r)).length;
  const waits = survivors === 0 && removed.length ? removed.slice(-1) : [];
  for (const id of removed) if (!waits.includes(id)) ops.push({ op: 'removeField', fieldId: id });
  ops.push(...adds, ...later);
  for (const id of waits) ops.push({ op: 'removeField', fieldId: id });
  return ops;
}

/** "Removing X, Y — projects keep them in their .env until their next sync." (null = nothing to say) */
export function removalNote(before: Access | undefined, rows: Row[]): string | null {
  if (!before?.projectIds.length) return null;
  const kept = new Set(rows.map((r) => r.fieldId).filter(Boolean));
  const gone = before.fields.filter((f) => !kept.has(f.id)).map((f) => f.envVar);
  if (!gone.length) return null;
  return `Removing ${gone.join(', ')} — projects keep ${gone.length === 1 ? 'it' : 'them'} in their .env until their next sync.`;
}
