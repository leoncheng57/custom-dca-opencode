---
title: A worktree whose port is already taken
trigger: make a worktree
caveat: >-
  Command output is trimmed to the lines that changed a decision, and the
  npm ci step really takes a couple of minutes. The port collision is the
  interesting case, not the common one.
---

# Worked example

## user

make a worktree for the dark mode work

## tool — bash

```
$ git rev-parse --show-toplevel
/Users/you/Documents/Projects/myrepo
$ git rev-parse --abbrev-ref origin/HEAD
origin/main
$ git worktree list
/Users/you/Documents/Projects/myrepo                        a1b2c3d [main]
/Users/you/Documents/Projects/myrepo.worktrees/other-topic  9f8e7d6 [feat/other-topic]
$ git fetch origin
```

## tool — bash

```
$ git worktree add -b feat/dark-mode \
    ~/Documents/Projects/myrepo.worktrees/dark-mode origin/main
Preparing worktree (new branch 'feat/dark-mode')
branch 'feat/dark-mode' set up to track 'origin/main'.
HEAD is now at a1b2c3d
```

## tool — bash

```
$ cd ~/Documents/Projects/myrepo.worktrees/dark-mode && npm ci
added 270 packages in 1m48s
$ cp ~/Documents/Projects/myrepo/.env .env 2>/dev/null || true
$ npm run typecheck && npm test && npm run build
Tests  214 passed (214)
✓ built in 3.1s
```

## tool — bash

```
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
node    4821 you   24u  IPv6  TCP *:3000 (LISTEN)
$ ps -p 4821 -o pid,command
 4821 node .../myrepo.worktrees/other-topic/node_modules/.bin/vite
```

## assistant

Worktree ready:

```
  path:     /Users/you/Documents/Projects/myrepo.worktrees/dark-mode
  branch:   feat/dark-mode (from origin/main @ a1b2c3d)
  deps:     installed (npm ci)
  baseline: typecheck + 214 tests + build all green
  ports:    3000 in use by PID 4821 in ../other-topic — stack-free tiers only
```

Port 3000 belongs to the dev server in the `other-topic` worktree, so do not
start a second one here. Typecheck, tests, lint and build all pass without it
— do that work first and contend for the port at the end, one worktree at a
time.

## note

The `ps -p` call is the point of this transcript. `lsof` says something owns
port 3000; it does not say what. Skipping that second command is how you
attach to a sibling worktree's dev server and spend an hour debugging the
wrong branch's code.

Two other things are load-bearing and invisible in the result. The branch is
cut from `origin/main` after a fetch, not from local `main`, so it does not
start life behind. And `npm ci` runs at all because `node_modules` is not
shared between worktrees — a fresh worktree has source only, and the first
command you run in it otherwise fails in a way that looks like a code error.

The baseline is proven green *before* any code is written, so the first red
test is unambiguously yours.
