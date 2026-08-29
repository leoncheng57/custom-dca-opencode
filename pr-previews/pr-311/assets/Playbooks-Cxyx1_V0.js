import{c as W,b as B,r as f,d as Z,D as J,e as ee,j as s,A as ne,S as te,L as D}from"./index-BqD9eUNS.js";/**
 * @license lucide-react v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],se=W("sparkles",ae);/**
 * @license lucide-react v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=[["path",{d:"m7 11 2-2-2-2",key:"1lz0vl"}],["path",{d:"M11 13h4",key:"1p7l4v"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}]],ie=W("square-terminal",oe),re=/^([|>])([+-]?)(\d*)([+-]?)$/,L=/^(\s*)([A-Za-z0-9_.-]+)\s*:\s?(.*)$/,q=/^(\s*)-\s+(.*)$/;function x(e){return e.length-e.trimStart().length}function E(e,n){if(e.length<2||!e.startsWith(n)||!e.endsWith(n))return!1;const t=e.slice(1,-1);if(n==="'"){for(let a=0;a<t.length;a+=1)if(t[a]==="'"){if(t[a+1]==="'"){a+=1;continue}return!1}return!0}for(let a=0;a<t.length;a+=1){if(t[a]==="\\"){a+=1;continue}if(t[a]==='"')return!1}return!0}function G(e){return E(e,'"')?e.slice(1,-1).replace(/\\(["\\])/g,"$1"):E(e,"'")?e.slice(1,-1).replace(/''/g,"'"):e}function H(e){if(e.startsWith('"')||e.startsWith("'"))return e;const n=e.search(/(^|\s)#/);return n===-1?e:e.slice(0,n)}function M(e){const n=H(e.trim()).trim();return G(n)}function le(e){const n=H(e.trim()).trim();if(E(n,'"')||E(n,"'"))return G(n);if(n==="true")return!0;if(n==="false")return!1;if(n!==""){const t=Number(n);if(!Number.isNaN(t))return t}return n}function de(e){let n="",t=0;for(const a of e){if(a===""){t+=1;continue}n===""?n=a:(n+=t>0?`
`.repeat(t):" ",n+=a),t=0}return n}function he(e,n,t){return t==="strip"?e:t==="keep"?e+`
`.repeat(n+1):e===""?"":`${e}
`}function ce(e,n,t,a,i){const d=[];let r=n;for(;r+1<e.length;){const m=e[r+1];if(m.trim()===""){d.push(""),r+=1;continue}if(x(m)<=t)break;d.push(m),r+=1}let c=d.length-1;for(;c>=0&&d[c]==="";)c-=1;const h=d.length-1-c,u=d.slice(0,c+1),p=u.reduce((m,l)=>l===""?m:Math.min(m,x(l)),Number.MAX_SAFE_INTEGER),w=u.map(m=>m===""?"":m.slice(Math.min(p,x(m)))),y=a==="|"?w.join(`
`):de(w);return{value:he(y,h,i),endIndex:r}}function ue(e){const n=e[2]||e[4];return n==="-"?"strip":n==="+"?"keep":"clip"}function pe(e,n){for(let t=n+1;t<e.length;t+=1){const a=e[t];if(!(a.trim()===""||a.trimStart().startsWith("#")))return a}}function me(e){return e.replace(/^\uFEFF/,"").replace(/\r\n?/g,`
`)}function P(e){const n=me(e);if(!/^---[ \t]*(\n|$)/.test(n))return{data:{},content:n};const t=n.split(`
`);let a=-1;for(let u=1;u<t.length;u+=1){const p=t[u];if(p==="---"||p==="..."||/^(---|\.\.\.)[ \t]+$/.test(p)){a=u;break}}if(a===-1)return{data:{},content:n};const i=t.slice(1,a),d=t.slice(a+1).join(`
`),r={};let c=null,h=null;for(let u=0;u<i.length;u+=1){const p=i[u];if(p.trim()===""||p.trimStart().startsWith("#"))continue;const w=p.match(q);if(w&&c){const g=r[c];Array.isArray(g)&&g.push(M(w[2]));continue}const y=p.match(L);if(!y){c=null,h=null;continue}const[,m,l,k]=y,v=m.length>0;if(v&&!h)continue;v||(h=null,c=null);const j=k.trim(),S=j.match(re);if(S){const{value:g,endIndex:Q}=ce(i,u,m.length,S[1],ue(S));u=Q,v&&h?r[h][l]=g:r[l]=g;continue}if(j===""){const g=pe(i,u);if(g&&q.test(g)&&x(g)>=m.length){r[l]=[],c=l,h=null;continue}if(g&&x(g)>m.length&&L.test(g)){r[l]={},h=l,c=null;continue}v&&h?r[h][l]="":r[l]="";continue}if(v&&h){r[h][l]=M(k);continue}r[l]=le(k),c=null}return{data:r,content:d}}function V(e){return e.replace(/^\s*#\s+.+?(\n+|$)/,"")}const ge=/\$ARGUMENTS\b|\$[1-9]\b/,fe=/!`[^`]+`/,we=/`([a-z0-9]+(?:-[a-z0-9]+)*)`/g;function be(e,n){const t=e.replace(/!`[^`]+`/g," "),a=[];for(const i of t.matchAll(we)){const d=i[1];n.has(d)&&!a.includes(d)&&a.push(d)}return a}function K(e){const n=e.split("/").filter(Boolean).pop()??"";return n.endsWith(".md")?n.slice(0,-3):""}function ye(e,n){return n?`/${e} <arguments>`:`/${e}`}function ke(e,n,t={}){const a=K(e);if(!a)return null;const{data:i,content:d}=P(n),r=d.trim(),c=(i.description??"").trim();if(r==="")return null;const h=be(r,t.skillNames??new Set);return{name:a,description:c,agent:i.agent,model:i.model,subtask:i.subtask===!0,body:r,takesArguments:ge.test(r),runsShell:fe.test(r),relatedSkills:h,...t.simulation?{simulation:t.simulation}:{},bytes:typeof TextEncoder>"u"?n.length:new TextEncoder().encode(n).length}}function ve(e,n={}){return Object.entries(e).map(([t,a])=>{var i;return ke(t,a,{skillNames:n.skillNames,simulation:(i=n.simulations)==null?void 0:i.get(K(t))})}).filter(t=>t!==null).sort((t,a)=>t.name.localeCompare(a.name))}function xe(e,n){const t=n.trim().toLowerCase();return t===""?e:e.filter(a=>[a.name,a.description,a.body,a.relatedSkills.join(" ")].join(" ").toLowerCase().includes(t))}const _e="leoncheng57",z="custom-dca-opencode",_=`${_e}/${z}`,N=`https://github.com/${_}`,b="agent-skills",A="main",Te=`${z}-${A}`;function Va(e){const n=`https://raw.githubusercontent.com/${_}/${A}/${b}/commands/${e}.md`;return[{id:"curl-global",label:"curl",scope:"global",note:"Recommended. Available in every project you open with OpenCode.",command:["mkdir -p ~/.config/opencode/commands && \\",`curl -sL ${n} \\`,`  -o ~/.config/opencode/commands/${e}.md`].join(`
`)},{id:"curl-project",label:"curl into a project",scope:"project",note:"Commits with the repo, so the command travels with the codebase and loads only there.",command:["# from the root of your project","mkdir -p .opencode/commands && \\",`curl -sL ${n} \\`,`  -o .opencode/commands/${e}.md`].join(`
`)},{id:"symlink",label:"clone + symlink",scope:"global",note:"Stays updatable: git pull in the clone refreshes the live command.",command:[`git clone ${N}.git ~/src/custom-dca-opencode   # once`,"mkdir -p ~/.config/opencode/commands",`ln -s ~/src/custom-dca-opencode/${b}/commands/${e}.md \\`,`      ~/.config/opencode/commands/${e}.md`].join(`
`)}]}const Ie=[{path:"~/.config/opencode/commands/<name>.md",scope:"Global",readBy:"OpenCode",note:"Every project. Start here."},{path:".opencode/commands/<name>.md",scope:"Project",readBy:"OpenCode",note:"Committed with the repo; loads only inside it."},{path:".claude/commands/<name>.md",scope:"Project",readBy:"Claude Code",note:"Different frontmatter dialect (argument-hint, allowed-tools). Not shipped here."}];function Ka(e){return[{id:"skills-cli",label:"skills CLI",scope:"global",note:"Recommended. Resolves the repo’s skills/ directory for you; -g installs globally.",command:`npx skills add ${N}/tree/${A}/${b} --skill ${e} -g`},{id:"degit",label:"degit",scope:"global",note:"Copies one directory with no git history attached.",command:`npx degit ${_}/${b}/skills/${e} ~/.agents/skills/${e}`},{id:"curl",label:"curl + tar",scope:"global",note:"No Node required. Extracts a single directory out of the tarball.",command:["mkdir -p ~/.agents/skills && \\",`curl -sL https://codeload.github.com/${_}/tar.gz/refs/heads/${A} \\`,"  | tar -xz -C ~/.agents/skills --strip-components=3 \\",`      ${Te}/${b}/skills/${e}`].join(`
`)},{id:"sparse-symlink",label:"sparse clone + symlink",scope:"global",note:"Stays updatable: git pull in ~/src/custom-dca-opencode refreshes the live skill.",command:[`git clone --filter=blob:none --sparse ${N}.git ~/src/custom-dca-opencode`,`cd ~/src/custom-dca-opencode && git sparse-checkout set ${b}/skills/${e}`,`ln -s ~/src/custom-dca-opencode/${b}/skills/${e} ~/.agents/skills/${e}`].join(`
`)},{id:"project-local",label:"project-local",scope:"project",note:"Commits with the repo, so the skill travels with the codebase and loads only there.",command:["# from the root of your project",`npx degit ${_}/${b}/skills/${e} .agents/skills/${e}`].join(`
`)}]}const Ee=[{path:"~/.agents/skills/<skill>/",scope:"Global",readBy:"OpenCode, Cursor, Codex, Copilot, Gemini CLI, Amp, Roo, Zed",note:"Highest reach — install here unless you have a reason not to."},{path:"~/.claude/skills/<skill>/",scope:"Global",readBy:"Claude Code",note:"The Claude Code variant of the same layout."},{path:".agents/skills/<skill>/",scope:"Project",readBy:"OpenCode, Cursor, Codex, Copilot, Gemini CLI, Amp, Roo, Zed",note:"Highest reach at project scope — commit it and every collaborator gets the skill."},{path:".opencode/skills/<skill>/",scope:"Project",readBy:"OpenCode",note:"Committed with the repo, so the skill only loads inside that project."},{path:".claude/skills/<skill>/",scope:"Project",readBy:"Claude Code",note:"Project-scoped equivalent for Claude Code."}],Ae=220,Re=new Set(["e.g","i.e","etc","vs","cf","approx","al","mr","ms","dr","no"]),Se=240;function O(e){const n=e.split("/").filter(Boolean);return n[n.length-2]??""}function Ce(e){return e.split(/[-_]+/).filter(Boolean).map(n=>/[A-Z]/.test(n)?n:n.charAt(0).toUpperCase()+n.slice(1)).join(" ")}function Ne(e,n=Se){const t=e.replace(/\s+/g," ").trim();if(t==="")return"";for(let a=0;a<t.length;a+=1){if(!".!?".includes(t[a]))continue;const i=t[a+1];if(i!==void 0&&i!==" ")continue;const d=t.slice(0,a).split(/[\s(]/).pop();if(t[a]==="."&&d&&Re.has(d.toLowerCase()))continue;const r=t.slice(0,a+1);return r.length<=n?r:$(r,n)}return t.length<=n?t:$(t,n)}function $(e,n){const t=e.slice(0,n),a=t.lastIndexOf(" ");return`${(a>n*.6?t.slice(0,a):t).replace(/[,;:.\s]+$/,"")}…`}function De(e){if(!e)return[];const n=new Set;return e.split(",").map(t=>t.trim()).filter(t=>t===""||n.has(t.toLowerCase())?!1:(n.add(t.toLowerCase()),!0))}function Pe(e){const n=e.trim().split(/\s+/).filter(Boolean).length;return Math.max(1,Math.round(n/Ae))}function Oe(e){return typeof TextEncoder>"u"?e.length:new TextEncoder().encode(e).length}function Ue(e,n,t){var p;const a=O(e);if(!a)return null;const{data:i,content:d}=P(n),r=i.metadata??{},c=a,h=(i.description??"").trim(),u=V(d).trim();return{name:c,title:((p=r.title)==null?void 0:p.trim())||Ce(c),description:h,summary:Ne(h),tags:De(r.tags),license:i.license,compatibility:i.compatibility,metadata:r,body:u,readingTimeMinutes:Pe(u),bytes:Oe(n),...t?{simulation:t}:{}}}function je(e,n=new Map){return Object.entries(e).map(([t,a])=>Ue(t,a,n.get(O(t)))).filter(t=>t!==null).sort((t,a)=>t.name.localeCompare(a.name))}function Le(e,n){const t=n.trim().toLowerCase();return t===""?e:e.filter(a=>[a.name,a.title,a.description,a.tags.join(" ")].join(" ").toLowerCase().includes(t))}function qe(e){return[...new Set(e.flatMap(n=>n.tags))].sort((n,t)=>n.localeCompare(t))}const Me=`---
name: ascii-diagrams
description: Draw annotated ASCII diagrams instead of prose walls when explaining a multi-step plan, a large change set, a data flow, a UI proposal, or the state of a long session. Covers three diagram types (annotated file tree with NEW/MOD status column, vertical data flow with failure-mode annotations, box-drawing UI mockup), the box-drawing character set, alignment and width discipline, and the rule that every annotation must add information the structure cannot show. Use when asked to "show me the plan", "what files change", "diagram this", "sketch the UI", "draw the flow", "summarize where we are", or when about to write more than a few paragraphs describing a change set or architecture.
metadata:
  tags: "diagrams, docs, output-style"
---

# ASCII diagrams that are worth reading

A diagram earns its place only if it says something prose cannot say cheaply.
The three formats below carry information that a paragraph loses: **spatial
grouping**, **status per item**, and **where the trap is**.

Reach for one of these instead of a prose wall when the answer has structure.

---

## Pick the type

| Situation | Type | Why |
|---|---|---|
| "What files will this touch?" / plan review / PR summary | **Annotated file tree** | New-vs-modified is a column, not a sentence |
| "How does X get to Y?" / design review / where a bug hides | **Data flow** | Branch points and failure modes have positions |
| "What will the screen look like?" / proposing UI | **UI mockup** | Layout and changed elements are visual facts |
| Tracing an *existing* execution path through real code | see \`code-flowchart\` skill | That one does the discovery too |
| Two axes of comparison, no topology | **Table** | Do not draw a diagram for tabular data |
| One linear sequence, no branches | **Numbered list** | Do not draw a diagram for a list |

Rendering medium (ASCII vs Mermaid vs SVG) and the tooling that produces them
is a separate decision — see the \`docs-and-diagram-tooling\` skill.

---

## Hard rules

1. **Always fence the diagram** in a \`\`\` block. Unfenced, a proportional font
   destroys every column you aligned.
2. **Width ≤ 100 columns.** Terminals, PR description panes, and side-by-side
   diff views all clip past that. 80 is safer still. Count before shipping.
3. **Annotations must add information not visible from the structure.**
   \`reminders.ts   NEW   new file\` is noise. \`reminders.ts   NEW   pure: parse /
   render / validate\` is a design decision.
4. **Call out traps inline with \`←\`.** This is what makes a diagram worth
   reading rather than skimming. If a step silently no-ops, if a list gets
   replaced rather than merged, if an allow-list must be extended or the feature
   is inert — that annotation goes *at the arrow where it bites*, not in a
   paragraph underneath.
5. **Columns line up.** Status columns share one start offset across the whole
   tree. Arrows land on the glyph they point at. Box sides are vertically
   flush. Misalignment reads as carelessness and destroys trust in the content.
6. **Realistic copy, never lorem.** \`( 3 enabled )\` and
   \`Reference code as file_path:line_number\` communicate; \`Label text here\`
   does not.

## Character set

Keep it small. Mixing weights looks accidental.

\`\`\`
box       ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ─ │       default for everything
flow      ▼ ▲ ► ◄ →                    direction of travel
pointer   ←                            "the note applies to THIS line"
marker    ◀NEW  ⚠  ✓  ✗                changed / warning / pass / fail
checkbox  [x]  [ ]                     UI state
tree      ├── └── │                    file trees only
\`\`\`

Double-line \`╔ ╗ ╚ ╝ ║\` reads as "external system / not ours". Use it sparingly
or not at all. Never mix \`─\` and \`-\` in the same rule.

**Ambiguous-width hazard.** \`⚠ ◀ ▸ ▾ ►\` are East-Asian-Width *ambiguous*: one
character, but some terminals with emoji presentation draw them two cells wide.
Box-drawing characters are never ambiguous, so a single \`⚠\` inside a box shifts
that one row by a cell and nothing else — the classic off-by-one you see in
mockups. **Align by character count**, which is what GitHub, VS Code and the
check below all use. If your audience is a terminal known to double-width them,
drop to \`!\` and \`<--\` instead of chasing both conventions at once.

---

## Type (a) — annotated file tree

For change sets. Three columns: path, status, why.

\`\`\`
custom-dca-ide-with-openhands/
├── reminders/                                  NEW   catalogue, SKILL.md format
│   ├── cite-file-lines/SKILL.md                NEW
│   └── verify-before-claiming/SKILL.md         NEW
├── server/openhands/
│   ├── reminders.ts                            NEW   pure: parse / render / validate
│   ├── remindersLoader.ts                      NEW   the ONLY fs read (boot-time)
│   └── agentSettings.ts                        MOD   + user_message_suffix in allow-list
├── client/
│   ├── pages/Reminders.tsx                     NEW   own nav entry
│   └── lib/events.ts                           MOD   + extended_content
└── Dockerfile                                  MOD   COPY reminders  ← release-build trap
\`\`\`

- Status column starts at one fixed offset for the *entire* tree, chosen so the
  longest path clears it by at least two spaces.
- \`NEW\` / \`MOD\` / \`DEL\` only. Leave the comment blank when there is nothing
  non-obvious to say — an empty cell is better than filler.
- Directories that only contain listed children need no status.
- The \`←\` trap goes on the line that will bite, here the release-only Docker
  build that dev never exercises.

## Type (b) — data flow

Vertical, top to bottom. Boxes only for things that are *components*; bare
labels for data and calls. Branches hang off \`├──\`, the trunk continues on \`│\`.

\`\`\`
 reminders/<id>/SKILL.md            parsed once at boot
         │
         ├── enabled ids ─────► misc_settings.helix_hub.reminder_presets
         │                              SOURCE OF TRUTH for the checkboxes
         │
         └── renderReminders(ids) ─► agent_context.user_message_suffix   (derived)
                     │
                     ▼
         PATCH /api/settings   ← one call, both halves
                     │                                        ▲
                     │                    must send skills:[] ┘ or upstream
                     ▼                    re-materializes them (#89 one-way bug)
         ┌──────────────────────────────────┐
         │ agent-server DEFAULT PROFILE     │
         └────────────────┬─────────────────┘
                          │  conversationAgentSettings() forwards it
                          │  ← PR #103 allow-list, +1 key or this is INERT
                          ▼
         POST /api/conversations
\`\`\`

What makes this version useful rather than decorative:

- It names the **source of truth** and marks the other value \`(derived)\`. That
  is the single most common design question and it is answered spatially.
- Two of the four annotations are **failure modes**, each anchored with \`←\` to
  the exact hop where the failure occurs. The \`▲ ┘\` elbow lets a note attach to
  an arrow that has no room beside it.
- It cites the issue/PR numbers that establish the trap. A reader who doubts
  the claim can go check.

Do not draw only the happy path. If a flow has no failure modes worth marking,
it probably did not need a diagram.

## Type (c) — UI mockup

Chrome in box-drawing, real strings inside, \`◀NEW\` on anything the change adds.

\`\`\`
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▸_ OpenHands  Local  Conversations · Manager runs · Terminal · Notifications │
│                      Agent settings · Tools · Reminders ◀NEW · Contributing  │
└──────────────────────────────────────────────────────────────────────────────┘

  Reminders                                                       ( 3 enabled )

  ┌────────────────────────────────────────────────────────────────────────┐
  │ [x]  cite-file-lines                                                   │
  │      Reference code as file_path:line_number so it can be opened.      │
  │────────────────────────────────────────────────────────────────────────│
  │ [ ]  no-force-push                       ⚠ declares triggers (ignored) │
  └────────────────────────────────────────────────────────────────────────┘
\`\`\`

- \`◀NEW\` marks the delta. A reviewer should be able to find every change in the
  mockup without reading the prose.
- \`⚠\` carries a caveat about *behaviour*, not appearance — here, that a field
  the user can see is silently not honoured.
- Row separators use \`│───…───│\`, keeping the outer walls intact.
- Show real counts and real copy. \`( 3 enabled )\` tells the reviewer the header
  is dynamic; \`(N enabled)\` does not.

---

## Before you ship it

Count **characters**, not bytes — every box-drawing glyph is 3 bytes in UTF-8,
so \`awk '{print length}'\` and \`wc -c\` will both lie to you by a factor of three:

\`\`\`bash
# widest line in characters, and any box rows whose length disagrees
python3 - diagram.txt <<'EOF'
import sys
L = open(sys.argv[1]).read().split("\\n")
print("widest:", max(len(l) for l in L))
rows = [(i+1, len(l)) for i, l in enumerate(L) if l.lstrip()[:1] in "┌│└"]
for n, w in rows:
    if w != max(w for _, w in rows): print(f"  line {n}: {w} chars (short)")
EOF
\`\`\`

Then read it back in a monospace context. Check: status column single offset,
every \`│\` in a box column-aligned, every \`▼\`/\`►\` landing on its target, no line
over 100. Fix drift before posting — a misaligned diagram is worse than prose.

## When not to diagram

Skip it for a single-file change, a yes/no answer, a linear sequence with no
branches, or anything already fully expressed by a table. A diagram nobody
needed costs the reader time and costs you credibility on the next one.

## Longer worked examples

\`EXAMPLES.md\` in this directory has three complete diagrams — a multi-package
change set, a request flow with three annotated failure modes, and a
before/after UI pair — with notes on the specific choices made in each.

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
a change set turned into an annotated tree with two failure modes marked, then
width-checked before shipping.
`,$e=`---
name: background-subagent
description: Hand the request the user just made to a background subagent with the task tool and return immediately instead of doing the work inline. Covers restating the request as a self-contained prompt for an agent with zero conversation context, the OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS precondition for background:true, choosing the subagent_type, resuming or adding context to a running task with task_id, reporting what was launched and then stopping rather than duplicating the work, and when backgrounding is the wrong call. Use when the user says "do this in the background", "kick that off", "hand it to a subagent", "run that async", "don't block on it", or "fire and forget".
metadata:
  tags: "subagents"
---

# Fire the current prompt at a background subagent

Take what the user just asked for, restate it so a context-free agent can act
on it, launch it with \`background: true\`, tell the user what went out, and
**stop**. The value of this is entirely in not doing the work twice.

---

## Preconditions — check before promising anything

\`background: true\` requires an environment flag. Without it the task tool
fails with:

> Background subagents require \`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true\`

\`\`\`bash
echo "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"
\`\`\`

If it is unset, say so and offer the alternatives: run it in the foreground
(you will block until it returns), or the user restarts opencode with the flag
set. Do not silently drop \`background\` and run in the foreground — the user
asked not to be blocked, and a foreground task looks identical until it hangs.

Also true here, verified against \`opencode 1.18.19\`:

- **\`subagent_depth\` defaults to \`1\`.** If you are yourself a subagent you
  cannot launch one. The failure is \`Subagent depth limit reached\`.
- The result of a subagent **is not shown to the user**. Whatever it returns,
  you have to relay.

## Step 1 — restate the request self-contained

This is the failure mode. A fresh subagent sees **only your \`prompt\` string**.
Not the conversation, not the file you were both just looking at, not the
directory you are standing in, not the constraint the user gave three turns
ago. "Do what the user asked" produces a confused agent and a wasted run.

Rewrite the request until it survives being read cold:

- **Absolute paths.** \`/Users/x/proj/server/auth.ts\`, never \`that file\` or
  \`./auth.ts\`.
- **The working directory**, stated explicitly.
- **Constraints from earlier turns**, restated. Branch names, "don't touch
  README", the library the user vetoed, the version pin.
- **Verification.** The exact command that proves the work is done
  (\`npm test\`, \`npm run typecheck\`) — the subagent cannot ask you.
- **Write or research?** Say which. The tool description is explicit that the
  agent "is not aware of the user's intent" on this point.
- **The deliverable**, since it returns exactly one message to you.

A useful check: could a colleague who just walked in execute this prompt? If
not, it is not ready.

## Step 2 — pick the \`subagent_type\`

Check what exists on this machine before choosing — the roster is
configurable and differs per install:

\`\`\`bash
opencode agent list
\`\`\`

At time of writing, here:

| Type | For | Constraint |
|---|---|---|
| \`general\` | Multi-step work, edits, running commands | Full permissions; \`todowrite\` denied |
| \`explore\` | Codebase search and questions about it | **Enforced read-only** (grep/glob/read/webfetch/websearch only) |
| \`diagram\` | Rendering Mermaid to SVG or ASCII | \`edit\` and \`bash\` denied |

Backgrounding a read-only \`explore\` is nearly always safe. Backgrounding a
\`general\` that edits files is only safe if you are certain you will not touch
the same files while it runs.

## Step 3 — launch

\`\`\`
task(
  description  = "Audit auth token expiry",        // 3-5 words
  subagent_type= "explore",
  background   = true,
  prompt       = "<the self-contained restatement>"
)
\`\`\`

\`command\` is an optional field for recording what triggered the task; skip it
unless a slash command did.

## Step 4 — report, then stop

The tool returns immediately with a \`task_id\` and tells you, verbatim:

> DO NOT sleep, poll for progress, ask the task for status, or duplicate this
> task's work — avoid working with the same files or topics it is using.

Obey that. You are **notified automatically** when it finishes; the result is
injected into this session as a message.

Say something short and end the turn:

> Launched an \`explore\` subagent in the background to audit token expiry across
> \`server/auth/\`. I'll report back when it lands. (\`task_id: ses_abc123\`)

Then genuinely stop. Do not start the same investigation "just to have a head
start" — that is the exact duplication this mechanism exists to avoid. If
there is genuinely non-overlapping work in front of you, do that instead;
otherwise end the response.

Never claim the work is done. It is running.

## Adding context to a running task

Passing \`task_id\` for a task that is **still running** does not start a new
one — it sends your prompt to the live task as additional context. Useful when
the user follows up with a correction:

\`\`\`
task(description="Audit auth token expiry", subagent_type="explore",
     task_id="ses_abc123", prompt="Also cover refresh tokens in server/session/.")
\`\`\`

Passing \`task_id\` for a **finished** task resumes that subagent's session with
its previous messages and tool outputs intact — cheaper and better-informed
than a fresh agent for a follow-up on the same material.

## When not to background this

- **You need the result to continue this turn.** Foreground it. Backgrounding
  something you are about to wait for is strictly worse — same latency, plus
  you lose the ability to react as it goes.
- **The task needs back-and-forth.** A subagent cannot ask a question. Anything
  ambiguous, anything where you would expect a "did you mean X?", stays inline.
- **It is small.** Under a handful of tool calls, the round trip costs more
  than the work.
- **It will edit files you are about to edit.** Concurrent writes to the same
  file, or two agents racing on a port or a lockfile.
- **The user wants to watch.** Background output arrives as one message at the
  end; there is no visible progress. If they want to steer, keep it inline or
  launch a separate interactive session instead.
- **You are already a subagent.** Depth limit is 1.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| \`Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true\` | Flag not set | Report it; offer foreground or a restart with the flag |
| \`Subagent depth limit reached\` | You are a subagent | Cannot nest; do it inline |
| \`Unknown agent type: X is not a valid agent type\` | Guessed the roster | \`opencode agent list\` first |
| Subagent asks a clarifying question and dies | Ambiguous prompt | Close every decision in the prompt before launching |
| Subagent worked on the wrong file | Relative path or "that file" | Absolute paths only |
| Duplicated work, conflicting edits | Kept working after launching | Report and stop, or pick non-overlapping work |
| User never sees the result | Result is invisible to the user by design | Relay a summary when the notification arrives |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing,
showing both branches of the precondition check — the flag unset and refused,
then set and launched, with the turn ending at the report.
`,Fe=`---
name: build-waves
description: Run a sustained multi-wave build in one OpenCode session, using background subagents to compress research while the parent keeps implementing until the project is verified. Covers cutting sequential waves on disjoint file and artifact boundaries, overlapping research for the next wave with parent-owned writes in the current wave, limiting concurrent tasks, planning verification up front, preserving the queue and decisions in files and todowrite across compaction or model changes, budgeting scarce parent context and cost, auditing child sessions in opencode.db, and stopping only for a real user decision, a failed verification that requires a fix wave, or completed verified work. Use when the user says "build all of it", "do not stop until it is done", "use background subagents to save time", or asks for a long-running implementation plan executed in waves. Requires OpenCode with OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true.
metadata:
  tags: "subagents, long-running, planning"
---

# Build all waves through verification

Treat a long build as one durable queue of sequential waves, not a series of
mini-projects that each wait for permission. Background children shorten the
research path; the parent remains responsible for the coherent implementation
and for reaching a verified exit.

This skill supplies the loop around delegation. Use \`background-subagent\` for
launch and prompt mechanics, \`deep-research-subagents\` for read-only fan-out,
\`parallel-research-handoff\` for research that precedes fresh implementation
sessions, and \`manager-children\` when the work belongs in multiple interactive
sessions or worktrees instead of one sustained parent.

These topologies have different continuation semantics. An in-process
background \`task\` can return a host-delivered result to its parent conversation.
A standalone child TUI in cmux cannot resume the parent by writing a status
file, pushing a PR, changing a badge, or running \`cmux notify\`. Use
\`manager-children\` for that topology and persist enough state for the manager's
next genuine inbound turn. Never describe a CMUX notification as an automatic
parent wake-up.

## Preflight: prove background tasks are available

Run this before promising parallel work:

\`\`\`bash
test "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-}" = true
\`\`\`

If it fails, do not pretend the run can use background children. Tell the user
the flag must be set before starting OpenCode, then either bail or offer a
foreground version. Do not silently turn asynchronous tasks into blocking ones.
The usual \`subagent_depth\` limit is one, so plan a flat fan-out; confirm the
installed roster and exact mechanics with \`background-subagent\`.

## Before wave 1: make the run durable

The parent context is the scarce, irreplaceable resource. Child sessions can be
restarted; a parent that loses its decisions and queue after compaction cannot.
Before launching anything:

1. Write a plan file with scope, decisions, artifact boundaries, wave order,
   ownership, dependencies, and exact verification commands.
2. Put every wave in \`todowrite\`, including the final verification wave. Mark
   only one implementation wave active at a time.
3. Record load-bearing findings and the next-wave brief in files. Never rely on
   "I will remember that after compaction."
4. Establish a clean baseline for the planned verification commands when
   practical, so later failures can be attributed to this run.

Keep the file plan and \`todowrite\` synchronized at each boundary. They are the
restart protocol if context compacts, the model changes, or the session resumes
hours later.

## Cut waves on ownership and artifacts

A wave is a set of tasks that can proceed independently because their owned
files and produced artifacts do not overlap. Cut on boundaries such as schema,
server route, client surface, migration, fixtures, or docs, not vague slices of
one feature.

For every task, write down:

- owned files or directories
- input artifacts it may read
- output artifact and acceptance check
- dependencies on prior waves
- files and shared resources it must not touch

If two tasks may edit the same file, regenerate the same lockfile, bind the same
port, or mutate the same database, they are not concurrent tasks. Sequence them
or assign the shared integration to the parent.

Cap a batch at about five concurrent tasks. More children increase duplicated
search, synthesis work, and ownership mistakes faster than they reduce elapsed
time. Fewer independent tasks are fine; do not manufacture parallelism.

## Default topology: children explore, parent writes

Make read-only research the default fan-out. Children inspect APIs, inventory
routes, find analogues, map tests, and return cited findings. The parent turns
those compressed reports into edits and retains the cross-wave design.

Pipeline the run:

1. While the parent implements wave n, launch read-only research needed for
   wave n+1.
2. Keep those prompts outside the files being edited and require concise,
   cited deliverables.
3. At the boundary, reconcile reports, update the durable plan, verify the
   completed wave's acceptance checks, and immediately begin the next wave.
4. Fan out writes only when each child's complete file set is known and
   provably disjoint from every other child and from the parent.

Do not duplicate the launch patterns from the referenced skills. Their prompt,
notification, and result-relay rules still apply here.

## Verification is the final planned wave

Create the verification wave before implementation starts. It is not cleanup
added after the last edit. Include the repository's required typecheck, tests,
build, lint, integration or end-to-end checks, plus review of the accumulated
diff against the original scope.

The exit condition is all planned verification passing, not the last feature
file being written. If verification fails, add a bounded fix wave, execute it,
and rerun the affected checks plus the final suite. Record the result in the
plan so a resumed session knows what is still unproven.

## Stopping rule

After a wave, continue to the next queued action without asking "shall I
continue?" Progress reports do not transfer control back to the user. Stop only
when one of these is true:

- A real product, scope, safety, or destructive-action decision requires the
  user. State the smallest decision and the consequences of each option.
- Verification failed and the failure must be assessed before a fix wave. Once
  assessed, create and run that wave rather than treating the failure as done.
- Every wave, including verification and any fix waves, is complete and green.

Observed model behavior is not a control mechanism. In project runs, GPT models
have appeared more likely than Opus models to continue through every wave;
Opus models have sometimes paused after one or two waves for human approval.
This is an observation, not a guarantee. The durable queue and stopping rule
must keep working when the model changes or either behavior changes.

Nor is an external process a control mechanism unless it supplies a real wake
channel. The stopping rule governs what the parent does while it has a turn; it
does not keep a completed turn scheduled. If the work uses standalone CMUX
children, the manager resumes only after a user message or a separately tested,
serialized supervisor prompt. See \`manager-children\` for that boundary.

> **Evidence from one observed run, not a universal law**
>
> One backend migration ran for 7.5 hours and 254 messages with 18 background
> children, one compaction, and one model change. Child batch sizes were
> 3, 5, 2, 2, 2, and 1. Sixteen children were read-only \`explore\`; two were
> \`general\`. Child cost was $60.15 versus $196.62 in the parent. The parent
> reached 90% context, compacted to 26%, changed from Opus 5 to GPT-5.6, and
> retained Waves 0-5 because the queue lived in durable state. Verification had
> not been planned and was added only after user intervention: the reason this
> skill requires it up front.

## Audit child sessions after the run

OpenCode stores child sessions in \`~/.local/share/opencode/opencode.db\` with the
parent session id, transcript, model, and cost. Use SQLite when a report needs
provenance or the run needs a cost and behavior audit:

\`\`\`sql
SELECT datetime(time_created / 1000, 'unixepoch') AS created,
       agent,
       round(cost, 2) AS cost,
       title
FROM session
WHERE parent_id = 'ses_...'
ORDER BY time_created;
\`\`\`

Use the rows to find which child produced a claim, inspect its transcript, and
compare planned ownership with actual delegation. Treat the audit as evidence
for improving the next wave plan, not as a substitute for final verification.

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
one wave boundary, with the next wave's research overlapping the current wave's
writes and the run continuing without asking permission.
`,We=`---
name: cite-file-lines
description: Cite code with an exact repository-relative file path and line number so a reader can open the evidence directly. Covers choosing stable, load-bearing references, distinguishing verified facts from inference, and avoiding guessed locations. Use when explaining a codebase, reviewing a change, or reporting a diagnosis, or when the user says "cite the lines", "point me to the exact code", or "where exactly is that in the codebase".
metadata:
  tags: verification
---

# Cite file lines

When you make a claim about a function, class, configuration key, route, test,
or behavior, attach the smallest useful reference in the form
\`path/to/file.ts:42\`. A reader should be able to jump from the claim to the
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
| A reader cannot locate the named code | Citation is a directory, symbol-only reference, or vague prose | Give \`path:line\` for the definition or behavior branch |
| The citation does not prove the claim | It points to a comment or caller rather than the behavior | Read through the implementation and cite the load-bearing line |
| A review sounds certain but lacks evidence | Location was inferred from naming or convention | Label the inference or verify it before reporting |
| A long list of references obscures the argument | Every adjacent line was cited | Keep only the smallest references that establish the point |
| A link will drift during review | It names a moving branch | Pin external code-review links to the reviewed commit SHA |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
a request to cite the lines behind a behavior, answered with a verified
\`path:line\` reference instead of a paraphrase.

Instead of writing “the API rejects unknown reminder IDs,” write: “The route
validates the requested ID against the server-owned catalogue before resolving
the body (\`server/routes/sessions.ts:...\`).” The sentence names both the
behavior and the evidence; replace the ellipsis with the verified line before
publishing it.
`,Be=`---
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

Not to be confused with \`parallel-research-handoff\`, which researches N
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

- It is a needle lookup. One \`grep\` beats a subagent's startup cost every time.
- Answers are **sequential** — question 2's shape depends on question 1's
  answer. Do that pass yourself, then fan out on what it opens up.
- The work mutates state. Subagents that write race each other.
- You need to iterate with the user mid-investigation.

## What is actually available here

Verified against \`opencode 1.18.19\` (\`opencode agent list\`, and the task tool's
schema in the binary). Do not assume a roster from another machine.

| \`subagent_type\` | Use it for | Constraint |
|---|---|---|
| \`explore\` | Codebase search: find files by pattern, grep keywords, "how does X work?" | **Enforced read-only** — only grep, glob, read, webfetch, websearch are permitted. Cannot write even if told to. |
| \`general\` | Multi-step research and work that needs bash or edits | Full permissions. \`todowrite\` denied. Say "read-only" explicitly if you mean it. |
| \`diagram\` | Rendering a Mermaid diagram to SVG or ASCII | \`edit\` and \`bash\` denied; uses the mermaid MCP |

\`explore\` takes a **thoroughness level** in the prompt — \`"quick"\`, \`"medium"\`,
or \`"very thorough"\`. Say which. For this skill it is almost always
\`"very thorough"\`; that is the whole point of escalating.

Two limits that bite:

- **\`subagent_depth\` defaults to \`1\`.** Your subagents cannot spawn their own
  subagents. Plan a flat fan-out, not a tree.
- Subagents get \`task\` and \`todowrite\` denied unless their own agent config
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
restrict yourself to \`client/\` and do not read \`server/\`."* Without that they
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
   the middle, a capable agent starts implementing. (Unnecessary for \`explore\`,
   which enforces it — but required for \`general\`.)
2. **A numbered list of specific questions**, not a topic. "Research the auth
   system" returns an essay. "1. Which module issues the session cookie, and at
   which line? 2. What is its expiry, and where is that configured? …" returns
   facts.
3. **\`file:line\` for every claim, and verbatim API shapes.** Prose summaries
   decay into hallucination the moment they cross a context boundary;
   \`setup.ts:2018\` does not. If a server is reachable, tell it to GET
   \`/openapi.json\` and paste the schema rather than describe it.
4. **The deliverable, spelled out.** "Return a markdown section per numbered
   question, each with a one-line answer followed by the evidence. Under 800
   words." Unspecified format means you do the reformatting.
5. **"Flag what you could not verify rather than guessing.** End with an
   \`UNVERIFIED:\` list of anything you inferred, could not find, or read only
   indirectly." This single line is the difference between a report you can
   trust and one you have to re-check. Ask for it explicitly — the default
   behaviour is to smooth over gaps.

Skeleton:

\`\`\`
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
End with \`UNVERIFIED:\` listing anything you inferred or could not confirm.

READ-ONLY. Do not write or edit any files.
\`\`\`

## Synthesise, do not concatenate

Pasting four reports under four headings is not an answer, and it hands the
reader the work you were delegated. Do this instead:

1. **Lead with the answer** to the original question, in a few sentences.
2. **Reconcile conflicts explicitly.** Two agents disagreeing is a finding, not
   a formatting problem. Go read the cited lines yourself and say which is
   right and why the other looked true.
3. **Merge the \`UNVERIFIED:\` lists into one** and put it where the reader will
   see it. Anything on it that changes the decision, go verify now.
4. **Keep the \`file:line\` citations** in the merged output. They are the reason
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
| A claim turns out to be invented | No \`UNVERIFIED:\` contract | Demand the list; spot-check one claim per report |
| \`general\` subagent edited files | Read-only stated once, mid-prompt | Top and bottom, or use \`explore\` |
| Subagent tried to delegate | Assumed nesting works | \`subagent_depth\` is 1 — flat fan-out only |
| No wall-clock saving | Launched sequentially | One message, multiple tool calls |
| Synthesis longer than the reports | Concatenated | Answer first, reconcile conflicts, cite, cut |
| Shallow answers from \`explore\` | Thoroughness not specified | Say \`"very thorough"\` in the prompt |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
four concurrent read-only agents on non-overlapping axes, and a synthesis that
reconciles two reports that disagreed.
`,Ge=`---
name: docs-and-diagram-tooling
description: Choose the right visual medium when writing documentation and use the diagram and preview tooling actually installed on this machine, instead of hand-writing Mermaid into a file nobody renders. Covers when a diagram beats prose, a table or a list; picking ASCII vs Mermaid vs rendered SVG based on where the doc will be read (terminal, PR description, GitHub README or wiki); the mermaid MCP render tools and the diagram subagent; and cmux markdown live preview. Use when asked to "write docs", "document this", "add a diagram to the README", "make an architecture doc", "render this diagram", or "how do I preview these docs".
metadata:
  tags: "diagrams, docs"
---

# Docs and diagram tooling on this machine

Most of the value here is inventory. A fresh agent hand-writes a Mermaid block
into a markdown file and never renders it, because it has no way to know a
render pipeline and a live preview are already installed.

For *how to draw* an ASCII diagram — the conventions, the character set, the
annotation rules — see the **\`ascii-diagrams\`** skill. This skill is about
which medium to pick and which tool to reach for. Do not restate those rules;
load that skill instead.

---

## Pick the medium from where it will be read

The controlling question is not "which is prettier", it is **"in what surface
does the reader open this?"**

| Reader opens it in | Medium | Because |
|---|---|---|
| A terminal (\`cat\`, \`less\`, agent transcript, CLI help) | **ASCII** | Mermaid is an unrendered wall of source here |
| A PR description or code review comment | **ASCII** | GitHub renders Mermaid in markdown, but reviewers read diffs and emails in monospace; ASCII survives both |
| A commit message, \`AGENTS.md\`, a code comment | **ASCII** | No renderer exists at all |
| A GitHub/GitLab README or wiki | **Mermaid** | Renders natively; stays diffable as text |
| A docs site (MkDocs, Docusaurus, etc.) | **Mermaid**, only if the site's plugin chain renders it | Keeps docs-as-code — but verify first, see below |
| A slide, an issue attachment, an external doc | **SVG** | Fixed layout, scales, no renderer dependency |

Rules of thumb that follow from that table:

- **When unsure, ASCII.** It degrades to readable everywhere; Mermaid degrades
  to noise.
- **Never both** for the same diagram. Two copies drift, and the stale one is
  the one the reader trusts.
- **Hand-write ASCII rather than generating it.** \`render_mermaid_ascii\` output
  is correct but sparse and wide, and it cannot carry the \`←\` trap annotations
  and status columns that make a diagram worth reading. Generate ASCII only for
  a throwaway sanity check of graph structure.

And before reaching for any diagram: a **table** beats a diagram for two axes
of comparison, and a **numbered list** beats a diagram for a linear sequence.
Diagrams are for topology, branching, and spatial grouping.

---

## What is installed here

Verified on this machine. Re-check with \`opencode agent list\` and the MCP
server list in \`~/.config/opencode/opencode.json\` before relying on any of it
elsewhere.

### \`diagram\` subagent

Defined at \`~/.config/opencode/agents/diagram.md\`, \`mode: subagent\`, with
\`edit: deny\` and \`bash: deny\`.

> Generates beautiful Mermaid diagrams as SVG files or ASCII art using the
> mermaid MCP tools

Delegate to it with the task tool (\`subagent_type: "diagram"\`) when you want a
rendered artifact and do not want to spend main-context tokens on Mermaid
syntax iteration. Because it cannot edit files, it hands you back a path or the
ASCII — you do the writing.

### \`mermaid\` MCP server

A locally installed Mermaid rendering MCP server, three tools:

| Tool | Args | Returns |
|---|---|---|
| \`render_mermaid_svg\` | \`code\`, \`theme\`, \`outputDir\` | Path to a written SVG |
| \`render_mermaid_ascii\` | \`code\`, \`useAscii\` | Unicode (or pure-ASCII) art inline |
| \`list_themes\` | — | 15 themes |

Default output dir comes from \`MERMAID_OUTPUT_DIR\` — pass \`outputDir\`
explicitly to land the SVG next to the doc that references it. Themes include
\`zinc-dark\` (good default for dark terminals), \`zinc-light\`, \`github-light\`,
\`tokyo-night\`, \`catppuccin-mocha\`, \`nord\`. Pick a light theme for anything
embedded in a README, where the page background is usually white.

Diagram types the renderer supports: \`graph TD/LR\`, \`sequenceDiagram\`,
\`stateDiagram-v2\`, \`classDiagram\`, \`erDiagram\`, \`xychart-beta\`.

### \`cmux markdown\` — live preview

The \`cmux-markdown\` skill covers this properly; load it for the details. The
one-liner:

\`\`\`bash
cmux markdown open /abs/path/to/DOC.md --focus false
\`\`\`

Opens a rendering panel that live-reloads on every write, so you can iterate on
a doc and watch it render. \`cmux open <path-or-url>\` also works for markdown
and URLs. Always pass \`--focus false\` unless the user asked to be taken there.

This is the fastest way to check that tables, nesting and fenced blocks came
out right — but note it renders **markdown**, so a Mermaid block shows as a
code block, not a diagram. It verifies structure, not Mermaid output.

### Static docs sites

**Mermaid on a docs site is not guaranteed.** A \`mermaid\` fence renders only if
that site's plugin chain includes Mermaid support, and plugin bundles are often
opaque from the docs repository alone. Do not assume: put one small Mermaid
block in a page, build or serve the site locally with whatever generator it
uses, and look. If it renders as a code block, fall back to ASCII, or render an
SVG and reference it as an image.

Whatever the generator, read an existing published page before writing a new
one. House style and cross-link conventions are cheaper to copy than to guess
at, and a site's own navigation config is the authoritative source for where a
new page belongs.

### Also present, situationally

- **\`excalidraw\` MCP** — hand-drawn style diagrams; for design docs where the
  diagram is illustrative rather than normative.
- **\`figma\` MCP** — \`get_figma_data\` / \`download_figma_images\`. When a design
  already exists, pull the real frame instead of mocking up a UI diagram.
- **\`chrome-devtools\` MCP** — \`take_screenshot\` (\`fullPage\`) for documenting
  actual rendered UI. A screenshot beats a mockup once the thing exists.

Several of these are enabled in config but may not be connected in a given
session. Check your available tools before promising output from one.

---

## Writing the doc

1. **Find the house style first.** An existing doc in the same repo or on the
   same docs site is worth more than any generic template. Read one before
   writing.
2. **Structure before prose.** Tables for comparisons, lists for sequences,
   diagrams for topology, prose only for the reasoning that connects them.
3. **Cite \`file:line\`.** A doc that names the code it describes stays checkable
   as the code moves; one that paraphrases silently rots.
4. **Say what is *not* true.** The limitation, the trap, the thing that looks
   like it should work — that is what a reader cannot get from the source.
5. **Preview before claiming it is done.** \`cmux markdown open\` for markdown;
   for a docs site, build or serve it locally with its own generator. "It
   should render" is not verification.

## Related skills

| Need | Skill |
|---|---|
| ASCII diagram conventions, characters, annotation rules | \`ascii-diagrams\` |
| Trace an execution path through real code and draw it | \`code-flowchart\` |
| Generate a full multi-file learning guide for a repo | \`repo-learning-guide\` |
| Live markdown preview details and routing | \`cmux-markdown\` |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
a README diagram with the medium chosen from where it will be read, the house
style matched, and the block actually rendered before being called done.
`,He=`---
name: duck-mode
description: Wrap every assistant reply in lines of duck emojis. Use when the user says "duck mode", "enable duck mode", "turn on the ducks", or asks for every response to be bracketed by 🦆🦆🦆. Also the repo's worked example of the smallest possible skill, and of when a skill is the wrong mechanism.
metadata:
  tags: "output-style, funny"
---

# Duck mode

- Begin every reply with a line containing exactly \`🦆🦆🦆\` and nothing else.
- End every reply with a line containing exactly \`🦆🦆🦆\` and nothing else.
- This applies to *every* reply — one-word answers, errors, clarifying questions, refusals.
- Never mention, explain, apologise for, or draw attention to the ducks.
- Never put ducks inside code blocks, file contents, commit messages, PR bodies, or anything written to disk.
- The ducks are a display convention only; they are never part of an artifact.
- Stop when the user says "no more ducks" or "quack off", and do not comment on stopping.

---

## Reliability

This skill is a specimen. It was built alongside a plugin that does the same job
deterministically, specifically to measure which mechanism actually holds. The
measurements below are from OpenCode 1.18.19 on 2026-08-21.

### Did the skill hold?

**Yes — 6/6 turns, which is better than expected.** Harness: \`opencode run --pure\`
(plugins disabled) with \`--continue\`, \`anthropic/claude-haiku-4-5\`, the directives
above stated once in turn 1. Turns 2-4 were tool-heavy (two \`read\` calls plus a
\`grep\` each), turn 5 wrote a file, turn 6 was a six-part instruction-dense request.
Ducks appeared on the first and last line of all six replies. The disk-hygiene
clause also held: the file written in turn 5 contained **0** duck characters.

Do not over-read this. Three caveats:

- The rule sat in the turn-1 **user message**, which never leaves the context
  window. A real skill's body is injected when the skill is invoked and is far
  more likely to age out.
- Six turns is a short run and **no compaction occurred**. Post-compaction
  behaviour is the interesting case and is **UNVERIFIED**.
- One model, one session. Compliance is a per-model property.

The honest summary: a clearly-worded, recently-stated formatting rule survives
ordinary tool use fine. What is unproven is durability across compaction and
long sessions — which is exactly where an instruction-based mechanism is
expected to fail, and exactly what this experiment could not reach.

### Did the plugin hook fire?

**Yes. Verified end-to-end, not inferred from types.**

\`experimental.text.complete\` is declared in \`@opencode-ai/plugin\` 1.18.18 but
appears nowhere in the published docs. It is genuinely wired: the 1.18.19 binary
contains the call site at byte offset 65753447, in \`SessionProcessor\`'s
\`text-end\` case, and the return value is assigned back —

\`\`\`
h.currentText.text = (yield* trigger("experimental.text.complete",
  {sessionID, messageID, partID}, {text: h.currentText.text})).text
\`\`\`

Runtime proof, from an isolated throwaway project (never the live session): a
probe plugin logged \`HOOK_FIRED … before="pancake"\` and the process printed

\`\`\`
🦆🦆🦆
pancake
🦆🦆🦆
\`\`\`

for a model asked to reply with exactly the word \`pancake\`. The ducks were never
generated by the model. \`output.text\` is mutable and the mutation is persisted.

**Load-bearing caveat, discovered by experiment:** the hook fires **once per text
part, not once per response**. A turn containing tool calls has several text
parts, so a naive implementation brackets every prose block. The shipped plugin
therefore prepends only on a message's first part and appends on every part, so
the response's first and last lines are always ducks, with interior duck lines
remaining around tool calls. A strict one-pair-per-response guarantee is **not
achievable from this hook alone** — when a part ends you cannot know whether
another follows.

**Second finding:** with the plugin enabled, the model saw ducks in its own prior
turns and volunteered *"I'm using the duck-test skill, which explains the ducks"*.
A plugin can guarantee the ducks are **present**; it cannot enforce "never mention
the ducks", because that is a property of generation, not of post-processing.

### Recommendation

For response *shaping* in OpenCode, use a **plugin on
\`experimental.text.complete\`**. It is deterministic, costs zero tokens, cannot
decay, survives compaction, and is unaffected by model choice. Accept that it is
undocumented and experimental, and pin the behaviour with a test.

Use a **skill** only when the behaviour is genuinely on-demand and the user
invokes it by name. Use **AGENTS.md** for the parts a filter cannot express —
here, the "never comment on the ducks" clause, which needs the model's
cooperation. The strongest configuration is a hybrid: plugin for guaranteed
presence, one AGENTS.md line to suppress commentary.

\`experimental.chat.system.transform\` (also confirmed firing — it logged twice per
run in the probe) is the fallback if the text hook is withdrawn. It appends to the
system prompt every turn, so the instruction never ages out of context, but it is
still model-mediated and so still advisory rather than guaranteed.

### Not verified

- Behaviour **after compaction** for either mechanism.
- Whether the streaming TUI re-renders mutated text, or whether ducks only appear
  in the committed part. All runtime evidence here is from \`opencode run\`
  (non-interactive); the interactive TUI was not exercised.
- Long-horizon skill decay (>6 turns), and decay on any model other than
  \`claude-haiku-4-5\`.
- Hook stability across versions. \`experimental.\` is a stated no-guarantee prefix
  and this API is absent from the docs; it may be renamed or removed without notice.

### The general lesson

**Skills are for on-demand procedures. Always-on behaviour belongs in a plugin, a
hook, or AGENTS.md.**

A skill is *instructions*, not a *filter*. Nothing enforces it. Writing an
always-on rule as a skill means asking the model, every single turn and forever,
to remember something a five-line function could have guaranteed. That trade is
occasionally worth it — instructions can express intent a filter cannot, such as
"do not draw attention to this" — but it should be a deliberate choice, not the
default one. If the requirement is "this must always be true", the right question
is not "how do I word the skill?" but "what is the mechanism that makes wording
unnecessary?"

### The plugin

### The plugin

Lives outside this repo, at \`~/.config/opencode/plugins/duck-mode.ts\`; it is
user configuration, not a repo artifact. It is **off by default** and activates
only with \`DUCK_MODE=1\` in the environment. Registration is explicit — OpenCode
does not auto-load that directory; the path must be listed in the \`plugin\` array
of \`~/.config/opencode/opencode.json\`. Both states were tested: with the variable
unset the reply was a bare \`alpha\`; with \`DUCK_MODE=1\` the same prompt returned
\`bravo\` wrapped in ducks. It typechecks clean under \`tsc --strict\` against the
real \`Plugin\` type.

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
ducks switched on, then a file written to disk without any, and the assistant
never once mentioning them.
`,Ve=`---
name: grill-me
description: Interview the user in rounds about a plan, design, or decision, working a design tree until every branch is settled and nothing is left silently assumed. Use when the user says "grill me", "grill-me", "stress-test this plan", "poke holes in my design", "interview me about this", or wants to reach shared understanding on a design before anything gets built.
metadata:
  tags: "critique"
---

# Grill me

<!-- Adapted from mattpocock/skills (MIT): skills/productivity/grilling.
     Restructured for OpenCode: single model-invoked skill (no wrapper split,
     because OpenCode ignores \`disable-model-invocation\`), plus a closing
     handoff/ADR step that upstream does not have. See CREDITS.md. -->

Interview the user relentlessly until you reach a shared understanding. Map the
problem as a **design tree**: every decision branches into the decisions that
hang off it.

---

## Work the tree in rounds

The **frontier** is every decision whose prerequisites are already settled — the
questions you can ask *now* without guessing at answers you have not heard yet.

**Ask the whole frontier in one round.** Number each question and give your
recommended answer. Then stop and wait for the user's answers before the next
round.

A question whose answer depends on another question still open in this round
belongs to a *later* round, not this one. Putting it in the current round forces
the user to answer hypothetically, and hypothetical answers do not settle
anything.

Each round of answers reshapes the tree: settled decisions push the frontier
outward and unblock the questions that depended on them. Recompute the frontier
and ask the next round.

---

## Round format

\`\`\`
❓ **Q1** - **<question title>**: <question body, possibly multiple paragraphs,
including the concrete options if there are options>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body>

➡️ <your recommended answer>
\`\`\`

Always give a recommendation. A question without one offloads the thinking back
onto the user, which is the opposite of the point. Recommend even when you are
unsure, and say that you are unsure.

---

## Finding facts is your job, never the user's

When a frontier question needs a fact from the environment — what a file
contains, which version is installed, whether an endpoint exists, what the
current schema looks like — **dispatch a sub-agent to find it**. Never ask the
user for something you could look up.

**Do not block on the lookup.** A running exploration is an unsettled
prerequisite, so only the questions *downstream* of it wait for the sub-agent to
report. Ask the rest of the frontier now, in the same round.

The split is: **facts are yours, decisions are the user's.** Look up the facts.
Put every decision to the user and wait.

---

## Hold your position

Do not accept an answer you believe is wrong just because the user gave it. Say
so, and argue the case with the reason. A grilling that folds at the first push
back has produced consensus about nothing.

Equally, do not stop at the first plausible-sounding answer to your own
question. The recommendation you offer is a starting position, not a conclusion.

---

## Stop condition

**The session is done when the frontier is empty**: every branch of the design
tree visited, nothing left silently assumed.

Then summarise the agreed decisions back as one list, and **wait for the user to
confirm**. Do not act on the design until they do.

---

## Close it out

Once the user confirms, offer to persist the outcome — the decisions are
worthless if they live only in a scrolled-past chat:

- **A handoff doc** — the decisions restated as directives with their rationale,
  in the shape another agent can execute from. Use the \`parallel-research-handoff\`
  skill's handoff structure if the work is about to be delegated.
- **An ADR** — context, decision, consequences, one file per decision, committed
  next to the code it governs. Better when the *reasoning* is what needs to
  survive, especially for the decisions that were close calls.

Ask which; write it if they want it.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| User answers "it depends on Q3" | A dependent question was put in the current round | Move it to a later round; the frontier was computed wrong |
| Grill feels like an interrogation drip | Questions asked one at a time | Ask the entire frontier per round |
| User is asked what version of X is installed | A fact was treated as a decision | Dispatch a sub-agent; look it up |
| Whole round stalls on one lookup | Blocked on the sub-agent | Only downstream questions wait; ask the rest now |
| User picks every recommendation without thought | Recommendations offered with no reasoning | Give the why, and name the tradeoff being made |
| Agreement reached, then relitigated during build | Outcome never written down | Emit the handoff doc or ADR |
| Session ends still holding assumptions | Stopped when questions ran out, not when the frontier emptied | Recompute the frontier; unvisited branches remain |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
round 1 of a grilling on a Redis caching plan, showing a full frontier asked in
one round, a fact looked up rather than asked, and a question deliberately held
back for round 2.
`,Ke=`---
name: human-verification-steps
description: Generate a short, executable checklist for a human to verify completed user-visible behaviour across browser UI, CLI/scripts, APIs/backends, deployments, and docs/content. Use when the user asks for "human verification steps", "manual verification steps", "how do I verify this manually", "what should I check in the browser", or "give me QA steps".
metadata:
  tags: "verification, docs"
---

# Human verification steps

Produce the smallest checklist that establishes whether a completed change works
from a user's perspective. Do not review the implementation itself. For
adversarial review of a plan, design, or diff, use \`red-team-this\`; this skill
validates finished behaviour after the change exists.

## Gate on automation

Run the relevant automated checks **before** asking a human to do anything.
Inspect \`package.json\`, task files, CI configuration, and changed tests to find
the project's real commands. Prefer the narrowest relevant checks, then run the
repository's required aggregate checks when practical:

\`\`\`bash
npm run typecheck
npm test -- --run
npm run build
\`\`\`

Replace those examples with the project's actual commands. Record each exact
command, exit status, and useful result. Never write "tests pass" based on an
old CI run, a baseline supplied in the prompt, or an unexecuted command.

If a required automated check fails, stop. Report the failure and use
**Fixes required** as the disposition. Do not send a human to verify a build
that is already red. If infrastructure prevents a check from running, label it
\`UNVERIFIED\`; do not quietly treat unavailable as passed.

## Research the changed surfaces

Determine what changed before writing the checklist. Do this work yourself:

\`\`\`bash
git status --short
git diff --stat
git diff --name-only origin/main...HEAD
git diff origin/main...HEAD
\`\`\`

Then trace every user-facing entry point affected by the diff:

- Read routes, navigation, commands, help text, API contracts, migrations,
  deployment manifests, feature flags, and changed documentation.
- Read changed and adjacent tests for intended states and known boundaries.
- Find the real start command, base URL, ports, required services, seed data,
  accounts, roles, environment variables, and deployment target.
- Run safe setup and inspection commands when access is available.
- Ask the user only for genuine access, credentials, production-only state, or
  unresolved product intent. Do not ask them to locate routes or commands that
  are present in the repository.

State assumptions explicitly. If the exact URL, account role, test fixture, or
deployment environment cannot be established, mark the affected check
\`UNVERIFIED\` rather than inventing it.

## Write 5-12 executable steps

Keep the checklist between **5 and 12 steps**. Longer checklists do not get run;
combine equivalent states or remove checks already proven by automation.

Every step must contain all three parts:

1. **Action** — exactly what the human does.
2. **Expected** — the user-visible result that means the behaviour works.
3. **Failure signal** — the observable result that means it does not.

Include all setup needed to reproduce the check: exact URL or command, viewport,
theme, login state and role, test data, feature flag, environment, and expected
output or status code. Prefer this:

\`\`\`markdown
1. **Keyboard-open the details panel** — At
   \`http://localhost:3000/orders/ord_failed\`, use a signed-in support account,
   set the viewport to \`1280x800\` in light theme, press \`Tab\` until "Details"
   is focused, then press \`Enter\`.
   - **Expected:** The panel opens, focus moves to its heading, and the failed
     payment reason is readable without a mouse.
   - **Failure signal:** The panel stays closed, focus disappears or remains
     behind it, or the reason is clipped.
\`\`\`

Reject implementation-detail checks such as "the component has class
\`text-orange-500\`" or "the handler calls \`refreshToken()\`". Those belong in
automated tests. Ask whether assistant messages are visibly orange, whether the
session survives refresh, or whether the command returns the documented output.

## Cover the boundaries that matter

Select boundaries supported by the changed surface; do not mechanically include
irrelevant checks. Cover the happy path plus the highest-risk adjacent states.

For browser and UI changes, check as applicable:

- Empty or absent data, loading, failure, retry, and permission-denied states.
- Keyboard-only operation, visible focus, focus movement, and Escape behaviour.
- A narrow mobile viewport and the normal desktop viewport.
- Light and dark themes; reduced motion for animation or transitions.
- Refresh, browser back/forward, and a direct deep link in a new tab.
- First and last items, long text, overflow, and disabled controls.

For CLI or scripts, check clean and invalid input, exit status, stdout versus
stderr, non-interactive use, help text, and first/last or empty results.

For APIs and backends, check the documented success response, malformed input,
missing data, authentication and authorization, idempotency or retry behaviour,
and a downstream failure when safely reproducible.

For deployments, check the intended environment, version or commit, health,
configuration and secrets presence without exposing values, rollback signal,
and one real user path through the deployed service.

For docs and content, follow the instructions from a clean starting point,
verify links and commands, inspect narrow rendering where relevant, and confirm
examples match current product language and output.

## Treat evidence honestly

A screenshot proves appearance at one instant. It does **not** prove that a
timer advances, focus moves, a disclosure persists after refresh, keyboard
navigation works, or a failed request is handled. Require observation over time,
interaction, refresh, or controlled failure for those claims.

Classify every completed check separately:

- \`VERIFIED\` — the action ran and the expected result was directly observed.
- \`FAILED\` — a failure signal was observed, with concise reproduction details.
- \`UNVERIFIED\` — the action did not run or evidence is insufficient; state the
  blocker, such as missing access, unavailable server, or absent test data.

Never convert partial evidence into success. "The page loaded before the server
went down" does not verify error handling. "A screenshot looks correct" does
not verify focus or persistence.

## Report the result

Lead with the automated-check report, then the numbered human checklist. After
execution, summarize the evidence under \`VERIFIED\`, \`FAILED\`, and \`UNVERIFIED\`.
Keep an empty category visible as \`None\` so the result cannot be misread.

End with exactly one disposition:

- **Ready to ship** — required automation passed and all release-critical human
  checks are \`VERIFIED\`.
- **Fixes required** — automation failed or any release-critical behaviour is
  \`FAILED\`.
- **Partially verified** — completed checks passed, but non-critical checks
  remain \`UNVERIFIED\`.
- **Blocked on human access** — release-critical checks require access, account
  roles, credentials, devices, or environments the agent does not have.

Name the failed or blocked step beside the disposition. Do not end with "and
then it worked" or leave the ship decision implicit.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Human starts testing while CI is red | Automated gate was skipped | Run and report real project commands first; stop on failure |
| Checklist says "check the page" | Changed surfaces were not researched | Read the diff, routes, tests, commands, and deployment config |
| Step can be interpreted several ways | Environment or data is missing | Specify URL/command, viewport, theme, login role, and fixture |
| Check asserts a CSS class or function call | Implementation detail replaced behaviour | Describe what the user sees or can accomplish |
| Happy path passes but release still breaks | Boundaries were omitted | Add the highest-risk empty, error, permission, input, or navigation state |
| Screenshot is accepted as interaction proof | Static evidence was overclaimed | Exercise time, focus, persistence, refresh, and failures directly |
| Unavailable server appears under passed checks | Statuses were collapsed | Separate \`VERIFIED\`, \`FAILED\`, and \`UNVERIFIED\` |
| Nobody executes the checklist | It became a test plan | Keep only 5-12 high-information steps |
| Report ends without a ship decision | Evidence was listed but not resolved | End with one explicit disposition |
| Checklist duplicates adversarial diff review | Wrong skill boundary | Use \`red-team-this\` for assumptions; verify finished behaviour here |

## Worked example

\`SIMULATION.md\` shows this skill firing on a mixed browser and CLI change: seven
human steps, one \`UNVERIFIED\` check, and a \`Partially verified\` disposition.
`,ze=`---
name: manager-children
description: Coordinate implementation waves through separate OpenCode TUI workers in isolated git worktrees and cmux workspaces. Covers ownership boundaries, cold-start assignment packets, status files and heartbeats, PR-based delivery, monitoring, sequential merge gates, and the critical fact that standalone children do not automatically resume the manager. Use when the user says "make this session a manager", "spin up workers", "parallel children", "separate cmux workspaces", "fire and forget", or asks one parent to manage several implementation agents.
metadata:
  tags: "subagents, worktrees, planning"
---

# Manage standalone OpenCode workers honestly

Use this skill when implementation belongs in several persistent OpenCode TUIs,
branches, and worktrees. The current session is the manager: it defines waves,
assigns disjoint ownership, reviews results, and controls integration. Children
implement one bounded assignment each.

Use \`build-waves\` instead when one parent should retain all coherent writes and
background \`task\` children only compress research. Use \`session-handoff\` for one
standalone child and \`worktree-up\` for the full worktree safety procedure.

## Continuation contract

Do not confuse child persistence with manager persistence.

\`\`\`text
child TUI --writes--> .agent-status.json
          --pushes--> branch / PR
          --alerts--> cmux notification

manager --when a turn starts--> reads durable state, reviews, merges, dispatches
\`\`\`

A standalone child in another cmux workspace cannot resume or call the manager
merely by writing a file, pushing a branch, changing a cmux badge, or running
\`cmux notify\`. The notification alerts the human; it is not an OpenCode prompt.
The live tracker is also display-only.

"Fire and forget" therefore means the child keeps working after the manager's
turn ends. It does not mean the manager keeps executing unattended.

The manager gets another turn only through a real inbound wake channel:

- the user sends or resumes a message;
- the host delivers an in-process background \`task\` result to the parent; or
- an external supervisor explicitly prompts the manager session.

This skill does not implement the third mechanism. Never claim full unattended
wave progression unless a tested supervisor exists. Such a supervisor must know
the exact parent session, prove it is idle, deduplicate completion events, and
serialize prompts. Posting blindly can race a running turn or lose work.

## Optional wake strategies

Use the default attended workflow unless the user explicitly accepts wake-up
risk. There are four practical levels:

1. **Human wake, recommended.** Children run \`cmux notify\`; the user sends
   "continue" when ready. This is simple and honest. The durable plan makes the
   resumed turn deterministic.
2. **Exact-surface CMUX injection, best effort.** Capture the manager surface
   UUID at dispatch and let one designated child type a unique resume message
   into that surface after delivery. This is easy, but CMUX cannot prove the
   OpenCode turn is idle. Input can race a running turn, remain in the composer,
   target a closed surface, or be submitted twice.
3. **Same-server supervisor, robust but not simple.** A separate process watches
   status files, deduplicates terminal phases, confirms the manager session is
   idle on the same OpenCode server, and sends one serialized prompt through the
   session API. Cross-process status is not authoritative, so every participant
   must use that same server.
4. **One-shot background timer chain, useful for recurring checks.** Launch one
   read-only background \`task\` child that waits five minutes, inspects one
   worker, and returns. Its host-delivered result is a real parent wake channel.
   If work is still active, the resumed manager captures a fresh baseline and
   launches exactly one replacement five-minute timer. Repeat until the worker
   is delivered or blocked.

Do not fan out 5-, 10-, and 15-minute timers in advance. Overlapping timers cost
more, wake the manager with obsolete baselines, and continue reporting after an
earlier timer already triggered integration. The chain keeps only one pending
timer and refreshes its evidence on every manager turn.

Timer prompts must carry a freshness baseline. Before launch, record:

\`\`\`text
dispatched_at: 2026-08-21T23:40:00Z
baseline_status_updated_at: 2026-08-21T23:30:02Z
baseline_pr_head: 177421a
\`\`\`

After the delay, a timer may report \`READY FOR MANAGER REVIEW\` only when all of
these are true:

- \`.agent-status.json.updated_at\` is later than \`dispatched_at\`;
- the worker reached the expected terminal phase after dispatch;
- the local branch and remote PR head agree; and
- current CI results validate that exact PR head.

An old \`done\` record and green checks on the baseline SHA are stale evidence,
not readiness. The timer must report \`STALE: no post-dispatch transition\` and
include both timestamps and SHAs. On a non-terminal result, the manager launches
one new five-minute timer with the just-observed timestamp and SHA as its
baseline. If the PR is already merged, report \`SUPERSEDED: already merged\` with
the merge commit. A deleted remote feature branch is expected cleanup after
merge and must not be misreported as \`NOT READY\`.

For an explicitly accepted best-effort wake, capture the UUID rather than a
renumberable \`surface:N\` reference:

\`\`\`bash
cmux --json --id-format both identify
\`\`\`

Give the UUID only to one designated waker. After its branch is pushed and PR
state is recorded, it may run once:

\`\`\`bash
cmux send --surface "$MANAGER_SURFACE_UUID" -- \\
  "Worker task-slug reached pr-open. Resume from durable manager status."
cmux send-key --surface "$MANAGER_SURFACE_UUID" enter
\`\`\`

Record a wake token before sending so retries do not duplicate the message. If
the command fails or idle state is uncertain, fall back to \`cmux notify\` and
human wake. Never give every parallel child permission to submit independently;
simultaneous completion would create competing manager turns.

## 1. Make the manager durable

Before launching workers:

1. Write a plan file with wave order, decisions, ownership, dependencies,
   verification commands, and the next resume action.
2. Mirror the plan in \`todowrite\`, including review, integration, and final
   verification. Keep exactly one manager action active.
3. Record child workspace, worktree, branch, task slug, and expected artifact.
4. State which events require a user decision and which the manager may resolve.

The plan file and task list are the resume protocol after a pause, compaction,
model change, or application restart. Chat memory is not durable orchestration.

## 2. Cut waves on ownership

Each child must own a complete, bounded artifact and a known file set. Parallel
children may read shared files but must not edit the same file, lockfile,
migration, generated output, fixed port, or database.

If two tasks may touch one integration seam, sequence them or assign that seam
to the manager. Cap a wave at about five children; do not manufacture
parallelism from tightly coupled work.

## 3. Create isolated worktrees

Fetch first and branch from the current remote default branch, never a stale
local checkout. Worktrees are siblings of the repository.

\`\`\`bash
git -C /absolute/repo fetch origin
git -C /absolute/repo worktree add \\
  /absolute/repo.worktrees/task-slug \\
  -b feat/task-slug origin/main
\`\`\`

Use the repository's actual default branch. Verify the path, branch, and clean
status before allowing edits. Follow \`worktree-up\` for ignored environment files,
dependency installation, fixed ports, and cleanup.

## 4. Launch persistent children without stealing focus

Ask for the model if the user did not specify one. Use \`--auto\` only when the
user explicitly authorized automatic permission approval.

\`\`\`bash
cmux workspace create \\
  --name "Child: Task Name" \\
  --cwd "/absolute/repo.worktrees/task-slug" \\
  --command "opencode --auto -m openai/gpt-5.6-sol" \\
  --group workspace_group:2 \\
  --group-placement end \\
  --focus false
\`\`\`

Resolve the new workspace and terminal surface by title. Re-resolve them after
a cmux restart; short numeric references are not stable.

## 5. Send one cold-start assignment

Every assignment must contain:

1. Exact repository, worktree, and branch.
2. Objective, owned files, forbidden files, and concurrent workers.
3. Settled contracts and explicit non-goals.
4. Permission posture and exact model.
5. Required tests and the definition of done.
6. Commit, push, and PR rules. Children never push the default branch.
7. The reporting protocol below.

Require \`.agent-status.json\` at the worktree root and ensure it is gitignored:

\`\`\`json
{
  "task": "task-slug",
  "phase": "assigned",
  "branch": "feat/task-slug",
  "pr_url": null,
  "summary": "Assignment received",
  "blockers": [],
  "updated_at": "2026-08-21T12:00:00Z"
}
\`\`\`

Allowed phases are \`assigned\`, \`working\`, \`verifying\`, \`pushed\`, \`pr-open\`,
\`blocked\`, and \`done\`. The child must obtain \`updated_at\` by running
\`date -u +%Y-%m-%dT%H:%M:%SZ\`, update at every phase change, and heartbeat at
least every ten minutes. It should mirror the phase with \`cmux set-status\` and
notify on \`done\` or \`blocked\`.

The assignment ends with: print a concise summary and stay available for
follow-up. A successful launch command is not proof that the prompt arrived;
confirm the workspace metadata or first status record.

## 6. Monitor durable signals

Use this order:

1. \`.agent-status.json\` phase, heartbeat age, and blockers.
2. Git branch status, pushed commits, PR state, and CI.
3. Child screen only when status is stale or contradictory.

Do not continuously scrape TUI screens. A status file unchanged for more than
15 minutes is suspicious; inspect the worktree and screen, then nudge or resume
the child. A \`done\` badge without a pushed branch or PR is not delivered work.

An optional dashboard may watch the status files, but it does not wake the
manager. Leave user-owned monitor surfaces open until the user closes them.

## 7. Resume the manager deterministically

At the beginning of every resumed turn:

1. Read the plan file and \`todowrite\` before relying on conversation memory.
2. Read every active \`.agent-status.json\`.
3. Fetch remote branches and inspect PR checks.
4. Reconcile completed artifacts against ownership and shared contracts.
5. Continue the next queued manager action without asking for permission unless
   a real product, safety, or destructive decision is unresolved.

If no child is ready, report that workers continue independently and end the
turn. Do not busy-wait or pretend the manager remains scheduled.

## 8. Integrate one branch at a time

Review each diff before integration. Merge or squash one PR, run the repository's
full verification suite, then proceed to the next. Resolve conflicts
semantically and search for conflict markers. Never let a child bypass failed
checks, branch protection, or the manager's review gate.

After the wave is green, update the durable plan and immediately dispatch the
next wave when the current turn is active. Clean worktrees and branches only
after merge and only when no follow-up session needs them.

## Failure modes

| Symptom | Cause | Correct response |
|---|---|---|
| Manager stops after dispatch | Standalone children cannot wake it | Wait for a real inbound turn; resume from durable state |
| Notification appears but no manager action follows | \`cmux notify\` targets the human, not OpenCode | Do not advertise it as an automation callback |
| Two children edit one seam | Wave was cut by feature labels, not ownership | Stop one writer and sequence integration |
| Tracker says done but no PR exists | Status is self-reported, not delivery proof | Inspect git and require push/PR evidence |
| Child silently works in the wrong checkout | Launch used an implicit directory | Relaunch with absolute worktree and branch |
| External wake starts duplicate turns | Supervisor did not check idle/deduplicate | Disable it until serialization is proven |
| Timer says ready while worker is still fixing | It trusted a pre-dispatch \`done\` record or baseline CI | Require post-dispatch timestamp and exact-head checks |
| Several timers wake for one worker | The manager pre-scheduled 5/10/15-minute checks | Keep exactly one five-minute timer; replace it only after its result |
| Later timer says merged work is not ready | It requires a feature branch that was deleted after merge | Report \`SUPERSEDED\` from PR state and merge commit |
| Manager loses the next action after compaction | Queue existed only in chat | Restore the plan file and synchronized task list |

## Worked example

\`SIMULATION.md\` shows two CMUX workers continuing after the manager pauses, then
the manager resuming from status files after a genuine user turn.
`,Ye=`---
name: native-worktree-subagents
description: Run mutating OpenCode Task children in isolated sibling Git worktrees while preserving native parent-child lineage and hand-back. Covers Plan deny inheritance, worktree containment, absolute-path prompts, preflight guards, disjoint ownership, and reviewing child results before merge. Use when the user says "give the child its own worktree", "run this as a Task subagent in a separate branch", or "delegate this safely to a Task child".
metadata:
  tags: worktrees, subagents
---

# Run native worktree subagents

Use native OpenCode Task children when delegated work must retain \`parentID\`,
sidebar visibility, foreground/background behavior, and result hand-back. Give
every mutating child a sibling Git worktree and branch created from fresh
\`origin/main\`.

## Prove the parent can delegate safely

Before launch, confirm the parent is a fresh Build-only session. A parent that
previously activated Plan can carry historical deny rules into new children even
after Build restores the parent's own tools. If the child cannot run the
preflight below, stop instead of substituting an independent root session.

## Give the child an unambiguous boundary

The child session still belongs to the parent's OpenCode directory. Granting an
external directory permission permits file access; it does not change relative
path resolution, default shell CWD, LSP/VCS/snapshot scope, or event directory.
Every child prompt must therefore state:

- the exact absolute worktree path and branch
- that edits are allowed only inside that path
- that every Bash call sets \`workdir\` to that path or uses \`git -C <absolute-path>\`
- that every read, edit, and patch uses an absolute path inside the worktree
- explicit file ownership, non-goals, verification commands, commit/push
  instructions, and the required final report

Require this guard before edits, tests, commit, and push:

\`\`\`bash
pwd
git rev-parse --show-toplevel
git status --short --branch
\`\`\`

The child must stop without mutation unless both \`pwd\` and the Git top-level
equal the assigned worktree. It must never fall back to the parent checkout,
weaken filesystem permissions, force-push, or push the default branch.

## Parallelism requires disjoint ownership

Launch native Task children in parallel only when their file ownership and
shared resources do not overlap. A shared lockfile, migration, port, generated
artifact, or integration file makes work concurrent in appearance but serialized
in reality. Give the shared boundary to one child or the parent.

After launch, do not duplicate a child's work. Review every child diff and
verification result before presenting or merging its PR.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Child edits the parent checkout | Relative paths resolved in the parent directory | Require the absolute worktree path and run the guard before mutation |
| Child cannot run a tool after switching to Build | A historical Plan deny was inherited | Stop and create a fresh Build-only parent rather than weakening rules |
| Two children conflict despite separate branches | Ownership or a shared resource overlapped | Sequence the work or assign the shared boundary to one owner |
| Child finishes but its result is unclear | Prompt omitted deliverable or verification requirements | State the final report, owned files, and exact commands before launch |
| Parent repeats child work | Background launch was treated as completion | Wait for the native hand-back and review the child output |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
a request to isolate a Task child in its own worktree, answered with the
preflight check, the assigned worktree and branch, and the ownership boundary
stated in the launch prompt.

For a child that updates only a component, assign one absolute worktree, name
the component and tests it owns, prohibit lockfile changes, require its guard
output before edits, and require the focused test command plus a concise diff
summary at hand-back.
`,Xe=`---
name: parallel-research-handoff
description: Research several independent feature ideas in parallel with read-only subagents, compile the findings into self-contained handoff prompts, and fire those prompts off as parallel agent sessions in fresh git worktrees. Use when the user drops a list of 2+ unrelated tasks and wants them researched and then handed to other agents, says "research these with subagents", "spin these up in parallel", "give me prompts I can paste into other agents", "use N worktrees", or asks whether many subagents are good for research.
metadata:
  tags: "subagents, research, worktrees"
---

# Parallel research → handoff prompts → multi-session fire-off

Three phases, strictly ordered. The value is concentrated in phase 2: a handoff
prompt that has already closed the decisions and pre-answered the API questions
turns a 40-minute exploratory session into a 10-minute implementation session.

For the *downstream* half — status protocols, live tracking, merge waves — see
the \`manager-children\` skill. This skill covers the upstream half: finding out
what is true, and writing it down so nobody has to find out twice.

---

## Phase 1 — Parallel read-only research

### When parallel subagents actually pay

Fan out when the questions are **independent, read-only, and each needs >5 tool
calls**. Each subagent burns its own context on greps, file reads, and API
probes, then returns a page of distilled findings — your context holds N reports
instead of N exploration transcripts. That compression is the entire point.

Do **not** fan out when:

- One question's answer determines the next one's shape (sequential dependency).
- The work mutates shared state (two agents writing the same file, racing on a port).
- It is a needle lookup — a single \`grep\` beats a subagent's startup cost.

Rule of thumb: one subagent per task in the user's list, launched in a single
message with multiple tool calls so they run concurrently.

### Writing a research prompt

Read-only is a hard constraint, stated twice (top and bottom): *"Do NOT write or
edit any files. Read-only research."* Otherwise a capable subagent will start
implementing.

Ask for a **numbered list of specific questions**, not "research X". The
difference in output quality is large. Cover:

1. Structure — entry points, layout, where state lives, file inventory with roles.
2. Prior art — does the mechanism already exist in some form? Grep the obvious
   nouns and report every hit with \`file:line\` and what it means.
3. The nearest existing analogue — "summarize the full pattern for feature Y,
   which is the closest thing to what we want". This is the highest-value
   question in the list; the implementing agent will copy that pattern.
4. Concrete integration points — which module, which route, which line.
5. Live API truth — if a server, container, or CLI is reachable, curl it. See below.
6. Testing conventions — the test runner's environment, what it can and cannot
   do, and one representative test file reproduced in full.
7. Explicit gap list — "what does NOT exist yet".

Always demand \`file:line\` references and verbatim API shapes. Prose summaries
decay into hallucination once they cross a context boundary; \`setup.ts:2018\`
does not.

### Probe the live system, not just the source

The single highest-leverage instruction: *"If a live server is reachable at
\`<url>\`, GET \`/openapi.json\` (or \`/docs\`) and report the exact request/response
schemas verbatim."*

This is how you discover things the source tree cannot tell you — that an
endpoint exists but only mutates at creation time, that a config list is
replaced wholesale rather than merged, that the three feature flags gating your
whole feature are all \`false\` in this deployment. Those findings change scope.
Restrict subagents to GETs.

---

## Phase 2 — Compile findings into handoff prompts

A good handoff prompt is **decision-closed and re-derivation-proof**. The
receiving agent should never need to answer a question you already answered.

### Mandatory sections

1. **Task line + branch + state.** "Branch \`X\` is already checked out in this
   worktree, deps are installed, and typecheck/test/build are green at baseline
   (N tests)." A known-good baseline means the agent's first red test is
   unambiguously its own fault.
2. **Docs to read first** — the repo's own conventions files, by path.
3. **\`PRE-RESEARCHED — DO NOT RE-DERIVE:\`** — the compiled findings, every one
   carrying \`file:line\`. This is the bulk of the prompt and the reason it works.
   Include the negative findings ("no dialog primitive exists anywhere — you are
   building the first one"), which are as expensive to establish as the positive
   ones and are the ones agents most often get wrong.
4. **Decisions already taken, with rationale.** If you asked the user a scoping
   question, restate the answer as a directive plus the *why*, so the agent does
   not relitigate it: "SCOPE IS DECIDED: GLOBAL ONLY … rationale: the upstream
   API cannot mutate X mid-run (verified against openapi.json), so a
   per-conversation toggle would be a confusing half-feature."
5. **Gotchas, labelled.** The things that will silently no-op. Give each its own
   \`GOTCHA:\` line.
6. **Numbered build steps**, each naming the file to create and the existing
   file to model it on.
7. **Explicit out-of-scope list with reasons**, phrased as "list as follow-ups in
   the PR body, do not build". Without reasons, agents relitigate; with reasons,
   they comply.
8. **Constraints** — dependency policy, testid naming, comment style, styling
   tokens. Quote the repo rule with its \`file:line\`.
9. **Verification** — exact commands, exact test file to add, which existing test
   to model it on, and any environment limitation ("the runner is
   \`environment: node\`, so NO component rendering").
10. **\`SHARED-RESOURCE RULE:\`** — see below.
11. **Report-back contract** — what you want in the final message.

### The shared-resource rule

Parallel agents in sibling worktrees collide on anything the filesystem or the
OS shares: fixed ports, bind-mounted state dirs, a single dev database, docker
compose project names, global caches.

Enumerate the conflicts in *both* prompts, name the sibling worktree and its
branch, and state the check:

> Another agent is working in a sibling worktree at \`../<other>\` on branch
> \`<branch>\`. \`docker compose up\` binds fixed ports (8010, 3210) and bind-mounts
> \`./.state\` — only ONE worktree may run the stack at a time. Tiers 1-3
> (typecheck/test/build) need no stack. Before running e2e or \`docker compose
> up\`, check whether the stack is already running (\`docker ps\`, \`lsof -i :8010\`)
> and do not start a second one.

Steer both agents toward the stack-free verification tiers so the contended
resource is needed briefly, at the end, by one agent at a time.

### Prompt hygiene

- Plain ASCII arrows (\`->\`) and quotes. Prompts get passed through shells,
  \`cat\`, and terminal emulators; smart quotes and box-drawing characters
  survive none of that reliably.
- Put each prompt in its own file. Multi-line text through a \`--command\` flag is
  fragile; a file is diffable, re-runnable, and reviewable.
- Store prompts *outside* every git working tree so no worktree starts dirty.
- Show the prompts to the user before firing. They are the last cheap moment to
  correct scope.

---

## Phase 3 — Fire off the sessions

### Worktrees

\`\`\`bash
cd <repo>
git worktree prune          # stale entries accumulate, especially from containers
git fetch origin

WT=<repo-path>.worktrees    # sibling of the repo, outside every working tree
mkdir -p "$WT/prompts"
git worktree add -b feat/<a> "$WT/<a>" origin/main
git worktree add -b feat/<b> "$WT/<b>" origin/main
\`\`\`

Branch from \`origin/main\`, not local \`main\`, so a stale checkout does not become
two stale branches.

### Install deps in parallel, then prove the baseline

\`\`\`bash
( cd "$WT/<a>" && npm ci > /tmp/a.log 2>&1 && echo "a: OK" ) &
( cd "$WT/<b>" && npm ci > /tmp/b.log 2>&1 && echo "b: OK" ) &
wait
\`\`\`

Then actually run typecheck + test + build in at least one worktree before
launching. Fresh installs fail in ways that look like agent errors later —
blocked postinstall scripts, missing native binaries, lockfile drift. Ten
seconds here saves an agent twenty minutes of debugging someone else's problem.
Quote the resulting test count in the prompts.

### Launch

\`\`\`bash
cmux workspace create --name "<a>" --cwd "$WT/<a>" --focus false \\
  --command "opencode --model <provider/model> --prompt \\"\\$(cat $WT/prompts/<a>.md)\\""
\`\`\`

- \`--focus false\` — never steal focus.
- Interactive TUI (not \`opencode run\`) so the user can steer mid-flight.
- \`--prompt "$(cat …)"\` — the file indirection keeps multi-line text intact.
- Verify the model id exists first: \`opencode models | grep <name>\`.
- Confirm launch with \`ps aux | grep opencode | grep <worktree>\`; the full prompt
  should appear in the process args.
- \`cmux notify\` when both are up.

### Before you fire, offer two choices

- **Plan mode or not?** Agents launched this way start editing immediately. Ask
  whether they should present a plan first.
- **PR or local commit?** The prompts as written push a branch and open a PR.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Agent re-greps everything you already researched | Findings summarized as prose, no \`file:line\` | Cite lines; add \`DO NOT RE-DERIVE\` |
| Agent relitigates a settled scope decision | Decision stated without rationale | State the why, and the evidence behind it |
| Agent builds an out-of-scope item | Out-of-scope list had no reasons | Give each exclusion a one-line reason |
| Both agents hang on a port | Shared-resource rule missing from one prompt | Put it in every prompt, name the sibling |
| Agent's first test run is red | Baseline never verified | Run typecheck/test/build before launching |
| Prompt arrives mangled | Smart quotes / multi-line through a flag | ASCII only, prompt in a file |
| Subagent starts editing during research | Read-only stated once, in the middle | State it at the top and the bottom |
| Feature ships but does nothing at runtime | Gating flags never probed | Curl the live API, not just the source |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
two features researched in parallel, worktrees cut and baselined, and a handoff
prompt shown to the user — stopping at the two checkpoints rather than firing.
`,Qe=`---
name: red-team-this
description: Argue against a plan, design, or diff the agent just produced, switching sides and grounding every objection in file:line, command output, or a doc URL. Use when the user says "red team this", "argue against it", "attack this plan", "poke holes in this diff", "what would go wrong", "convince me not to", or wants an adversarial review of work the agent itself authored.
metadata:
  tags: "critique"
---

# Red team this

You are no longer the author. **Switch sides explicitly**, out loud, in the first
line of the output:

> Red-teaming the plan above. I am arguing against it.

The failure this skill exists to prevent is the author reviewing their own work
and finding it good. A model asked to "check this plan" defends it, because the
reasoning that produced it is still in context and still feels correct. Naming
the side-switch is what breaks that.

**Do not re-litigate the plan's merits.** Every sentence that begins "to be
fair, the plan does correctly…" is the author leaking back in. The plan's case
has already been made; your job is the case against it. Balance is the user's
job, after they have both sides.

**Prefer running as a sub-agent.** Dispatch the red team into a fresh context
holding only the artifact — the plan text, the diff, the design doc — and not
the reasoning that produced it. An agent that never saw the plan being built has
no sunk cost in it and will find objections the authoring context cannot see. Do
this by default for anything larger than a small diff.

---

## The six objection classes

Work all six. Each is a different failure, and skipping one is how the expensive
one gets missed. Say explicitly when a class yields nothing — "no hidden
coupling found" is a finding.

**1. Wrong problem.**
The plan solves something adjacent to the actual complaint. The user reported
slow page loads; the plan adds a cache to a query that takes 4ms. Check the plan
against the original problem statement, quoted verbatim.

**2. A cheaper alternative exists.**
Same outcome, materially less work or less new surface area. A config change
instead of a new module. An existing library already in \`package.json\`. Deleting
the feature that made this necessary. Name the alternative concretely and state
what it costs relative to the plan.

**3. Hidden coupling.**
The change reaches further than the plan claims. Other callers of the function
being modified, a shared type, a serialised format someone else deserialises, a
database column another service reads, an event contract. Find these by
grepping, not by reasoning about them.

**4. Operational cost.**
What this costs *after* it ships and forever after: a new deploy dependency, a
new secret to rotate, a background job that can now back up, a new failure mode
with no alert on it, on-call surface. Cost-to-build is visible in the plan;
cost-to-run is where the plan is usually silent.

**5. Reversibility.**
How expensive is undoing this? A pure code change is cheap. A data migration, a
published API, a changed on-disk format, an external integration, anything that
generates rows other systems now depend on — these are one-way doors. Say which
door this is. One-way doors deserve disproportionate objection weight even when
the plan is probably right.

**6. The assumption nobody checked.**
The load-bearing belief the plan rests on that no one verified. "The endpoint
returns sorted results." "This runs single-threaded." "That flag is enabled in
prod." "The table is small." These are the objections that turn out to be
correct most often, because unchecked assumptions are unchecked precisely
because they seemed obvious. Go check one or two of them right now rather than
just naming them.

---

## Evidence is mandatory

**Every objection must cite one of:**

- \`path/to/file.ts:412\` — a specific line
- command output, pasted, with the command that produced it
- a documentation or spec URL

An objection you cannot ground does not go in the main list. Put it in a
separate, clearly labelled bucket:

\`\`\`markdown
## Speculative (unverified — no evidence gathered)

- The rate limiter may be shared across tenants. Did not verify; would need
  access to the prod config to confirm.
\`\`\`

Speculative objections are still worth stating — they are hypotheses the user
may be able to settle in seconds from knowledge you lack. But they must never be
mixed in with grounded ones, because an unsourced objection stated with the same
confidence as a sourced one is how a red team becomes noise and gets ignored
wholesale.

Grounding an objection often means running something. Grep for the other
callers. Curl the endpoint. Read the migration. Do that work; a red team that
only reads the plan is a plausibility check, not a review.

---

## Rank by expected cost

Rate each grounded objection on three axes, then **sort by the product**:

| Axis | Scale | Meaning |
|---|---|---|
| **Likelihood** | 1–5 | How likely is this objection actually right? |
| **Cost if true** | 1–5 | Damage if it is right and ships unaddressed. |
| **Cost to check now** | 1–5, *inverted* | Cheap to check scores high. A 10-second grep is 5; a week of load testing is 1. |

Sorting by likelihood × cost-if-true × cost-to-check-now surfaces the cheap
checks on plausible, expensive problems first — which is the correct order to
spend the user's next ten minutes, and is not the order the objections occurred
to you in.

Present as a table:

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Assumption | Results assumed sorted; \`api.ts:88\` does not sort | \`api.ts:88\` | 4 | 5 | 5 | 100 |
| 2 | Coupling | 3 other callers of \`parseRow\` | \`grep -rn parseRow\` (3 hits) | 5 | 3 | 5 | 75 |

---

## Close with a decision

Two things, both required.

**The cheapest experiment that would kill the plan.** One command, one query,
one five-minute spike — the single highest-information action available. Not a
list; the one. If the plan survives it, the plan is materially stronger; if it
does not, you saved the whole build.

> Cheapest kill: \`grep -rn "parseRow(" src/ | wc -l\` — if this is >1 the
> single-caller assumption in step 3 is false and the plan needs restructuring.
> 10 seconds.

**A verdict**, one of exactly three:

- **proceed** — objections found are low-scoring or already mitigated in the plan.
- **proceed-with-change** — name the specific amendment. This is the most common
  honest verdict.
- **stop** — a one-way door with an unchecked assumption behind it, or the
  cheaper alternative is clearly better.

State the verdict even when it is *proceed*. A red team that never clears
anything is a red team the user learns to discount.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Objections read as hedged suggestions | Never switched sides | State the side-switch in line one |
| "To be fair, the plan does handle…" | Author leaking back in | Delete; the plan's case is already made |
| All six classes produce vague concerns | Read the plan, never ran anything | Grep, curl, read the migration |
| User dismisses the whole review | Speculative mixed with grounded | Separate bucket, clearly labelled |
| Highest-scored objection is unactionable | Ranked by severity alone | Include cost-to-check; cheap checks rank up |
| Review ends with "several concerns" | No verdict | proceed / proceed-with-change / stop |
| Same blind spot as the plan | Ran in the authoring context | Dispatch as a sub-agent with only the artifact |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
a rate-limiter plan attacked with four grounded objections, one speculative
one kept separate, a ranked table and a \`proceed-with-change\` verdict.
`,Ze=`---
name: session-handoff
description: Launch one standalone OpenCode session from another and explicitly carry over its agent or mode, model, reasoning effort, working directory, prompt, permission posture, branch or worktree, and stop condition. Use when the user says "open a new session", "hand this off to a new session", "start a fresh opencode session", "carry this over to another session", or "launch a session in plan mode".
metadata:
  tags: "subagents, planning"
---

# Hand work to a standalone OpenCode session

A new session inherits **nothing automatically**. Carry state through exactly
two channels: CLI flags and the handoff packet. Treat prose such as "stay in
plan mode" as advisory; \`--agent plan\` is the control. There is no \`--mode\`
flag.

Use this for one standalone child session. For a \`task\`-tool subagent, defer to
\`background-subagent\`. For research followed by several sessions, defer to
\`parallel-research-handoff\`. For branch and worktree creation, defer to
\`worktree-up\`; do not duplicate those mechanics here.

## 1. Pick the mechanism first

These mechanisms are not interchangeable:

| Mechanism | Carries history | Separate process | Best use |
|---|---|---|---|
| \`/new\` | No | No | Clear the current TUI into a new conversation |
| \`task\` tool | Only the prompt supplied to the subagent | No | Bounded delegated work whose result returns to the parent |
| \`--session <id> --fork\` | Yes, copied from that session | Yes | Branch a known conversation while preserving its history |
| Fresh \`opencode [project]\` | No | Yes | A steerable standalone TUI the user can watch |
| \`opencode run\` | No, unless continuing or attaching | Yes | Non-interactive work, automation, or a machine-readable event stream |

Choose fresh TUI or \`run\` when the user asks for another standalone session.
Use \`--fork\` only when copied history is the explicit goal. Do not use
\`--continue\` or \`--session\` merely to avoid writing a complete packet.

## 2. Inspect before claiming

Ask the installation what exists:

\`\`\`bash
opencode agent list
opencode models
opencode session list
\`\`\`

The roster is per-install. Built-in primary agents are normally \`build\` (all
tools) and \`plan\` (edit and bash default to ask); built-in subagents normally
include \`general\`, \`explore\`, and \`scout\`. Still inspect rather than assume.

Carry over only facts you can verify. Label every other statement
\`UNVERIFIED\`, including provider behavior, model aliases, accepted reasoning
variants, previous test results you did not witness, and inferred user intent.
Never assert that a setting, plugin, permission, environment variable, or
conversation detail will be inherited.

## 3. Write the handoff packet

A fresh session sees only the prompt. Write a standalone packet that includes:

1. **Absolute repo path.** Name the exact working directory, never \`.\` or "the repo".
2. **Branch and worktree.** State both, plus whether either already exists.
3. **Objective.** Define the deliverable and whether the child plans, researches, or edits.
4. **Progress so far.** Separate completed work from proposed work.
5. **Settled decisions with rationale.** Preserve the why so the child does not relitigate scope.
6. **Ownership.** List files it owns and files it must not touch; name concurrent agents.
7. **Requested runtime.** Record the exact agent, model, and provider-specific variant.
8. **Permission posture.** State expected asks and explicit denies; state whether \`--auto\` is forbidden or requested.
9. **Verification.** Give exact commands and known baseline results.
10. **Stop condition.** Say what final artifact or report ends the child's work.
11. **\`UNVERIFIED\`.** List every remaining assumption, or write \`UNVERIFIED: none\`.

Require the child's first reply to restate the repo, branch, agent, model,
variant, permission posture, objective, ownership boundaries, and stop
condition before doing anything. That restatement detects a mangled or stale
packet early.

Store the packet outside every git working tree so no checkout starts dirty:

\`\`\`bash
PACKET_DIR="$HOME/.local/state/opencode-handoffs"
mkdir -p "$PACKET_DIR"
PACKET="$PACKET_DIR/auth-plan.md"
\`\`\`

Write the packet there with the normal file-editing tool. Do not inline a
multi-line packet directly into a launch command. Do not put secrets in the
packet: prompt text becomes a process argument and may be exposed by shell
history or \`ps\`.

## 4. Launch every setting explicitly

Confirm the worktree's branch before any session may edit:

\`\`\`bash
git -C "/absolute/path/to/repo.worktrees/auth-plan" branch --show-current
git -C "/absolute/path/to/repo.worktrees/auth-plan" status --short --branch
\`\`\`

Launch a steerable TUI with the working directory as the positional project:

\`\`\`bash
opencode "/absolute/path/to/repo.worktrees/auth-plan" \\
  --agent plan \\
  --model openai/gpt-5.6-sol \\
  --prompt "$(cat "$PACKET")"
\`\`\`

Launch a non-interactive session with \`run\`:

\`\`\`bash
opencode run \\
  --dir "/absolute/path/to/repo.worktrees/auth-plan" \\
  --agent plan \\
  --model openai/gpt-5.6-sol \\
  --variant high \\
  --prompt "$(cat "$PACKET")" \\
  --title "Plan auth refresh" \\
  --format json
\`\`\`

\`--agent\` sets mode. \`--variant\` is provider-specific reasoning effort; verify
that the selected provider recognizes values such as \`high\`, \`max\`, or
\`minimal\`. \`--thinking\` only displays thinking blocks; it does not enable or
increase reasoning. \`--attach <url>\` connects \`run\` to an existing
\`opencode serve\`; it does not transfer this parent's state.

Do not add \`--auto\` unless the user explicitly asked for it. If requested, say
out loud before launch that it auto-approves permissions that would otherwise
ask. Explicit deny rules still apply under \`--auto\`; it does not erase them.

## 5. Verify the child, not just the command

A successful shell command proves only that a process started. Confirm:

- Its working directory is the absolute worktree path.
- \`git branch --show-current\` in the child matches the packet.
- The selected agent and model match the explicit flags.
- The requested variant appears in the packet and launch command.
- Its first reply restates the packet before planning or editing.
- Its permission behavior matches the requested posture.

Inspecting \`ps\` can prove what was **requested** on the command line, not what a
provider accepted. A provider may ignore an unsupported variant. Mark that
state \`UNVERIFIED\` until the child or provider reports it. Avoid printing the
full process arguments when the packet could contain sensitive information.

## 6. Safety rules

- Never imply automatic inheritance. Name the flag or packet field carrying each setting.
- Never add \`--auto\` by convenience or copy it from another command.
- Never place tokens, passwords, private keys, or sensitive user data in prompts or process arguments.
- Verify the worktree and branch before permitting edits.
- Give parent and child disjoint file ownership, or stop the parent from editing while the child runs.
- Use a fresh session unless copied history is explicitly requested; \`--fork\` changes that guarantee.
- End the parent turn after reporting what launched. Do not start doing the child's assigned work.

## Optional: present it in cmux

cmux is only a presentation wrapper; the bare CLI above remains authoritative:

\`\`\`bash
cmux workspace create --name "auth-plan" \\
  --cwd "/absolute/path/to/repo.worktrees/auth-plan" \\
  --focus false \\
  --command "opencode --agent plan --model openai/gpt-5.6-sol --prompt \\"\\$(cat $PACKET)\\""
\`\`\`

Always use \`--focus false\`; never steal focus. Keep settings in the nested
\`opencode\` command and packet, not in assumptions about cmux.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Child edits when it should have planned | Prompt says "plan" but launch omitted \`--agent plan\` | Relaunch with \`--agent plan\`; prose is not mode control |
| History unexpectedly copied | Used \`--fork\` with \`--continue\` or \`--session\` | Use a fresh TUI or fresh \`run\` without continuation flags |
| Child opens the wrong repo | Relative project path or implicit shell directory | Pass an absolute positional project or \`--dir\` |
| Child lacks crucial context | Packet was conversational shorthand | Rewrite it as a cold-start, decision-closed packet |
| Parent and child overwrite each other | Both own or edit the same files | Assign disjoint ownership and stop one writer |
| \`--auto\` appears to have been inherited | Launch command was copied without review | Remove it unless explicitly requested; announce it when used |
| Secrets appear in shell history or \`ps\` | Secret was embedded in prompt or argument | Remove it and rotate the exposed secret; use a safe external channel |
| Variant is silently ignored | Provider does not recognize the requested effort | Inspect provider support and label acceptance \`UNVERIFIED\` |

References: [CLI](https://opencode.ai/docs/cli/),
[agents](https://opencode.ai/docs/agents/), and
[permissions](https://opencode.ai/docs/permissions/).

## Worked example

\`SIMULATION.md\` in this directory shows the guard firing when prose requests
plan mode but the launch omits \`--agent plan\`, followed by the corrected
standalone launch and the parent's real stopping condition.
`,Je=`---
name: worktree-up
description: Set up a git worktree for new work — sibling <repo>.worktrees/<topic> directory, branch cut from origin's default, dependencies installed, fixed-port collisions checked against worktrees already running the stack. Use when the user says "make a worktree", "worktree up", "spin up a branch", "work on this in a worktree", or when new code is about to be written and the current checkout is a shared branch.
metadata:
  tags: "worktrees"
---

# Worktree up

The *rule* — never write new code directly on a shared checked-out branch — lives
in \`AGENTS.md\`. This skill is the *procedure*.

A worktree gives each line of work its own directory, its own branch, and its
own dirty state, while sharing one \`.git\`. The failure it prevents is two pieces
of work interleaved in one checkout, where \`git stash\` is the only tool left.

\`manager-children\` and \`parallel-research-handoff\` both create worktrees as part
of a larger flow. Both should defer to this procedure for the mechanics.

---

## 1. Orient

Run these before creating anything:

\`\`\`bash
git rev-parse --show-toplevel                       # repo root — you may be in a subdir
git rev-parse --abbrev-ref origin/HEAD              # default branch, e.g. origin/main
git worktree list                                   # what already exists
\`\`\`

If \`origin/HEAD\` is unset (a common state on a fresh clone) it errors. Fix it
once:

\`\`\`bash
git remote set-head origin --auto
\`\`\`

Then **fetch**, always, before cutting the branch:

\`\`\`bash
git fetch origin
\`\`\`

Branching from a stale local \`main\` is how two worktrees start life already
behind and conflicting. Branch from \`origin/<default>\`, never from local.

---

## 2. Naming

Worktrees live in a **sibling** directory of the repo, never inside it — a
worktree nested under the repo shows up as untracked files in the parent and
gets swept into commits and \`rm -rf\` alike.

\`\`\`
~/Documents/Projects/myrepo/                  # the clone
~/Documents/Projects/myrepo.worktrees/        # sibling, holds all worktrees
~/Documents/Projects/myrepo.worktrees/dark-mode/
~/Documents/Projects/myrepo.worktrees/fix-login-412/
\`\`\`

- Directory: \`<repo>.worktrees/<topic>\`, topic in kebab-case. Where an issue
  number exists, the local house convention is \`<topic>-<issue>\` — for example
  \`fix-login-412\`.
- Branch: \`<type>/<topic>\` — \`feat/dark-mode\`, \`fix/login-412\`, \`chore/deps\`.

Directory name and branch topic should match, so \`git worktree list\` and
\`git branch\` read as the same list.

---

## 3. Create

\`\`\`bash
REPO=$(git rev-parse --show-toplevel)
WT="\${REPO}.worktrees"
TOPIC=dark-mode
BRANCH=feat/dark-mode
DEFAULT=$(git rev-parse --abbrev-ref origin/HEAD)   # e.g. origin/main

mkdir -p "$WT"
git worktree add -b "$BRANCH" "$WT/$TOPIC" "$DEFAULT"
\`\`\`

If the branch already exists, drop \`-b\`:

\`\`\`bash
git worktree add "$WT/$TOPIC" "$BRANCH"
\`\`\`

\`git worktree add\` refuses to check out a branch that is already checked out
elsewhere — that refusal is the feature, not an obstacle to work around. If you
hit it, the branch is live in another worktree; find it with \`git worktree list\`.

---

## 4. Install dependencies

**\`node_modules\` is not shared between worktrees.** Nor are \`.venv\`, \`target/\`,
\`vendor/\`, or any other gitignored build directory. A fresh worktree has source
only, and the first command you run in it will fail in a way that looks like a
code error.

\`\`\`bash
cd "$WT/$TOPIC"
npm ci            # or: pnpm install --frozen-lockfile / yarn / uv sync / bundle install
\`\`\`

Then **prove the baseline is green before writing any code**:

\`\`\`bash
npm run typecheck && npm test && npm run build
\`\`\`

A known-good baseline means the first red test is unambiguously yours. Fresh
installs fail in ways that masquerade as your bug half an hour later — blocked
postinstall scripts, missing native binaries, lockfile drift. Note the passing
test count.

Also copy any gitignored local config the project needs — \`.env\`, \`.env.local\`,
credentials files. These live only in the original checkout:

\`\`\`bash
cp "$REPO/.env" "$WT/$TOPIC/.env" 2>/dev/null || true
\`\`\`

Read the copied \`.env\` afterwards: paths inside it are frequently **relative**
and will resolve against the new worktree, which has no state directory. Make
those absolute, pointing back at the original checkout.

---

## 5. Port collisions

**This is where parallel worktrees actually break.** If the project binds fixed
ports — a \`docker compose\` file with \`ports: "3000:3000"\`, a hardcoded dev
server port, a bind-mounted state directory — then **only one worktree can run
the stack at a time**. The second one either fails to bind or, worse, silently
attaches to the first one's services and you debug the wrong process.

Before starting anything that binds:

\`\`\`bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
docker ps
\`\`\`

**If a port is occupied, confirm the PID is yours before assuming you won the
bind.** Other projects on the same machine run the same binaries, and a log line
saying \`server listening\` in your terminal does not prove your process owns the
socket:

\`\`\`bash
lsof -nP -iTCP:3000 -sTCP:LISTEN     # note the PID
ps -p <PID> -o pid,ppid,command      # is this actually your process, in your worktree?
\`\`\`

Options when the stack is already up in a sibling worktree:

- **Stay in the stack-free tiers.** Typecheck, unit tests, lint, and build
  usually need no running services. Do all of that first; contend for the port
  briefly, at the end, one worktree at a time.
- **Run only your layer on a free port.** Point it at the already-running shared
  services rather than starting a second full stack.
- **Wait.** Coordinate rather than racing.

Never start a second stack "just to see". Bind-mounted state directories mean
two stacks can corrupt each other's data, and that failure surfaces hours later.

---

## 6. Report

Give the user the **absolute path** — they will need to \`cd\` there, open an
editor on it, or launch an agent in it:

\`\`\`
Worktree ready:
  path:     /Users/you/Documents/Projects/myrepo.worktrees/dark-mode
  branch:   feat/dark-mode (from origin/main @ a1b2c3d)
  deps:     installed (npm ci)
  baseline: typecheck + 214 tests + build all green
  ports:    3000 in use by PID 4821 in ../other-topic — stack-free tiers only
\`\`\`

---

## 7. Clean up

When the branch is merged or abandoned:

\`\`\`bash
git worktree remove "$WT/$TOPIC"          # refuses if dirty
git worktree remove --force "$WT/$TOPIC"  # only when the dirt is genuinely disposable
git branch -d "$BRANCH"                   # -D if abandoned unmerged
\`\`\`

\`git worktree remove\` deletes the directory including its \`node_modules\`. It
will not delete uncommitted work without \`--force\`; check \`git -C "$WT/$TOPIC"
status\` first.

If a worktree directory was deleted by hand (or lived inside a container that is
now gone), git still lists it as registered. Clear the stale entries:

\`\`\`bash
git worktree prune
git worktree list      # confirm
\`\`\`

Run \`git worktree prune\` before creating new worktrees in any repo that has seen
this. Stale registrations block reuse of the same path.

---

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| New branch is already behind | Cut from stale local \`main\` | \`git fetch origin\`, branch from \`origin/<default>\` |
| \`fatal: ... is already checked out\` | Branch live in another worktree | \`git worktree list\` and go there |
| Worktree files show as untracked in the parent | Created inside the repo | Recreate in the \`<repo>.worktrees\` sibling |
| Every command fails immediately in a new worktree | Deps not installed; \`node_modules\` is not shared | Run the install |
| App starts but reads no config | Gitignored \`.env\` not copied | Copy it; make relative paths absolute |
| Server "starts" but behaves like another branch | Attached to a sibling worktree's stack | \`lsof -nP -iTCP:<port> -sTCP:LISTEN\`, verify the PID |
| Two worktrees corrupt shared state | Two stacks against one bind-mounted dir | One stack at a time; stack-free tiers otherwise |
| \`worktree add\` fails on a path you deleted | Stale registration | \`git worktree prune\` |
| First test run is red on untouched code | Baseline never established | Run typecheck/test/build before editing |

## Worked example

\`SIMULATION.md\` in this directory has a short transcript of this skill firing:
a worktree created and its baseline proven green, then a port collision traced
back to the sibling worktree that actually owns the socket.
`,en=`---
title: Turning a change set into an annotated tree
trigger: what files change
caveat: >-
  One diagram type of the three, and the width check is shown running once
  and passing. In practice the first draft usually fails it and the status
  column has to be re-cut.
---

# Worked example

## user

I'm about to open the PR for the webhook retry work. what files change?

## assistant

A tree, not prose: new-versus-modified is a column, and two of these carry a
trap a reviewer cannot see in the diff.

\`\`\`
notifications-service/
├── src/webhooks/
│   ├── retry.ts                              NEW   pure: backoff calc, no I/O
│   ├── retryQueue.ts                         NEW   the ONLY place that enqueues
│   └── dispatch.ts                           MOD   + retry hook  ← also called by
│                                                     the digest job, which must
│                                                     NOT retry
├── src/config/limits.ts                      MOD   + maxAttempts  ← add to the
│                                                     allow-list in settings.ts
│                                                     or this is INERT at runtime
├── migrations/0043_webhook_attempts.sql      NEW   adds attempts column, no backfill
├── test/webhooks/retry.spec.ts               NEW   table-driven, 14 cases
└── docs/runbooks/webhook-failures.md         ---   discussed, deliberately excluded
                                                    from this PR
\`\`\`

Three things worth your attention before review:

- \`dispatch.ts\` is shared with the digest job. The retry hook fires for both
  unless it is gated, and a retried digest sends duplicate email.
- \`limits.ts\` gains a key that does nothing until it is added to the settings
  allow-list. That is a silent no-op, not a crash.
- The migration adds \`attempts\` with no backfill, so existing rows are \`NULL\`
  and every comparison against them is false.

## tool — bash

\`\`\`
$ python3 - <<'EOF'
L = open('/tmp/tree.txt').read().split("\\n")
print("widest:", max(len(l) for l in L))
EOF
widest: 85
\`\`\`

## note

The status column starts at one offset for the whole tree, chosen from the
longest path — \`migrations/0043_webhook_attempts.sql\` — not per subtree. A
column that shifts between branches reads as carelessness and costs the
diagram its credibility.

\`---\` is a third status meaning "discussed, deliberately excluded". Naming the
exclusion in the tree stops a reviewer asking for it.

Every annotation says something the structure cannot. \`retry.ts NEW new file\`
would be noise; \`pure: backoff calc, no I/O\` is a design decision. Two of the
notes wrap to a second line, and the continuation starts under the comment
column so paths and comments never blur together.

The two \`←\` traps are the whole point. Both are invisible in the diff: a shared
caller that must not inherit the new behaviour, and a config key that is inert
until an allow-list is extended. Each note sits on the line where it bites, not
in a paragraph underneath.

Width is counted in **characters**, not bytes — every box-drawing glyph is
three bytes in UTF-8, so \`wc -c\` lies by a factor of three. 85 clears the
100-column limit that terminals, PR panes and side-by-side diffs all clip at.
`,nn=`---
title: The flag is unset, then set
trigger: kick that off
caveat: >-
  Two runs spliced together to show both branches of the precondition check.
  In one session you get one or the other, and the result lands minutes later
  as an injected message that is not shown here.
---

# Worked example

## user

Our token refresh looks wrong somewhere in \`server/auth/\`. Kick that off in the
background while I finish this migration.

## tool — bash

\`\`\`
$ echo "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"
unset
\`\`\`

## assistant

I can't background it — \`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS\` is unset,
and \`background: true\` fails without it. Two options:

- **Foreground it now.** Same audit, but it blocks this session until it
  returns, which is what you asked to avoid.
- **Restart opencode with the flag set**, then ask again. The flag is read at
  startup, so setting it in this shell will not help the running process.

I have not started the audit either way.

## note

This branch is the reason the skill exists. Silently dropping \`background\` and
running in the foreground is the tempting failure: it looks identical to
success until the session hangs, and the user explicitly asked not to be
blocked.

## user

restarted with the flag. kick it off

## tool — bash

\`\`\`
$ echo "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"
true
$ opencode agent list
general   Multi-step work, edits, running commands
explore   Codebase search and questions about it (read-only)
diagram   Renders Mermaid to SVG or ASCII
\`\`\`

## tool — task

\`\`\`
task(
  description   = "Audit auth token expiry",
  subagent_type = "explore",
  background    = true,
  prompt        = "READ-ONLY. In this repo, audit how auth tokens expire and
                   refresh across server/auth/. Report: where expiry is set,
                   every place it is compared against, whether refresh and
                   access tokens use the same clock source, and any path that
                   can return a token that is already expired. Cite file:line
                   for every claim. End with UNVERIFIED: for anything you
                   inferred."
)

→ ses_abc123
  DO NOT sleep, poll for progress, ask the task for status, or duplicate this
  task's work — avoid working with the same files or topics it is using.
\`\`\`

## assistant

Launched an \`explore\` subagent in the background to audit token expiry across
\`server/auth/\`. I'll report back when it lands. (\`task_id: ses_abc123\`)

## note

The turn ends there. Nothing follows — no "meanwhile, let me take a look at
\`server/auth/session.ts\`", no progress poll, no sleep. Starting the same
investigation to get a head start is the exact duplication the mechanism
exists to avoid, and the tool says so in its own return value.

The prompt is written for an agent with **zero** conversation context. It
restates the repo, the directory, the questions, the citation requirement and
the read-only constraint, because "the thing we were just discussing" means
nothing in a fresh session.

\`explore\` was chosen over \`general\` because the task is read-only. Backgrounding
a \`general\` that edits files is only safe when you are certain you will not
touch the same files while it runs — and here the user is mid-migration.
`,tn=`---
title: A wave boundary, mid-run
trigger: do not stop until it is done
caveat: >-
  One boundary out of six from a run that took hours. The waves before and
  after it, the compaction, and the model change are all elided — this shows
  the loop, not the duration.
---

# Worked example

## user

Migrate the reporting service off the legacy schema. Build all of it, do not
stop until it is done.

## tool — bash

\`\`\`
$ test "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-}" = true && echo ok
ok
$ npm run typecheck && npm test && npm run build
Tests  486 passed (486)
✓ built
\`\`\`

## assistant

Baseline green at 486 tests. Writing the plan file before launching anything —
the parent context is the one thing that cannot be restarted, so the queue has
to live on disk.

\`docs/migration-plan.md\` now holds scope, per-wave ownership, artifact
boundaries, and the exact verification commands. Six waves, cut so no two
tasks touch the same files:

\`\`\`
wave 0  schema + migrations        db/                    done
wave 1  query layer                server/queries/        done
wave 2  report renderers           server/reports/        ← current
wave 3  API surface                server/routes/
wave 4  client                     client/reports/
wave 5  VERIFICATION               planned up front, not cleanup
\`\`\`

All six are in \`todowrite\`, including wave 5. Only wave 2 is marked active.

## note

Wave 5 exists before wave 2 starts. Verification planned after the last edit is
cleanup, and cleanup gets cut when the run gets long. The exit condition is all
planned verification passing, not the last feature file being written.

## assistant

Wave 2 is mine to write. Launching wave 3's research now so it overlaps with
this wave's implementation rather than following it.

## tool — task

\`\`\`
task(subagent_type="explore", description="Research report routes", background=true,
     prompt="READ-ONLY. Inventory every route in server/routes/ that returns
             report data: path, handler, response shape, and which query
             functions it calls. Cite file:line. Do not read server/reports/ —
             another process is editing it. End with UNVERIFIED:.")
→ ses_7c1
\`\`\`

## assistant

Wave 2 complete: eleven renderers moved, \`server/reports/legacy/\` deleted.

\`\`\`
$ npm run typecheck && npm test
Tests  486 passed (486)
\`\`\`

Wave 3's research came back while I was working — the routes inventory found
two endpoints nobody listed in the original scope, both reading the legacy
tables directly. Added to the plan file as wave 3 tasks; the scope grew and
the durable record grew with it.

Marking wave 2 done in \`todowrite\`, wave 3 active, and starting wave 3 now.

## note

No "shall I continue?" here. A progress report is not a handoff of control —
stopping after every wave to ask turns a sustained run back into the series of
mini-projects the skill exists to prevent.

There are exactly three reasons to stop: a real product, scope, safety or
destructive-action decision; a verification failure that must be assessed
before a fix wave is cut; or every wave including verification being green.
Two surprise endpoints are none of those. They are a plan-file edit.

Children explore, the parent writes. Wave 3's research ran read-only, in the
background, against files the parent was not touching, and its only output was
a compressed cited report — the parent kept the cross-wave design and every
edit.

Note what this transcript cannot show. The measured run behind this skill went
7.5 hours and 254 messages, compacted once at 90% context, and changed model
mid-run. It kept its place because the queue was in a file and in \`todowrite\`,
not in the context window. That is the property the boundary above is
protecting, and one boundary cannot demonstrate it.
`,an=`---
title: A claim gets a verified citation instead of a paraphrase
trigger: cite the lines
caveat: >-
  One claim, one citation. A real review would repeat this pattern once per
  finding rather than stopping after the first.
---

# Worked example

## user

Why does an unknown reminder ID get rejected? Cite the lines that prove it.

## tool — bash

\`\`\`
$ rg -n "isValidReminderId" server/routes/sessions.ts
118:  if (!isValidReminderId(reminder)) {
119:    return res.status(400).json({ error: "unknown reminder" });
\`\`\`

## assistant

The prompt route validates the requested reminder ID against the server-owned
catalogue before it ever resolves a body: an ID that fails \`isValidReminderId\`
is rejected with 400 before the trusted text is looked up
(\`server/routes/sessions.ts:118-119\`).

## note

The answer cites the branch that produces the rejection, not the route's
filename or a paraphrase like "there's some validation somewhere." The line
range was read from the actual file, not guessed from the function name.
`,sn=`---
title: Four agents on a multi-tenancy question
trigger: research this properly
caveat: >-
  One prompt is shown in full and the other three are summarised to their
  scope lines. The four reports come back over several minutes and are
  compressed here to the synthesis they produced.
---

# Worked example

## user

We need to add multi-tenancy. Research this properly before we design anything
— I want to know what we already have, what breaks, and what nobody has
thought about.

## assistant

Four axes, split so no two agents read the same files:

1. **Data layer** — schema, migrations, every query that would need a tenant
   filter.
2. **Auth and session** — where identity is established and what it carries.
3. **Background jobs and caches** — the places a tenant boundary is easiest to
   leak across.
4. **Prior art and config** — anything already half-built, plus how tenancy
   would be configured and deployed.

Launching all four concurrently.

## tool — task

\`\`\`
task(subagent_type="explore", description="Multi-tenancy: data layer", prompt="
  READ-ONLY RESEARCH. Do not write or edit any files. Thoroughness: very thorough.

  Context: repo at ./, a single-tenant Node + Postgres app. We are scoping
  multi-tenancy. Three other agents cover auth, jobs/caches, and config —
  restrict yourself to db/, server/models/ and server/queries/, and do not
  read server/auth/ or server/queue/.

  Answer these, in order:
  1. What tables exist, and which hold user-owned data? file:line for the schema.
  2. Which queries would need a tenant predicate? Give a count and the files.
  3. Is there any existing column, index or constraint that could serve as a
     tenant discriminator today?
  4. What does NOT exist yet in this area?

  For every claim give file:line. Deliverable: one markdown section per
  question, answer first then evidence, under 800 words total.
  End with \`UNVERIFIED:\` listing anything you inferred or could not confirm.

  READ-ONLY. Do not write or edit any files.
")

task(subagent_type="explore", description="Multi-tenancy: auth",
     prompt="… restrict yourself to server/auth/ and server/middleware/; do
             not read db/ or server/queue/ …")

task(subagent_type="explore", description="Multi-tenancy: jobs and caches",
     prompt="… restrict yourself to server/queue/, server/cache/ and any
             Redis usage; do not read db/ or server/auth/ …")

task(subagent_type="explore", description="Multi-tenancy: prior art and config",
     prompt="… restrict yourself to config/, infra/, docs/ and the git log; do
             not read application source …")
\`\`\`

## tool — bash

\`\`\`
$ rg -n "tenant|organi[sz]ation" server/models/user.ts db/schema.sql
db/schema.sql:41:  organization_id  uuid  references organizations(id)
\`\`\`

## assistant

**Answer first: the data layer is closer than expected and the cache layer is
the real problem.**

\`db/schema.sql:41\` already carries \`organization_id\` on \`users\`, added in a
2024 migration and never used for isolation. Nine of the eleven user-facing
tables can reach an organization in one join; the two that cannot —
\`audit_events\` and \`uploads\` — are the migration work.

Auth already resolves an organization: \`server/auth/session.ts:88\` puts
\`org_id\` on the session but nothing downstream reads it. So the identity half
is done and the enforcement half does not exist.

**Where the agents disagreed.** The jobs agent reported the queue as
tenant-safe; the config agent reported one shared Redis with no key prefix. I
read both citations — \`server/queue/worker.ts:8\` and \`server/cache/client.ts:5\`
open separate clients against the same \`REDIS_URL\` with no \`keyPrefix\`. The
jobs agent was looking at job *payloads*, which do carry an org id, and missed
the keyspace. The config agent is right; this is the highest-risk finding and
it is not in the database at all.

**What surprised me.** Nobody asked about \`audit_events\`, and it is the one
table with no path to an organization — an audit log that cannot be scoped is
a compliance problem, not a refactor.

\`\`\`
UNVERIFIED:
- Whether the 2024 organization_id backfill covered all existing rows
  (migration 0042 has no backfill step; production data not inspected).
- Whether any customer currently relies on cross-organization visibility.
- Read-replica routing: infra/ references a replica but no config was found.
\`\`\`

## note

Four agents, not two and not eight. Below three, do it yourself; above five the
synthesis costs more than the search saved.

All four went out in a **single message** so they run concurrently. Issued one
after another they would take four times as long and give none of the benefit.

Each prompt names what the agent may *not* read. Without that boundary they all
converge on whatever grep hits first and you pay four times for one answer.

The synthesis is not four reports under four headings. It leads with the
answer, resolves the disagreement by going and reading the cited lines rather
than picking a side, merges every \`UNVERIFIED:\` into one list, and keeps the
\`file:line\` citations so the reader can act without redoing the search.

The one bash call is a spot-check of a load-bearing claim — cheap, and it
catches a confidently-wrong report before it becomes a confidently-wrong answer.
`,on=`---
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

\`\`\`
$ rg -l 'mermaid' --glob '!node_modules' .
docs/architecture.md
$ rg -n 'graph |theme' docs/architecture.md | head -3
12:graph LR
\`\`\`

## assistant

\`docs/architecture.md:12\` uses \`graph LR\` with no theme directive, so I will
match that rather than introduce a second convention.

## tool — mermaid · render_mermaid_ascii

\`\`\`
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
\`\`\`

## assistant

Parses, and the retry edge lands where it should. Written into \`README.md\`
under a new "How ingest works" heading, with the queue's retry ceiling stated
in prose underneath — the diagram shows that retries exist, not that they stop
after five attempts (\`server/queue/worker.ts:31\`).

## tool — bash

\`\`\`
$ cmux markdown open /Users/you/Documents/Projects/app/README.md --focus false
opened
\`\`\`

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
a commit message or an \`AGENTS.md\` would get ASCII because no renderer exists
there at all. And the house style is read from an existing doc first, because
one convention in a repo beats two.

Note what the diagram deliberately does not carry. The retry ceiling is prose,
with a \`file:line\`, because a number inside a diagram rots silently while a
cited one stays checkable.

Rendering to ASCII rather than SVG was a verification step, not the artifact —
the file gets the Mermaid fence. Had this been a static docs-site page instead,
the fence could not be assumed to render at all: Mermaid support depends on
that site's plugin chain, so it has to be tried and looked at before being
relied on.
`,rn=`---
title: Ducks on, then a file written without them
trigger: turn on the ducks
caveat: >-
  Three turns from a six-turn measured run, and nothing here is enforced — the
  ducks held because the rule was stated recently. Behaviour after compaction
  is unverified. See the Reliability section of SKILL.md.
---

# Worked example

## user

turn on the ducks

## assistant

🦆🦆🦆

Ducks are on.

🦆🦆🦆

## user

what's in package.json's scripts block?

## assistant

🦆🦆🦆

Five: \`dev\`, \`build\`, \`preview\`, \`typecheck\`, and \`test\`. \`build\` runs
\`vite build\` and then copies \`docs/index.html\` over \`docs/404.html\`, which is
how the SPA survives a deep link on GitHub Pages.

🦆🦆🦆

## user

write that up as NOTES.md

## tool — write

\`\`\`
NOTES.md
--------
# Scripts

\`build\` runs \`vite build\`, then copies \`docs/index.html\` to \`docs/404.html\`
so a deep link like /s/grill-me resolves on GitHub Pages.
\`\`\`

## assistant

🦆🦆🦆

Written to \`NOTES.md\`.

🦆🦆🦆

## note

Two clauses are doing the work here, and both are easy to miss.

The ducks never appear in \`NOTES.md\`. They are a display convention, so they
stop at the edge of the transcript — anything written to disk, committed, or
put in a PR body is duck-free. That clause also held under measurement — the
file the recorded six-turn run wrote contained zero duck characters.

The assistant also never mentions the ducks, explains them, or apologises for
them. Not in the first reply, not when asked to write a file. Drawing
attention to the convention breaks it.

Note what this example cannot show: that it keeps working. Nothing enforces
any of the above — it is instructions, re-read by a model every turn. The
repo ships this skill next to a plugin that does the same job deterministically
precisely to make that contrast measurable.
`,ln=`---
title: Stress-testing a Redis cache plan
trigger: grill me
caveat: >-
  Round 1 only, and its frontier is four questions rather than the eight a real
  design of this size produces. The session continues for three to five more
  rounds before the frontier empties.
---

# Worked example

## user

I want to put a Redis cache in front of \`GET /products\` — it's our slowest
endpoint. Plan is: cache the serialized JSON, 5 minute TTL, invalidate on
write. Grill me on it before I start.

## assistant

Four questions on the frontier. Q5 (key sharding) depends on your answer to
Q2, so it waits for round 2.

❓ **Q1** — **TTL and invalidation together?** You have both a 5-minute TTL
*and* write invalidation. Those solve different problems: the TTL bounds
staleness from writes you *miss*, invalidation removes staleness from writes
you *catch*. Running both is fine, but only if you can say which one is the
correctness guarantee and which is the backstop.

➡️ Invalidation is the guarantee, TTL is the backstop — and set the TTL much
longer, an hour or more. A 5-minute TTL on a working invalidation path just
throws away 90% of your hit rate for a safety net you hope never catches
anything.

---

❓ **Q2** — **What is the cache key?** \`GET /products\` almost certainly takes
query parameters. If the key is the path alone, two users with different
filters get each other's results — that is a correctness bug, not a
performance one.

➡️ Key on the normalized query string, with parameters sorted and unknown
ones dropped. If any response varies by user (pricing tier, locale,
permissions), that dimension has to be in the key too, and you should say so
now rather than discover it in production.

---

❓ **Q3** — **Is the endpoint slow because of the database?** Caching a slow
endpoint helps only if the slowness is in work the cache can skip. If the
2 seconds is serialization or a fan-out to another service *after* the query,
the cache still helps; if it is a missing index, the cache hides a one-line
fix behind a new piece of infrastructure.

➡️ I do not know yet, so I looked. See the tool call below — nothing is
caching this today and the query is unbounded. Answer Q3 with a trace before
committing to Redis.

---

❓ **Q4** — **What happens when Redis is down?** Two options: fail the request,
or fall through to the database. Fall-through is the obvious answer until you
consider that a cache outage then delivers your full uncached load to a
database that has been sized for the cached load.

➡️ Fall through, but behind a circuit breaker and a concurrency limit on the
database path. Unqualified fall-through converts a cache outage into a
database outage, which is strictly worse than serving errors from one endpoint.

## tool — bash

\`\`\`
$ rg -n "cache|redis" server/routes/products.ts
44:  // TODO: cache this
$ rg -n "limit|LIMIT" server/routes/products.ts
(no matches)
\`\`\`

## note

Four questions go out together because all four are answerable now. Q5 depends
on Q2's answer, so asking it in this round would force a hypothetical answer —
and hypothetical answers settle nothing.

Q3 needed a fact about the codebase, not a decision from the user, so it was
looked up rather than asked. Facts are the agent's job; decisions are the
user's.

Every question carries a recommendation. A question without one hands the
thinking back to the user, which is the opposite of the point.
`,dn=`---
title: Verifying a notification settings UI and export-status CLI
trigger: give me QA steps
caveat: >-
  This compact example uses an illustrative application and shows one execution
  report rather than every boundary the repository could support. A real run
  derives commands, URLs, roles, fixtures, and release-criticality from the
  current diff and environment instead of copying these values.
---

# Worked example

## user

The notification preferences change is finished. It adds a browser screen and
an \`export-status\` CLI command. Please give me QA steps before release.

## assistant

I’ll run the repository’s automated gate before assigning manual work. If it is
red, I’ll stop rather than ask you to test a broken build.

## tool — bash

\`\`\`
$ npm run typecheck
> tsc --noEmit

$ npm test -- --run
> vitest --run
Test Files  passed
Tests       passed

$ npm run build
> vite build
✓ built
\`\`\`

## assistant

Automation is green. I’m tracing the changed routes, commands, fixtures, and
deployment requirements now so the checklist uses the real entry points.

## tool — bash

\`\`\`
$ git diff --name-only origin/main...HEAD
package.json
src/cli/export-status.ts
src/routes/settings/notifications.tsx
src/routes/settings/notifications.test.tsx
tests/cli/export-status.test.ts

$ rg -n "notifications|export-status|notification-empty" package.json src tests
package.json:14:    "export-status": "tsx src/cli/export-status.ts"
src/routes/settings/notifications.tsx:18:export const path = "/settings/notifications"
src/routes/settings/notifications.test.tsx:41:fixture: "notification-empty"
tests/cli/export-status.test.ts:27:expect(result.exitCode).toBe(2)
\`\`\`

## assistant

**Automated checks**

| Command | Result |
|---|---|
| \`npm run typecheck\` | \`VERIFIED\` — exited successfully |
| \`npm test -- --run\` | \`VERIFIED\` — test files and tests passed |
| \`npm run build\` | \`VERIFIED\` — production build completed |

Use local data fixture \`notification-empty\`. Start the app with \`npm run dev\`
and keep the CLI in a second terminal.

1. **Open the happy path** — As signed-in user \`qa-member@example.test\`, visit
   \`http://localhost:3000/settings/notifications\` at \`1280x800\` in light theme.
   - **Expected:** Email and push preferences load with labels and current values.
   - **Failure signal:** The route is blank, errors, or shows another user’s values.
2. **Save and refresh** — Disable push, save, then refresh the exact URL.
   - **Expected:** Success feedback appears and push remains disabled after refresh.
   - **Failure signal:** No feedback, duplicate requests, or the old value returns.
3. **Check keyboard operation** — Reload, use only \`Tab\`, \`Space\`, and \`Enter\` to
   change and save a preference.
   - **Expected:** Focus is always visible, follows visual order, and reaches Save.
   - **Failure signal:** Focus disappears, traps, skips a control, or saving needs a mouse.
4. **Check narrow dark mode** — At \`390x844\` in dark theme, open the same deep
   link with the \`notification-empty\` fixture.
   - **Expected:** The empty state is readable with no horizontal scrolling.
   - **Failure signal:** Text or controls clip, overlap, or lose contrast.
5. **Check permission denial** — Sign in as \`qa-readonly@example.test\` and open
   the same URL directly in a new tab.
   - **Expected:** A permission message appears without exposing preference data.
   - **Failure signal:** Preferences render, the page loops, or a raw error appears.
6. **Run the CLI success path** — Execute
   \`npm run export-status -- --user qa-member@example.test\`.
   - **Expected:** One documented status prints to stdout and the exit status is \`0\`.
   - **Failure signal:** Output is ambiguous, written only to stderr, or exits non-zero.
7. **Run invalid CLI input in staging** — With staging credentials, execute
   \`npm run export-status -- --user missing@example.test\`.
   - **Expected:** A concise not-found message goes to stderr and exit status is \`2\`.
   - **Failure signal:** It exits \`0\`, prints a stack trace, or returns another user.

A screenshot can support steps 1 and 4 only. It cannot prove save persistence,
focus movement, permission handling, or either CLI exit status.

## user

Steps 1-6 matched. I could not run step 7 because I do not have staging
credentials. On step 3, focus was visible and Save worked with Enter.

## assistant

**VERIFIED**

- Steps 1-6. Step 2 included refresh persistence; step 3 included keyboard focus
  and activation, not screenshot-only evidence.

**FAILED**

- None.

**UNVERIFIED**

- Step 7: staging credentials were unavailable, so invalid CLI input and exit
  status \`2\` were not observed.

**Disposition: Partially verified.** The completed browser checks and local CLI
success path passed, but staging invalid-input handling remains unverified.

## note

The example stops at the evidence boundary rather than converting missing
staging access into success. Because step 7 is not identified as
release-critical in this illustrative scenario, the disposition is \`Partially
verified\`; if the repository marked it release-critical, the correct disposition
would be \`Blocked on human access\`.
`,hn=`---
title: Two workers continue while the manager pauses
trigger: make this session a manager
caveat: >-
  The transcript shows one dispatch and resume boundary. A real wave includes
  implementation, PR review, sequential integration, and final verification.
---

## user

Make this session a manager and spin up separate workers for API pagination and
permission safety.

## assistant

I will use isolated sibling worktrees and unfocused CMUX workspaces. The workers
can continue after this turn ends, but their notifications cannot resume me. I
will persist the queue so the next real inbound turn can continue deterministically.

\`\`\`text
wave 0  pagination          worker A
        permission safety  worker B
wave 1  integration        manager
wave 2  verification       manager
\`\`\`

## tool — bash

\`\`\`text
workspace:40  Child: Transcript Scale
workspace:41  Child: Permission Safety
\`\`\`

## assistant

Both assignments require \`.agent-status.json\`, ten-minute heartbeats, verified
commits, pushed branches, and PRs. They own disjoint artifacts. I am ending this
turn rather than polling; the children remain active.

## note

This is the important pause. \`cmux notify\` may alert the human, but it does not
create a new manager turn.

## user

Continue the wave.

## tool — read

\`\`\`text
pagination:         phase=pr-open  PR #42  checks=green
permission-safety: phase=working  heartbeat=3m
\`\`\`

## assistant

I resumed from durable state rather than memory. I will review PR #42 now and
leave the second worker running; integration remains sequential.

## note

The genuine user message is the wake channel. The status files tell the resumed
manager exactly what action is safe next.
`,cn=`---
title: A child gets its own worktree before it can edit anything
trigger: give the child its own worktree
caveat: >-
  Shows the preflight and the launch prompt boundary; the child's own guard
  output and final report are not shown here.
---

# Worked example

## user

Delegate the notification badge fix to a Task child. Give the child its own
worktree so it can't touch what I'm editing here.

## tool — bash

\`\`\`
$ git branch --show-current
main
$ git status --short
 M client/pages/Hub.tsx
\`\`\`

## assistant

This parent session is a fresh Build-only session with no prior Plan
activation, so it can delegate safely. I'm creating a sibling worktree from
\`origin/main\` at \`../custom-dca-opencode.worktrees/notification-badge\` on
branch \`fix/notification-badge\`, then launching the child with:

\`\`\`
task(
  description   = "Fix notification badge count",
  subagent_type = "general",
  prompt        = "Absolute worktree: /Users/x/custom-dca-opencode.worktrees/notification-badge
                    on branch fix/notification-badge. Edit only inside that path — never the
                    parent checkout at /Users/x/custom-dca-opencode. Every Bash call must set
                    workdir to the worktree path. Before editing, tests, commit, or push, run:
                    pwd; git rev-parse --show-toplevel; git status --short --branch — and stop
                    without mutating anything unless both equal the assigned worktree. Own
                    client/components/notification-badge.tsx and its test only. Do not touch
                    client/pages/Hub.tsx, which I am editing here. Verify with
                    npm test -- --run tests/notification-events.test.ts, then commit and push
                    the branch. Report the diff summary and test result."
)
\`\`\`

## note

The prompt states the absolute worktree, the branch, the exact file it owns,
the file it must not touch, the required preflight guard, and the verification
command — because a fresh Task child sees only this string, not the
conversation above it.
`,un=`---
title: Two features researched, then handed off
trigger: research these with subagents
caveat: >-
  Phase 1 takes minutes and one handoff prompt is shown as a skeleton rather
  than in full — a real one runs to two or three hundred lines. Both user
  checkpoints are shown; neither may be skipped, and this transcript stops at
  the second one rather than showing the launch.
---

# Worked example

## user

Two things I want built: a saved-filters feature for the issue list, and
per-project webhook secrets. They don't overlap. Research these with subagents
and get me prompts I can hand to two agents.

## tool — task

\`\`\`
task(subagent_type="explore", description="Research saved filters", prompt="
  READ-ONLY RESEARCH. Do not write or edit any files.
  ...
  7. What does NOT exist yet? List the gaps explicitly.
  Cite file:line for every claim. READ-ONLY.
")

task(subagent_type="explore", description="Research webhook secrets", prompt="
  READ-ONLY RESEARCH. Do not write or edit any files.
  ...
  Another agent covers the issue list; do not read client/issues/.
  Cite file:line for every claim. READ-ONLY.
")
\`\`\`

## assistant

Both back. The load-bearing findings:

**Saved filters.** No persistence primitive for per-user UI state exists —
\`client/issues/FilterBar.tsx:40\` holds filter state in \`useState\` and nothing
writes it anywhere. This is the first one, not a variation on an existing
pattern.

**Webhook secrets.** \`server/webhooks/verify.ts:22\` already reads a single
\`WEBHOOK_SECRET\` from the environment and is called from three routes. Making
it per-project is a signature change across all three, not a new module.

Two gotchas worth naming now, because both are silent:

- \`server/config/settings.ts:64\` has an allow-list. A new setting key that is
  not added there is accepted by the API and then ignored at runtime.
- The test runner is \`environment: node\`. Component rendering in a spec fails
  in a way that looks like a component bug.

## tool — bash

\`\`\`
$ git worktree prune && git fetch origin
$ WT=~/Documents/Projects/app.worktrees
$ git worktree add -b feat/saved-filters    $WT/saved-filters    origin/main
$ git worktree add -b feat/webhook-secrets  $WT/webhook-secrets  origin/main
$ (cd $WT/saved-filters   && npm ci && npm run typecheck && npm test) &
$ (cd $WT/webhook-secrets && npm ci && npm run typecheck && npm test) &
$ wait
saved-filters    : 214 passed (214)
webhook-secrets  : 214 passed (214)
$ mkdir -p $WT/prompts   # outside every working tree, so no worktree starts dirty
\`\`\`

## assistant

Prompts written to \`$WT/prompts/saved-filters.md\` and
\`$WT/prompts/webhook-secrets.md\`. Here is the first, abbreviated — read it
before I fire anything, this is the last cheap moment to correct scope:

\`\`\`
Branch feat/saved-filters is checked out at <path>, deps installed,
typecheck + 214 tests + build green at baseline.

Read first: AGENTS.md, client/README.md

PRE-RESEARCHED - DO NOT RE-DERIVE:
- Filter state lives in client/issues/FilterBar.tsx:40, useState only.
- NO persistence primitive for per-user UI state exists anywhere. You are
  building the first one. Do not go looking for it.
- Settings are read via server/config/settings.ts:64 (allow-list).

DECIDED: per-user, not per-team. Rationale: the team model has no membership
table yet (verified, db/schema.sql), so per-team would need one first.

GOTCHA: a setting key absent from the settings.ts:64 allow-list is accepted
by the API and silently ignored at runtime.
GOTCHA: test runner is environment: node - NO component rendering in specs.

OUT OF SCOPE (list as follow-ups in the PR body, do not build):
- Sharing a saved filter with another user - needs the team model.

SHARED-RESOURCE RULE: another agent is working in a sibling worktree at
../webhook-secrets on branch feat/webhook-secrets. docker compose up binds
fixed ports (8010, 3210) and bind-mounts ./.state - only ONE worktree may
run the stack at a time. Tiers 1-3 (typecheck/test/build) need no stack.
Before running e2e or docker compose up, check docker ps and lsof -i :8010
and do not start a second one.

Verify: npm run typecheck && npm test && npm run build
\`\`\`

Two things to decide before I launch:

1. **Plan mode or not?** Launched this way both agents start editing
   immediately. Should they present a plan first?
2. **PR or local commit?** As written both prompts push a branch and open a PR.

## note

The transcript stops here on purpose. The skill has two mandatory user
checkpoints — the prompts are shown before anything fires, and the plan-mode
and PR-versus-commit questions are asked — and running straight through them
would advertise an autonomy the skill deliberately withholds.

The prompt is decision-closed. It states what was decided *and why*, so the
receiving agent does not relitigate it, and it carries the negative finding
("NO persistence primitive exists anywhere — you are building the first one")
which is as expensive to establish as any positive one and is what agents most
often get wrong.

The \`SHARED-RESOURCE RULE\` names the sibling worktree, its branch, the exact
ports, and the check to run. Both prompts get it, not just one.

Prompt files live in \`$WT/prompts/\`, outside every working tree, so neither
worktree starts dirty. Arrows are plain ASCII because the text passes through
a shell and a terminal emulator on its way to the agent.
`,pn=`---
title: Attacking a rate-limiter plan the agent just wrote
trigger: red team this
caveat: >-
  Four of the six objection classes are shown; the two that yielded nothing are
  named but not expanded. A real run also dispatches the red team into a fresh
  sub-agent context for anything larger than this diff.
---

# Worked example

## user

red team this

## assistant

Red-teaming the plan above. I am arguing against it.

Gathering evidence before I make claims.

## tool — bash

\`\`\`
$ rg -n "RateLimit|rateLimit" server/ --type ts -l
server/middleware/rateLimit.ts
server/routes/auth.ts
$ rg -n "new Redis\\(" server/
server/middleware/rateLimit.ts:12:const redis = new Redis(process.env.REDIS_URL!)
server/queue/worker.ts:8:const redis = new Redis(process.env.REDIS_URL!)
$ rg -n "keyPrefix|db:" server/middleware/rateLimit.ts server/queue/worker.ts
(no matches)
\`\`\`

## assistant

**1. Wrong problem.** The complaint was *"the login endpoint falls over during
the morning spike"*. The plan rate-limits per IP. The spike is 4,000 legitimate
users on a corporate NAT, so per-IP limiting throttles the customer, not an
attacker. Grounded: the original issue text, quoted above.

**2. Cheaper alternative.** \`server/routes/auth.ts\` already imports
\`express-rate-limit\` for the password-reset route. Reusing it is a config
change; the plan adds a new middleware module.

**3. Hidden coupling.** Two \`new Redis()\` clients, no \`keyPrefix\` and no \`db:\`
selector on either. The limiter and the job queue share one keyspace, so a
limiter key named \`user:123\` can collide with a queue key. This is invisible in
the diff.

**4. Assumption.** The plan assumes \`REDIS_URL\` points at a Redis the limiter
may flush. \`server/queue/worker.ts:8\` says otherwise.

No wrong-abstraction finding. No reversibility problem — the middleware can be
removed in one commit.

## assistant

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Wrong problem | Per-IP limiting throttles a NAT'd office, not an attacker | issue text; plan §1 | 5 | 5 | 4 | 100 |
| 2 | Coupling | Limiter and queue share a Redis keyspace, no prefix | \`rateLimit.ts:12\`, \`worker.ts:8\` | 4 | 4 | 5 | 80 |
| 3 | Cheaper alt | \`express-rate-limit\` already a dependency | \`routes/auth.ts\` | 3 | 2 | 5 | 30 |

## assistant

**Speculative (unverified — no evidence gathered)**

- The morning spike may be retries from a mobile client rather than distinct
  users. Did not verify; would need the access log, which I cannot reach.

> Cheapest kill: \`redis-cli --scan --pattern 'bull:*' | head -1\` against the
> same URL — if the queue's keys are in there, objection 2 is confirmed and the
> plan needs a \`keyPrefix\` before anything else. 10 seconds.

**Verdict: proceed-with-change.** Key the limiter on account ID rather than IP,
and give both Redis clients an explicit \`keyPrefix\`. The plan's structure is
fine; its key choice solves a different problem than the one reported.

## note

The side-switch is the first line, before any analysis. Without it the model
defends the plan it just wrote — the reasoning that produced it is still in
context and still feels correct.

Every objection in the ranked table cites a \`file:line\` or a command that was
actually run. The one objection that could not be grounded is in its own
labelled bucket, because an unsourced objection stated with the same confidence
as a sourced one is how a red team becomes noise and gets ignored wholesale.

Two classes are explicitly reported as empty. "No wrong-abstraction finding" is
a result; silently skipping the class looks identical to not having checked.

Note the ranking is not the order the objections were found in. Sorting by
likelihood × cost × cheapness-to-check puts the ten-second check on the
plausible, expensive problem first.
`,mn=`---
title: Plan mode must be a flag
trigger: launch a session in plan mode
caveat: >-
  The transcript compresses packet authoring and child startup. It shows one
  deliberately incorrect launch followed by a corrected launch; a real parent
  should catch the missing flag before starting the first child.
---

# Worked example

## user

Please launch a session in plan mode for the auth refresh work. It should inspect
the existing branch and return an implementation plan, but not edit anything.

## assistant

I will inspect the installed roster and existing sessions, write a cold-start
packet outside the worktree, and launch a separate TUI. The requested mode,
model, directory, permissions, and stop condition must all be explicit because
the child inherits none of them from this conversation.

## tool — bash

\`\`\`bash
$ opencode agent list
build (primary)
...
plan (primary)
...
general (subagent)
...
explore (subagent)
...
scout (subagent)
$ # Unrelated permission details and agents are elided.
$ opencode models
...
openai/gpt-5.6-sol
$ # Other installed models are elided.
$ opencode session list
\`\`\`

## assistant

The packet at \`/Users/alex/.local/state/opencode-handoffs/auth-plan.md\` names
\`/Users/alex/Projects/acme.worktrees/auth-refresh\`, branch
\`feat/auth-refresh\`, the planning objective, settled decisions with rationale,
owned and forbidden files, \`agent: plan\`, \`model: openai/gpt-5.6-sol\`,
\`variant: UNVERIFIED - TUI has no --variant flag\`, ask-before-tools permission
posture, verification commands, and this stop condition: return the plan and do
not edit, commit, push, or open a PR.

It also requires the child's first reply to restate those fields.

## tool — bash

\`\`\`bash
$ git -C /Users/alex/Projects/acme.worktrees/auth-refresh branch --show-current
feat/auth-refresh
$ opencode /Users/alex/Projects/acme.worktrees/auth-refresh \\
    --model openai/gpt-5.6-sol \\
    --prompt "$(cat /Users/alex/.local/state/opencode-handoffs/auth-plan.md)"
\`\`\`

## note — guard fires

The launch omitted \`--agent plan\`. The packet's prose requested planning, but
the new TUI selected its default primary agent and began editing. The parent
stops that child rather than trusting the prose or letting it continue. This is
the failure the skill exists to prevent: nothing about the parent's mode was
inherited.

## assistant

That launch was invalid: I carried the requested mode only in prose. I stopped
it. I will relaunch from the same verified worktree with \`--agent plan\`; I will
not add \`--auto\`, because you did not request automatic approval.

## tool — bash

\`\`\`bash
$ opencode /Users/alex/Projects/acme.worktrees/auth-refresh \\
    --agent plan \\
    --model openai/gpt-5.6-sol \\
    --prompt "$(cat /Users/alex/.local/state/opencode-handoffs/auth-plan.md)"
\`\`\`

## note — launch verification

The corrected child's first reply restates the absolute worktree, branch,
\`plan\` agent, model, unverified TUI variant, ask-before-tools posture, read-only
ownership boundary, objective, and stop condition. The child also confirms its
working directory and branch before inspecting files. Process arguments prove
what the parent requested, not whether the provider accepted an unsupported
setting.

## assistant

Launched a standalone TUI in
\`/Users/alex/Projects/acme.worktrees/auth-refresh\` on \`feat/auth-refresh\` with
\`--agent plan\` and \`--model openai/gpt-5.6-sol\`. No \`--auto\` was used. The child
restated the packet and will stop after returning an implementation plan; I am
not doing the auth work in this session.
`,gn=`---
title: A worktree whose port is already taken
trigger: make a worktree
caveat: >-
  Command output is trimmed to the lines that changed a decision, and the
  npm ci step really takes a couple of minutes. The port collision is the
  interesting case, not the common one.
---

# Worked example

## user

make a worktree for the dark mode work

## tool — bash

\`\`\`
$ git rev-parse --show-toplevel
/Users/you/Documents/Projects/myrepo
$ git rev-parse --abbrev-ref origin/HEAD
origin/main
$ git worktree list
/Users/you/Documents/Projects/myrepo                        a1b2c3d [main]
/Users/you/Documents/Projects/myrepo.worktrees/other-topic  9f8e7d6 [feat/other-topic]
$ git fetch origin
\`\`\`

## tool — bash

\`\`\`
$ git worktree add -b feat/dark-mode \\
    ~/Documents/Projects/myrepo.worktrees/dark-mode origin/main
Preparing worktree (new branch 'feat/dark-mode')
branch 'feat/dark-mode' set up to track 'origin/main'.
HEAD is now at a1b2c3d
\`\`\`

## tool — bash

\`\`\`
$ cd ~/Documents/Projects/myrepo.worktrees/dark-mode && npm ci
added 270 packages in 1m48s
$ cp ~/Documents/Projects/myrepo/.env .env 2>/dev/null || true
$ npm run typecheck && npm test && npm run build
Tests  214 passed (214)
✓ built in 3.1s
\`\`\`

## tool — bash

\`\`\`
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
node    4821 you   24u  IPv6  TCP *:3000 (LISTEN)
$ ps -p 4821 -o pid,command
 4821 node .../myrepo.worktrees/other-topic/node_modules/.bin/vite
\`\`\`

## assistant

Worktree ready:

\`\`\`
  path:     /Users/you/Documents/Projects/myrepo.worktrees/dark-mode
  branch:   feat/dark-mode (from origin/main @ a1b2c3d)
  deps:     installed (npm ci)
  baseline: typecheck + 214 tests + build all green
  ports:    3000 in use by PID 4821 in ../other-topic — stack-free tiers only
\`\`\`

Port 3000 belongs to the dev server in the \`other-topic\` worktree, so do not
start a second one here. Typecheck, tests, lint and build all pass without it
— do that work first and contend for the port at the end, one worktree at a
time.

## note

The \`ps -p\` call is the point of this transcript. \`lsof\` says something owns
port 3000; it does not say what. Skipping that second command is how you
attach to a sibling worktree's dev server and spend an hour debugging the
wrong branch's code.

Two other things are load-bearing and invisible in the result. The branch is
cut from \`origin/main\` after a fetch, not from local \`main\`, so it does not
start life behind. And \`npm ci\` runs at all because \`node_modules\` is not
shared between worktrees — a fresh worktree has source only, and the first
command you run in it otherwise fails in a way that looks like a code error.

The baseline is proven green *before* any code is written, so the first red
test is unambiguously yours.
`,fn=`---
description: Launch one self-contained task in the background and stop
agent: build
---

Background this task: \`$ARGUMENTS\`

Current flag value:

!\`printf '%s' "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-unset}"\`

1. If the value above is not \`true\`, do not launch. Explain that OpenCode must
   be restarted with \`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true\`, and
   offer foreground execution as the blocking alternative.
2. If \`$ARGUMENTS\` is empty or ambiguous, ask one clarifying question instead
   of dispatching a task that cannot recover.
3. Restate the task for an agent with zero conversation context: absolute
   working directory and file paths, earlier constraints, whether it may edit,
   exact verification commands, and the final deliverable.
4. Check the installed agent roster before choosing a type. Prefer \`explore\`
   for read-only research; use \`general\` for writes only when its file ownership
   cannot overlap this session.
5. Launch exactly one task with \`background: true\`.
6. Report the type, scope, and returned \`task_id\`, then end the turn. Do not
   poll, sleep, or begin the same work "while it runs".

Never claim the task is complete when it has only been launched.

For preconditions, context-restatement rules, resuming via \`task_id\`, and the
full failure-mode table, load the \`background-subagent\` skill.
`,wn=`---
description: Run a long implementation as durable waves through verification
agent: build
---

Build \`$ARGUMENTS\` to completion as one sustained multi-wave run.

Background-subagent availability:

!\`test "\${OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS:-}" = true && echo available || echo unavailable\`

Before implementation:

1. Write a plan file containing scope, settled decisions, wave order, file
   ownership, dependencies, shared-resource constraints, and exact verification
   commands. The queue must survive compaction and a model change.
2. Put every wave in \`todowrite\`, including the final verification wave. Mark
   only one implementation wave active.
3. Establish the repository's baseline when practical and record its test count.
4. Cut waves on disjoint files and produced artifacts, not vague feature areas.
   Tasks that touch one lockfile, port, database, or generated artifact are
   sequential, not parallel.

During the run:

- The parent owns all coherent writes and cross-wave design by default.
- While implementing wave N, background read-only research for wave N+1 when
  the flag above is available. If it is unavailable, continue sequentially;
  never pretend foreground work is background work.
- At each boundary, verify the completed wave, reconcile returned research,
  update both the plan file and \`todowrite\`, and immediately begin the next wave.
- Do not ask "shall I continue?" after a progress report.
- If verification fails, add and execute a bounded fix wave, then rerun the
  affected checks and the final suite.

Stop only for a real product/scope/safety decision, an unassessed verification
failure, or every wave including final verification being green.

For context-budget rules, fan-out limits, audit queries, and stopping failures,
load the \`build-waves\` skill.
`,bn=`---
description: Cite the load-bearing code lines behind an explanation or finding
agent: plan
---

For \`$ARGUMENTS\`, read the relevant source first and write the result with the
smallest useful repository-relative \`path:line\` citation after every material
claim. Distinguish verified facts from inference and do not invent locations.

For citation selection, review-specific evidence, and the failure-mode table,
load the \`cite-file-lines\` skill.
`,yn=`---
description: Fan one broad research question out across read-only agents
agent: build
---

Research this properly: \`$ARGUMENTS\`

First decide whether delegation pays. Use this command only when the question
contains at least three independent unknowns, spans unrelated files or sources,
or would require roughly twenty tool calls. For a needle lookup, do it inline.

If it qualifies:

1. Split it into 3–5 non-overlapping axes. Name what each agent owns and what it
   must not read so they do not converge on the first grep hit.
2. Launch all agents concurrently in one message. Use \`explore\` with
   "very thorough" for codebase research; use \`general\` read-only only when bash
   or another unavailable tool is genuinely required.
3. Every prompt starts and ends with READ-ONLY, supplies the absolute repository
   path, asks numbered questions, requires \`file:line\` or verbatim URL evidence,
   asks what does **not** exist, and ends with \`UNVERIFIED:\`.
4. Spot-check one load-bearing claim from each report yourself.
5. Synthesize rather than concatenate: answer the original question first,
   reconcile disagreements by reading the cited evidence, merge all unverified
   items, preserve citations, and say what surprised you.

Do not dispatch sequential questions whose later shape depends on an earlier
answer, and do not let research agents mutate state.

For escalation signals, prompt anatomy, fan-out limits, and synthesis failures,
load the \`deep-research-subagents\` skill.
`,kn=`---
description: Draw an annotated ASCII diagram instead of a prose wall
agent: plan
---

Draw an ASCII diagram for \`$ARGUMENTS\`. If that is empty, diagram the plan,
change set, flow, or UI we are currently discussing.

Choose exactly one form:

- **Annotated file tree** for "what files change" — path, NEW/MOD/DEL status,
  then a comment only when it adds a design or coordination fact.
- **Vertical data flow** for "how does X reach Y" — boxes only for components,
  branches off the trunk, and failure modes attached where they bite.
- **UI mockup** for "what will it look like" — real copy, consistent widths,
  and the delta marked once with \`NEW\`.

Hard requirements:

1. Fence the diagram so a proportional font cannot destroy it.
2. Keep every line at or below 100 characters.
3. Align status columns and box edges across the whole diagram.
4. Put traps inline with \`<-\`; do not hide them in prose underneath.
5. Use realistic labels and counts, never lorem or placeholders.
6. Every annotation must say something the structure cannot already show.

Return the diagram first, then no more than five bullets explaining the
load-bearing choices. Do not use Mermaid unless the user explicitly asked for
a rendered diagram.

For character conventions, width checking, and the three complete formats,
load the \`ascii-diagrams\` skill.
`,vn=`---
description: Choose the right documentation medium, render it, and preview it
agent: build
---

Document or render \`$ARGUMENTS\`.

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
3. Cite the code as \`file:line\`, and call out the limitation or trap a reader
   cannot infer from the source.
4. Use the available renderer or \`diagram\` subagent rather than hand-writing a
   Mermaid block and hoping it parses. Pass an explicit output directory for
   SVG artifacts.
5. Preview the finished document: \`cmux markdown open\` for Markdown, or build
   or serve the docs site locally with its own generator. Inspect the rendered
   output and build logs before claiming completion.

If a named renderer or MCP server is unavailable in this session, say so and
offer the medium that can actually be verified. "It should render" is not
verification.

For the installed tool inventory, rendering tradeoffs, and docs-site caveats,
load the \`docs-and-diagram-tooling\` skill.
`,xn=`---
description: Reassert duck-mode response formatting in this turn
agent: build
---

Enable duck mode now.

From this reply onward:

- Begin every reply with a line containing exactly \`🦆🦆🦆\` and nothing else.
- End every reply with the same line.
- Apply it to ordinary answers, tool-heavy turns, questions, errors, and short
  replies.
- Never mention, explain, apologise for, or draw attention to the ducks.
- Never put ducks in code blocks, files, commit messages, PR bodies, generated
  documents, or anything else written to disk. They are display-only.
- Stop when the user says \`no more ducks\` or \`quack off\`, without commenting on
  the change.

This command re-injects the instruction late in a long session; it does not
make the behavior deterministic. A model-mediated command can still decay or
fail after compaction. If duck framing must be guaranteed, use the output hook
described by the full skill instead.

For the measured reliability results, plugin tradeoffs, and known limitations,
load the \`duck-mode\` skill.
`,_n=`---
description: Interview me about a design until nothing is assumed
agent: plan
---

Grill me on \`$ARGUMENTS\`. If that is empty, grill me on the design we have been
discussing.

Work it as a design tree and ask the whole frontier in one round:

1. The frontier is every decision whose prerequisites are already settled. Ask
   all of them now, numbered.
2. Give each question your recommended answer. A question without one hands the
   thinking back to me, which is the opposite of the point.
3. A question whose answer depends on another question still open in this round
   belongs to a later round. Do not ask me to answer hypothetically.
4. Anything you could look up is yours, not mine. Dispatch a subagent for facts
   about this codebase rather than asking me. Only downstream questions wait on
   it — ask the rest of the frontier now.
5. Then stop and wait. Do not answer your own questions and proceed.

Format each question as:

    Q1 - <title>: <body, with the concrete options if there are options>
    -> <your recommended answer>

Hold your position if I give an answer you believe is wrong, and say why.

For the stop condition and how to persist the outcome as a handoff doc or an
ADR, load the \`grill-me\` skill.
`,Tn=`---
description: Compile a self-contained handoff prompt for a fresh session
agent: build
subtask: true
---

Write a handoff prompt that a fresh agent — one with zero knowledge of this
conversation — can execute for: $ARGUMENTS

Current repository state:

!\`git rev-parse --show-toplevel && git branch --show-current && git status --short\`

The prompt must be decision-closed and re-derivation-proof. Include, in order:

1. Absolute worktree path, branch, and the base revision it was cut from.
2. Whether dependencies are installed and whether the baseline is green, with
   the passing test count.
3. \`PRE-RESEARCHED - DO NOT RE-DERIVE:\` — every finding carrying \`file:line\`,
   including the negative ones. "No dialog primitive exists anywhere, you are
   building the first one" is as expensive to establish as any positive finding
   and is the thing agents most often get wrong.
4. Decisions already taken, each with its rationale, so the agent does not
   relitigate them.
5. \`GOTCHA:\` lines for anything that will silently no-op.
6. Numbered build steps, each naming the file to create and an existing file to
   model it on.
7. Out of scope, with a reason per exclusion, phrased as "list as follow-ups in
   the PR body, do not build".
8. Exact verification commands and any runner limitation.
9. \`SHARED-RESOURCE RULE:\` naming every sibling worktree, its branch, and the
   fixed ports or state directories only one of them may hold at a time.
10. The report-back contract and the stop condition.

Plain ASCII only — no smart quotes and no box-drawing. The text will pass
through a shell and a terminal emulator on its way to the agent.

Write it to a file outside every git working tree and print the path. Do not
launch anything; show me the prompt first.

For the research phase that feeds this, load \`parallel-research-handoff\`. For
launching the session afterwards, load \`session-handoff\`.
`,In=`---
description: Dispatch isolated OpenCode workers and manage their PR wave
agent: build
---

Manage \`$ARGUMENTS\` through separate OpenCode workers in sibling git worktrees
and unfocused CMUX workspaces.

Before dispatch:

1. Load the \`manager-children\` skill and follow its continuation contract.
2. Write a durable wave plan with ownership, dependencies, integration order,
   and final verification.
3. State explicitly that standalone children continue after this turn but do
   not automatically resume the manager.
4. Create one worktree and branch per disjoint assignment from the current
   remote default branch.
5. Require status files, heartbeats, verified commits, pushed branches, and PRs.

Use the manager skill's resume and merge gates. Never busy-wait, scrape child
screens as the primary monitor, push the default branch from a child, or claim
that a CMUX notification is an OpenCode callback.
`,En=`---
description: Delegate disjoint edits to native Task children in sibling worktrees
agent: build
---

Delegate \`$ARGUMENTS\` only after confirming a fresh Build-only parent and a
dedicated sibling worktree from fresh \`origin/main\`. Give each child an absolute
worktree path, exclusive file ownership, exact verification, and the required
preflight guard before it edits anything.

For inherited Plan denies, containment rules, parallel-ownership limits, and
the failure-mode table, load the \`native-worktree-subagents\` skill.
`,An=`---
description: Argue against the plan or diff just produced
agent: build
---

Red-team what you just produced. If \`$ARGUMENTS\` names a file or a plan, target
that; otherwise target your own most recent output.

Open with the side-switch, verbatim, as the first line:

> Red-teaming the work above. I am arguing against it.

Then:

1. Work all six objection classes — wrong problem, cheaper alternative, hidden
   coupling, operational cost, reversibility, the unchecked assumption. Say so
   explicitly when a class yields nothing.
2. Ground every objection in \`file:line\`, pasted command output, or a doc URL.
   Grep for the other callers rather than reasoning about them.
3. Keep objections you cannot ground in a separate, clearly labelled
   speculative bucket. Never mix them with grounded ones.
4. Rank the grounded objections by likelihood x cost-if-true x cheapness-to-check
   and present them as a table.
5. Close with the single cheapest experiment that would kill the work, and a
   verdict of exactly one of \`proceed\`, \`proceed-with-change\`, or \`stop\`.

Do not re-litigate the work's merits. The case for it has already been made.

For the full objection taxonomy, the ranking axes, and the failure-mode table,
load the \`red-team-this\` skill.
`,Rn=`---
description: Research several tasks, compile handoff prompts, then stop for review
agent: build
---

Research and prepare handoffs for: \`$ARGUMENTS\`

Three phases, in order:

1. **Read-only research.** Split the supplied tasks into independent axes and
   launch one read-only agent per task concurrently. Require structure, prior
   art, the nearest analogue, concrete integration points, live API truth when
   reachable by GET, testing conventions, explicit gaps, \`file:line\` evidence,
   and a final \`UNVERIFIED:\` list.
2. **Compile prompts.** Turn each report into a decision-closed prompt containing
   the absolute worktree/branch state, docs to read first,
   \`PRE-RESEARCHED - DO NOT RE-DERIVE\`, settled decisions with rationale,
   \`GOTCHA:\` lines, numbered build steps, reasoned exclusions, constraints,
   exact verification, \`SHARED-RESOURCE RULE\`, and the report-back contract.
   Store prompt files outside every git worktree.
3. **Stop for review.** Show every prompt before launching. Ask whether the
   receiving sessions should plan first or edit immediately, and whether they
   should open PRs or leave local commits. Do not fire anything until those two
   choices are answered.

Use plain ASCII in prompt files, and do not recreate a baseline from a stale
local default branch.

For live probing, prompt hygiene, worktree setup, and the complete phase gates,
load the \`parallel-research-handoff\` skill.
`,Sn=`---
description: Carry the current task into one explicitly configured OpenCode session
agent: build
---

Prepare one standalone OpenCode session for: \`$ARGUMENTS\`

Nothing is inherited automatically. Carry settings through explicit CLI flags
and a self-contained handoff packet.

1. Choose the mechanism: fresh interactive TUI for steerable work,
   \`opencode run\` for scripted work, \`--session <id> --fork\` only when history
   must be copied, or the task tool when this is actually a subagent job.
2. Inspect \`opencode agent list\`, \`opencode models\`, the repository root, branch,
   worktree state, and baseline. Mark anything you cannot verify as UNVERIFIED.
3. Write a prompt file outside the worktree containing the absolute path,
   branch, objective, progress, settled decisions with rationale, owned and
   forbidden files, requested agent/model/variant, permission posture,
   verification commands, stop condition, and unverified assumptions.
4. Show the packet and exact launch command before executing it. Use
   \`--agent plan\` or \`--agent build\`; do not express mode as prompt prose.
   Use \`--variant\` for provider-specific reasoning effort. \`--thinking\` controls
   display only. Never add \`--auto\` unless the user explicitly requested it.
5. Keep secrets out of the packet and process arguments. Verify the target
   branch before allowing edits.
6. After launch, verify the working directory, branch, selected agent and model,
   and that the first reply understood the packet. A successful process start
   proves what was requested, not what the provider accepted.

Use cmux only as an optional presentation wrapper and never steal focus.

For the mechanism comparison, launch forms, safety rules, and verification
failures, load the \`session-handoff\` skill.
`,Cn=`---
description: Turn today's commits into a standup update
agent: build
subtask: true
---

My commits across all branches in the last day:

!\`git log --all --author="$(git config user.email)" --since="24 hours ago" --pretty=format:'%h %s' --no-merges\`

Merged pull requests, if the GitHub CLI is available:

!\`gh pr list --author "@me" --state merged --limit 10 --json number,title,mergedAt -q '.[] | "#\\(.number) \\(.title)"' 2>/dev/null || echo "(gh unavailable)"\`

Still open:

!\`gh pr list --author "@me" --state open --limit 10 --json number,title,isDraft -q '.[] | "#\\(.number)\\(if .isDraft then " DRAFT" else "" end) \\(.title)"' 2>/dev/null || echo "(gh unavailable)"\`

Write a standup update from the above, in three sections:

**Yesterday** — what actually landed, grouped by theme rather than listed per
commit. Say what it does for a reader, not what the diff touched.

**Today** — what the open work implies is next. Mark anything that is a guess.

**Blocked** — only genuine blockers. If there are none, say "nothing blocked"
rather than inventing one.

Rules:

- Three to six bullets per section. This gets read aloud.
- No commit hashes and no branch names unless someone would need to go find it.
- If the log is empty, say so plainly. Do not pad it out of the PR list.
- \`$ARGUMENTS\` may narrow the scope to one project or topic; if it does, drop
  everything else.

This command has no skill behind it deliberately: it is a small, self-contained
utility that does not need a permanent slot in the agent's retrieval context.
`,Nn=`---
description: Run the checks, then write human verification steps
agent: build
---

Typecheck:

!\`npm run typecheck 2>&1 | tail -20\`

Tests:

!\`npm test 2>&1 | tail -30\`

Build:

!\`npm run build 2>&1 | tail -15\`

Working tree:

!\`git status --short && git diff --stat HEAD\`

The above already ran. Do not run them again.

If anything above is red, stop and report the failure. Do not send a human to
verify a build that is already broken.

If everything is green, write the human verification checklist for the change
shown in the diff, scoped to \`$ARGUMENTS\` when it names a surface:

- 5 to 12 numbered steps, each with the action, the expected result, and the
  failure signal.
- Name the exact URL, command, viewport, theme, or test data each step needs.
- Check what automated tests cannot: visual layout, interaction, keyboard
  access, responsive behaviour, deployed behaviour.
- Cover a boundary, not only the happy path — empty state, error state, narrow
  viewport, or reduced motion, whichever the diff actually touches.
- Separate VERIFIED, FAILED, and UNVERIFIED. Never report an unreachable
  surface as passing.
- End with a disposition: Ready to ship, Fixes required, Partially verified, or
  Blocked on human access.

For the full procedure and its failure modes, load the
\`human-verification-steps\` skill.
`,Dn=`---
description: Create an isolated worktree for new work
agent: build
---

Create a git worktree for "$ARGUMENTS" now.

1. Find the repository root and origin's default branch. Run \`git fetch origin\`
   before branching; start from \`origin/<default>\`, never a stale local branch.
2. Create the worktree beside the repository at
   \`<repo>.worktrees/<topic>\`, on branch \`<type>/<topic>\`. Use kebab-case and
   include the issue number when one exists.
3. Install dependencies in the new worktree because gitignored directories such
   as \`node_modules\` and \`.venv\` are not shared.
4. Copy required gitignored local configuration such as \`.env\`; make any paths
   inside it absolute when they refer back to state in the original checkout.
5. Establish a green baseline with the repository's typecheck, tests, and build
   before writing code.
6. Before starting anything on fixed ports, run
   \`lsof -nP -iTCP:<port> -sTCP:LISTEN\` and confirm the owning PID. Only one
   worktree may run a fixed-port stack at a time.
7. Report the absolute worktree path, branch, base revision, dependency status,
   baseline result, and any port conflict.

If creation is blocked by a stale registration, a branch already checked out,
or a sibling stack, consult the \`worktree-up\` skill for the full failure-mode and
cleanup procedures. Do not work around Git's worktree safety checks.
`,Pn=`---
title: A task refused before it can block
trigger: /background
caveat: >-
  This shows the unavailable-flag branch. A successful run would additionally
  show the task call and returned task_id, then end immediately.
---

# Worked example

## user

/background audit token expiry in server/auth

## tool — shell interpolation

\`\`\`
OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS
unset
\`\`\`

## assistant

I cannot launch this in the background: the required flag is unset and OpenCode
reads it at startup.

Choose one:

- Restart OpenCode with
  \`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true\`, then run this command again.
- Run the same audit in the foreground now; it will block this session until it
  returns.

I have not started the audit either way.

## note

The guard is visible because shell interpolation ran before the model saw the
command template. Silently dropping \`background: true\` would look successful
until the foreground task blocks — exactly the failure this command prevents.
`,On=`---
title: A long migration made durable before wave one
trigger: /build-waves
caveat: >-
  Only setup and one wave boundary are shown. A real sustained build continues
  for hours and may compact or change models before final verification.
---

# Worked example

## user

/build-waves migrate reporting off the legacy schema

## tool — shell interpolation

\`\`\`
background subagents: available
\`\`\`

## assistant

I wrote \`docs/reporting-migration-plan.md\` and mirrored it in \`todowrite\`:

\`\`\`
wave 0  baseline + schema map       done
wave 1  query layer                 active
wave 2  renderers                   queued
wave 3  API routes                  queued
wave 4  client                      queued
wave 5  final verification          queued
\`\`\`

Wave 5 exists before implementation starts. Each wave owns disjoint files;
shared migrations and the lockfile remain parent-owned.

While I implement wave 1, one read-only background agent is mapping wave 2's
renderer callers. I will reconcile that report at the boundary, verify wave 1,
update both durable records, and continue without asking permission.

## tool — task

\`\`\`
explore, background=true
scope: server/reports/ callers only
forbidden: server/queries/ (parent is editing it)
\`\`\`

## note

The command did not begin by editing. The plan file, queue, ownership boundaries,
and final verification wave are the restart protocol if context compacts.

The shell interpolation made background availability a fact rather than an
assumption; an unavailable flag would produce a sequential run instead of a fake
parallel one.
`,Un=`---
title: A finding gets a verified line citation
trigger: /cite-file-lines
caveat: >-
  One claim, one citation. A longer review would repeat this once per finding.
---

# Worked example

## user

/cite-file-lines why does an unknown reminder ID get rejected

## tool — bash

\`\`\`
$ rg -n "isValidReminderId" server/routes/sessions.ts
118:  if (!isValidReminderId(reminder)) {
119:    return res.status(400).json({ error: "unknown reminder" });
\`\`\`

## assistant

The prompt route rejects an unknown reminder ID with 400 before resolving any
trusted body (\`server/routes/sessions.ts:118-119\`).

## note

The line range came from reading the file, not from guessing at the function
name. For the full citation-selection rules and failure-mode table, load the
\`cite-file-lines\` skill.
`,jn=`---
title: Four independent axes, one synthesized answer
trigger: /deep-research
caveat: >-
  Agent prompts and reports are abbreviated. A real very-thorough pass spends
  most of its time reading citations and reconciling conflicting evidence.
---

# Worked example

## user

/deep-research how ready is this service for multi-tenancy

## assistant

This qualifies: four independent unknowns and three unrelated source areas.

Launching concurrently:

1. Database ownership columns and query predicates — \`db/\`, \`server/queries/\`.
2. Session identity and authorization — \`server/auth/\`, no database files.
3. Queues and caches — \`server/queue/\`, \`server/cache/\`, no auth files.
4. Deployment and prior art — \`infra/\`, \`docs/\`, git history, no app source.

Every prompt is read-only, very thorough, requires \`file:line\`, asks what does
not exist, and ends with \`UNVERIFIED:\`.

## tool — task

\`\`\`
4 explore agents launched concurrently
\`\`\`

## assistant

**Answer:** identity is already tenant-aware; enforcement is not. The session
carries \`org_id\` (\`server/auth/session.ts:88\`), but 17 queries omit an
organization predicate. The highest-risk gap is outside SQL: queue and cache
clients share one Redis keyspace with no prefix.

Two reports disagreed about queue isolation. I checked their citations: job
payloads carry an org id, but Redis keys do not, so the cache report is correct.

\`\`\`
UNVERIFIED:
- production rows missing organization_id
- customers relying on cross-organization visibility
\`\`\`

## note

The output is a synthesized answer, not four reports pasted under four headings.
The disagreement was resolved from evidence, and the unverified items stay
visible because either could change the design.
`,Ln=`---
title: A route change shown as a file tree
trigger: /diagram
caveat: >-
  One of three supported diagram forms. The width check is summarized rather
  than shown running, and a real change set may require several alignment passes.
---

# Worked example

## user

/diagram what files change for adding saved filters

## assistant

\`\`\`
app/
├── server/
│   ├── routes/savedFilters.ts              NEW   CRUD boundary, validates owner
│   └── routes/index.ts                     MOD   + mount route
├── client/issues/
│   ├── SavedFilterPicker.tsx               NEW   keyboard-selectable combobox
│   └── FilterBar.tsx                       MOD   source of truth moves upward
├── db/
│   └── 0044_saved_filters.sql              NEW   owner_id index  <- tenancy boundary
└── test/savedFilters.test.ts               NEW   API + cross-user rejection
\`\`\`

- The status column starts at one offset across the whole tree.
- \`FilterBar.tsx\` names the state-ownership change rather than saying only
  "modified".
- The migration carries the trap inline: omitting \`owner_id\` from the index
  turns a per-user feature into a cross-user leak.
- Widest line: 91 characters, under the 100-column limit.

## note

\`$ARGUMENTS\` supplied both the diagram type and the subject. The command chose
an annotated tree because the question was "what files change"; a data-flow
diagram would add arrows without answering the reviewer's first question.

The one \`<-\` annotation is the deliverable, not decoration. It marks a failure
the file structure cannot show.
`,qn=`---
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
diffable source. \`docs/architecture.md\` already uses \`graph LR\` with no theme
directive, so I will match it.

## tool — mermaid renderer

\`\`\`
graph LR
  webhook --> queue --> normaliser --> warehouse
  normaliser -. retry .-> queue

render: success
\`\`\`

## tool — cmux markdown

\`\`\`
opened README.md in live preview
\`\`\`

## assistant

Rendered and checked: four nodes run left-to-right, the retry edge returns to
the queue, and the fence is a diagram rather than source text. The five-attempt
retry ceiling remains cited prose below it (\`server/queue/worker.ts:31\`) because
a number inside an image rots silently.

## note

The renderer and preview are the guard. Hand-writing Mermaid and saying "it
should render" is precisely the failure the command exists to prevent.

If this were a static docs site, the command would first prove that site's
plugin chain supports Mermaid instead of assuming GitHub behavior carries over.
`,Mn=`---
title: Duck rules reasserted after a long session
trigger: /duck-mode
caveat: >-
  Two turns cannot demonstrate durability. This remains model-mediated behavior;
  only the plugin described by the skill can make framing deterministic.
---

# Worked example

## user

/duck-mode

## assistant

🦆🦆🦆

Ducks are on.

🦆🦆🦆

## user

Write the answer into NOTES.md.

## tool — write

\`\`\`
NOTES.md
--------
Ducks are on.
\`\`\`

## assistant

🦆🦆🦆

Written to \`NOTES.md\`.

🦆🦆🦆

## note

The framing appears in the conversation but not in the file. Re-firing the
command late in a long session puts the exact rules back into the current turn;
it does not prove they will survive the next compaction.
`,$n=`---
title: A frontier of three, then silence
trigger: /grill-me
caveat: >-
  Round 1 of four or five. The command routes to the plan agent, so nothing in
  this transcript could have edited a file.
---

# Worked example

## user

/grill-me the command catalogue design

## assistant

Three questions on the frontier. Q4 (install instructions) depends on Q2, so it
waits for round 2.

Q1 - **Do commands get their own route, or share the skills grid?** A shared
grid keeps one search box, but commands and skills answer different questions
and mixing them buries the smaller set.

-> Separate route. The two have different install paths and different
portability guarantees, and a visitor looking for one is not browsing the other.

Q2 - **Where do command worked-examples live?** Beside the command is the
obvious answer, but \`commands/\` is a namespace: OpenCode registers every \`.md\`
in it, so a sibling file becomes a bogus slash command.

-> Separate \`command-simulations/\` directory. It breaks symmetry with skills,
which is a real cost, but the alternative pollutes the user's autocomplete.

Q3 - **Ship Claude Code variants?** Claude Code reads \`.claude/commands/\` with
a different frontmatter dialect.

-> OpenCode only, stated plainly. The catalogue's value is portability, and
pretending commands are portable when the dialects differ is the misleading
move.

## note

The whole frontier goes out in one round, numbered, each with a recommendation.
Q4 is named and deferred rather than asked, because asking a question whose
prerequisite is still open forces a hypothetical answer that settles nothing.

\`agent: plan\` in the frontmatter is what makes this safe to fire mid-session:
the plan agent has edit and bash set to ask, so a grilling cannot quietly start
implementing its own recommendations.

The turn ends here, waiting. That is the skill's actual behaviour, and a
transcript that answered its own questions would misrepresent it.
`,Fn=`---
title: A prompt written off-context
trigger: /handoff
caveat: >-
  The generated prompt is abbreviated to its section headers; a real one runs to
  two or three hundred lines. It stops before launching anything.
---

# Worked example

## user

/handoff the saved-filters feature

## tool — bash

\`\`\`
$ git rev-parse --show-toplevel && git branch --show-current && git status --short
/Users/you/Documents/Projects/app
feat/saved-filters
\`\`\`

## assistant

Written to \`/Users/you/Documents/Projects/app.worktrees/prompts/saved-filters.md\`:

\`\`\`
Branch feat/saved-filters is checked out at <abs path>, deps installed,
typecheck + 214 tests green at baseline.

PRE-RESEARCHED - DO NOT RE-DERIVE:
- Filter state lives in client/issues/FilterBar.tsx:40, useState only.
- NO persistence primitive for per-user UI state exists. You are building
  the first one. Do not go looking for it.

DECIDED: per-user, not per-team. Rationale: no membership table exists yet
(db/schema.sql), so per-team would need one first.

GOTCHA: a setting key absent from server/config/settings.ts:64 is accepted
by the API and silently ignored at runtime.

OUT OF SCOPE (list as follow-ups in the PR body, do not build):
- Sharing a filter with another user - needs the team model.

SHARED-RESOURCE RULE: sibling worktree ../webhook-secrets on branch
feat/webhook-secrets. docker compose binds 8010 and 3210 and bind-mounts
./.state - only ONE worktree may run the stack. Check docker ps first.

Verify: npm run typecheck && npm test && npm run build
\`\`\`

Read it before I launch anything.

## note

\`subtask: true\` in the frontmatter is doing the heavy lifting. Compiling this
prompt means re-reading a lot of the repository, and all of that reading happened
in a subagent — the parent session got back one file path and the finished text
instead of thirty tool results.

That is the strongest argument for a command over a skill in a long session:
the expensive part runs somewhere else and never touches the context you are
trying to preserve.

The command stops before firing. Showing the prompt is the last cheap moment to
correct scope.
`,Wn=`---
title: Dispatching workers without promising an automatic wake-up
trigger: /manager-children
caveat: >-
  Only the dispatch boundary is shown. The manager resumes on a later inbound
  turn, reviews PRs sequentially, and runs the final verification wave.
---

## user

/manager-children paginate transcripts and protect foreign-agent permissions

## assistant

I wrote a durable three-wave plan and split the work by ownership:

\`\`\`text
worker A  transcript API and client paging
worker B  session permission policy and tests
manager   sequential review, merge, full verification
\`\`\`

Standalone CMUX workers will continue when this turn ends. Their status files,
PRs, and notifications do not automatically resume this manager.

## tool — bash

\`\`\`text
created: repo.worktrees/transcript-pagination
created: repo.worktrees/session-permission-safety
launched: Child: Transcript Scale, Child: Permission Safety
\`\`\`

## assistant

Both workers are running with disjoint ownership and required heartbeats. The
next manager turn will read durable status before reviewing either branch.

## note

The command states the pause boundary instead of implying that CMUX is an
execution scheduler for the parent conversation.
`,Bn=`---
title: A child is delegated only after its worktree is ready
trigger: /native-worktree-subagents
caveat: >-
  Shows the preflight and launch prompt boundary; the child's own guard output
  and final report are not shown here.
---

# Worked example

## user

/native-worktree-subagents fix the notification badge count

## tool — bash

\`\`\`
$ git branch --show-current
main
$ git status --short
 M client/pages/Hub.tsx
\`\`\`

## assistant

This parent is a fresh Build-only session, so it can delegate safely. Creating
a sibling worktree at \`../custom-dca-opencode.worktrees/notification-badge\` on
branch \`fix/notification-badge\`, then launching the child with the absolute
worktree path, exclusive ownership of the badge component, the required
\`pwd; git rev-parse --show-toplevel; git status --short --branch\` preflight,
and the exact verification command it must run before committing and pushing.

## note

For the inherited Plan-deny risk, containment rules, parallel-ownership
limits, and the full failure-mode table, load the \`native-worktree-subagents\`
skill.
`,Gn=`---
title: Turning on your own diff
trigger: /red-team
caveat: >-
  Two objection classes are shown of the six the template asks for, and the
  ranked table is trimmed to two rows.
---

# Worked example

## user

/red-team

## assistant

Red-teaming the work above. I am arguing against it.

## tool — bash

\`\`\`
$ rg -n "frameDelayMs|setTimeout" src/ --type ts
src/lib/simulationPlayback.ts:24:export function frameDelayMs(speed: Speed)
src/components/SimulationPanel.tsx:79:  const timer = window.setTimeout(
$ rg -n "prefers-reduced-motion" src/
src/styles/globals.css:47:@media (prefers-reduced-motion: reduce) {
src/components/SimulationPanel.tsx:39:  window.matchMedia('(prefers-reduced-motion: reduce)')
\`\`\`

## assistant

**Unchecked assumption.** The autoplay timer assumes the tab is visible.
\`SimulationPanel.tsx:79\` sets a timeout with no \`visibilitychange\` guard, so a
backgrounded tab still advances frames and a reader returning after two minutes
finds the transcript finished. Nothing in the diff addresses this.

**Operational cost.** Every skill page now mounts a timer on load, because the
section is open by default. That is twelve pages each starting a repeating
timeout the moment they render, and no test covers what happens when a visitor
opens several in tabs.

No hidden coupling found — \`frameDelayMs\` has exactly one caller. No
reversibility problem; this is pure presentation and reverts in one commit.

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Assumption | Backgrounded tabs still advance | \`SimulationPanel.tsx:79\` | 5 | 3 | 5 | 75 |
| 2 | Operational | Timer starts on every page load | open-by-default in \`SkillRoute.tsx\` | 4 | 2 | 4 | 32 |

> Cheapest kill: open a skill page, switch tabs for 60 seconds, come back. If
> the transcript is at the last frame, objection 1 is confirmed. 60 seconds.

**Verdict: proceed-with-change.** Pause the timer on \`document.hidden\`. The
rest is fine.

## note

The side-switch is line one, before any evidence. Without it the model defends
what it just built, because the reasoning that produced it is still in context.

Both objections cite a line that was actually grepped. The two classes that
found nothing are reported as empty rather than skipped — silently omitting a
class looks identical to not having checked it.

The verdict is \`proceed-with-change\`, not \`stop\`. A red team that never clears
anything gets discounted.
`,Hn=`---
title: Two researched prompts waiting at the checkpoint
trigger: /research-handoff
caveat: >-
  The research reports and prompt bodies are abbreviated. The transcript ends
  before launch because the two human choices are mandatory gates.
---

# Worked example

## user

/research-handoff saved filters and per-project webhook secrets

## tool — task

\`\`\`
2 read-only explore agents, launched concurrently
saved filters owns client/issues/ + settings persistence
webhook secrets owns server/webhooks/ + config
\`\`\`

## assistant

Both reports are back. I wrote two prompts outside the worktrees:

\`\`\`
.../prompts/saved-filters.md
.../prompts/webhook-secrets.md
\`\`\`

Each contains \`PRE-RESEARCHED - DO NOT RE-DERIVE\`, settled scope with rationale,
\`GOTCHA:\` lines, numbered files, reasoned exclusions, exact verification, and the
same \`SHARED-RESOURCE RULE\` for ports 8010 and 3210.

Read them before I fire anything. Two decisions:

1. Should the receiving sessions present plans first, or edit immediately?
2. Should they open PRs, or stop at local commits?

## note

The command stops here deliberately. Launching before those answers would turn
a review checkpoint into a notification and advertise autonomy the workflow
explicitly withholds.

The prompt files are outside both worktrees, so neither implementation branch
starts dirty.
`,Vn=`---
title: A Plan session launched with explicit settings
trigger: /session-handoff
caveat: >-
  The process check proves requested flags, not provider acceptance. A real
  handoff also waits for the child to restate its packet before declaring success.
---

# Worked example

## user

/session-handoff inspect the playback timer in Plan mode with GPT Sol high effort

## assistant

This is a fresh interactive session, not a fork and not a subagent. I wrote a
packet outside the worktree with the absolute path, branch, read-only objective,
owned files, forbidden edits, verification expectations, and stop condition.

Exact launch:

\`\`\`
opencode /Users/you/src/app \\
  --agent plan \\
  --model openai/gpt-5.6-sol \\
  --prompt "$(cat /Users/you/src/app.worktrees/prompts/playback-review.md)"
\`\`\`

The interactive TUI has no \`--variant\` flag, so "high effort" is marked
UNVERIFIED rather than smuggled in as prompt prose. If provider-specific effort
is required, use \`opencode run --variant high\` instead.

## tool — process check

\`\`\`
requested: --agent plan --model openai/gpt-5.6-sol
working directory: /Users/you/src/app
\`\`\`

## assistant

The child is running with the requested agent, model, and directory. I am not
reviewing those files in this parent session. I will wait for its report.

## note

Nothing was inherited. Plan mode and model came from CLI flags; context came
from the packet. The missing effort flag remains visible instead of being
claimed.

The parent stops rather than duplicating the child's review.
`,Kn=`---
title: A standup with nothing invented
trigger: /standup
caveat: >-
  One day of a real log, shortened. The value is in what the command refuses to
  pad, which a busier day would show less clearly.
---

# Worked example

## user

/standup

## tool — bash

\`\`\`
$ git log --all --author="you@example.com" --since="24 hours ago" --pretty=format:'%h %s' --no-merges
7ed8c02 feat: add simulation playback
779d9c2 feat: add session handoff skill
4699eaf feat: add human verification steps skill
$ gh pr list --author "@me" --state open --limit 10
(no open pull requests)
\`\`\`

## assistant

**Yesterday**

- Skill pages now play their worked example as a timed transcript instead of a
  wall of text — autoplay, manual stepping, and a speed control.
- Two new skills landed: writing human verification checklists, and handing a
  session off to a fresh one with its settings intact.

**Today**

- Nothing is queued. Next is likely the command catalogue, but that is a guess
  from the direction of the last three commits, not from anything committed.

**Blocked**

- Nothing blocked.

## note

Three commits became two bullets. Nobody wants a commit list read aloud, and the
template asks for themes rather than a transcription.

The "Today" bullet is marked as a guess, because the log genuinely does not
contain it. The "Blocked" section says nothing is blocked rather than
manufacturing something to fill the heading.

This command has no skill behind it on purpose. It is small and self-contained,
so giving it a permanent slot in the agent's retrieval context would cost about
570 characters on every turn of every session to save typing a sentence.
`,zn=`---
title: Checks run before the human is asked to look
trigger: /verify
caveat: >-
  The checklist is trimmed to four steps; a real one runs to eight or ten. The
  shell blocks ran before the model saw anything, which is the point.
---

# Worked example

## user

/verify the playback controls

## tool — bash

\`\`\`
$ npm run typecheck
$ npm test
Tests  202 passed (202)
Tests  24 passed (24)
$ npm run build
✓ built in 1.4s
$ git status --short && git diff --stat HEAD
 M src/components/SimulationPanel.tsx      | 118 ++++++--
 M src/components/simulation-panel.module.css | 96 +++++-
\`\`\`

## assistant

All three green, so this is worth a human pass.

**1. Autoplay starts unprompted.** Open \`/s/grill-me\`. The simulation section is
already expanded and frame 1 is showing. Within ~10s a second turn appears with
no interaction. *Failure signal:* nothing moves, or every turn is visible at once.

**2. Assistant text is orange, user text green.** Same page. *Failure signal:*
both the same colour, or code inside an assistant turn is unreadable.

**3. Manual navigation pauses autoplay.** Press Next. The status line reads
\`paused\`. Wait 15s — no further advance. *Failure signal:* it keeps advancing.

**4. Reduced motion does not autoplay.** System Settings → Accessibility →
Reduce motion, reload. Section still open, frame 1 visible, controls still work,
status says autoplay is off. *Failure signal:* frames advance anyway.

\`\`\`
VERIFIED    typecheck, tests, build
UNVERIFIED  everything above — I ran the commands, I did not open a browser
\`\`\`

Disposition: **Blocked on human access** for the visual steps.

## note

The four shell blocks are not the assistant deciding to run things. They are
\`\` !\`command\` \`\` interpolations in the template: they executed before the model
saw the prompt, so their output was already in the turn.

That ordering is the guard. A skill has to *decide* to run the checks and can
skip them; the command cannot, because the output arrives whether the model
wants it or not. The reward is that a red build never reaches a human.

Note the honest split at the end. Running the commands is not the same as
looking at the page, and the report says so rather than claiming a pass.
`,Yn=`---
title: One line in, a baselined worktree out
trigger: /worktree-up
caveat: >-
  The npm ci step really takes minutes, and the orient commands are collapsed
  into one block. The command stops at the report; it does not start work.
---

# Worked example

## user

/worktree-up dark-mode

## tool — bash

\`\`\`
$ git rev-parse --show-toplevel && git rev-parse --abbrev-ref origin/HEAD
/Users/you/Documents/Projects/app
origin/main
$ git fetch origin
$ git worktree add -b feat/dark-mode ../app.worktrees/dark-mode origin/main
Preparing worktree (new branch 'feat/dark-mode')
$ cd ../app.worktrees/dark-mode && npm ci && npm run typecheck && npm test
Tests  214 passed (214)
$ lsof -nP -iTCP:3000 -sTCP:LISTEN
(none)
\`\`\`

## assistant

\`\`\`
  path:     /Users/you/Documents/Projects/app.worktrees/dark-mode
  branch:   feat/dark-mode (from origin/main @ a1b2c3d)
  deps:     installed (npm ci)
  baseline: typecheck + 214 tests green
  ports:    3000 free
\`\`\`

Ready. I have not written any code in it.

## note

\`$ARGUMENTS\` carried \`dark-mode\` straight into the template, which is the whole
reason this is a command rather than a skill — a skill cannot take input.

The template is the happy path only. The moment something goes wrong — a stale
worktree registration, a branch already checked out elsewhere, a sibling
worktree holding the port — the last line of the command sends the agent to the
\`worktree-up\` skill for the failure-mode table. The command deliberately does
not restate it, because two copies of a failure-mode table drift.
`,Xn=["user","assistant","tool","note"],Qn=/^##[ \t]+([a-z]+)(?:[ \t]+—[ \t]*(.*))?[ \t]*$/,Zn=/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;function Jn(e){return Xn.includes(e)}function et(e){const n=[];let t=null,a=null;for(const i of e.split(`
`)){const d=i.match(Zn);if(d){const[,c,h]=d;a===null?a=c:c[0]===a[0]&&c.length>=a.length&&h.trim()===""&&(a=null),t==null||t.lines.push(i);continue}const r=a===null?i.match(Qn):null;if(r){const[,c,h]=r;if(!Jn(c))return null;t={role:c,label:(h==null?void 0:h.trim())||void 0,lines:[]},n.push(t);continue}if(t){t.lines.push(i);continue}if(i.trim()!=="")return null}return n}function nt(e){const{data:n,content:t}=P(e),a=(n.title??"").trim(),i=(n.trigger??"").trim(),d=(n.caveat??"").trim();if(a===""||i===""||d==="")return null;const r=et(V(t));if(r===null||r.length===0||r[0].role!=="user")return null;const c=r.map(h=>({...h,body:h.lines.join(`
`).trim()})).filter(h=>h.body!=="").map(({role:h,label:u,body:p})=>u===void 0?{role:h,body:p}:{role:h,label:u,body:p});return c.length===0?null:{title:a,trigger:i,caveat:d,turns:c}}function Y(e){const n=new Map;for(const[t,a]of Object.entries(e)){const i=O(t),d=i===""?null:nt(a);d&&n.set(i,d)}return n}const tt=Object.assign({"../../agent-skills/skills/ascii-diagrams/SKILL.md":Me,"../../agent-skills/skills/background-subagent/SKILL.md":$e,"../../agent-skills/skills/build-waves/SKILL.md":Fe,"../../agent-skills/skills/cite-file-lines/SKILL.md":We,"../../agent-skills/skills/deep-research-subagents/SKILL.md":Be,"../../agent-skills/skills/docs-and-diagram-tooling/SKILL.md":Ge,"../../agent-skills/skills/duck-mode/SKILL.md":He,"../../agent-skills/skills/grill-me/SKILL.md":Ve,"../../agent-skills/skills/human-verification-steps/SKILL.md":Ke,"../../agent-skills/skills/manager-children/SKILL.md":ze,"../../agent-skills/skills/native-worktree-subagents/SKILL.md":Ye,"../../agent-skills/skills/parallel-research-handoff/SKILL.md":Xe,"../../agent-skills/skills/red-team-this/SKILL.md":Qe,"../../agent-skills/skills/session-handoff/SKILL.md":Ze,"../../agent-skills/skills/worktree-up/SKILL.md":Je}),at=Object.assign({"../../agent-skills/skills/ascii-diagrams/SIMULATION.md":en,"../../agent-skills/skills/background-subagent/SIMULATION.md":nn,"../../agent-skills/skills/build-waves/SIMULATION.md":tn,"../../agent-skills/skills/cite-file-lines/SIMULATION.md":an,"../../agent-skills/skills/deep-research-subagents/SIMULATION.md":sn,"../../agent-skills/skills/docs-and-diagram-tooling/SIMULATION.md":on,"../../agent-skills/skills/duck-mode/SIMULATION.md":rn,"../../agent-skills/skills/grill-me/SIMULATION.md":ln,"../../agent-skills/skills/human-verification-steps/SIMULATION.md":dn,"../../agent-skills/skills/manager-children/SIMULATION.md":hn,"../../agent-skills/skills/native-worktree-subagents/SIMULATION.md":cn,"../../agent-skills/skills/parallel-research-handoff/SIMULATION.md":un,"../../agent-skills/skills/red-team-this/SIMULATION.md":pn,"../../agent-skills/skills/session-handoff/SIMULATION.md":mn,"../../agent-skills/skills/worktree-up/SIMULATION.md":gn}),st=Object.assign({"../../agent-skills/commands/background.md":fn,"../../agent-skills/commands/build-waves.md":wn,"../../agent-skills/commands/cite-file-lines.md":bn,"../../agent-skills/commands/deep-research.md":yn,"../../agent-skills/commands/diagram.md":kn,"../../agent-skills/commands/docs-preview.md":vn,"../../agent-skills/commands/duck-mode.md":xn,"../../agent-skills/commands/grill-me.md":_n,"../../agent-skills/commands/handoff.md":Tn,"../../agent-skills/commands/manager-children.md":In,"../../agent-skills/commands/native-worktree-subagents.md":En,"../../agent-skills/commands/red-team.md":An,"../../agent-skills/commands/research-handoff.md":Rn,"../../agent-skills/commands/session-handoff.md":Sn,"../../agent-skills/commands/standup.md":Cn,"../../agent-skills/commands/verify.md":Nn,"../../agent-skills/commands/worktree-up.md":Dn}),ot=Object.assign({"../../agent-skills/command-simulations/background.md":Pn,"../../agent-skills/command-simulations/build-waves.md":On,"../../agent-skills/command-simulations/cite-file-lines.md":Un,"../../agent-skills/command-simulations/deep-research.md":jn,"../../agent-skills/command-simulations/diagram.md":Ln,"../../agent-skills/command-simulations/docs-preview.md":qn,"../../agent-skills/command-simulations/duck-mode.md":Mn,"../../agent-skills/command-simulations/grill-me.md":$n,"../../agent-skills/command-simulations/handoff.md":Fn,"../../agent-skills/command-simulations/manager-children.md":Wn,"../../agent-skills/command-simulations/native-worktree-subagents.md":Bn,"../../agent-skills/command-simulations/red-team.md":Gn,"../../agent-skills/command-simulations/research-handoff.md":Hn,"../../agent-skills/command-simulations/session-handoff.md":Vn,"../../agent-skills/command-simulations/standup.md":Kn,"../../agent-skills/command-simulations/verify.md":zn,"../../agent-skills/command-simulations/worktree-up.md":Yn});function it(e){return Object.fromEntries(Object.entries(e).map(([n,t])=>{var i;return[`commands/${((i=n.split("/").pop())==null?void 0:i.replace(/\.md$/u,""))??""}/SIMULATION.md`,t]}))}const T=je(tt,Y(at)),R=ve(st,{skillNames:new Set(T.map(e=>e.name)),simulations:Y(it(ot))});function za(e){return T.find(n=>n.name===e)}function Ya(e){return R.find(n=>n.name===e)}function Xa(e){return R.find(n=>n.relatedSkills.length===1&&n.relatedSkills[0]===e)}const rt="https://github.com/leoncheng57/custom-dca-opencode",lt="main",I=`${rt}/blob/${lt}/agent-skills`,Qa={skill:e=>`${I}/skills/${e}/SKILL.md`,skillSimulation:e=>`${I}/skills/${e}/SIMULATION.md`,command:e=>`${I}/commands/${e}.md`,commandSimulation:e=>`${I}/command-simulations/${e}.md`},X={status:"unknown",directoryLabel:"",installedSkills:new Set,installedCommands:new Set},C=X;function dt(e){const n=e.replace(/\/+$/u,"");return n.slice(n.lastIndexOf("/")+1)||n}function ht(e,n){return!e||!n?X:{status:"ready",directoryLabel:dt(e),installedSkills:new Set(n.skills.map(t=>t.name)),installedCommands:new Set(n.commands.map(t=>t.name))}}function ct(){const e=B(),[n,t]=f.useState(C);return f.useEffect(()=>{const a=Z(e.search,typeof localStorage>"u"?null:localStorage.getItem(J));if(!a){t(C);return}const i=new AbortController;let d=!1;return ee.catalog(a,i.signal).then(r=>{d||t(ht(a,r))}).catch(()=>{d||t(C)}),()=>{d=!0,i.abort()}},[e.search]),n}const ut="_page_1ec81_1",pt="_content_1ec81_8",mt="_wipWarning_1ec81_14",gt="_eyebrow_1ec81_16",ft="_type_1ec81_16",wt="_count_1ec81_16",bt="_filterLabel_1ec81_16",yt="_filterInput_1ec81_16",kt="_tag_1ec81_16",vt="_meta_1ec81_16",xt="_source_1ec81_16",_t="_terminal_1ec81_16",Tt="_methodScope_1ec81_16",It="_hero_1ec81_20",Et="_modalTitle_1ec81_37",At="_cardTitle_1ec81_37",Rt="_sectionTitle_1ec81_37",St="_lede_1ec81_42",Ct="_typeStats_1ec81_44",Nt="_typeStat_1ec81_44",Dt="_catalog_1ec81_49",Pt="_catalogHead_1ec81_50",Ot="_filter_1ec81_16",Ut="_clear_1ec81_57",jt="_tab_1ec81_58",Lt="_cardLink_1ec81_58",qt="_tabs_1ec81_60",Mt="_tags_1ec81_60",$t="_tabActive_1ec81_64",Ft="_grid_1ec81_68",Wt="_card_1ec81_37",Bt="_cardTop_1ec81_70",Gt="_typeSkill_1ec81_74",Ht="_typeCommand_1ec81_75",Vt="_loadState_1ec81_78",Kt="_loadStateOn_1ec81_79",zt="_loadStateOff_1ec81_80",Yt="_scopeNote_1ec81_81",Xt="_cardSkill_1ec81_82",Qt="_cardCommand_1ec81_83",Zt="_cardCopy_1ec81_84",Jt="_cardTags_1ec81_84",ea="_empty_1ec81_85",na="_locations_1ec81_87",ta="_tableWrap_1ec81_87",aa="_table_1ec81_87",sa="_dialog_1ec81_89",oa="_dialogBody_1ec81_90",ia="_close_1ec81_90",ra="_modalHead_1ec81_91",la="_modalDescription_1ec81_91",da="_route_1ec81_91",ha="_detailGrid_1ec81_92",ca="_side_1ec81_92",ua="_terminalBar_1ec81_94",pa="_light_1ec81_94",ma="_terminalPath_1ec81_94",ga="_terminalSource_1ec81_94",fa="_terminalTurns_1ec81_94",wa="_turn_1ec81_94",ba="_turnRole_1ec81_94",ya="_turnAssistant_1ec81_94",ka="_turnTool_1ec81_94",va="_turnNote_1ec81_94",xa="_terminalControls_1ec81_98",_a="_terminalButton_1ec81_98",Ta="_terminalButtonPrimary_1ec81_98",Ia="_terminalStatus_1ec81_98",Ea="_progress_1ec81_98",Aa="_terminalCaveat_1ec81_98",Ra="_disclosures_1ec81_100",Sa="_disclosure_1ec81_100",Ca="_disclosureMeta_1ec81_100",Na="_disclosureBody_1ec81_100",Da="_descriptionPanel_1ec81_100",Pa="_descriptionBar_1ec81_100",Oa="_descriptionBody_1ec81_100",Ua="_relation_1ec81_100",ja="_method_1ec81_16",La="_methodHead_1ec81_100",qa="_methodCopy_1ec81_100",Ma="_command_1ec81_100",$a="_notFound_1ec81_100",o={page:ut,content:pt,wipWarning:mt,eyebrow:gt,type:ft,count:wt,filterLabel:bt,filterInput:yt,tag:kt,meta:vt,source:xt,terminal:_t,methodScope:Tt,hero:It,modalTitle:Et,cardTitle:At,sectionTitle:Rt,lede:St,typeStats:Ct,typeStat:Nt,catalog:Dt,catalogHead:Pt,filter:Ot,clear:Ut,tab:jt,cardLink:Lt,tabs:qt,tags:Mt,tabActive:$t,grid:Ft,card:Wt,cardTop:Bt,typeSkill:Gt,typeCommand:Ht,loadState:Vt,loadStateOn:Kt,loadStateOff:zt,scopeNote:Yt,cardSkill:Xt,cardCommand:Qt,cardCopy:Zt,cardTags:Jt,empty:ea,locations:na,tableWrap:ta,table:aa,dialog:sa,dialogBody:oa,close:ia,modalHead:ra,modalDescription:la,route:da,detailGrid:ha,side:ca,terminalBar:ua,light:pa,terminalPath:ma,terminalSource:ga,terminalTurns:fa,turn:wa,turnRole:ba,turnAssistant:ya,turnTool:ka,turnNote:va,terminalControls:xa,terminalButton:_a,terminalButtonPrimary:Ta,terminalStatus:Ia,progress:Ea,terminalCaveat:Aa,disclosures:Ra,disclosure:Sa,disclosureMeta:Ca,disclosureBody:Na,descriptionPanel:Da,descriptionBar:Pa,descriptionBody:Oa,relation:Ua,method:ja,methodHead:La,methodCopy:qa,command:Ma,notFound:$a};function U({install:e,installed:n,kind:t}){return e.status!=="ready"?null:s.jsxs("span",{className:`${o.loadState} ${n?o.loadStateOn:o.loadStateOff}`,"data-installed":n,"data-testid":`opencode-playbook-${t}-load-state`,title:`Reported by the OpenCode server for ${e.directoryLabel}. Installation is per project.`,children:[n?"Loaded":"Not loaded"," in ",e.directoryLabel]})}function Fa({install:e,skill:n,onTag:t}){return s.jsxs("article",{className:`${o.card} ${o.cardSkill}`,"data-playbook-kind":"skill","data-testid":"opencode-playbook-skill-card",children:[s.jsxs("div",{className:o.cardTop,children:[s.jsxs("span",{className:`${o.type} ${o.typeSkill}`,children:[s.jsx(se,{"aria-hidden":"true",size:10})," Skill · model-selected"]}),s.jsxs("span",{className:o.meta,children:[n.readingTimeMinutes," min"]})]}),s.jsx(U,{install:e,installed:e.installedSkills.has(n.name),kind:"skill"}),s.jsx("h2",{className:o.cardTitle,children:n.title}),s.jsx("p",{className:o.cardCopy,children:n.summary}),s.jsx("div",{className:o.cardTags,children:n.tags.map(a=>s.jsxs("button",{className:o.tag,"data-testid":"opencode-playbook-tag",onClick:()=>t(a),type:"button",children:["#",a]},a))}),s.jsx(D,{className:o.cardLink,"data-testid":`opencode-playbook-skill-${n.name}`,to:`/playbooks/skills/${n.name}`,children:"Read playbook →"})]})}function Wa({command:e,install:n}){return s.jsxs("article",{className:`${o.card} ${o.cardCommand}`,"data-playbook-kind":"command","data-testid":"opencode-playbook-command-card",children:[s.jsxs("div",{className:o.cardTop,children:[s.jsxs("span",{className:`${o.type} ${o.typeCommand}`,children:[s.jsx(ie,{"aria-hidden":"true",size:10})," Command · human-invoked"]}),s.jsx("span",{className:o.meta,children:e.subtask?"subtask":"session"})]}),s.jsx(U,{install:n,installed:n.installedCommands.has(e.name),kind:"command"}),s.jsx("h2",{className:o.cardTitle,children:ye(e.name,e.takesArguments)}),s.jsx("p",{className:o.cardCopy,children:e.description}),s.jsxs("div",{className:o.cardTags,children:[e.runsShell&&s.jsx("span",{children:"shell input"}),e.relatedSkills.map(t=>s.jsx("span",{children:t},t))]}),s.jsx(D,{className:o.cardLink,"data-testid":`opencode-playbook-command-${e.name}`,to:`/playbooks/commands/${e.name}`,children:"Read command →"})]})}const Ba=[{kind:"all",label:"All",href:"/playbooks"},{kind:"skills",label:"Skills",href:"/playbooks/skills"},{kind:"commands",label:"Commands",href:"/playbooks/commands"}];function F({kind:e}){const n=e==="skills"?Ee:Ie;return s.jsxs("section",{className:o.locations,"aria-labelledby":`${e}-locations-heading`,children:[s.jsx("div",{className:o.eyebrow,children:"Install locations"}),s.jsxs("h2",{className:o.sectionTitle,id:`${e}-locations-heading`,children:["Where ",e," live"]}),s.jsx("p",{children:e==="skills"?"Skills are portable directories read by several agent families. Global paths apply everywhere; project paths travel with one repository.":"Commands are individual OpenCode markdown files. They cost no context until a human invokes them."}),s.jsx("div",{className:o.tableWrap,children:s.jsxs("table",{className:o.table,children:[s.jsx("thead",{children:s.jsxs("tr",{children:[s.jsx("th",{scope:"col",children:"Path"}),s.jsx("th",{scope:"col",children:"Scope"}),s.jsx("th",{scope:"col",children:"Read by"})]})}),s.jsx("tbody",{children:n.map(t=>s.jsxs("tr",{children:[s.jsx("th",{scope:"row",children:t.path}),s.jsx("td",{children:t.scope}),s.jsxs("td",{children:[t.readBy,s.jsx("span",{children:t.note})]})]},t.path))})]})})]})}function Ga({kind:e="all",detail:n}){var m;const[t,a]=f.useState(""),i=f.useRef(null),d=f.useRef(null),r=((m=B().state)==null?void 0:m.focusCatalog)===!0;f.useEffect(()=>{var l;r&&((l=d.current)==null||l.focus())},[r]);const c=ct(),h=f.useMemo(()=>e==="commands"?[]:Le(T,t),[e,t]),u=f.useMemo(()=>e==="skills"?[]:xe(R,t),[e,t]),p=f.useMemo(()=>qe(T),[]),w=h.length+u.length,y=l=>{var k;a(l),(k=i.current)==null||k.focus()};return s.jsxs("main",{className:o.page,"data-testid":"opencode-playbooks",ref:d,tabIndex:-1,children:[s.jsxs("div",{className:o.content,children:[s.jsx(ne,{className:o.wipWarning,"data-testid":"opencode-playbooks-wip-warning",variant:"warning",children:"Playbooks is still work in progress and its UI/UX may contain bugs."}),s.jsxs("header",{className:o.hero,children:[s.jsxs("div",{children:[s.jsx("div",{className:o.eyebrow,children:"Repository-owned agent procedures"}),s.jsx("h1",{children:"Repeatable ways to work with an agent."}),s.jsx("p",{className:o.lede,children:"Skills are selected by the model. Commands are invoked by a human. Guided workflows can join them here later without turning one content type into the whole product."})]}),s.jsxs("aside",{className:o.typeStats,"aria-label":"Playbook types",children:[s.jsxs("div",{className:o.typeStat,children:[s.jsx("strong",{children:T.length}),s.jsx("span",{children:"Skills"})]}),s.jsxs("div",{className:o.typeStat,children:[s.jsx("strong",{children:R.length}),s.jsx("span",{children:"Commands"})]}),s.jsxs("div",{className:o.typeStat,children:[s.jsx("strong",{children:"Next"}),s.jsx("span",{children:"Workflows"})]})]})]}),s.jsxs("section",{className:o.catalog,"aria-labelledby":"playbook-catalog-heading",children:[s.jsxs("div",{className:o.catalogHead,children:[s.jsxs("div",{children:[s.jsx("div",{className:o.eyebrow,children:"Catalogue"}),s.jsxs("h2",{className:o.sectionTitle,id:"playbook-catalog-heading",children:[w," matching playbooks ",s.jsx("span",{className:o.count,children:e})]})]}),s.jsxs("label",{className:o.filter,children:[s.jsx(te,{"aria-hidden":"true",size:14}),s.jsx("span",{className:o.filterLabel,children:"filter"}),s.jsx("input",{className:o.filterInput,"data-testid":"opencode-playbook-filter",onChange:l=>a(l.target.value),placeholder:"name, tag, or trigger phrase",ref:i,type:"search",value:t}),t&&s.jsx("button",{"aria-label":"Clear filter",className:o.clear,"data-testid":"opencode-playbook-filter-clear",onClick:()=>{var l;a(""),(l=i.current)==null||l.focus()},type:"button",children:"×"})]})]}),s.jsx("nav",{className:o.tabs,"aria-label":"Playbook types",children:Ba.map(l=>s.jsx(D,{className:`${o.tab} ${l.kind===e?o.tabActive:""}`,"data-testid":`opencode-playbook-kind-${l.kind}`,to:l.href,children:l.label},l.kind))}),e!=="commands"&&s.jsxs("div",{className:o.tags,children:[s.jsx("span",{children:"try:"}),p.map(l=>s.jsxs("button",{className:o.tag,"data-testid":"opencode-playbook-hero-tag",onClick:()=>y(l),type:"button",children:["#",l]},l))]}),w?s.jsxs("div",{className:o.grid,children:[h.map(l=>s.jsx(Fa,{install:c,onTag:y,skill:l},l.name)),u.map(l=>s.jsx(Wa,{command:l,install:c},l.name))]}):s.jsxs("p",{className:o.empty,children:["No playbook matches ",s.jsx("code",{children:t.trim()}),"."]})]}),e==="skills"&&s.jsx(F,{kind:"skills"}),e==="commands"&&s.jsx(F,{kind:"commands"})]}),n]})}const Za=Object.freeze(Object.defineProperty({__proto__:null,InstallState:U,PlaybooksPage:Ga},Symbol.toStringTag,{value:"Module"}));export{U as I,Ga as P,lt as a,za as b,Va as c,Xa as d,Ka as e,Ya as f,Za as g,ye as i,Qa as p,o as s,ct as u};
