# macOS LaunchAgents

The recommended supervised unit is the production BFF and built SPA. It uses the
label `ai.custom-dca-opencode.bff`, listens on port `3210` by default, and writes
separate logs under `.state/logs/`.

```bash
cp .env.example .env
chmod 600 .env
npm run service:install
npm run service:status
npm run service:logs
npm run service:uninstall
```

To update an already-installed service with new code, see
[`docs/operations.md`](../docs/operations.md); it also explains why the OpenCode agent
runtime must not be restarted along with the BFF.

Use `npm run service:install -- --port=3211` to choose another supervised port.
Port `3000` is rejected because `npm run dev` uses it by default. Installation is
idempotent: it rebuilds the app, replaces only
`~/Library/LaunchAgents/ai.custom-dca-opencode.bff.plist`, and bootstraps only the
matching `gui/$UID/ai.custom-dca-opencode.bff` job. Uninstall does not use `pkill`,
does not touch OpenCode, and preserves logs.

Keep credentials such as `OPENCODE_SERVER_PASSWORD`, forge tokens, and notification
tokens in the repo-root `.env`, never in a plist. Keep that file mode `0600`.
`launchd` does not load `.zshrc`, `.zprofile`, or other shell profiles. The BFF still
loads `.env` with dotenv because its plist sets `WorkingDirectory` to the repository
root before starting `dist/server/index.js`.

The BFF never starts OpenCode. It connects to the one server named by `OPENCODE_URL`
in `.env`. Verify that server first rather than starting another:

```bash
curl --fail --user "${OPENCODE_SERVER_USERNAME:-opencode}:$OPENCODE_SERVER_PASSWORD" \
  "$OPENCODE_URL/global/health"
```

For tailnet access, proxy the dedicated supervised port and inspect the resulting
Serve configuration:

```bash
tailscale serve --bg http://127.0.0.1:3210
tailscale serve status
```

Set `PUBLIC_APP_URL` in `.env` to the HTTPS origin shown by Tailscale, then reinstall
the service so the rebuilt process reads it.

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
