---
name: conventional-commits
description: Write conventional-commit subjects — feat:, fix:, docs:, ci: — matching the repo history.
---

Write commit subjects and pull-request titles in conventional-commit style: `feat:`, `fix:`,
`docs:`, `ci:`, `refactor:`, `test:`, optionally scoped as `feat(scope):`.

Match the existing history of the repository you are in rather than applying this blindly —
check `git log --oneline` first, and follow what is already there if it differs.
