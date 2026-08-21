---
name: no-force-push
description: Never force-push, rewrite shared history, or amend a commit that has been pushed.
---

Do not force-push, rewrite published history, or amend a commit that already exists on a
remote. If a commit is wrong, add a new one that fixes it.

Do not update git config, skip hooks, or use interactive rebase. If a push is rejected
because the branch diverged, stop and report it rather than forcing your way past it.
