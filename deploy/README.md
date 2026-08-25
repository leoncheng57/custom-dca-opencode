# Deployment operations

The production deployment is deliberately split so app upgrades do not interrupt
agent turns:

```text
Phone or browser
      |
      v
Tailscale HTTPS
      |
      v
launchd: UI + BFF (:3210) ----> OpenCode (:4097)
      |                                |
      +-- rebuilt on app upgrade        +-- left running
```

The supervised unit is `ai.custom-dca-opencode.bff`. It serves the built SPA and
production BFF on port `3210` by default, with logs under `.state/logs/`. OpenCode
is a separate, long-lived process named by `OPENCODE_URL` in `.env`.

## Upgrade after GitHub changes

Run these commands from the repository root:

```bash
git pull --ff-only
npm ci
npm run service:install -- --port=3210
```

`service:install` rebuilds the SPA and BFF, replaces the matching LaunchAgent, and
starts the new BFF process. A connected browser briefly reconnects. OpenCode is not
restarted, so active agent turns continue.

### Verify the upgrade

```bash
curl --fail http://127.0.0.1:3210/api/health
npm run service:status
tailscale serve status
```

When Tailscale Serve is configured, also load the HTTPS origin shown by
`tailscale serve status`. A successful `/api/health` response reports whether the
BFF can reach OpenCode and whether their expected versions match.

> Do not restart OpenCode during an active turn. An OpenCode restart interrupts
> that turn; its session history remains, but the turn is not resumed automatically.

## First-time setup

```bash
cp .env.example .env
chmod 600 .env
npm ci
npm run service:install -- --port=3210
```

Use `npm run service:install -- --port=3211` to choose another supervised port.
Port `3000` is rejected because `npm run dev` uses it by default. Installation is
idempotent: it rebuilds the app, replaces only
`~/Library/LaunchAgents/ai.custom-dca-opencode.bff.plist`, and bootstraps only the
matching `gui/$UID/ai.custom-dca-opencode.bff` job. Uninstall does not use `pkill`,
does not touch OpenCode, and preserves logs.

## Operations checklist

- Check service state: `npm run service:status`
- Follow BFF logs: `npm run service:logs`
- Remove the BFF service: `npm run service:uninstall`
- Keep `.env` mode `0600`; it contains credentials and is never copied to the plist.

Keep credentials such as `OPENCODE_SERVER_PASSWORD`, forge tokens, and notification
tokens in the repo-root `.env`, never in a plist. Keep that file mode `0600`.
`launchd` does not load `.zshrc`, `.zprofile`, or other shell profiles. The BFF still
loads `.env` with dotenv because its plist sets `WorkingDirectory` to the repository
root before starting `dist/server/index.js`.

## OpenCode connection

The BFF never starts OpenCode. It connects to the one server named by `OPENCODE_URL`
in `.env`. Verify that server first rather than starting another:

```bash
curl --fail --user "${OPENCODE_SERVER_USERNAME:-opencode}:$OPENCODE_SERVER_PASSWORD" \
  "$OPENCODE_URL/global/health"
```

## Tailscale access

Proxy the dedicated supervised port and inspect the resulting Serve configuration:

```bash
tailscale serve --bg http://127.0.0.1:3210
tailscale serve status
```

Set `PUBLIC_APP_URL` in `.env` to the HTTPS origin shown by Tailscale, then rerun
`npm run service:install -- --port=3210` so the BFF reads the new value.

## Optional OpenCode Unit

`ai.opencode.serve.plist` remains a manual template for users who do not already
supervise OpenCode. Do not install it when `OPENCODE_URL/global/health` is already
reachable, and never overwrite an installed plist automatically.

The template invokes the OpenCode binary directly. It never relies on `node`,
`/usr/bin/env`, nvm, or shell-profile PATH setup. It also deliberately does not load
`.env` and contains no password: use it only for an unsecured server bound to
`127.0.0.1`. If OpenCode requires authentication, keep it under its existing
supervisor and put only the matching URL and credentials in the BFF's mode-0600
`.env`.

Before first use, make a working copy and replace every `REPLACE_WITH_*` value:

- `REPLACE_WITH_ABSOLUTE_OPENCODE_BINARY`: the absolute result of `command -v opencode`
- `REPLACE_WITH_OPENCODE_PORT`: the port from `OPENCODE_URL` in `.env`
- `REPLACE_WITH_HOME_DIRECTORY`: the absolute home directory
- `REPLACE_WITH_LAUNCHD_PATH`: an explicit PATH containing tools agents may invoke
- `REPLACE_WITH_LOG_DIRECTORY`: an existing absolute log directory

Paths containing spaces are valid plist strings and must not be shell-escaped. Escape
XML-sensitive characters if a path contains them. Validate that no placeholder remains
before installing under the distinct label:

```bash
cp deploy/ai.opencode.serve.plist /tmp/ai.opencode.serve.plist
# Edit /tmp/ai.opencode.serve.plist, then:
! grep -q 'REPLACE_WITH_' /tmp/ai.opencode.serve.plist
plutil -lint /tmp/ai.opencode.serve.plist
test ! -e ~/Library/LaunchAgents/ai.opencode.serve.plist
cp /tmp/ai.opencode.serve.plist ~/Library/LaunchAgents/ai.opencode.serve.plist
launchctl bootstrap "gui/$UID" ~/Library/LaunchAgents/ai.opencode.serve.plist
launchctl print "gui/$UID/ai.opencode.serve"
```

The jobs and logs are intentionally unambiguous: `ai.opencode.serve` uses
`opencode.launchd.*.log`; `ai.custom-dca-opencode.bff` uses `bff.launchd.*.log`.
