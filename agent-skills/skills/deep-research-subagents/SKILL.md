---
name: deep-research-subagents
description: Escalate one large research question to parallel read-only subagents instead of grinding through it inline, then synthesise the reports into a single answer. Covers the signals that justify delegation (breadth across many files, repos or docs; several independent unknowns; a search that would blow the main context), how to split a question into non-overlapping axes, how to write a subagent prompt that returns something usable (explicit deliverable, cite-your-sources, read-only constraint, flag-what-you-could-not-verify), fan-out limits, and how to synthesise rather than concatenate. Use when asked to "research this properly", "go deep on", "do a thorough investigation", "use subagents", "spend more effort on this", or when a question needs 20+ tool calls across unrelated areas.
metadata:
  tags: "subagents, research"
---

# Deep research with parallel subagents

One big question, split across several read-only agents, recombined into one
answer. The gain is **context compression**: each subagent burns its own window
on greps and reads and hands you back a page. You hold N pages instead of N
exploration transcripts.

Not to be confused with `parallel-research-handoff`, which researches N
*independent features* and turns each into a handoff prompt for a fresh
implementation session. This skill is one question, investigated deeply, and
the deliverable is an answer — not a prompt.

---

## Escalate or not

Delegate when **two or more** of these hold:

- The question spans areas that do not share files — frontend and infra and a
  vendor API, not three functions in one module.
- There are several **independent unknowns**: answering one does not change how
  you would ask the next.
- A thorough pass would read 20+ files, and you only need a paragraph from each.
- External sources (docs, changelogs, a live API) are in scope alongside code.
- The output you need is a comparison, and each option can be costed separately.

Do **not** delegate when:

- It is a needle lookup. One `grep` beats a subagent's startup cost every time.
- Answers are **sequential** — question 2's shape depends on question 1's
  answer. Do that pass yourself, then fan out on what it opens up.
- The work mutates state. Subagents that write race each other.
- You need to iterate with the user mid-investigation.

## What is actually available here

Verified against `opencode 1.18.19` (`opencode agent list`, and the task tool's
schema in the binary). Do not assume a roster from another machine.

| `subagent_type` | Use it for | Constraint |
|---|---|---|
| `explore` | Codebase search: find files by pattern, grep keywords, "how does X work?" | **Enforced read-only** — only grep, glob, read, webfetch, websearch are permitted. Cannot write even if told to. |
| `general` | Multi-step research and work that needs bash or edits | Full permissions. `todowrite` denied. Say "read-only" explicitly if you mean it. |
| `diagram` | Rendering a Mermaid diagram to SVG or ASCII | `edit` and `bash` denied; uses the mermaid MCP |

`explore` takes a **thoroughness level** in the prompt — `"quick"`, `"medium"`,
or `"very thorough"`. Say which. For this skill it is almost always
`"very thorough"`; that is the whole point of escalating.

Two limits that bite:

- **`subagent_depth` defaults to `1`.** Your subagents cannot spawn their own
  subagents. Plan a flat fan-out, not a tree.
- Subagents get `task` and `todowrite` denied unless their own agent config
  grants them. Do not ask a subagent to delegate.

## Split into non-overlapping axes

Overlap is the main way fan-out wastes effort: three agents grep the same
directory and return the same three findings, and you pay for all of it.

Split by **artifact type**, not by "part of the question":

- one agent per repo or per top-level package
- code / tests / docs+changelogs / live API as separate agents
- one agent for "how does the nearest existing analogue work" (usually the
  highest-value single task)
- one agent for "what does NOT exist yet" — negative findings are as expensive
  to establish as positive ones and are what implementers most often get wrong

Name the boundary in each prompt: *"Another agent is covering the server side;
restrict yourself to `client/` and do not read `server/`."* Without that they
converge on whatever grep hits first.

