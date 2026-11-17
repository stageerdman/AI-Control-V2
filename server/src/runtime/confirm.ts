/* Auto-approve (AGENTS): is an agent's ask_user just a yes/no permission check? Pure, no I/O.
   The studio answers those itself when the `autoApprove` setting is on; anything that needs the
   user — a credential, a fact about them, a choice among real alternatives, free text — is asked.
   Conservative on purpose: when in doubt it returns null and the user is asked as before. */

export const AUTO_YES = 'Yes, go ahead. (Auto-approved by the studio.)';

/* Needs the user whatever the wording: secrets, accounts, facts only they know. */
const NEEDS_USER =
  /\b((api[ -]?)?keys?|(database|db|webhook|callback|connection|redis|mongo|postgres) (url|uri|string)|tokens?|passwords?|passphrase|secrets?|credentials?|log ?in|sign ?in|accounts?|e-?mail address|do you (have|know|own|use|remember|prefer)|have you|did you|are you (using|on|signed)|your (name|address|phone|domain|budget|preference)|(can|could|may) (i|we) (get|have|borrow)|(send|give|tell|show) me|share|provide|paste)\b/i;

/* What only the user can see: a request to try something ("reload the app"), or how it turned out
   ("did the fix work?"). A Yes/No here is the user's observation, never a permission — the studio must not
   answer it (it once told an agent "Yes" to "Reload the app — did the fix work?" and the question vanished). */
const USER_SEES =
  /\b((did|does|do|is|are)\s+(it|that|this|everything|the\s+\w+)(\s+\w+)?\s+(work|works|worked|working|fix|fixed|help|helped|look|looks|show|shows|showing|load|loads|loaded|appear|appears|render|renders)|(can|do|did) you (see|reproduce)|works? for you|let me know|reload|refresh|re-?open|try (it|again|the)|test (it|the))\b/i;

/* A real choice between alternatives ("Postgres or SQLite?"); "…or not?" is still yes/no. */
const CHOICE = /\bor\b(?!\s+not\b)/i;
/* A question sentence that opens with a wh-word asks for information ("Which port should I use?"). */
const WH =
  /(^|[.?!:]\s+)((and|so|also|then|but|ok|okay)[,]?\s+)?(what|which|where|when|who|whom|whose|how|why)\b/i;

const PERMISSION = [
  /\b(should|shall|may|can|could|must)\s+(i|we)\b/i,
  /\b(do|would)\s+you\s+(want|like)\s+me\s+to\b/i,
  /\bwant\s+me\s+to\b/i,
  /\b(is|would)\s+(it|that|this)\s+(be\s+)?(ok|okay|alright|all right|fine|safe)\b/i,
  /\b(ok|okay|alright|all right|fine|safe)\s+(to|if|for me|with)\b/i,
  /\bare\s+you\s+(ok|okay|fine|happy|sure)\b/i,
  /\b(please\s+)?confirm\b/i,
  /\b(mind|object)\s+if\s+i\b/i,
  /\bpermission\b/i,
  /\b(am|are)\s+(i|we)\s+(allowed|cleared|good)\s+to\b/i,
  /\b(i|we)('ll| will)\s+\w+.*\bunless you\b/i,
  /^\s*(proceed|continue|go ahead|go on|approve|ready)\b/i,
  /\b(proceed|go ahead)\s*\?/i,
  /\b(ok|okay|alright|sound good|sounds good|good to go|right)\s*\?\s*$/i,
];

const KEEP_GOING = /^(keep going|carry on|go on|go for it)\b/i;
const YES_WORD =
  /^(yes|y|yep|yeah|yup|sure|ok|okay|alright|all right|proceed|continue|go ahead|do it|confirm|confirmed|approve|approved|allow|accept|agree|fine|please do)\b/i;
/* An affirmative action in a pair against a "no" ("Overwrite" / "Keep existing"). */
const YES_ACTION =
  /^(delete|remove|overwrite|replace|reset|install|uninstall|upgrade|update|run|apply|commit|merge|rewrite|clean|clear|drop|force|retry|start|restart|kill|stop the server|wipe|purge|migrate|rebuild|reinstall)\b/i;
const NO_WORD =
  /^(no|n|nope|nah|cancel|stop|abort|don't|dont|do not|skip|keep|leave|deny|denied|reject|decline|not now|later|wait|hold|never|halt|undo|back)\b/i;

const clean = (o: string) =>
  o
    .trim()
    .replace(/^[\s"'`([{]*(\d+[.)]|[a-z][.)])?\s*/i, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();

type Side = 'yes' | 'act' | 'no' | null;
function side(option: string): Side {
  const o = clean(option);
  if (KEEP_GOING.test(o)) return 'yes';
  if (NO_WORD.test(o)) return 'no';
  if (YES_WORD.test(o)) return 'yes';
  if (YES_ACTION.test(o)) return 'act';
  return null;
}

/** The studio's answer when this ask is a yes/no permission check, else null (ask the user). */
export function autoAnswer(question: string, options?: readonly string[] | null): string | null {
  const q = question.trim();
  if (!q || NEEDS_USER.test(q) || USER_SEES.test(q)) return null;

  if (options && options.length > 0) {
    const sides = options.map(side);
    /* only yes / no answers, exactly one way to say yes, at least one way to say no */
    if (sides.some((s) => s === null)) return null;
    const yes = sides.flatMap((s, i) => (s === 'yes' || s === 'act' ? [i] : []));
    if (yes.length !== 1 || !sides.includes('no')) return null;
    /* "Bag or cart?" answered Yes/No makes no sense — ask. ("Overwrite or keep?" / [Overwrite, Keep] is fine.) */
    if (sides[yes[0] as number] === 'yes' && CHOICE.test(q)) return null;
    const pick = options[yes[0] as number] as string;
    return `${pick.trim().replace(/[\s.!]+$/, '')}. (Auto-approved by the studio.)`;
  }

  if (CHOICE.test(q) || WH.test(q)) return null;
  return PERMISSION.some((r) => r.test(q)) ? AUTO_YES : null;
}
