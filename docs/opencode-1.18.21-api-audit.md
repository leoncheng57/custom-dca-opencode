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
