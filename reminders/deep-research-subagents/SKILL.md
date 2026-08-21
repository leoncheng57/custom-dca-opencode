---
name: deep-research-subagents
title: Deep Research with Subagents
description: Split one broad research question across non-overlapping read-only agents and synthesize a cited answer.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/deep-research-subagents/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Use 3-5 parallel read-only subagents only when one question spans several independent areas and would consume substantial main-session context. Split by artifact, repository, package, or evidence source so agents do not repeat the same search.

Give every agent a self-contained scope, numbered questions, explicit exclusions, a concise deliverable, and a requirement to cite file:line or source URLs. Require an UNVERIFIED section instead of guesses.

Synthesize rather than concatenate: answer the original question first, reconcile conflicts, preserve citations, merge verification gaps, and spot-check one load-bearing claim from each report. Do not delegate a small lookup, sequential investigation, or shared-state mutation.
