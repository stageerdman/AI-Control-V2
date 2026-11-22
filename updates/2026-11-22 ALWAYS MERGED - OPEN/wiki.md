# Always Merged — wiki

- **The studio already merged. The user was asked anyway.** Report-in fires only when an
  item is `done`, and that is after its merge. But Pixel's only source was the builder's
  note, written before review and merge. The fix is to hand Pixel the fact (the commit),
  not to change the merge. Lesson: whoever tells the user needs the latest state, not the
  oldest summary.
- **Never merge in the user's folder.** `git merge` there fails on unsaved edits in the
  same files (spike case 2), leaves a merge commit the user never made, and can leave files
  half-merged. Merge main into the task's own checkout and only fast-forward main.
- **A branch that isn't checked out moves by ref.** `git update-ref refs/heads/main <new>
  <old>` is safe, and the old-value guard catches a race. Never do that to a branch that IS
  checked out: its files would suddenly look like unsaved edits.
- **Unfinished ≠ finished.** Work left on branches by failed or cancelled tasks is not a
  merge problem. Landing it unreviewed would break the "accepted only" rule.
- Spike: `spike/merge-spike.mjs` (temp repos only). `git merge-tree --write-tree` works
  (git 2.54), but we don't need it.
