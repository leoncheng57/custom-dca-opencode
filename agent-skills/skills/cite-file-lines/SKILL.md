---
name: cite-file-lines
description: Cite code with an exact repository-relative file path and line number so a reader can open the evidence directly. Covers choosing stable, load-bearing references, distinguishing verified facts from inference, and avoiding guessed locations. Use when explaining a codebase, reviewing a change, or reporting a diagnosis, or when the user says "cite the lines", "point me to the exact code", or "where exactly is that in the codebase".
metadata:
  tags: verification
---

# Cite file lines

When you make a claim about a function, class, configuration key, route, test,
or behavior, attach the smallest useful reference in the form
`path/to/file.ts:42`. A reader should be able to jump from the claim to the
evidence without searching for a paraphrased name.

## Choose evidence before prose

Read the source that proves the statement before describing it. Prefer the
definition, branch, request boundary, assertion, or call site that carries the
behavior over a nearby comment or filename that only suggests it.

Use one precise citation when it supports the whole claim. Add another only
when the behavior crosses a boundary, such as a client request and its server
handler, or a feature implementation and the test that proves it.

## Keep the citation useful

- Use repository-relative paths unless the absolute path is essential to the
  operational instruction.
- Cite the line where the relevant statement begins. For a short range, name
  the first line in prose and link a range when the surface supports it.
- Quote exact identifiers, not invented descriptions of them.
- Put the citation immediately after the claim it supports, not in a detached
  bibliography.
- Separate facts you read or ran from conclusions you inferred. Say when a
  behavior was not verified.

## Review and diagnosis

For a review finding, cite the changed line that causes the risk and the line
that establishes the surrounding contract when they differ. For a diagnosis,
cite the failure path and the condition that makes it reachable. A line number
is evidence, not an explanation: state why that code produces the outcome.

Do not manufacture a citation from a remembered path, a search-result snippet,
or a convention. If the exact location is unknown, search for it or say that
the claim remains unverified.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| A reader cannot locate the named code | Citation is a directory, symbol-only reference, or vague prose | Give `path:line` for the definition or behavior branch |
| The citation does not prove the claim | It points to a comment or caller rather than the behavior | Read through the implementation and cite the load-bearing line |
| A review sounds certain but lacks evidence | Location was inferred from naming or convention | Label the inference or verify it before reporting |
| A long list of references obscures the argument | Every adjacent line was cited | Keep only the smallest references that establish the point |
| A link will drift during review | It names a moving branch | Pin external code-review links to the reviewed commit SHA |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
a request to cite the lines behind a behavior, answered with a verified
`path:line` reference instead of a paraphrase.

Instead of writing “the API rejects unknown reminder IDs,” write: “The route
validates the requested ID against the server-owned catalogue before resolving
the body (`server/routes/sessions.ts:...`).” The sentence names both the
behavior and the evidence; replace the ellipsis with the verified line before
publishing it.
