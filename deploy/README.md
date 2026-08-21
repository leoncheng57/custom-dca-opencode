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
reachable, and never overwrite an installed plist automatically. Before first use:

1. Replace every `REPO_ROOT` with the absolute repository path. Paths containing
   spaces are valid plist strings and must not be shell-escaped.
2. Create `.state/logs` and ensure dependencies are installed.
3. Put the OpenCode URL and optional password in `.env`; the plist contains no secret.
4. Validate and install under its distinct label:

```bash
plutil -lint deploy/ai.opencode.serve.plist
cp deploy/ai.opencode.serve.plist ~/Library/LaunchAgents/ai.opencode.serve.plist
launchctl bootstrap "gui/$UID" ~/Library/LaunchAgents/ai.opencode.serve.plist
launchctl print "gui/$UID/ai.opencode.serve"
```

The wrapper `scripts/start-opencode.mjs` loads the same `.env`, derives the bind port
from `OPENCODE_URL`, and passes the password through the child environment. The jobs
and logs are intentionally unambiguous: `ai.opencode.serve` uses
`opencode.launchd.*.log`; `ai.custom-dca-opencode.bff` uses `bff.launchd.*.log`.
