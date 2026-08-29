---
description: Stop safely, push authorized progress, and leave an accurate status
agent: build
---

Wrap up the current run now. `$ARGUMENTS` may name the branch, PR, issue, or
human update destination. Complete these steps in order; do not stop after a
chat-only summary.

1. Stop work owned by this run. Cancel this run's background agents, test
   runners, preview servers, and other processes that could keep mutating state.
   Verify they stopped. Never kill a process merely because its name or port
   looks familiar: establish that this run started or owns it. Leave unrelated
   user and sibling-worktree processes alone.
2. Inspect the repository root, branch, worktree, status, diff, staged diff, and
   recent commits. Separate this run's intended changes from pre-existing or
   unrelated user changes. Scan intended paths for credentials and generated
   secret files. Never stage or commit secrets, and never absorb unrelated
   changes just to make the tree clean.
3. Run the most relevant affordable verification for this run's changes. Record
   each check as green, red, or not run, including the command and concise reason.
   A red check does not justify hiding otherwise useful progress.
4. Preserve real progress under the repository's permissions and the user's
   explicit commit/push instructions. If authorized, stage only owned files,
   commit them, and push the current feature branch even when verification is
   red, with the failure stated plainly. Never push `main` or another protected
   default branch. Do not force-push. If commit or push is not authorized, is
   rejected, or would include unsafe/unrelated content, leave it uncommitted or
   local and report that fact as a blocker instead of bypassing the gate.
5. Refresh every project-defined status artifact with the current UTC timestamp,
   exact branch/commit/push state, verification results, blockers, and next
   action. Supersede stale claims. Reconcile the task list immediately: completed
   work is completed, intentionally dropped work is cancelled, and only genuine
   remaining work stays pending. If a status artifact is tracked, include its
   final update in the authorized push, using a small follow-up commit when the
   progress commit already exists. Do not let status sync create new local-only
   state.
6. Post one human-readable update to each destination the project explicitly
   defines and this run is authorized to use, such as its PR or issue. Do not
   invent a destination or leak details to a public channel. Include what is
   green and red, why anything is red, what is committed and pushed versus only
   local, open decisions requiring a human, and the next command or owner.
7. If there is a PR, end the posted update and final response with exactly one
   accurate verdict: `SAFE TO MERGE` only when the intended change is pushed,
   required checks are green, and no blocking decision remains; otherwise `DO
   NOT MERGE`, followed by the blocking facts. Re-read remote/PR state after the
   push before choosing the verdict.

Finish with the branch, pushed commit (or `not pushed`), stopped-work evidence,
verification matrix, status destinations updated, open decisions, and merge
verdict. Accuracy is more important than making the wrap-up look green.
