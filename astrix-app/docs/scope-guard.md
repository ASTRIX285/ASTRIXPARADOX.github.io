# Branch scope allowlists

Run `node astrix-app/tools/validate-scope-guard.mjs` from a checkout with a freshly fetched `origin/main` and enough history for a merge base.

Every feature branch must have `.scope/<full-branch-name>.txt`. For example, `chore/example` uses `.scope/chore/example.txt`. Slashes are directory separators, so branch names cannot collide through filename replacement. Main uses the existing baseline only and needs no scope file.

Use one exact repository-relative file path per line. Blank lines and lines starting with `#` are allowed. A comment-only file is valid when the task needs no permissions beyond the baseline. Missing files, duplicates, whitespace around paths, absolute paths, traversal, backslashes, wildcard patterns and symlinks fail validation. Scope files cannot grant access to other scope files or Git internals. Only the current branch's scope file can change; it is implicitly allowed and should not list itself.

The existing baseline paths and generated-data/infrastructure patterns remain unchanged. New task-specific exceptions go in the branch file, never in the shared validator. Add only paths needed for the reviewed task. Scope files are reviewable policy, not an authorization boundary against someone modifying the validator itself.

The guard checks committed changes against `origin/main...HEAD`, staged changes, unstaged changes and non-ignored untracked files. Both sides of a rename are checked. Deleted files still require permission. Paths are read with NUL delimiters.

Local runs use the checked-out branch. GitHub pull-request runs use `GITHUB_HEAD_REF`, including detached merge checkouts. Detached push or workflow runs use `GITHUB_REF_NAME` only when `GITHUB_REF_TYPE=branch`. Other detached checkouts fail closed; check out the intended branch before running locally. CI must fetch base history and `origin/main`.

For queued PR migration: rebase onto main after this PR merges, remove the PR's additions to the shared validator while retaining main's baseline, and put those exact additions in its own scope file. Existing merged policy files can remain tracked; they are not loaded by other branches. Do not edit another branch's file.

Run `node astrix-app/tools/test-scope-guard.mjs` for temporary-repository tests. It is also registered in the full validator.
