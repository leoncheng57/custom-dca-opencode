---
name: parallel-research-handoff
title: Parallel Research Handoff
description: Research several independent feature ideas in parallel with read-only subagents, compile the findings into self-contained handoff prompts, and fire those prompts off as parallel agent sessions in fresh git worktrees. Use when the user drops a list of 2+ unrelated tasks and wants them researched and then handed to other agents, says "research these with subagents", "spin these up in parallel", "give me prompts I can paste into other agents", "use N worktrees", or asks whether many subagents are good for research.
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/parallel-research-handoff/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

# Parallel research → handoff prompts → multi-session fire-off

Three phases, strictly ordered. The value is concentrated in phase 2: a handoff
prompt that has already closed the decisions and pre-answered the API questions
turns a 40-minute exploratory session into a 10-minute implementation session.

For the *downstream* half — status protocols, live tracking, merge waves — see
the `manager-children` skill. This skill covers the upstream half: finding out
what is true, and writing it down so nobody has to find out twice.

---

## Phase 1 — Parallel read-only research

### When parallel subagents actually pay

Fan out when the questions are **independent, read-only, and each needs >5 tool
calls**. Each subagent burns its own context on greps, file reads, and API
probes, then returns a page of distilled findings — your context holds N reports
instead of N exploration transcripts. That compression is the entire point.

Do **not** fan out when:

- One question's answer determines the next one's shape (sequential dependency).
- The work mutates shared state (two agents writing the same file, racing on a port).
- It is a needle lookup — a single `grep` beats a subagent's startup cost.

Rule of thumb: one subagent per task in the user's list, launched in a single
message with multiple tool calls so they run concurrently.

### Writing a research prompt

Read-only is a hard constraint, stated twice (top and bottom): *"Do NOT write or
edit any files. Read-only research."* Otherwise a capable subagent will start
implementing.

Ask for a **numbered list of specific questions**, not "research X". The
difference in output quality is large. Cover:

1. Structure — entry points, layout, where state lives, file inventory with roles.
2. Prior art — does the mechanism already exist in some form? Grep the obvious
   nouns and report every hit with `file:line` and what it means.
3. The nearest existing analogue — "summarize the full pattern for feature Y,
   which is the closest thing to what we want". This is the highest-value
   question in the list; the implementing agent will copy that pattern.
4. Concrete integration points — which module, which route, which line.
5. Live API truth — if a server, container, or CLI is reachable, curl it. See below.
6. Testing conventions — the test runner's environment, what it can and cannot
   do, and one representative test file reproduced in full.
7. Explicit gap list — "what does NOT exist yet".

Always demand `file:line` references and verbatim API shapes. Prose summaries
decay into hallucination once they cross a context boundary; `setup.ts:2018`
does not.

### Probe the live system, not just the source

The single highest-leverage instruction: *"If a live server is reachable at
`<url>`, GET `/openapi.json` (or `/docs`) and report the exact request/response
schemas verbatim."*

This is how you discover things the source tree cannot tell you — that an
endpoint exists but only mutates at creation time, that a config list is
replaced wholesale rather than merged, that the three feature flags gating your
whole feature are all `false` in this deployment. Those findings change scope.
Restrict subagents to GETs.

---

## Phase 2 — Compile findings into handoff prompts

A good handoff prompt is **decision-closed and re-derivation-proof**. The
receiving agent should never need to answer a question you already answered.

### Mandatory sections

1. **Task line + branch + state.** "Branch `X` is already checked out in this
   worktree, deps are installed, and typecheck/test/build are green at baseline
   (N tests)." A known-good baseline means the agent's first red test is
   unambiguously its own fault.
