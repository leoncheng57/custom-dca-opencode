---
title: A task refused before it can block
trigger: background-subagent
caveat: >-
  This shows the unavailable-flag branch. A successful run would additionally
  show the task call and returned task_id, then end immediately.
---

# Worked example

## user

audit token expiry in server/auth

*Reminder attached: Delegate in the Background*

## tool — shell interpolation

```
OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS
unset
```

## assistant

I cannot launch this in the background: the required flag is unset and OpenCode
reads it at startup.

Choose one:

- Restart OpenCode with
  `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true`, then run this command again.
- Run the same audit in the foreground now; it will block this session until it
  returns.

I have not started the audit either way.

## note

The guard is visible because shell interpolation ran before the model saw the
command template. Silently dropping `background: true` would look successful
until the foreground task blocks — exactly the failure this command prevents.
