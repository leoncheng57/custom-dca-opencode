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

When unsure, choose ASCII because it remains readable without a renderer. Never
maintain ASCII and Mermaid copies of the same diagram. For rendered SVG, pass an
explicit output directory and use a light theme for documents normally read on
a light page. A Markdown preview validates structure but may show Mermaid as a
code block; build the actual docs site to prove its plugin chain renders it.

Check the current agent and MCP roster instead of assuming machine-local tools
are connected. A table beats a diagram for two-axis comparison, and a numbered
list beats one for a branchless sequence.

| Failure | Response |
|---|---|
| Mermaid is visible as source | Use ASCII or a rendered SVG |
| SVG lands outside the documentation tree | Render again with an explicit output directory |
| New page does not appear in site navigation | Follow the site's navigation configuration and nearest page |
| Preview looks right but the build is red | Report failure; rendered appearance is not build verification |
| Tool named in the procedure is unavailable | State the limitation and use a verifiable fallback |