2. **Docs to read first** — the repo's own conventions files, by path.
3. **`PRE-RESEARCHED — DO NOT RE-DERIVE:`** — the compiled findings, every one
   carrying `file:line`. This is the bulk of the prompt and the reason it works.
   Include the negative findings ("no dialog primitive exists anywhere — you are
   building the first one"), which are as expensive to establish as the positive
   ones and are the ones agents most often get wrong.
4. **Decisions already taken, with rationale.** If you asked the user a scoping
   question, restate the answer as a directive plus the *why*, so the agent does
   not relitigate it: "SCOPE IS DECIDED: GLOBAL ONLY … rationale: the upstream
   API cannot mutate X mid-run (verified against openapi.json), so a
   per-conversation toggle would be a confusing half-feature."
5. **Gotchas, labelled.** The things that will silently no-op. Give each its own
   `GOTCHA:` line.
6. **Numbered build steps**, each naming the file to create and the existing
   file to model it on.
7. **Explicit out-of-scope list with reasons**, phrased as "list as follow-ups in
   the PR body, do not build". Without reasons, agents relitigate; with reasons,
   they comply.
8. **Constraints** — dependency policy, testid naming, comment style, styling
   tokens. Quote the repo rule with its `file:line`.
9. **Verification** — exact commands, exact test file to add, which existing test
   to model it on, and any environment limitation ("the runner is
   `environment: node`, so NO component rendering").
10. **`SHARED-RESOURCE RULE:`** — see below.
11. **Report-back contract** — what you want in the final message.

### The shared-resource rule

Parallel agents in sibling worktrees collide on anything the filesystem or the
OS shares: fixed ports, bind-mounted state dirs, a single dev database, docker
compose project names, global caches.

Enumerate the conflicts in *both* prompts, name the sibling worktree and its
branch, and state the check:

> Another agent is working in a sibling worktree at `../<other>` on branch
> `<branch>`. `docker compose up` binds fixed ports (8010, 3210) and bind-mounts
> `./.state` — only ONE worktree may run the stack at a time. Tiers 1-3
> (typecheck/test/build) need no stack. Before running e2e or `docker compose
> up`, check whether the stack is already running (`docker ps`, `lsof -i :8010`)
> and do not start a second one.

Steer both agents toward the stack-free verification tiers so the contended
resource is needed briefly, at the end, by one agent at a time.

### Prompt hygiene

- Plain ASCII arrows (`->`) and quotes. Prompts get passed through shells,
  `cat`, and terminal emulators; smart quotes and box-drawing characters
  survive none of that reliably.
- Put each prompt in its own file. Multi-line text through a `--command` flag is
  fragile; a file is diffable, re-runnable, and reviewable.
- Store prompts *outside* every git working tree so no worktree starts dirty.
- Show the prompts to the user before firing. They are the last cheap moment to
  correct scope.

---

## Phase 3 — Fire off the sessions

### Worktrees

```bash
cd <repo>
git worktree prune          # stale entries accumulate, especially from containers
git fetch origin

WT=<repo-path>.worktrees    # sibling of the repo, outside every working tree
mkdir -p "$WT/prompts"
git worktree add -b feat/<a> "$WT/<a>" origin/main
git worktree add -b feat/<b> "$WT/<b>" origin/main
```

Branch from `origin/main`, not local `main`, so a stale checkout does not become
two stale branches.

### Install deps in parallel, then prove the baseline

```bash
( cd "$WT/<a>" && npm ci > /tmp/a.log 2>&1 && echo "a: OK" ) &
( cd "$WT/<b>" && npm ci > /tmp/b.log 2>&1 && echo "b: OK" ) &
wait
```

Then actually run typecheck + test + build in at least one worktree before
launching. Fresh installs fail in ways that look like agent errors later —
blocked postinstall scripts, missing native binaries, lockfile drift. Ten
seconds here saves an agent twenty minutes of debugging someone else's problem.
Quote the resulting test count in the prompts.

### Launch

```bash
cmux workspace create --name "<a>" --cwd "$WT/<a>" --focus false \
  --command "opencode --model <provider/model> --prompt \"\$(cat $WT/prompts/<a>.md)\""
```

- `--focus false` — never steal focus.
- Interactive TUI (not `opencode run`) so the user can steer mid-flight.
- `--prompt "$(cat …)"` — the file indirection keeps multi-line text intact.
- Verify the model id exists first: `opencode models | grep <name>`.
- Confirm launch with `ps aux | grep opencode | grep <worktree>`; the full prompt
  should appear in the process args.
- `cmux notify` when both are up.

### Before you fire, offer two choices

- **Plan mode or not?** Agents launched this way start editing immediately. Ask
  whether they should present a plan first.
- **PR or local commit?** The prompts as written push a branch and open a PR.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Agent re-greps everything you already researched | Findings summarized as prose, no `file:line` | Cite lines; add `DO NOT RE-DERIVE` |
| Agent relitigates a settled scope decision | Decision stated without rationale | State the why, and the evidence behind it |
| Agent builds an out-of-scope item | Out-of-scope list had no reasons | Give each exclusion a one-line reason |
| Both agents hang on a port | Shared-resource rule missing from one prompt | Put it in every prompt, name the sibling |
| Agent's first test run is red | Baseline never verified | Run typecheck/test/build before launching |
| Prompt arrives mangled | Smart quotes / multi-line through a flag | ASCII only, prompt in a file |
| Subagent starts editing during research | Read-only stated once, in the middle | State it at the top and the bottom |
| Feature ships but does nothing at runtime | Gating flags never probed | Curl the live API, not just the source |
