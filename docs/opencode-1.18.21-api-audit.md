# OpenCode 1.18.21 API audit

Audited live on 2026-08-21 against OpenCode 1.18.21 at `GET /doc` and selected
runtime endpoints. The comparison baseline was the 1.18.19 contract used by the
BFF, not the older published documentation.

## Verdict

- The OpenAPI surface remains 162 paths, 188 operations, and 472 schemas.
- Every classic endpoint called by the BFF is still present.
- No used request or response gained a required field, and no enum consumed by
  the BFF changed.
- The expected server version can move from 1.18.19 to 1.18.21 without an
  adapter change.

## Revalidated traps

- `POST /session/{id}/prompt_async` still returns 204 immediately.
- `GET /global/event` remains the cross-project stream. Events use the global
  wrapper; `server.heartbeat` still appears at runtime despite being absent from
  the typed event union.
- `Todo` still has only `content`, `status`, and `priority`; it has no `id`.
- `GET /file/status` and `GET /find/symbol` still return `[]`.
- `GET /event` remains directory-scoped, while `/global/event` is required for
  the multi-project UI.

Historical research snapshots under `docs/research/` retain their original
1.18.19 labels because they describe the version actually measured at the time.

## PTY (classic surface)

Audited live against a running 1.18.21 server. All routes exist on both the classic
surface and the `/api/**` twin, except `GET /pty/shells`, which is classic-only.

| Route | Behaviour observed |
|---|---|
| `POST /pty` | Returns `Pty`. **Overwrites `args` with `["-l"]`** — always a login shell. Accepts any `cwd`, including `/etc`. `env` is merged as given. |
| `GET /pty` | Scoped by `?directory=`. An **unscoped** call returns `[]`, not everything. |
| `GET /pty/{id}` | **404 when addressed through a different `directory`**, even though `Pty` has no directory field. This is the only way to prove ownership. |
| `PUT /pty/{id}` | `{ title?, size?: { rows, cols } }`. Resize is HTTP, not a socket message. |
| `DELETE /pty/{id}` | Returns a bare `true`. |
| `GET /pty/shells` | `{ path, name, acceptable }[]`. |
| `POST /pty/{id}/connect-token` | **403 `PtyForbiddenError` in every case tried** — unsecured server, and secured server with valid basic auth. Not usable in 1.18.21. |
| `GET /pty/{id}/connect` | WebSocket. Honours basic auth (**401** without, **101** with `Authorization`). Also accepts a `cursor` query param for replay; connecting without one already replays the buffer. |

Two things the schema does not tell you:

- **The socket multiplexes.** Text frames carry raw terminal bytes. Binary frames whose
  first byte is `0x00` carry JSON control data — observed `\x00{"cursor":284}`, a byte
  offset into the output buffer. A client that renders binary frames prints garbage.
- **`Origin` is not validated on the upgrade.** A handshake sending
  `Origin: http://evil.example` was accepted. Since browsers do not apply CORS to
  WebSocket handshakes, any origin check has to be done by the proxy in front.

Events `pty.created`, `pty.updated`, `pty.exited` and `pty.deleted` are carried on
`/global/event` with the usual `directory` envelope, so a PTY list needs no poller.
