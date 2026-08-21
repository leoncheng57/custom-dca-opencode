# custom-dca-opencode

A custom local coding-agent IDE built on the [OpenCode](https://opencode.ai) server API.

React/Vite SPA + Express BFF talking to a long-lived `opencode serve` over HTTP and SSE.
Runs entirely on the host — no Docker, one process to supervise. Reachable from a phone
over Tailscale.

> Successor to `custom-dca-ide-with-openhands`, which is frozen as an artifact.
> The research and plan behind the migration live in [`docs/research/`](docs/research/).

## Why

`opencode` is excellent in the terminal, but a terminal UI can't give you a
notifications settings page, a merge-request panel with pipeline status, or a
glanceable view of which of your MCP servers are quietly failing. This is that layer —
a web frontend for an agent server you already run.

It is deliberately **not** a replacement for the `opencode` CLI. Both are clients of
the same server and can be attached at the same time, watching the same sessions.

## Status

Early. Built in phases — see [`docs/research/opencode-build-plan.html`](docs/research/).

| Phase | | |
|---|---|---|
| 0 | Foundation — scaffold, permission policy, launchd unit | ✅ |
| 1 | The seam — SDK wrapper + event adapter | 🚧 |
| 2 | Session lifecycle + interrupted-run detection | |
| 3 | Panels — MR, commands, files, changes, preview proxy | |
| 4 | Derived — task list, status bar, tools & health | |
| 5 | Settings, resilience, worktrees | |
| 6 | Mobile polish + cutover | |

## Requirements

- Node 22+
- A running `opencode serve` (or `opencode web`) — v1.18.19
- Optional: Tailscale, for phone access

## Quick start

```bash
npm install
cp .env.example .env        # point OPENCODE_URL at your server
npm run dev
```

## Architecture

```
Browser (desktop / phone via Tailscale)
   │
   ├── client/    React 19 + Vite + Tailwind v4 SPA
   │
   └── server/    Express BFF — auth, directory scoping, SSE fan-out,
                  local git, third-party (GitLab/GitHub/ntfy)
        │
        └── opencode serve :4096   one instance, all projects
```

The BFF exists because: it holds the server credential, fans one upstream SSE stream out
to many browser clients, threads `?directory=` per project, and runs the things the
OpenCode API doesn't expose (git history, forge APIs, notification transport).

## Safety

`opencode serve` runs agent tools **directly on the host as your user** — there is no
container. The guardrail is the `permission` block in `opencode.json`: per-tool and
per-command-pattern `allow` / `ask` / `deny`, with `~/.ssh`, `~/.aws` and `.env` files
denied outright.

Note that permission precedence is **last-match-wins**, the opposite of most ACL
systems. Broad rules first, specific overrides after.

## License

MIT
