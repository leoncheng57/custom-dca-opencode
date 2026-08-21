---
name: human-verification-steps
title: Write Human Verification Steps
description: Produce a short executable checklist that verifies completed behavior from a user's perspective.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/human-verification-steps/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Run the repository's relevant automated checks before asking a human to test. If required automation fails, report the failure and stop rather than sending someone to verify a red build.

Then write 5-12 high-information manual steps based on the actual diff, routes, commands, fixtures, and environment. Every step must specify the action, expected user-visible result, and observable failure signal. Include only relevant boundaries such as keyboard access, mobile width, empty/error states, invalid input, refresh, permissions, or deployment health.

Classify executed checks as VERIFIED, FAILED, or UNVERIFIED without treating screenshots or partial evidence as proof of interaction. End with one explicit disposition: ready to ship, fixes required, partially verified, or blocked on human access.
