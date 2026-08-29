---
name: docs-and-diagram-tooling
title: Choose Documentation Visuals
description: Choose prose, lists, tables, ASCII, Mermaid, or rendered images based on structure and where readers will view the document.
tags: diagrams, docs
source_repo: https://github.com/leoncheng57/agent-skills
source_path: skills/docs-and-diagram-tooling/SKILL.md
source_commit: 8b036a41f578dc6c6307ae0a8dd2857121afcabb
---

Choose the documentation medium from both the information shape and the reader's surface.

- Use prose for reasoning, numbered lists for linear procedures, and tables for comparisons.
- Use ASCII for terminals, comments, prompts, and review surfaces where rendering is uncertain.
- Use Mermaid only where the target renders it; use SVG or another fixed image for external documents and slides.
- Do not maintain duplicate versions of one diagram.

Read a nearby document to match house style. Cite the code or source being described, state important limitations, and preview or render the result with available tooling before claiming it works.
