# Design snapshots

## What this directory is

Each file here records the design of one subsystem as it was understood on a single date,
in one project context. **These documents are deliberately not kept synchronized with the
implementation.** The maintained documentation is the source of truth:
[`docs/architecture.md`](../architecture.md), [`docs/notifications.md`](../notifications.md),
[`AGENTS.md`](../../AGENTS.md), and the rest of `docs/`. Where a snapshot and a maintained
document disagree, the maintained document wins.

The directory exists for two reasons. The first is deliberate practice at system design:
writing the full skeleton below forces the threat model, the cost model, and the rejected
alternatives to be stated rather than assumed. The second is a historical record of what
was known and decided on a given date, which is destroyed the moment a snapshot is edited
to match later code.

A reader must never mistake an older snapshot for the current implementation contract.
Every snapshot carries its date in its filename and in its heading, and this directory is
excluded from the in-app `/docs` catalogue for the reason given in the last section.

## Index

| Document | Snapshot date | Scope | Notion (public) | Source of truth |
|---|---|---|---|---|
| [`2026-08-26-request-and-event-architecture.md`](./2026-08-26-request-and-event-architecture.md) | 2026-08-26 | Browser to React single-page application (SPA) to Express backend-for-frontend (BFF) to OpenCode: the request path, the async prompt path, and the global event fan-out. | Not yet published | [`docs/architecture.md`](../architecture.md) |
| [`2026-08-26-notification-persistence-and-delivery.md`](./2026-08-26-notification-persistence-and-delivery.md) | 2026-08-26 | Notification ingest, the persisted record model, retention and pruning, manual-only resolution, and the desktop / ntfy / Web Push / app-badge delivery channels. | Not yet published | [`docs/notifications.md`](../notifications.md) |

## Naming and versioning

Files are named `YYYY-MM-DD-<topic>.md`. The date is the snapshot date and never changes,
even when the file is touched later.

A superseding snapshot is a **new file with a new date**. Existing snapshots are never
rewritten to reflect later implementation changes, because that would destroy the
historical record that justifies this directory. Corrections limited to typographical
errors and broken links are acceptable; changes that alter what the document claims the
system does are not.

Borrowing the architecture decision record (ADR) convention: a superseded snapshot gains a
short note at the top of the file pointing at its successor. It is not rewritten and it is
not deleted.

## How these documents are structured

Snapshots follow an Amazon-style engineering design-document skeleton. Future authors
should copy this section order verbatim:

1. Overview
2. Background
3. Problem Statement
4. Tenets
5. Goals
6. Scope (In Scope / Out of Scope)
7. Requirements (User and Technical, each requirement tagged P0, P1, or P2)
8. Assumptions and Dependencies
9. Proposed Design (each decision annotated as a one-way or two-way door)
10. Alternatives Considered (Pros, Cons, Rejected because, What would change our mind)
11. Security and Threat Model
12. Scaling, Performance and Cost
13. Testing and Verification
14. Metrics, Monitoring and Alarms
15. Operational Support (New Issues, Notify Partners, Tooling, Cleanup)
16. Risks and Mitigations
17. Rollout / How it shipped
18. Open Questions
19. Future Work
20. Decisions Made
21. Appendices
22. References

Three conventions are deliberate and should not be "corrected":

- The section is **Out of Scope**, not "Non-Goals", because that is the Amazon term.
- There is **no FAQ section**. A design-document FAQ buries the lede: the answers that
  matter belong in the design prose, and the ones that do not matter belong nowhere.
- There is **no standalone Trade-offs section**. A trade-off belongs in the design prose
  immediately next to the decision it qualifies, where the reader is already holding the
  context needed to judge it.

These snapshots describe systems that were already built, so the rollout section is
written in the past tense as "how it shipped", and the Decisions Made log carries the
record of every deviation between the design as proposed and the system as delivered.

## Diagrams

