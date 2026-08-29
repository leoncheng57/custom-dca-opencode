---
description: Complete an objective autonomously with durable checkpoints
agent: build
---

Complete the rest of this objective as one sustained run: `$ARGUMENTS`

Do not ask whether to continue. Work through research, implementation, fixes,
and final verification until the objective is complete or a real user decision
blocks it.

Before changing code:

1. Read repository instructions and inspect the relevant code, tests, current
   branch, and worktree state. Do not overwrite unrelated changes.
2. Translate the objective into acceptance criteria and a task list that
   includes final verification. Record assumptions separately from facts.
3. Create a durable checkpoint using the project's existing status/plan
   convention. If none exists, write a clearly named progress file outside the
   git worktree in a persistent user-state directory, not a temporary directory,
   and report its absolute path. Include the objective, criteria, assumptions,
   current task, completed tasks, touched files, verification, and restart
   instructions. Mirror the active task in the session todo list.

During the run:

- Make the best reasonable guess for ambiguous, reversible, non-safety choices.
  Record the guess and rationale in the checkpoint, implement it, and continue.
- Prefer the smallest correct change and established repository conventions.
- Update the checkpoint and todo list after each meaningful boundary, before a
  long operation, and after any verification failure. Keep timestamps in UTC.
- Treat failed checks as work to diagnose and fix, not as a reason to ask whether
  to proceed. Rerun affected checks after each bounded fix.
- Preserve Plan/Build and tool permissions. Never switch modes, alter policy, or
  bypass a permission denial to gain authority the session does not have.
- Obey every confirmation gate. Do not invent credentials, tokens, approvals,
  facts, test results, or access. Never expose secrets in checkpoints or output.
- Ask one focused question only when progress requires a genuinely irreversible
  or destructive action, security/privacy authorization, privilege escalation,
  spending decision, unavailable credential/access grant, or product choice
  whose plausible answers have materially different consequences. State what
  was tried, the exact decision needed, safe options, and what remains preserved.
- Do not turn inconvenience, ordinary ambiguity, or a recoverable test failure
  into a user question. Continue all independent work before declaring blocked.

At completion, run the repository's relevant focused and broad verification.
Inspect the final diff and status for accidental or unrelated changes. Update
the durable checkpoint to completed or blocked, with exact commands and results.
Report acceptance criteria, changed files, assumptions made, verification,
remaining risks, and any work that exists only locally. Never claim completion
from an accepted asynchronous operation; poll or otherwise verify its outcome.
