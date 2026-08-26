---
title: A README diagram that was actually rendered
trigger: add a diagram to the README
caveat: >-
  The Mermaid source is trimmed to four nodes and the render succeeded first
  try. In practice syntax iteration is where the time goes, which is the
  argument for delegating it to the diagram subagent instead of the main
  context.
---

# Worked example

## user

add a diagram to the README showing how the ingest pipeline works

## assistant

README on GitHub, so **Mermaid** — it renders natively there and stays
diffable as text. ASCII would survive more surfaces but throws away the
rendering GitHub already gives us for free.

Reading the existing docs for house style before writing anything.

## tool — bash

```
$ rg -l 'mermaid' --glob '!node_modules' .
docs/architecture.md
$ rg -n 'graph |theme' docs/architecture.md | head -3
12:graph LR
```

## assistant

`docs/architecture.md:12` uses `graph LR` with no theme directive, so I will
match that rather than introduce a second convention.

## tool — mermaid · render_mermaid_ascii

```
render_mermaid_ascii(code="graph LR
  A[webhook] --> B[queue]
  B --> C[normaliser]
  C --> D[(warehouse)]
  C -.retry.-> B")

┌─────────┐   ┌───────┐   ┌────────────┐   ┌───────────┐
│ webhook │──►│ queue │──►│ normaliser │──►│ warehouse │
└─────────┘   └───────┘   └────────────┘   └───────────┘
                  ▲             │
                  └─── retry ───┘
```

## assistant

Parses, and the retry edge lands where it should. Written into `README.md`
under a new "How ingest works" heading, with the queue's retry ceiling stated
in prose underneath — the diagram shows that retries exist, not that they stop
after five attempts (`server/queue/worker.ts:31`).

## tool — bash

```
$ cmux markdown open /Users/you/Documents/Projects/app/README.md --focus false
opened
```

## assistant

Rendered and checked in the preview panel: the fence renders as a diagram, not
as a wall of source, and the four nodes are in the order the pipeline runs.

## note

The render call is the whole point of this transcript. The failure this skill
exists to prevent is hand-writing a Mermaid block into a file and declaring it
done — the block is never rendered, and nobody finds out it does not parse
until a reader opens the page. "It should render" is not verification.

Two cheaper decisions happen before that. The medium is chosen from **where the
reader opens it**, not from which is prettier: a README on GitHub gets Mermaid,
a commit message or an `AGENTS.md` would get ASCII because no renderer exists
there at all. And the house style is read from an existing doc first, because
one convention in a repo beats two.

Note what the diagram deliberately does not carry. The retry ceiling is prose,
with a `file:line`, because a number inside a diagram rots silently while a
cited one stays checkable.

Rendering to ASCII rather than SVG was a verification step, not the artifact —
the file gets the Mermaid fence. Had this been a TechDocs page instead, the
fence could not be assumed to render at all: TechDocs is MkDocs underneath and
Mermaid support depends on the site's plugin chain, so it has to be tried and
looked at before being relied on.
