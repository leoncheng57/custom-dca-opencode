# Engineering Design Documents

The Notion pages below are the sole storage location for the point-in-time design snapshots
created for issue #151. This repository intentionally does not retain Markdown copies, exports,
or mirrored diagrams: editing a repository copy would create a competing source.

## Index

| Document | Snapshot date | Scope | Notion |
|---|---|---|---|
| [Request and Event Architecture — 2026-08-26](https://app.notion.com/p/Request-and-Event-Architecture-2026-08-26-3c8a232837d9810b80abd5d9c0c0e03d) | 2026-08-26 | Browser to React SPA to Express BFF to OpenCode: the request path, async prompt path, and global event fan-out. | Private until manually published |
| [Notification Persistence and Delivery — 2026-08-26](https://app.notion.com/p/Notification-Persistence-and-Delivery-2026-08-26-3c8a232837d98168bd0ec3c67e0d0b26) | 2026-08-26 | Notification ingest, durable records, retention, manual resolution, and desktop, ntfy, Web Push, and app-badge delivery. | Private until manually published |
| [Live Session Browser — 2026-08-27](https://app.notion.com/p/Live-Session-Browser-2026-08-27-3c9a232837d98154bb51f23fe99394a5) | 2026-08-27 | Live per-session interactive web browser: headless Chromium, screencast transport, capacity and memory model, and the SSRF boundary. Proposed, not implemented. | Private until manually published |

All three pages are children of [Public Engineering Design Docs](https://app.notion.com/p/Public-Engineering-Design-Docs-3c8a232837d980d2b294db846b968a57) under `Custom Projects` in `Leon (Professional)`.

## Snapshot contract

Each Notion page records the design as understood on its snapshot date. It is deliberately not
kept synchronized with the implementation. The maintained repository documentation remains the
current implementation contract: [`docs/architecture.md`](../architecture.md),
[`docs/notifications.md`](../notifications.md), and [`AGENTS.md`](../../AGENTS.md). Where a
snapshot and maintained documentation disagree, the maintained documentation wins.

A superseding design is a new dated Notion page. The existing page is not rewritten to describe
later code, because doing so would destroy the historical record.

## Publication

Notion publication is manual. Open `Public Engineering Design Docs`, use **Share → Publish to
web**, then verify the resulting page in a signed-out or private browser window. The Notion API
does not expose a share-to-web operation, so the `public_url` cannot be set by this project.

After publication, replace the private links above with the verified public URLs. The follow-up
`/docs` Time Snapshot section is blocked on those public URLs.