All diagrams are Mermaid inside fenced ` ```mermaid ` blocks. One source then renders in
three places:

- GitHub, which renders `mermaid` fences natively in Markdown.
- This repository's in-app documentation viewer, [`client/ds/mermaid-diagram.tsx`](../../client/ds/mermaid-diagram.tsx),
  which runs Mermaid at `securityLevel: "strict"` and then sanitizes the generated SVG
  before mounting it.
- Notion code blocks, which accept the same fenced source.

Mermaid is already the repository convention: [`docs/architecture.md`](../architecture.md),
[`docs/subagents.md`](../subagents.md), and [`docs/pr-previews.md`](../pr-previews.md) all
use it. No diagram is committed as an image, because an image cannot be reviewed in a
pull-request diff.

## Publishing to Notion

Notion is the presentation host; this repository is where the text is authored and
reviewed. Markdown lands in a pull request so the content can be reviewed line by line,
and Notion supplies a readable public URL that a person can open without a GitHub account.

### Publication cannot be automated

**A human must click Share -> "Publish to web" in the Notion user interface.** This is a
platform limitation, not an unfinished task, and it should not be re-investigated without
new evidence from Notion:

- The published Notion application programming interface has no share-to-web endpoint.
- `public_url` on the page object is **read-only**. It reports whether a page is published
  and at what address; it cannot set that state.
- The undocumented internal API has a revealing asymmetry:
  `POST /v1/pages/{page_id}/unshare_from_web` exists, but there is **no `share_to_web`
  counterpart**.
- The internal permissions endpoint accepts only user, group, teamspace, and workspace
  principals. There is no "anyone on the internet" principal to grant.

Revocation therefore *can* be automated, but only through an undocumented endpoint that
upstream disclaims and may remove without notice. Treat automated unpublishing as a
convenience, never as the mechanism a security decision depends on.

### Procedure

1. Create the Notion page programmatically from the Markdown, as a child of the designated
   parent page named below.
2. A human opens that page and clicks Share -> Publish to web.
3. Verify the resulting URL loads in a **signed-out or private browser window**. This is a
   required gate, not a suggestion: a URL that works only in the authoring session is not
   published, and a page whose contents were never checked while signed out may be sharing
   more than intended.
4. Record the public URL in the index table above, replacing `Not yet published`.
5. Only then add the entry to the in-app `/docs` section.

### Target location

The target is the personal workspace **`Leon's Notion`** (workspace id
`d79da190-8834-4ecb-948b-a389476cfaf3`), as a child page of **`Improve OpenCode / create a
new DCA`** (page id `353f7c3a-56a0-80e4-b692-df85117d8c5a`). That page is the only existing
page in that workspace already about this project, and this is a personal repository, so
grouping the snapshots under it keeps one project in one place. No page in either available
workspace has ever been published to the web, so the first snapshot published from here is
also the first public page in the workspace.

> **Check which workspace the tooling is pointed at before publishing.** The `ntn` command-line
> tool on this machine is authenticated to the *other* workspace, `Leon (Professional)`.
> Publishing project material from an employer-owned workspace is a disclosure decision and
> the wrong default. `ntn` reads `NOTION_API_TOKEN`; the personal workspace is reachable
> through a separate integration token. Name the workspace and the parent page id explicitly
> in any script or command so the destination is never inferred from ambient credentials.

Both available Notion integrations have **no workspace-root access**: every page they can
see is nested under a parent that was already shared with the integration. A new page must
therefore be created under an existing shared parent, or created by hand in the user
interface and then shared with the integration before the API can write to it.

## Why these are not in the in-app `/docs` catalogue

Issue #151 asks the `/docs` page to *link out* to public Notion snapshots with a visible
point-in-time label. It does not ask for more in-app documentation. Cataloguing these files
in [`client/lib/docs.ts`](../../client/lib/docs.ts) would create exactly the second set of
canonical documentation the issue rules out: a reader landing on a 2026-08-26 snapshot
inside the app would have no signal that `docs/architecture.md` had moved on.

Two mechanical consequences point the same way. A `client/lib/docs.ts` entry assumes
`sourcePath` is a repository path that is concatenated onto the GitHub blob URL, which a
Notion address is not. And [`tests/docs.test.ts`](../../tests/docs.test.ts) asserts that
`slug` and `sourcePath` are each globally unique, so every snapshot and every future
superseding snapshot of the same subsystem would need its own distinct pair.

The `/docs` "Time Snapshot design docs" section is follow-up work in issue #151. It is
blocked on the public Notion URLs existing, because a link-out section with nothing to link
to is worse than no section at all.
