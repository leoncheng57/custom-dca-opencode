---
description: Choose the right documentation medium, render it, and preview it
agent: build
---

Document or render `$ARGUMENTS`.

Choose the medium from where the reader opens it:

- terminal, PR diff, commit message, AGENTS.md, code comment -> ASCII
- GitHub/GitLab README or wiki -> Mermaid
- slide, issue attachment, external document -> rendered SVG
- a static docs site -> Mermaid only after proving that site renders it;
  otherwise ASCII or a checked-in SVG

Then:

1. Read one existing document from the same repository or docs site and
   match its house style before writing.
2. Use tables for comparisons, lists for linear sequences, diagrams for
   topology, and prose only for the reasoning that connects them.
3. Cite the code as `file:line`, and call out the limitation or trap a reader
   cannot infer from the source.
4. Use the available renderer or `diagram` subagent rather than hand-writing a
   Mermaid block and hoping it parses. Pass an explicit output directory for
   SVG artifacts.
5. Preview the finished document: `cmux markdown open` for Markdown, or build
   or serve the docs site locally with its own generator. Inspect the rendered
   output and build logs before claiming completion.

If a named renderer or MCP server is unavailable in this session, say so and
offer the medium that can actually be verified. "It should render" is not
verification.

For the installed tool inventory, rendering tradeoffs, and docs-site caveats,
load the `docs-and-diagram-tooling` skill.
