---
name: docs-and-diagram-tooling
description: Choose the right visual medium when writing documentation and use the diagram and preview tooling actually installed on this machine, instead of hand-writing Mermaid into a file nobody renders. Covers when a diagram beats prose, a table or a list; picking ASCII vs Mermaid vs rendered SVG based on where the doc will be read (terminal, PR description, GitHub, Backstage TechDocs); the mermaid MCP render tools and the diagram subagent; cmux markdown live preview; and deepctl techdocs serve for Backstage TechDocs. Use when asked to "write docs", "document this", "add a diagram to the README", "make an architecture doc", "render this diagram", or "how do I preview these docs".
metadata:
  tags: "diagrams, docs"
---

# Docs and diagram tooling on this machine

Most of the value here is inventory. A fresh agent hand-writes a Mermaid block
into a markdown file and never renders it, because it has no way to know a
render pipeline and a live preview are already installed.

For *how to draw* an ASCII diagram — the conventions, the character set, the
annotation rules — see the **`ascii-diagrams`** skill. This skill is about
which medium to pick and which tool to reach for. Do not restate those rules;
load that skill instead.

---

## Pick the medium from where it will be read

The controlling question is not "which is prettier", it is **"in what surface
does the reader open this?"**

| Reader opens it in | Medium | Because |
|---|---|---|
| A terminal (`cat`, `less`, agent transcript, CLI help) | **ASCII** | Mermaid is an unrendered wall of source here |
| A PR description or code review comment | **ASCII** | GitHub renders Mermaid in markdown, but reviewers read diffs and emails in monospace; ASCII survives both |
| A commit message, `AGENTS.md`, a code comment | **ASCII** | No renderer exists at all |
| A GitHub/GitLab README or wiki | **Mermaid** | Renders natively; stays diffable as text |
| Backstage TechDocs | **Mermaid**, if the site supports it | Keeps docs-as-code — but verify first, see below |
| A slide, an issue attachment, an external doc | **SVG** | Fixed layout, scales, no renderer dependency |

Rules of thumb that follow from that table:

- **When unsure, ASCII.** It degrades to readable everywhere; Mermaid degrades
  to noise.
- **Never both** for the same diagram. Two copies drift, and the stale one is
  the one the reader trusts.
- **Hand-write ASCII rather than generating it.** `render_mermaid_ascii` output
  is correct but sparse and wide, and it cannot carry the `←` trap annotations
  and status columns that make a diagram worth reading. Generate ASCII only for
  a throwaway sanity check of graph structure.

And before reaching for any diagram: a **table** beats a diagram for two axes
of comparison, and a **numbered list** beats a diagram for a linear sequence.
Diagrams are for topology, branching, and spatial grouping.

---

## What is installed here

Verified on this machine. Re-check with `opencode agent list` and the MCP
server list in `~/.config/opencode/opencode.json` before relying on any of it
elsewhere.

### `diagram` subagent

Defined at `~/.config/opencode/agents/diagram.md`, `mode: subagent`, with
`edit: deny` and `bash: deny`.

> Generates beautiful Mermaid diagrams as SVG files or ASCII art using the
> mermaid MCP tools

Delegate to it with the task tool (`subagent_type: "diagram"`) when you want a
rendered artifact and do not want to spend main-context tokens on Mermaid
syntax iteration. Because it cannot edit files, it hands you back a path or the
ASCII — you do the writing.

### `mermaid` MCP server

`~/Documents/Projects/beautiful-mermaid-custom-mcp`, three tools:

| Tool | Args | Returns |
|---|---|---|
| `render_mermaid_svg` | `code`, `theme`, `outputDir` | Path to a written SVG |
| `render_mermaid_ascii` | `code`, `useAscii` | Unicode (or pure-ASCII) art inline |
| `list_themes` | — | 15 themes |

Default output dir is `MERMAID_OUTPUT_DIR`
(`~/Documents/Projects/dynamic-workflows/mermaid-output`) — pass `outputDir`
explicitly to land the SVG next to the doc that references it. Themes include
`zinc-dark` (good default for dark terminals), `zinc-light`, `github-light`,
`tokyo-night`, `catppuccin-mocha`, `nord`. Pick a light theme for anything
embedded in a README, where the page background is usually white.

