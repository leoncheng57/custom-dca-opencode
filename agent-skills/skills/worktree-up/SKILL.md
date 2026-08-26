---
name: worktree-up
description: Set up a git worktree for new work — sibling <repo>.worktrees/<topic> directory, branch cut from origin's default, dependencies installed, fixed-port collisions checked against worktrees already running the stack. Use when the user says "make a worktree", "worktree up", "spin up a branch", "work on this in a worktree", or when new code is about to be written and the current checkout is a shared branch.
metadata:
  tags: "worktrees"
---

# Worktree up

The *rule* — never write new code directly on a shared checked-out branch — lives
in `AGENTS.md`. This skill is the *procedure*.

A worktree gives each line of work its own directory, its own branch, and its
own dirty state, while sharing one `.git`. The failure it prevents is two pieces
of work interleaved in one checkout, where `git stash` is the only tool left.

`manager-children` and `parallel-research-handoff` both create worktrees as part
of a larger flow. Both should defer to this procedure for the mechanics.

---

## 1. Orient

Run these before creating anything:

```bash
git rev-parse --show-toplevel                       # repo root — you may be in a subdir
git rev-parse --abbrev-ref origin/HEAD              # default branch, e.g. origin/main
git worktree list                                   # what already exists
```

If `origin/HEAD` is unset (a common state on a fresh clone) it errors. Fix it
once:

```bash
git remote set-head origin --auto
```

Then **fetch**, always, before cutting the branch:

```bash
git fetch origin
```

Branching from a stale local `main` is how two worktrees start life already
behind and conflicting. Branch from `origin/<default>`, never from local.

---

## 2. Naming

Worktrees live in a **sibling** directory of the repo, never inside it — a
worktree nested under the repo shows up as untracked files in the parent and
gets swept into commits and `rm -rf` alike.

```
~/Documents/Projects/myrepo/                  # the clone
~/Documents/Projects/myrepo.worktrees/        # sibling, holds all worktrees
~/Documents/Projects/myrepo.worktrees/dark-mode/
~/Documents/Projects/myrepo.worktrees/fix-login-412/
```

- Directory: `<repo>.worktrees/<topic>`, topic in kebab-case. Where an issue
  number exists, the local house convention is `<topic>-<issue>` — for example
  `fix-login-412`.
- Branch: `<type>/<topic>` — `feat/dark-mode`, `fix/login-412`, `chore/deps`.

Directory name and branch topic should match, so `git worktree list` and
`git branch` read as the same list.

---

## 3. Create

```bash
REPO=$(git rev-parse --show-toplevel)
WT="${REPO}.worktrees"
TOPIC=dark-mode
BRANCH=feat/dark-mode
DEFAULT=$(git rev-parse --abbrev-ref origin/HEAD)   # e.g. origin/main

mkdir -p "$WT"
git worktree add -b "$BRANCH" "$WT/$TOPIC" "$DEFAULT"
```

If the branch already exists, drop `-b`:

```bash
git worktree add "$WT/$TOPIC" "$BRANCH"
```

`git worktree add` refuses to check out a branch that is already checked out
elsewhere — that refusal is the feature, not an obstacle to work around. If you
hit it, the branch is live in another worktree; find it with `git worktree list`.

---

## 4. Install dependencies

**`node_modules` is not shared between worktrees.** Nor are `.venv`, `target/`,
`vendor/`, or any other gitignored build directory. A fresh worktree has source
only, and the first command you run in it will fail in a way that looks like a
code error.

```bash
cd "$WT/$TOPIC"
npm ci            # or: pnpm install --frozen-lockfile / yarn / uv sync / bundle install
```

Then **prove the baseline is green before writing any code**:

```bash
npm run typecheck && npm test && npm run build
```

A known-good baseline means the first red test is unambiguously yours. Fresh
installs fail in ways that masquerade as your bug half an hour later — blocked
postinstall scripts, missing native binaries, lockfile drift. Note the passing
test count.

