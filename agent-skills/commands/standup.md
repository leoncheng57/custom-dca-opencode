---
description: Turn today's commits into a standup update
agent: build
subtask: true
---

My commits across all branches in the last day:

!`git log --all --author="$(git config user.email)" --since="24 hours ago" --pretty=format:'%h %s' --no-merges`

Merged pull requests, if the GitHub CLI is available:

!`gh pr list --author "@me" --state merged --limit 10 --json number,title,mergedAt -q '.[] | "#\(.number) \(.title)"' 2>/dev/null || echo "(gh unavailable)"`

Still open:

!`gh pr list --author "@me" --state open --limit 10 --json number,title,isDraft -q '.[] | "#\(.number)\(if .isDraft then " DRAFT" else "" end) \(.title)"' 2>/dev/null || echo "(gh unavailable)"`

Write a standup update from the above, in three sections:

**Yesterday** — what actually landed, grouped by theme rather than listed per
commit. Say what it does for a reader, not what the diff touched.

**Today** — what the open work implies is next. Mark anything that is a guess.

**Blocked** — only genuine blockers. If there are none, say "nothing blocked"
rather than inventing one.

Rules:

- Three to six bullets per section. This gets read aloud.
- No commit hashes and no branch names unless someone would need to go find it.
- If the log is empty, say so plainly. Do not pad it out of the PR list.
- `$ARGUMENTS` may narrow the scope to one project or topic; if it does, drop
  everything else.

This small utility is deliberately self-contained and adds no retrieval context
until a human invokes it.
