---
name: session-handoff
description: Launch one standalone OpenCode session from another and explicitly carry over its agent or mode, model, reasoning effort, working directory, prompt, permission posture, branch or worktree, and stop condition. Use when the user says "open a new session", "hand this off to a new session", "start a fresh opencode session", "carry this over to another session", or "launch a session in plan mode".
metadata:
  tags: "subagents, planning"
---

# Hand work to a standalone OpenCode session

A new session inherits **nothing automatically**. Carry state through exactly
two channels: CLI flags and the handoff packet. Treat prose such as "stay in
plan mode" as advisory; `--agent plan` is the control. There is no `--mode`
flag.

Use this for one standalone child session. For a `task`-tool subagent, defer to
`background-subagent`. For research followed by several sessions, defer to
`parallel-research-handoff`. For branch and worktree creation, defer to
`worktree-up`; do not duplicate those mechanics here.

## 1. Pick the mechanism first

These mechanisms are not interchangeable:

| Mechanism | Carries history | Separate process | Best use |
|---|---|---|---|
| `/new` | No | No | Clear the current TUI into a new conversation |
| `task` tool | Only the prompt supplied to the subagent | No | Bounded delegated work whose result returns to the parent |
| `--session <id> --fork` | Yes, copied from that session | Yes | Branch a known conversation while preserving its history |
| Fresh `opencode [project]` | No | Yes | A steerable standalone TUI the user can watch |
| `opencode run` | No, unless continuing or attaching | Yes | Non-interactive work, automation, or a machine-readable event stream |

Choose fresh TUI or `run` when the user asks for another standalone session.
Use `--fork` only when copied history is the explicit goal. Do not use
`--continue` or `--session` merely to avoid writing a complete packet.

## 2. Inspect before claiming

Ask the installation what exists:

```bash
opencode agent list
opencode models
opencode session list
```

The roster is per-install. Built-in primary agents are normally `build` (all
tools) and `plan` (edit and bash default to ask); built-in subagents normally
include `general`, `explore`, and `scout`. Still inspect rather than assume.

Carry over only facts you can verify. Label every other statement
`UNVERIFIED`, including provider behavior, model aliases, accepted reasoning
variants, previous test results you did not witness, and inferred user intent.
Never assert that a setting, plugin, permission, environment variable, or
conversation detail will be inherited.

## 3. Write the handoff packet

A fresh session sees only the prompt. Write a standalone packet that includes:

1. **Absolute repo path.** Name the exact working directory, never `.` or "the repo".
2. **Branch and worktree.** State both, plus whether either already exists.
3. **Objective.** Define the deliverable and whether the child plans, researches, or edits.
4. **Progress so far.** Separate completed work from proposed work.
5. **Settled decisions with rationale.** Preserve the why so the child does not relitigate scope.
6. **Ownership.** List files it owns and files it must not touch; name concurrent agents.
7. **Requested runtime.** Record the exact agent, model, and provider-specific variant.
8. **Permission posture.** State expected asks and explicit denies; state whether `--auto` is forbidden or requested.
9. **Verification.** Give exact commands and known baseline results.
10. **Stop condition.** Say what final artifact or report ends the child's work.
11. **`UNVERIFIED`.** List every remaining assumption, or write `UNVERIFIED: none`.

Require the child's first reply to restate the repo, branch, agent, model,
variant, permission posture, objective, ownership boundaries, and stop
condition before doing anything. That restatement detects a mangled or stale
packet early.

Store the packet outside every git working tree so no checkout starts dirty:

```bash
PACKET_DIR="$HOME/.local/state/opencode-handoffs"
mkdir -p "$PACKET_DIR"
PACKET="$PACKET_DIR/auth-plan.md"
```

Write the packet there with the normal file-editing tool. Do not inline a
multi-line packet directly into a launch command. Do not put secrets in the
packet: prompt text becomes a process argument and may be exposed by shell
history or `ps`.

## 4. Launch every setting explicitly

Confirm the worktree's branch before any session may edit:

```bash
git -C "/absolute/path/to/repo.worktrees/auth-plan" branch --show-current
git -C "/absolute/path/to/repo.worktrees/auth-plan" status --short --branch
```

