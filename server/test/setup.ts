/* Keep tests independent of the developer's git config (identity, hooks, signing). */
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

/* No auto housekeeping: after a commit or a push git may start `gc --auto` / `maintenance run --auto` detached
   in the background, still writing into a repo while its test deletes the folder (ENOTEMPTY on busy runs). */
const GIT_QUIET = { 'gc.auto': '0', 'maintenance.auto': 'false', 'receive.autogc': 'false' };
Object.entries(GIT_QUIET).forEach(([key, value], i) => {
  process.env[`GIT_CONFIG_KEY_${i}`] = key;
  process.env[`GIT_CONFIG_VALUE_${i}`] = value;
});
process.env.GIT_CONFIG_COUNT = String(Object.keys(GIT_QUIET).length);
