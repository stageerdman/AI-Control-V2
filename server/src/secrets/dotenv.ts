/* .env text ⇄ lines. Pure, no I/O. Every line the parser doesn't own (comments,
   blanks, anything odd) is kept byte-for-byte, so a rewrite only ever touches
   the keys it was asked to change. Single-line values only. */

export type EnvLine = { raw: string; key?: string; value?: string };

const KEY_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s?(.*)$/;
export const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Bare values that need no quoting in any dotenv flavour. */
const BARE = /^[A-Za-z0-9_\-.:/@+=,~%^]*$/;

function parseValue(rest: string): string {
  const s = rest.trim();
  if (s.startsWith('"')) {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c === '"') return out;
      if (c === '\\' && i + 1 < s.length) {
        const n = s[++i];
        out += n === 'n' ? '\n' : n === 'r' ? '\r' : n === 't' ? '\t' : n;
      } else out += c;
    }
    return out; // unterminated: take what's there
  }
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    return end === -1 ? s.slice(1) : s.slice(1, end);
  }
  const hash = s.search(/\s#/); // inline comment needs whitespace before '#'
  return (hash === -1 ? s : s.slice(0, hash)).trim();
}

export function parseEnv(text: string): EnvLine[] {
  if (text === '') return [];
  const raws = text.replace(/\r\n/g, '\n').split('\n');
  if (raws[raws.length - 1] === '') raws.pop(); // trailing newline
  return raws.map((raw) => {
    if (/^\s*#/.test(raw)) return { raw };
    const m = KEY_LINE.exec(raw);
    return m ? { raw, key: m[1] as string, value: parseValue(m[2] as string) } : { raw };
  });
}

export function serializeEnv(lines: readonly EnvLine[]): string {
  return lines.length ? `${lines.map((l) => l.raw).join('\n')}\n` : '';
}

/** One `KEY=value` line, quoted only when needed. Values must be single-line. */
export function formatLine(key: string, value: string): string {
  if (!ENV_KEY.test(key)) throw new Error('Invalid env var name');
  if (/[\n\r\0]/.test(value)) throw new Error('Env values must be single-line');
  if (BARE.test(value)) return `${key}=${value}`;
  if (!value.includes("'")) return `${key}='${value}'`;
  return `${key}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function getValue(lines: readonly EnvLine[], key: string): string | undefined {
  return lines.find((l) => l.key === key)?.value;
}

/** Replace the first `key` line in place (later duplicates dropped), or append. */
export function setValue(lines: readonly EnvLine[], key: string, value: string): EnvLine[] {
  const line: EnvLine = { raw: formatLine(key, value), key, value };
  const at = lines.findIndex((l) => l.key === key);
  if (at === -1) return [...lines, line];
  return lines.flatMap((l, i) => (i === at ? [line] : l.key === key ? [] : [l]));
}

export function removeKey(lines: readonly EnvLine[], key: string): EnvLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Keys in file order, first occurrence wins. */
export function keys(lines: readonly EnvLine[]): string[] {
  return [...new Set(lines.flatMap((l) => (l.key ? [l.key] : [])))];
}
