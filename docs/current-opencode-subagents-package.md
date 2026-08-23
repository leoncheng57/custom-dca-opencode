# Current OpenCode sub-agents: learning package

Status: **Current-state documentation**

## Recommended review order

1. [Senior-SWE system guide](current-opencode-subagents-guide.md)
2. [Interactive explainer](current-opencode-subagents.html)
3. [Quick reference](current-opencode-subagents-reference.md)
4. [Safe mock/static learning lab](current-opencode-subagents-lab.md)
5. [Existing contributor guide](subagents.md)
6. [Animated lifecycle diagram](assets/current-opencode-subagent-lifecycle.svg)
7. [Portable GIF](assets/current-opencode-subagent-lifecycle.gif)

## What each artifact answers

| Artifact | Question |
|---|---|
| System guide | What owns execution, how state is derived, and where uncertainty enters |
| Interactive explainer | How foreground/background, evidence, UI, and permissions fit together |
| Quick reference | Which endpoint, limit, state, or operating rule do I need right now |
| Learning lab | How can I prove my understanding without touching production OpenCode |
| Existing guide | What contributor workflow and invariants already exist in the repository |
| SVG/GIF | Can I explain the lifecycle in under one minute |

## Scope boundary

This package explains what exists on `main`. It deliberately excludes the persistent side-agent
bridge proposed separately in draft PR #102.

Claims are classified as live-observed, code-supported, mock-modelled, or unverified. In particular,
child permission inheritance and guaranteed background hand-back are not presented as established
OpenCode contracts.
