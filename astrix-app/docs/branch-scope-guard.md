# Branch-local scope permissions

The exact-path set and five existing path patterns in `validate-scope-guard.mjs`
are the frozen baseline inherited from main `aff4223a180cd29ac44a5d1151b6fd587994bce2`.
No inherited permission is removed or broadened. Historical entries already on
main stay baseline permissions; unmerged PR additions are not baseline entries.

New tasks must not add permissions to the shared validator. On branch
`chore/my-task`, create `.scope/chore/my-task.txt`. Branch slashes are literal
subdirectories, not replaced with dashes. Add one exact repository-relative file
path per line. The scope file itself is implicitly permitted only for that branch.
Blank lines and full-line `#` comments are allowed; LF and CRLF both work.
An empty or comment-only file declares no additions to the inherited baseline.
Every branch with changes requires its own scope file, even for baseline-only edits.
A clean main checkout requires none.

Entries are case-sensitive, literal file paths. No absolute paths, traversal,
empty path segments, wildcards, whitespace, backslashes, URL encoding, `.git`
paths, directory permissions or scope-file permissions. Duplicate entries,
invalid UTF-8, missing files and symlinks (including ancestors) fail closed.
A deleted file may be listed if it exists in `origin/main`. Missing/deleted task
scope files fail when the branch has changes. Keep entries current when renaming
or removing files; renames check both the old and new path.

Only the current branch's scope file is read. Other branches' scope files can
remain in main, but cannot authorize this branch. Adding, changing, renaming or
deleting another branch's file fails even if an entry attempts to allow it.
Local scope is not a sandbox or substitute for review: permissions declared by a
PR still need Miguel's approval. The inherited baseline is intentionally retained,
including its broad infrastructure patterns; this change does not tighten those
existing permissions or claim that the baseline is a per-task change inventory.

## Local and CI checks

Fetch `origin/main` before validating and retain enough history for its merge base.
Run `node astrix-app/tools/validate-scope-guard.mjs`,
`node astrix-app/tools/test-scope-guard.mjs`, and
`node astrix-app/tools/paradox-validator.mjs` from the repository.
The full validator includes the new fixture tests.

The guard checks committed differences from `origin/main...HEAD`, unstaged edits,
staged edits and non-ignored untracked files. Git output uses NUL separators and
disables rename folding so no changed filename is silently lost.

Branch resolution prefers GitHub's `GITHUB_HEAD_REF`, then the PR event file's
`pull_request.head.ref` for PR events, then the local branch. For detached push
checkouts, `GITHUB_REF=refs/heads/<branch>` is supported. A detached PR merge ref
such as `refs/pull/318/merge` is not a branch name: CI must supply the real PR head
via `GITHUB_HEAD_REF` or `GITHUB_EVENT_PATH`. Unknown/malformed branch names and
unavailable `origin/main` history fail closed, never scan all scope files.

## Migrating an open PR after this change merges

1. Preserve the remote head and any local or unpushed work in a backup branch or
   separate worktree before rebasing onto freshly fetched main.
2. Keep main's shared validator. Move only that PR's additional permissions into
   `.scope/<its-exact-head-branch>.txt`; do not copy another branch's permissions.
   Baseline-only PRs still add their own comment-only scope file.
3. Resolve other conflicts without dropping either side's work or weakening tests.
4. Run full, Journey, Python, scope and task-specific validators. Update the same
   PR safely; never merge or deploy as part of the rebase.
5. Put the branch, commit, exit codes and manual QA checklist in the PR description.