Launch a steerable TUI with the working directory as the positional project:

```bash
opencode "/absolute/path/to/repo.worktrees/auth-plan" \
  --agent plan \
  --model openai/gpt-5.6-sol \
  --prompt "$(cat "$PACKET")"
```

Launch a non-interactive session with `run`:

```bash
opencode run \
  --dir "/absolute/path/to/repo.worktrees/auth-plan" \
  --agent plan \
  --model openai/gpt-5.6-sol \
  --variant high \
  --prompt "$(cat "$PACKET")" \
  --title "Plan auth refresh" \
  --format json
```

`--agent` sets mode. `--variant` is provider-specific reasoning effort; verify
that the selected provider recognizes values such as `high`, `max`, or
`minimal`. `--thinking` only displays thinking blocks; it does not enable or
increase reasoning. `--attach <url>` connects `run` to an existing
`opencode serve`; it does not transfer this parent's state.

Do not add `--auto` unless the user explicitly asked for it. If requested, say
out loud before launch that it auto-approves permissions that would otherwise
ask. Explicit deny rules still apply under `--auto`; it does not erase them.

## 5. Verify the child, not just the command

A successful shell command proves only that a process started. Confirm:

- Its working directory is the absolute worktree path.
- `git branch --show-current` in the child matches the packet.
- The selected agent and model match the explicit flags.
- The requested variant appears in the packet and launch command.
- Its first reply restates the packet before planning or editing.
- Its permission behavior matches the requested posture.

Inspecting `ps` can prove what was **requested** on the command line, not what a
provider accepted. A provider may ignore an unsupported variant. Mark that
state `UNVERIFIED` until the child or provider reports it. Avoid printing the
full process arguments when the packet could contain sensitive information.

## 6. Safety rules

- Never imply automatic inheritance. Name the flag or packet field carrying each setting.
- Never add `--auto` by convenience or copy it from another command.
- Never place tokens, passwords, private keys, or sensitive user data in prompts or process arguments.
- Verify the worktree and branch before permitting edits.
- Give parent and child disjoint file ownership, or stop the parent from editing while the child runs.
- Use a fresh session unless copied history is explicitly requested; `--fork` changes that guarantee.
- End the parent turn after reporting what launched. Do not start doing the child's assigned work.

## Optional: present it in cmux

cmux is only a presentation wrapper; the bare CLI above remains authoritative:

```bash
cmux workspace create --name "auth-plan" \
  --cwd "/absolute/path/to/repo.worktrees/auth-plan" \
  --focus false \
  --command "opencode --agent plan --model openai/gpt-5.6-sol --prompt \"\$(cat $PACKET)\""
```

Always use `--focus false`; never steal focus. Keep settings in the nested
`opencode` command and packet, not in assumptions about cmux.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Child edits when it should have planned | Prompt says "plan" but launch omitted `--agent plan` | Relaunch with `--agent plan`; prose is not mode control |
| History unexpectedly copied | Used `--fork` with `--continue` or `--session` | Use a fresh TUI or fresh `run` without continuation flags |
| Child opens the wrong repo | Relative project path or implicit shell directory | Pass an absolute positional project or `--dir` |
| Child lacks crucial context | Packet was conversational shorthand | Rewrite it as a cold-start, decision-closed packet |
| Parent and child overwrite each other | Both own or edit the same files | Assign disjoint ownership and stop one writer |
| `--auto` appears to have been inherited | Launch command was copied without review | Remove it unless explicitly requested; announce it when used |
| Secrets appear in shell history or `ps` | Secret was embedded in prompt or argument | Remove it and rotate the exposed secret; use a safe external channel |
| Variant is silently ignored | Provider does not recognize the requested effort | Inspect provider support and label acceptance `UNVERIFIED` |

References: [CLI](https://opencode.ai/docs/cli/),
[agents](https://opencode.ai/docs/agents/), and
[permissions](https://opencode.ai/docs/permissions/).

## Worked example

`SIMULATION.md` in this directory shows the guard firing when prose requests
plan mode but the launch omits `--agent plan`, followed by the corrected
standalone launch and the parent's real stopping condition.
