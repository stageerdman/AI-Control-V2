/* Role = pick an existing one or type a new name (creates it). "Edit roles" renames / deletes
   (with Undo) and holds each role's "Files reports" switch (spec-reports §4.2). */
import { useEffect, useRef, useState } from 'react';
import type { Role } from '../../api/types';
import { Switch } from '../../ui';
import { announce } from './fx';
import { enterChoice, normRole, type RoleOption, roleByName, roleOptions, roleUse } from './model';
import { deleteRole, ensureRole, renameRole, setRoleReporter, setRoleToolsmith } from './store';

export function RoleCombo({
  roles,
  roleId,
  onRole,
  onSaved,
}: {
  roles: Role[];
  roleId: string | null;
  /** null = no role */
  onRole: (role: Role | null) => void;
  onSaved: () => void;
}) {
  const current = roles.find((r) => r.id === roleId)?.name ?? '';
  const [text, setText] = useState(current);
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const manage = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);

  /* show the saved role whenever we're not typing (renames, deletes, undo) */
  useEffect(() => {
    if (!focused.current) setText(current);
  }, [current]);

  const opts = roleOptions(roles, text);
  const close = () => {
    setOpen(false);
    setAct(-1);
  };
  const choose = async (o: RoleOption) => {
    close();
    const name = o.create ? normRole(text) : o.label;
    setText(name);
    const role = o.create ? await ensureRole(name) : roles.find((r) => r.id === o.id);
    if (!role) {
      setText(current);
      return;
    }
    setText(role.name);
    if (role.id !== roleId) {
      onRole(role);
      announce(o.create ? `New role ${role.name} created and assigned` : `Role: ${role.name}`);
    }
  };

  return (
    <section className="zp-sec zp-role">
      <h3 className="zp-label">
        <label htmlFor="zpRole">Role</label>
        <button
          ref={manage}
          type="button"
          className="zp-hint-btn rl-manage"
          aria-expanded={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Done' : 'Edit roles'}
        </button>
      </h3>
      <div className="rc-box">
        <input
          ref={input}
          className="zp-input rc-input"
          id="zpRole"
          role="combobox"
          aria-expanded={open}
          aria-controls="zpRoleList"
          aria-autocomplete="list"
          aria-activedescendant={open && act >= 0 ? `rco-${act}` : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={28}
          placeholder="Pick a role or type a new one"
          value={text}
          onFocus={() => {
            focused.current = true;
            setAct(-1);
            setOpen(true);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setAct(roleOptions(roles, e.target.value).length ? 0 : -1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              if (!opts.length) return;
              setAct((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (!text.trim()) {
                if (roleId) {
                  onRole(null);
                  announce('Role cleared');
                }
                close();
                return;
              }
              const o = enterChoice(opts, act, text);
              if (o) void choose(o);
            } else if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setText(current);
              close();
            }
          }}
          onBlur={() =>
            setTimeout(() => {
              focused.current = false;
              /* an exact existing name sticks; anything else reverts (creating needs an explicit pick) */
              const hit = roleByName(roles, input.current?.value ?? '');
              if (hit && hit.id !== roleId) {
                onRole(hit);
                setText(hit.name);
              } else if (!hit) setText(current);
              close();
            }, 120)
          }
        />
        <div className="rc-list" id="zpRoleList" role="listbox" aria-label="Roles" hidden={!open}>
          {opts.length ? (
            opts.map((o, i) => (
              // biome-ignore lint/a11y/useFocusableInteractive: focus stays on the combobox input (aria-activedescendant)
              <div
                key={o.id + o.label}
                role="option"
                id={`rco-${i}`}
                className={`rc-opt${o.create ? ' create' : ''}${current === o.label ? ' cur' : ''}`}
                aria-selected={i === act}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(o);
                }}
              >
                {o.label}
              </div>
            ))
          ) : (
            <div className="rc-none" role="presentation">
              No roles yet — type one
            </div>
          )}
        </div>
      </div>
      {editing && <RoleEditor roles={roles} onSaved={onSaved} manage={manage} />}
    </section>
  );
}

function RoleEditor({
  roles,
  onSaved,
  manage,
}: {
  roles: Role[];
  onSaved: () => void;
  manage: React.RefObject<HTMLButtonElement | null>;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLInputElement>('.rl-name')?.focus();
  }, []);
  return (
    <div className="rl-edit" ref={box}>
      <ul className="rl-list">
        {roles.length > 0 && (
          <li className="rl-head" aria-hidden="true">
            <span />
            <span />
            <span>Files reports</span>
            <span>Own tools</span>
            <span />
          </li>
        )}
        {!roles.length && <li className="zp-empty">No roles yet.</li>}
        {roles.map((r) => (
          <RoleRow
            key={r.id}
            role={r}
            onSaved={onSaved}
            onDeleted={() =>
              setTimeout(() => {
                const next = box.current?.querySelector<HTMLInputElement>('.rl-name');
                (next ?? manage.current)?.focus();
              }, 0)
            }
          />
        ))}
      </ul>
      <p className="rl-hint">
        Renaming updates every agent with that role. Roles that file reports hand you research and write-ups.
        Roles that build their own tools write and keep their own checks (tests, linters, crash runs) and
        reuse them across projects.
      </p>
    </div>
  );
}

function RoleRow({ role, onSaved, onDeleted }: { role: Role; onSaved: () => void; onDeleted: () => void }) {
  const [v, setV] = useState(role.name);
  useEffect(() => setV(role.name), [role.name]);
  const commit = async () => {
    const n = normRole(v);
    if (n === role.name) {
      setV(role.name);
      return;
    }
    const before = role.name;
    if (n && (await renameRole(role.id, n))) {
      onSaved();
      announce(`${before} renamed to ${n}`);
    } else {
      setV(role.name);
      announce(n ? `${n} already exists` : 'A role needs a name');
    }
  };
  return (
    <li className="rl-row has-rep">
      <input
        className="rl-name"
        value={v}
        maxLength={28}
        aria-label={`Rename role ${role.name}`}
        spellCheck={false}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
            e.currentTarget.select();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            setV(role.name);
          }
        }}
        onBlur={() => void commit()}
      />
      <span className="rl-n">{roleUse(role.agentCount)}</span>
      <Switch
        checked={role.reporter}
        label={`${role.name} files reports`}
        onChange={(on) => {
          void setRoleReporter(role.id, on, onSaved);
          announce(`${role.name} ${on ? 'files reports' : 'no longer files reports'}`);
        }}
      />
      <Switch
        checked={!!role.toolsmith}
        label={`${role.name} builds own tools`}
        onChange={(on) => {
          void setRoleToolsmith(role.id, on, onSaved);
          announce(`${role.name} ${on ? 'builds its own tools' : 'no longer builds its own tools'}`);
        }}
      />
      <button
        type="button"
        className="rl-del"
        aria-label={`Delete role ${role.name}`}
        title="Delete role"
        onClick={() => {
          announce(`Role ${role.name} deleted`);
          void deleteRole(role, () => {
            onSaved();
            onDeleted();
          });
        }}
      >
        ×
      </button>
    </li>
  );
}