**Fan-out limit: 3–5.** Below 3, do it yourself. Above 5 the synthesis step
costs more than the search you saved, and the overlap rate climbs. Launch them
in a **single message with multiple tool calls** so they run concurrently —
sequential calls give you none of the wall-clock benefit.

## The prompt

A subagent starts with **zero conversation context**. It cannot see the user's
request, your earlier findings, or the repo you are standing in. Everything it
needs goes in the prompt.

Five things, every time:

1. **Read-only, stated at the top and again at the bottom.** Stated once, in
   the middle, a capable agent starts implementing. (Unnecessary for `explore`,
   which enforces it — but required for `general`.)
2. **A numbered list of specific questions**, not a topic. "Research the auth
   system" returns an essay. "1. Which module issues the session cookie, and at
   which line? 2. What is its expiry, and where is that configured? …" returns
   facts.
3. **`file:line` for every claim, and verbatim API shapes.** Prose summaries
   decay into hallucination the moment they cross a context boundary;
   `setup.ts:2018` does not. If a server is reachable, tell it to GET
   `/openapi.json` and paste the schema rather than describe it.
4. **The deliverable, spelled out.** "Return a markdown section per numbered
   question, each with a one-line answer followed by the evidence. Under 800
   words." Unspecified format means you do the reformatting.
5. **"Flag what you could not verify rather than guessing.** End with an
   `UNVERIFIED:` list of anything you inferred, could not find, or read only
   indirectly." This single line is the difference between a report you can
   trust and one you have to re-check. Ask for it explicitly — the default
   behaviour is to smooth over gaps.

Skeleton:

```
READ-ONLY RESEARCH. Do not write or edit any files.

Context: <repo path, what the overall question is, what other agents cover>
Scope: <the directories/files/URLs you own; the ones you must NOT read>

Answer these, in order:
1. ...
2. ...
3. What does NOT exist yet in this area?

For every claim give file:line, or the URL and the verbatim response shape.
Deliverable: one markdown section per question, answer first then evidence,
under 800 words total.
End with `UNVERIFIED:` listing anything you inferred or could not confirm.

READ-ONLY. Do not write or edit any files.
```

## Synthesise, do not concatenate

Pasting four reports under four headings is not an answer, and it hands the
reader the work you were delegated. Do this instead:

1. **Lead with the answer** to the original question, in a few sentences.
2. **Reconcile conflicts explicitly.** Two agents disagreeing is a finding, not
   a formatting problem. Go read the cited lines yourself and say which is
   right and why the other looked true.
3. **Merge the `UNVERIFIED:` lists into one** and put it where the reader will
   see it. Anything on it that changes the decision, go verify now.
4. **Keep the `file:line` citations** in the merged output. They are the reason
   the reader can act on it without redoing the search.
5. **Say what surprised you.** The negative findings and the trap nobody asked
   about are usually the highest-value output of the whole exercise.
6. **Spot-check one load-bearing claim per report.** Cheap, and it catches the
   confidently-wrong report before it becomes your confidently-wrong answer.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Reports repeat each other | Axes overlapped | Split by artifact/directory, name the exclusions in each prompt |
| Report is an essay with no citations | Asked for a topic, not questions | Numbered questions + "file:line for every claim" |
| A claim turns out to be invented | No `UNVERIFIED:` contract | Demand the list; spot-check one claim per report |
| `general` subagent edited files | Read-only stated once, mid-prompt | Top and bottom, or use `explore` |
| Subagent tried to delegate | Assumed nesting works | `subagent_depth` is 1 — flat fan-out only |
| No wall-clock saving | Launched sequentially | One message, multiple tool calls |
| Synthesis longer than the reports | Concatenated | Answer first, reconcile conflicts, cite, cut |
| Shallow answers from `explore` | Thoroughness not specified | Say `"very thorough"` in the prompt |

## Worked example

`SIMULATION.md` in this directory has a short transcript of this skill firing:
four concurrent read-only agents on non-overlapping axes, and a synthesis that
reconciles two reports that disagreed.