Diagram types the renderer supports: `graph TD/LR`, `sequenceDiagram`,
`stateDiagram-v2`, `classDiagram`, `erDiagram`, `xychart-beta`.

### `cmux markdown` — live preview

The `cmux-markdown` skill covers this properly; load it for the details. The
one-liner:

```bash
cmux markdown open /abs/path/to/DOC.md --focus false
```

Opens a rendering panel that live-reloads on every write, so you can iterate on
a doc and watch it render. `cmux open <path-or-url>` also works for markdown
and URLs. Always pass `--focus false` unless the user asked to be taken there.

This is the fastest way to check that tables, nesting and fenced blocks came
out right — but note it renders **markdown**, so a Mermaid block shows as a
code block, not a diagram. It verifies structure, not Mermaid output.

### Backstage TechDocs

Two independent paths:

```bash
deepctl techdocs serve                  # local preview, --mode backstage (default) or mkdocs
deepctl techdocs serve --mode mkdocs    # faster, closer to raw mkdocs
```

The `deepctl-mcp` server exposes the same thing as tools — `techdocs_serve`
(returns a task), plus `techdocs_logs` / `techdocs_logs_read` for build errors
and `techdocs_stop`. Use the logs tools when the preview comes up blank; the
mkdocs build failure will be in there rather than in the browser.

**Mermaid in TechDocs is not guaranteed.** TechDocs is MkDocs underneath, so a
`mermaid` fence renders only if the site's plugin chain includes Mermaid
support. DeepL sites use a single `deepl-techdocs-core` plugin in `mkdocs.yml`
whose contents are opaque from the repo. Do not assume: put one small Mermaid
block in a page, run `deepctl techdocs serve`, and look. If it renders as a
code block, use ASCII, or render an SVG and reference it as an image.

For docs that already exist in the catalog, the `backstage` MCP server reads
them without a local build: `techdocs_list_pages` then `techdocs_get_content`
for an `entityRef` like `component:default/my-service`. Use that to check house
style and cross-link targets before writing a new page — cheaper and more
accurate than guessing at conventions.

The Backstage catalog tools (`catalog_list_entities`, `catalog_get_entity`,
`catalog_get_related_entities`) are the authoritative source for ownership,
system membership and dependencies. Read those rather than inferring an
architecture diagram from imports.

### Also present, situationally

- **`excalidraw` MCP** (`~/Documents/Projects/excalidraw-mcp`) — hand-drawn
  style diagrams; for design docs where the diagram is illustrative rather than
  normative.
- **`figma` MCP** — `get_figma_data` / `download_figma_images`. When a design
  already exists, pull the real frame instead of mocking up a UI diagram.
- **`chrome-devtools` MCP** — `take_screenshot` (`fullPage`) for documenting
  actual rendered UI. A screenshot beats a mockup once the thing exists.

Several of these are enabled in config but may not be connected in a given
session. Check your available tools before promising output from one.

---

## Writing the doc

1. **Find the house style first.** An existing doc in the same repo or TechDocs
   site is worth more than any generic template. Read one before writing.
2. **Structure before prose.** Tables for comparisons, lists for sequences,
   diagrams for topology, prose only for the reasoning that connects them.
3. **Cite `file:line`.** A doc that names the code it describes stays checkable
   as the code moves; one that paraphrases silently rots.
4. **Say what is *not* true.** The limitation, the trap, the thing that looks
   like it should work — that is what a reader cannot get from the source.
5. **Preview before claiming it is done.** `cmux markdown open` for markdown,
   `deepctl techdocs serve` for TechDocs. "It should render" is not verification.

## Related skills

| Need | Skill |
|---|---|
| ASCII diagram conventions, characters, annotation rules | `ascii-diagrams` |
| Trace an execution path through real code and draw it | `code-flowchart` |
| Generate a full multi-file learning guide for a repo | `repo-learning-guide` |
| Live markdown preview details and routing | `cmux-markdown` |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
a README diagram with the medium chosen from where it will be read, the house
style matched, and the block actually rendered before being called done.
