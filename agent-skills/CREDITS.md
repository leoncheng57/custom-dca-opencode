# Credits

One command in this repository was adapted from another open-source project.
That command has since been retired along with the rest of this directory, but
the attribution stays: the derived work remains in this repository's history,
and a credit is not something a deletion cancels. The original author retains
copyright; their licence terms are reproduced below.

---

## mattpocock/skills

- **Upstream:** <https://github.com/mattpocock/skills>
- **Licence:** MIT (verified via the GitHub API — `license.spdx_id == "MIT"`)
- **Adapted from commit:** `0ab1b63a410a03d3627979a109c8695de27af954` (branch `main`)
- **Copyright:** © 2026 Matt Pocock

### Adapted, not vendored

No file in this repository was ever a copy of upstream. The command that
derived from it was an original rewrite:

`agent-skills/commands/grill-me.md`, retired in the change that emptied this
directory and readable in history at commit
`fe9e5ede5f3dc749b0515372ee2e2bc2fc3b3fba`, adopted the rounds-and-frontier
model from upstream `skills/productivity/grilling/SKILL.md` @ `0ab1b63`,
including its round output format. It differed deliberately:

- Upstream ships a `grill-me` → `grilling` skill pair. This repository adapts
  the behavior into one explicitly invoked `/grill-me` command with no
  retrieval description resident in agent context.
- A closing step offering to emit the outcome as a handoff document or an ADR is
  added; upstream has no equivalent.

The `grill-me` runtime reminder under `../reminders/` is a separate lineage with
its own recorded provenance, not a relocation of this adapted command. This
credit does not transfer to it.

### MIT Licence

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
