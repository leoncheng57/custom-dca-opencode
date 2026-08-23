---
title: A README diagram rendered before it ships
trigger: /docs-preview
caveat: >-
  The Mermaid source is shortened and parses first try. Real documentation work
  usually spends more time matching house style and iterating on render errors.
---

# Worked example

## user

/docs-preview add an ingest pipeline diagram to the README

## assistant

The reader opens this on GitHub, so Mermaid is the right medium: native render,
diffable source. `docs/architecture.md` already uses `graph LR` with no theme
directive, so I will match it.

## tool — mermaid renderer

```
graph LR
  webhook --> queue --> normaliser --> warehouse
  normaliser -. retry .-> queue

render: success
```

## tool — cmux markdown

```
opened README.md in live preview
```

## assistant

Rendered and checked: four nodes run left-to-right, the retry edge returns to
the queue, and the fence is a diagram rather than source text. The five-attempt
retry ceiling remains cited prose below it (`server/queue/worker.ts:31`) because
a number inside an image rots silently.

## note

The renderer and preview are the guard. Hand-writing Mermaid and saying "it
should render" is precisely the failure the command exists to prevent.

If this were TechDocs, the command would first prove the site's MkDocs plugin
supports Mermaid instead of assuming GitHub behavior carries over.
