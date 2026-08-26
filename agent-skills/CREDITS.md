# Credits

One skill in this repository is adapted from another open-source project.
The original author retains copyright; their licence terms are reproduced below.

---

## mattpocock/skills

- **Upstream:** <https://github.com/mattpocock/skills>
- **Licence:** MIT (verified via the GitHub API — `license.spdx_id == "MIT"`)
- **Adapted from commit:** `0ab1b63a410a03d3627979a109c8695de27af954` (branch `main`)
- **Copyright:** © 2026 Matt Pocock

### Adapted, not vendored

No file in this repository is a copy of upstream. The one skill that derives
from it is an original rewrite:

[`skills/grill-me/SKILL.md`](skills/grill-me/SKILL.md) adopts the
rounds-and-frontier model from upstream `skills/productivity/grilling/SKILL.md`
@ `0ab1b63`, including its round output format. It differs deliberately:

- Upstream ships a `grill-me` → `grilling` wrapper pair, where `grill-me` sets
  `disable-model-invocation: true`. OpenCode ignores that key, so the split
  would produce two always-loaded descriptions for one behaviour. This repo
  ships **one** model-invoked skill named `grill-me`.
- A closing step offering to emit the outcome as a handoff document or an ADR is
  added; upstream has no equivalent.

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