Also copy any gitignored local config the project needs — `.env`, `.env.local`,
credentials files. These live only in the original checkout:

```bash
cp "$REPO/.env" "$WT/$TOPIC/.env" 2>/dev/null || true
```

Read the copied `.env` afterwards: paths inside it are frequently **relative**
and will resolve against the new worktree, which has no state directory. Make
those absolute, pointing back at the original checkout.

---

## 5. Port collisions

**This is where parallel worktrees actually break.** If the project binds fixed
ports — a `docker compose` file with `ports: "3000:3000"`, a hardcoded dev
server port, a bind-mounted state directory — then **only one worktree can run
the stack at a time**. The second one either fails to bind or, worse, silently
attaches to the first one's services and you debug the wrong process.

Before starting anything that binds:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
docker ps
```

**If a port is occupied, confirm the PID is yours before assuming you won the
bind.** Other projects on the same machine run the same binaries, and a log line
saying `server listening` in your terminal does not prove your process owns the
socket:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN     # note the PID
ps -p <PID> -o pid,ppid,command      # is this actually your process, in your worktree?
```

Options when the stack is already up in a sibling worktree:

- **Stay in the stack-free tiers.** Typecheck, unit tests, lint, and build
  usually need no running services. Do all of that first; contend for the port
  briefly, at the end, one worktree at a time.
- **Run only your layer on a free port.** Point it at the already-running shared
  services rather than starting a second full stack.
- **Wait.** Coordinate rather than racing.

Never start a second stack "just to see". Bind-mounted state directories mean
two stacks can corrupt each other's data, and that failure surfaces hours later.

---

## 6. Report

Give the user the **absolute path** — they will need to `cd` there, open an
editor on it, or launch an agent in it:

```
Worktree ready:
  path:     /Users/you/Documents/Projects/myrepo.worktrees/dark-mode
  branch:   feat/dark-mode (from origin/main @ a1b2c3d)
  deps:     installed (npm ci)
  baseline: typecheck + 214 tests + build all green
  ports:    3000 in use by PID 4821 in ../other-topic — stack-free tiers only
```

---

## 7. Clean up

When the branch is merged or abandoned:

```bash
git worktree remove "$WT/$TOPIC"          # refuses if dirty
git worktree remove --force "$WT/$TOPIC"  # only when the dirt is genuinely disposable
git branch -d "$BRANCH"                   # -D if abandoned unmerged
```

`git worktree remove` deletes the directory including its `node_modules`. It
will not delete uncommitted work without `--force`; check `git -C "$WT/$TOPIC"
status` first.

If a worktree directory was deleted by hand (or lived inside a container that is
now gone), git still lists it as registered. Clear the stale entries:

```bash
git worktree prune
git worktree list      # confirm
```

Run `git worktree prune` before creating new worktrees in any repo that has seen
this. Stale registrations block reuse of the same path.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| New branch is already behind | Cut from stale local `main` | `git fetch origin`, branch from `origin/<default>` |
| `fatal: ... is already checked out` | Branch live in another worktree | `git worktree list` and go there |
| Worktree files show as untracked in the parent | Created inside the repo | Recreate in the `<repo>.worktrees` sibling |
| Every command fails immediately in a new worktree | Deps not installed; `node_modules` is not shared | Run the install |
| App starts but reads no config | Gitignored `.env` not copied | Copy it; make relative paths absolute |
| Server "starts" but behaves like another branch | Attached to a sibling worktree's stack | `lsof -nP -iTCP:<port> -sTCP:LISTEN`, verify the PID |
| Two worktrees corrupt shared state | Two stacks against one bind-mounted dir | One stack at a time; stack-free tiers otherwise |
| `worktree add` fails on a path you deleted | Stale registration | `git worktree prune` |
| First test run is red on untouched code | Baseline never established | Run typecheck/test/build before editing |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
a worktree created and its baseline proven green, then a port collision traced
back to the sibling worktree that actually owns the socket.
