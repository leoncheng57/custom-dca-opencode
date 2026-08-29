import{c as B,b as P,r as f,d as L,D as G,e as W,j as a,A as H,S as V,L as K}from"./index-Bzm4f740.js";/**
 * @license lucide-react v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=[["path",{d:"m7 11 2-2-2-2",key:"1lz0vl"}],["path",{d:"M11 13h4",key:"1p7l4v"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}]],X=B("square-terminal",Q),Y=/^([|>])([+-]?)(\d*)([+-]?)$/,S=/^(\s*)([A-Za-z0-9_.-]+)\s*:\s?(.*)$/,C=/^(\s*)-\s+(.*)$/;function y(e){return e.length-e.trimStart().length}function v(e,n){if(e.length<2||!e.startsWith(n)||!e.endsWith(n))return!1;const t=e.slice(1,-1);if(n==="'"){for(let o=0;o<t.length;o+=1)if(t[o]==="'"){if(t[o+1]==="'"){o+=1;continue}return!1}return!0}for(let o=0;o<t.length;o+=1){if(t[o]==="\\"){o+=1;continue}if(t[o]==='"')return!1}return!0}function D(e){return v(e,'"')?e.slice(1,-1).replace(/\\(["\\])/g,"$1"):v(e,"'")?e.slice(1,-1).replace(/''/g,"'"):e}function j(e){if(e.startsWith('"')||e.startsWith("'"))return e;const n=e.search(/(^|\s)#/);return n===-1?e:e.slice(0,n)}function I(e){const n=j(e.trim()).trim();return D(n)}function Z(e){const n=j(e.trim()).trim();if(v(n,'"')||v(n,"'"))return D(n);if(n==="true")return!0;if(n==="false")return!1;if(n!==""){const t=Number(n);if(!Number.isNaN(t))return t}return n}function J(e){let n="",t=0;for(const o of e){if(o===""){t+=1;continue}n===""?n=o:(n+=t>0?`
`.repeat(t):" ",n+=o),t=0}return n}function ee(e,n,t){return t==="strip"?e:t==="keep"?e+`
`.repeat(n+1):e===""?"":`${e}
`}function ne(e,n,t,o,r){const h=[];let i=n;for(;i+1<e.length;){const u=e[i+1];if(u.trim()===""){h.push(""),i+=1;continue}if(y(u)<=t)break;h.push(u),i+=1}let d=h.length-1;for(;d>=0&&h[d]==="";)d-=1;const l=h.length-1-d,c=h.slice(0,d+1),m=c.reduce((u,p)=>p===""?u:Math.min(u,y(p)),Number.MAX_SAFE_INTEGER),b=c.map(u=>u===""?"":u.slice(Math.min(m,y(u)))),k=o==="|"?b.join(`
`):J(b);return{value:ee(k,l,r),endIndex:i}}function te(e){const n=e[2]||e[4];return n==="-"?"strip":n==="+"?"keep":"clip"}function ae(e,n){for(let t=n+1;t<e.length;t+=1){const o=e[t];if(!(o.trim()===""||o.trimStart().startsWith("#")))return o}}function oe(e){return e.replace(/^\uFEFF/,"").replace(/\r\n?/g,`
`)}function O(e){const n=oe(e);if(!/^---[ \t]*(\n|$)/.test(n))return{data:{},content:n};const t=n.split(`
`);let o=-1;for(let c=1;c<t.length;c+=1){const m=t[c];if(m==="---"||m==="..."||/^(---|\.\.\.)[ \t]+$/.test(m)){o=c;break}}if(o===-1)return{data:{},content:n};const r=t.slice(1,o),h=t.slice(o+1).join(`
`),i={};let d=null,l=null;for(let c=0;c<r.length;c+=1){const m=r[c];if(m.trim()===""||m.trimStart().startsWith("#"))continue;const b=m.match(C);if(b&&d){const g=i[d];Array.isArray(g)&&g.push(I(b[2]));continue}const k=m.match(S);if(!k){d=null,l=null;continue}const[,u,p,_]=k,w=u.length>0;if(w&&!l)continue;w||(l=null,d=null);const E=_.trim(),x=E.match(Y);if(x){const{value:g,endIndex:$}=ne(r,c,u.length,x[1],te(x));c=$,w&&l?i[l][p]=g:i[p]=g;continue}if(E===""){const g=ae(r,c);if(g&&C.test(g)&&y(g)>=u.length){i[p]=[],d=p,l=null;continue}if(g&&y(g)>u.length&&S.test(g)){i[p]={},l=p,d=null;continue}w&&l?i[l][p]="":i[p]="";continue}if(w&&l){i[l][p]=I(_);continue}i[p]=Z(_),d=null}return{data:i,content:h}}function se(e){return e.replace(/^\s*#\s+.+?(\n+|$)/,"")}const ie=/\$ARGUMENTS\b|\$[1-9]\b/,re=/!`[^`]+`/;function U(e){return/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e)}function q(e){const n=e.split("/").filter(Boolean).pop()??"";return n.endsWith(".md")?n.slice(0,-3):""}function le(e,n){return n?`/${e} <arguments>`:`/${e}`}function de(e,n,t={}){const o=q(e);if(!U(o))return null;const{data:r,content:h}=O(n),i=h.trim(),d=(r.description??"").trim();return i===""?null:{name:o,description:d,agent:r.agent,model:r.model,subtask:r.subtask===!0,body:i,takesArguments:ie.test(i),runsShell:re.test(i),...t.simulation?{simulation:t.simulation}:{},bytes:typeof TextEncoder>"u"?n.length:new TextEncoder().encode(n).length}}function ce(e,n={}){return Object.entries(e).map(([t,o])=>{var r;return de(t,o,{simulation:(r=n.simulations)==null?void 0:r.get(q(t))})}).filter(t=>t!==null).sort((t,o)=>t.name.localeCompare(o.name))}function he(e,n){const t=n.trim().toLowerCase();return t===""?e:e.filter(o=>[o.name,o.description,o.body].join(" ").toLowerCase().includes(t))}const ue="leoncheng57",me="custom-dca-opencode",z=`${ue}/${me}`,pe=`https://github.com/${z}`,A="agent-skills",ge="main";function qt(e){if(!U(e))throw new Error(`Invalid command name: ${e}`);const n=`https://raw.githubusercontent.com/${z}/${ge}/${A}/commands/${e}.md`;return[{id:"curl-global",label:"curl",scope:"global",note:"Recommended. Available in every project you open with OpenCode.",command:["mkdir -p ~/.config/opencode/commands && \\",`curl -sL ${n} \\`,`  -o ~/.config/opencode/commands/${e}.md`].join(`
`)},{id:"curl-project",label:"curl into a project",scope:"project",note:"Commits with the repo, so the command travels with the codebase and loads only there.",command:["# from the root of your project","mkdir -p .opencode/commands && \\",`curl -sL ${n} \\`,`  -o .opencode/commands/${e}.md`].join(`
`)},{id:"symlink",label:"clone + symlink",scope:"global",note:"Stays updatable: git pull in the clone refreshes the live command.",command:[`git clone ${pe}.git ~/src/custom-dca-opencode   # once`,"mkdir -p ~/.config/opencode/commands",`ln -s ~/src/custom-dca-opencode/${A}/commands/${e}.md \\`,`      ~/.config/opencode/commands/${e}.md`].join(`
`)}]}const fe=[{path:"~/.config/opencode/commands/<name>.md",scope:"Global",readBy:"OpenCode",note:"Every project. Start here."},{path:".opencode/commands/<name>.md",scope:"Project",readBy:"OpenCode",note:"Committed with the repo; loads only inside it."},{path:".claude/commands/<name>.md",scope:"Project",readBy:"Claude Code",note:"Different frontmatter dialect (argument-hint, allowed-tools). Not shipped here."}],be=`---
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

Never claim the task is complete when it has only been launched. A background
result is not shown directly to the user; relay it when it returns.

Do not background work when you need its result this turn, the task needs
back-and-forth, it takes only a handful of tool calls, it overlaps files or a
shared resource you will touch, or this session is already a subagent. The
usual \`subagent_depth\` limit is one.

If the user corrects a running task, pass its \`task_id\` with the added context;
that continues the same task. Reusing a finished \`task_id\` resumes its session.

| Failure | Response |
|---|---|
| Background flag is unavailable | Offer foreground execution or an OpenCode restart; never silently block |
| Depth limit or unknown agent type | Stop; do not bypass the limit, and inspect the roster |
| Prompt is ambiguous | Ask before launch; a child cannot recover through dialogue |
| Files or shared state overlap | Keep the work inline or assign disjoint ownership |
| Result arrives | Verify and relay it; do not assume the launch response was completion |
`,we=`---
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

Keep fan-out flat and capped around five tasks. Prefer read-only children while
the parent owns coherent writes. Every task must name owned files, forbidden
files and shared resources, its input, its output, and its acceptance check.

Persist load-bearing findings and the next-wave brief in the plan file; chat is
not durable across compaction. A standalone CMUX child cannot wake this parent
by writing status or notifying the human, so never promise unattended progress
without a tested, serialized supervisor.

Afterward, use child session records only as provenance and cost evidence, not
as a substitute for the planned final verification.

| Failure | Response |
|---|---|
| Children repeat research | Tighten artifact and directory boundaries |
| Two tasks touch a lockfile, port, database, or generated output | Sequence them or give integration to the parent |
| Context compacts or the model changes | Restore the plan file and synchronized task list |
| Final checks fail | Add a bounded fix wave, then rerun affected and aggregate checks |
| A standalone child finishes | Resume only on a real inbound turn; status and CMUX alerts are not callbacks |
`,ye=`---
description: Cite the load-bearing code lines behind an explanation or finding
agent: plan
---

For \`$ARGUMENTS\`, read the relevant source first and write the result with the
smallest useful repository-relative \`path:line\` citation after every material
claim. Distinguish verified facts from inference and do not invent locations.

Prefer the definition, behavior branch, request boundary, assertion, or call
site that proves the statement over a nearby comment or suggestive filename.
Use one citation when it proves the claim; add another only when the behavior
crosses a boundary. Put evidence immediately after the claim.

For a review, cite both the changed line causing the risk and the surrounding
contract when they differ. For a diagnosis, cite the reachable failure path and
the condition that reaches it. Pin external review links to the reviewed commit
SHA so they cannot drift.

| Failure | Response |
|---|---|
| Exact location is unknown | Search for it or mark the claim unverified |
| Citation points only to a comment or caller | Read through and cite the load-bearing implementation |
| References obscure the argument | Keep the smallest set that establishes the point |
| Fact and inference are mixed | Label the inference separately |
`,ke=`---
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

Use a flat fan-out: the usual subagent depth is one. Cap the batch at five;
above that overlap and synthesis cost usually erase the gain. A \`general\` agent
must be told READ-ONLY at both the start and end of its prompt; prefer the
enforced read-only \`explore\` agent whenever its tools are sufficient.

Specify a bounded deliverable, such as one answer-first section per numbered
question under 800 words. If a live API is in scope, allow GET only and request
the verbatim schema rather than a paraphrase.

| Failure | Response |
|---|---|
| Reports repeat each other | Split by artifact or directory and name exclusions |
| Reports are essays without evidence | Ask numbered questions and require citations |
| A report contains invented certainty | Merge \`UNVERIFIED\` lists and spot-check its load-bearing claim |
| A child mutates state | Stop it; use enforced read-only delegation |
| Calls ran sequentially | Relaunch independent axes concurrently or keep the work inline |
| Synthesis is longer than the reports | Answer first, reconcile conflicts, preserve only decisive evidence |
`,ve=`---
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

Use one consistent character set. Box drawing is reliable in normal monospace
renderers; ambiguous-width emoji can shift terminal columns, so use ASCII
markers for terminals known to render them double-width. Count characters, not
UTF-8 bytes, and inspect the result in a monospace surface before publishing.

Do not diagram a single-file change, yes/no answer, two-axis comparison, or a
linear sequence with no branches. Use prose, a table, or a numbered list.

| Failure | Response |
|---|---|
| Columns or box edges drift | Recount character widths and use one shared offset |
| Diagram shows only a happy path | Attach the failure at the arrow where it occurs |
| An annotation repeats the structure | Delete it or replace it with a design or coordination fact |
| Mermaid appears unrendered | Fall back to fenced ASCII unless the target surface is proven to render it |

Longer annotated examples live in \`agent-skills/command-docs/diagram-examples.md\`.
`,_e=`---
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
`,xe=`---
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
fail after compaction.

If framing must be guaranteed, use an output plugin on
\`experimental.text.complete\`, pin its behavior with a test, and accept that the
hook is undocumented and fires once per text part rather than once per response.
Such a plugin can guarantee duck presence but cannot stop the model discussing
them. Use persistent agent instructions for that generation rule. Never claim
post-compaction, interactive-TUI, cross-model, or future-version behavior was
verified unless it was exercised directly.

Always-on behavior belongs in a plugin, hook, or agent instructions rather than
in a command. This command is appropriate only for explicit, on-demand use.
`,Re=`---
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

The session is complete only when the frontier is empty. Then summarize every
agreed decision and wait for confirmation before acting. Once confirmed, offer
to persist the result as either a decision-closed handoff document or an ADR
with context, decision, and consequences.

| Failure | Response |
|---|---|
| An answer depends on another open question | Move it to a later round |
| The exchange becomes one-question-at-a-time | Recompute and ask the whole frontier |
| A factual lookup stalls the round | Delegate the lookup; ask unaffected decisions now |
| Recommendations carry no reasoning | State the tradeoff and why you prefer one option |
| Build relitigates settled decisions | Persist the confirmed outcome with rationale |
| Questions stop but assumptions remain | Recompute unvisited branches; the frontier is not empty |
`,Te=`---
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

Before finalizing, verify every claimed path, branch, baseline, model, and
runtime capability. Mark anything else \`UNVERIFIED\`. Keep credentials out of
the packet because it may later appear in shell history or process arguments.

Do not compress decisions into conclusions: preserve rationale, especially for
scope exclusions and one-way choices. A negative finding must name how it was
searched so the receiving agent knows its evidence boundary.

| Failure | Response |
|---|---|
| Receiving agent repeats discovery | Add cited findings and \`DO NOT RE-DERIVE\` |
| Scope is relitigated | Add the settled rationale and supporting evidence |
| Prompt starts a checkout dirty | Move it outside all worktrees |
| Baseline is only reported from memory | Mark it UNVERIFIED or run it before handoff |
| Prompt contains secrets | Remove them and use a separate safe channel |
| Work is launched without review | Stop; print the packet and exact command first |
`,Ee=`---
description: Dispatch isolated OpenCode workers and manage their PR wave
agent: build
---

Manage \`$ARGUMENTS\` through separate OpenCode workers in sibling git worktrees
and unfocused CMUX workspaces.

Before dispatch:

1. Write a durable wave plan with ownership, dependencies, integration order,
   and final verification.
2. State explicitly that standalone children continue after this turn but do
   not automatically resume the manager.
3. Create one worktree and branch per disjoint assignment from the current
   remote default branch.
4. Require status files, heartbeats, verified commits, pushed branches, and PRs.

Standalone children cannot resume this manager by writing status, pushing a PR,
changing a badge, or running \`cmux notify\`. Those are durable evidence or human
alerts, not an OpenCode callback. The manager resumes only on a user message, an
in-process task result, or a separately tested supervisor prompt. Never promise
unattended progression without that wake channel.

Cut waves on complete artifacts and disjoint files. Parallel workers may read
shared files but must not edit the same integration file, lockfile, migration,
generated output, port, or database. Cap a wave around five children. Create
each sibling worktree after fetching the remote default branch, verify its path,
branch, clean status, dependencies, baseline, and fixed-port ownership.

Every cold-start assignment must name the absolute worktree and branch,
objective, owned and forbidden files, sibling workers, settled contracts,
non-goals, permission posture, model, exact tests, definition of done, and the
rule that children never push the default branch. Require a gitignored
\`.agent-status.json\` with phases \`assigned\`, \`working\`, \`verifying\`, \`pushed\`,
\`pr-open\`, \`blocked\`, and \`done\`; UTC timestamps come from \`date -u\`, update on
every transition, and heartbeat at least every ten minutes.

Before launching, ask the user which model to use when neither the repository
nor the current session has an explicit model contract that settles the choice.
Do not guess from availability, cost, or a previous unrelated child. Never add
\`--auto\` or any equivalent broad permission-approval mode unless the user
explicitly authorizes it for these workers. A copied launch command is not
authorization. Record both decisions in each assignment and launch command.

Monitor in this order: status file, Git/remote/PR/CI evidence, then the child
screen only when evidence is stale or contradictory. A stale heartbeat or a
\`done\` badge without a pushed branch is not delivery proof.

On every resumed turn, read the durable plan and status files, fetch remotes,
inspect exact-head checks, reconcile ownership, then continue the queued action.
If nothing is ready, report that and stop rather than busy-waiting. Integrate one
reviewed branch at a time, run the full suite after each merge, and clean a
worktree only after merge and after confirming no follow-up needs it.

| Failure | Response |
|---|---|
| Manager stops after dispatch | Wait for a real inbound turn; restore durable state |
| Notification produces no manager action | Correct the claim: it notified a human only |
| Two children edit one seam | Stop one writer and sequence ownership |
| Tracker says done but no PR exists | Inspect Git and require push/PR evidence |
| Child works in the wrong checkout | Stop and relaunch with absolute containment |
| Model was not specified or contractually settled | Ask before launch |
| Launch template contains \`--auto\` without explicit authorization | Remove it and ask; do not broaden permissions by convenience |
| Automated wake duplicates turns | Disable it until idle checks, dedupe, and serialization are proven |
| Manager loses the next action | Restore the synchronized plan and task queue |
`,Se=`---
description: Delegate disjoint edits to native Task children in sibling worktrees
agent: build
---

Delegate \`$ARGUMENTS\` only after confirming a fresh Build-only parent and a
dedicated sibling worktree from fresh \`origin/main\`. A parent that previously
activated Plan may pass historical denies to children even after its own Build
tools return. If the child cannot pass preflight, stop; never weaken policy or
substitute an unrelated root session.

The child remains scoped to the parent's OpenCode directory. External-directory
permission does not change relative path resolution, shell CWD, LSP/VCS scope,
or event directory. Its cold-start prompt must require:

1. The absolute worktree path and branch, with edits allowed only there.
2. Every Bash call setting \`workdir\` there or using \`git -C <absolute-path>\`.
3. Every read, edit, and patch using an absolute path inside the worktree.
4. Exclusive file ownership, non-goals, exact verification, commit/push rules,
   and the final report.
5. This guard before edits, tests, commit, and push:

       pwd
       git rev-parse --show-toplevel
       git status --short --branch

The child must stop without mutation unless both \`pwd\` and Git top-level equal
the assignment. Never fall back to the parent checkout, force-push, or push the
default branch. Parallel children must not share a lockfile, migration, port,
database, generated artifact, or integration file. Review the diff and checks
at hand-back before presenting or merging it, and never duplicate its work.

| Failure | Response |
|---|---|
| Child resolves paths in the parent checkout | Stop and relaunch with absolute containment rules |
| Tool remains denied in Build | Use a fresh Build-only parent; do not weaken rules |
| Separate branches still conflict | Sequence shared ownership or give it to one owner |
| Hand-back is unclear | Fix the prompt's deliverable and verification contract before launch |
`,Ce=`---
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
Prefer a fresh subtask context for anything larger than a small diff so the
reviewer does not inherit the author's sunk cost.

Score likelihood, cost if true, and inverted cost-to-check from 1-5; sort by
their product. Cheap checks on plausible expensive failures should rise first.

| Failure | Response |
|---|---|
| Review hedges or praises the work | Re-state the side switch and delete the defense |
| Concerns are plausible but ungrounded | Run the grep/curl/read or move them to speculative |
| Highest concern cannot be acted on | Include cost-to-check and identify one experiment |
| Same blind spot survives | Move the artifact into a fresh subtask context |
| Review ends with concerns but no decision | Emit one of the three exact verdicts |
`,Ie=`---
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
local default branch. Research axes must be independent, read-only, and large
enough to justify delegation; a needle lookup stays inline. State READ-ONLY at
both ends of each prompt. Restrict live API probes to GET and preserve verbatim
response shapes.

For later launch, fetch first, create sibling worktrees from the remote default
branch, install dependencies in each, and prove a baseline before allowing
edits. Enumerate fixed ports, writable state, databases, generated output, and
lockfiles in every receiving prompt. Only one worker may own a shared resource.
Never steal focus when creating a session.

| Failure | Response |
|---|---|
| Research agent starts implementing | Stop it and strengthen the read-only boundary |
| Receiving agent re-greps everything | Add \`file:line\` evidence and explicit negative findings |
| Scope is relitigated | Preserve the decision's rationale and evidence |
| Both workers bind one port or state directory | Keep stack-free checks parallel; serialize the shared stack |
| First test is red | Establish whether baseline or worker caused it before proceeding |
| Prompt is mangled | Store plain-ASCII text in a file; do not inline multiline shell arguments |
| Live feature silently no-ops | Probe its actual gate or API before writing the handoff |
`,Ae=`---
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

Use cmux only as an optional presentation wrapper and never steal focus. Store
the packet outside every worktree and keep secrets out of it: prompt text can
surface in shell history or process arguments. Require the child's first reply
to restate its path, branch, objective, ownership, agent, model, variant,
permission posture, and stop condition before work begins.

| Failure | Response |
|---|---|
| Child edits instead of planning | Relaunch with \`--agent plan\`; prose is not mode control |
| History was copied unexpectedly | Use a fresh TUI or run without continuation/fork flags |
| Child opens the wrong repository | Pass an absolute project path or \`--dir\` |
| Parent and child overwrite one another | Assign disjoint ownership and stop one writer |
| Secret appears in process arguments | Stop, remove it, and rotate the exposed credential |
| Provider ignores the reasoning variant | Mark acceptance UNVERIFIED until reported |

After launch, report what started and end the parent turn. Do not begin the
child's assigned work.
`,Ne=`---
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

This small utility is deliberately self-contained and adds no retrieval context
until a human invokes it.
`,Pe=`---
description: Run the checks, then write human verification steps
agent: build
---

Discover this repository's verification contract before running anything:

1. Read its agent instructions and contribution guide.
2. Inspect changed files, package or task manifests, lockfiles, CI workflows,
   and adjacent tests to identify the language, package manager, and required
   checks. Do not infer npm merely because this is an OpenCode command.
3. Prefer documented repository commands. When none exist, choose the narrowest
   standard checks supported by the detected tooling and state why.
4. Run the relevant focused checks, then the repository's required aggregate
   typecheck, test, lint, and build checks when practical. Record every exact
   command, exit status, and useful result.
5. Inspect \`git status --short\`, the diff against the actual base branch, and the
   diff stat before writing the checklist.

Never claim a check ran based on old CI, prompt text, or a remembered convention.
If any required check is red, stop and report the failure. Do not send a human
to verify a build that is already broken.

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

Research the changed routes, help text, API contracts, tests, start commands,
ports, fixtures, roles, flags, and deployment target yourself. Ask the user only
for access or product intent that the repository cannot establish. Do not use
implementation-detail checks; verify what a user can see or accomplish.

A screenshot proves one visual instant, not focus movement, persistence, time,
keyboard operation, or error handling. Exercise those behaviors directly.

After execution, list \`VERIFIED\`, \`FAILED\`, and \`UNVERIFIED\` separately, keeping
empty categories visible. End with exactly one disposition: **Ready to ship**,
**Fixes required**, **Partially verified**, or **Blocked on human access**.

| Failure | Response |
|---|---|
| Repository has no documented check commands | Inspect its manifests and CI, run only checks supported by detected tooling, and explain the choice |
| Automation is red | Stop with Fixes required |
| Infrastructure prevents a check | Mark it UNVERIFIED, never passed |
| A step lacks URL, data, viewport, role, or expected output | Add the missing setup before handing it to a human |
| Checklist exceeds 12 steps | Remove automated or low-information duplication |
`,De=`---
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

Do not work around Git's worktree safety checks. If \`origin/HEAD\` is unset, run
\`git remote set-head origin --auto\` and re-read it. If the branch exists, omit
\`-b\`; if it is checked out elsewhere, find and use that worktree instead.

Worktrees must be siblings, never nested under the clone. On cleanup, inspect
for uncommitted work before \`git worktree remove\`; use \`--force\` only when that
work is explicitly disposable. Run \`git worktree prune\` for registrations whose
directories were deleted outside Git.

| Failure | Response |
|---|---|
| New branch is already behind | Fetch and recreate it from the remote default branch |
| Branch is already checked out | Use \`git worktree list\`; do not bypass the refusal |
| New worktree commands fail immediately | Install its own dependencies |
| App has no local config | Copy required ignored config and fix relative paths |
| Server behaves like another branch | Verify the listening PID and its worktree |
| Two stacks share writable state | Stop one stack; use stack-free verification tiers |
| Deleted path remains registered | Prune stale worktrees, then confirm the list |
`,je=`---
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
`,Oe=`---
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
`,Ue=`---
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
name. The command itself carries the citation-selection and failure rules.
`,qe=`---
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
`,ze=`---
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
`,Me=`---
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
`,Fe=`---
title: Duck rules reasserted after a long session
trigger: /duck-mode
caveat: >-
  Two turns cannot demonstrate durability. This remains model-mediated behavior;
  only an output plugin such as the one described by the command can make framing deterministic.
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
`,$e=`---
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

Q1 - **Do commands get a dedicated route as well as the catalogue index?** A
single canonical route is simpler, but \`/playbooks/commands\` makes the content
type explicit in links and leaves room for later Playbook types.

-> Keep both \`/playbooks\` and \`/playbooks/commands\`, rendering one catalogue.

Q2 - **Where do command worked-examples live?** Beside the command is the
obvious answer, but \`commands/\` is a namespace: OpenCode registers every \`.md\`
in it, so a sibling file becomes a bogus slash command.

-> Separate \`command-simulations/\` directory. The alternative pollutes the
user's autocomplete.

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

The turn ends here, waiting. That is the command's actual behaviour, and a
transcript that answered its own questions would misrepresent it.
`,Be=`---
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

That is the strongest argument for this command in a long session: the expensive
part runs somewhere else and never touches the context you are preserving.

The command stops before firing. Showing the prompt is the last cheap moment to
correct scope.
`,Le=`---
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
`,Ge=`---
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

The command itself carries the inherited Plan-deny risk, containment rules,
parallel-ownership limits, and failure handling; there is no second source to
load or drift.
`,We=`---
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

**Operational cost.** Every command page now mounts a timer on load, because the
section is open by default. That is seventeen pages each starting a repeating
timeout the moment they render, and no test covers what happens when a visitor
opens several in tabs.

No hidden coupling found — \`frameDelayMs\` has exactly one caller. No
reversibility problem; this is pure presentation and reverts in one commit.

| # | Class | Objection | Evidence | L | C | Chk | Score |
|---|---|---|---|---|---|---|---|
| 1 | Assumption | Backgrounded tabs still advance | \`SimulationPanel.tsx:79\` | 5 | 3 | 5 | 75 |
| 2 | Operational | Timer starts on every page load | open-by-default in \`CommandRoute.tsx\` | 4 | 2 | 4 | 32 |

> Cheapest kill: open a command page, switch tabs for 60 seconds, come back. If
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
`,He=`---
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
`,Ve=`---
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
`,Ke=`---
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
779d9c2 feat: add session handoff command
4699eaf feat: add human verification command
$ gh pr list --author "@me" --state open --limit 10
(no open pull requests)
\`\`\`

## assistant

**Yesterday**

- Command pages now play their worked example as a timed transcript instead of a
  wall of text — autoplay, manual stepping, and a speed control.
- Two new commands landed: writing human verification checklists, and handing a
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

This command is small and self-contained. It adds no retrieval context until a
human explicitly invokes it.
`,Qe=`---
title: Checks run before the human is asked to look
trigger: /verify
caveat: >-
  The checklist is trimmed to four steps; a real one runs to eight or ten. This
  fixture repository uses npm, but the command discovers tooling before checks.
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

The assistant first inspected this repository's instructions, package manifest,
lockfile, CI, and changed tests. Those sources established npm and the three
commands shown above; the portable command did not assume them.

The automation gate remains load-bearing: a red build never reaches a human.

Note the honest split at the end. Running the commands is not the same as
looking at the page, and the report says so rather than claiming a pass.
`,Xe=`---
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

\`$ARGUMENTS\` carried \`dark-mode\` straight into the template, so the same command
can create a specifically named worktree without permanent retrieval context.

The template also owns the failure paths: stale registration, a branch already
checked out elsewhere, and a sibling worktree holding the port. One complete
command avoids a second source that could drift.
`,Ye=["user","assistant","tool","note"],Ze=/^##[ \t]+([a-z]+)(?:[ \t]+—[ \t]*(.*))?[ \t]*$/,Je=/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;function en(e){return Ye.includes(e)}function nn(e){const n=[];let t=null,o=null;for(const r of e.split(`
`)){const h=r.match(Je);if(h){const[,d,l]=h;o===null?o=d:d[0]===o[0]&&d.length>=o.length&&l.trim()===""&&(o=null),t==null||t.lines.push(r);continue}const i=o===null?r.match(Ze):null;if(i){const[,d,l]=i;if(!en(d))return null;t={role:d,label:(l==null?void 0:l.trim())||void 0,lines:[]},n.push(t);continue}if(t){t.lines.push(r);continue}if(r.trim()!=="")return null}return n}function tn(e){const{data:n,content:t}=O(e),o=(n.title??"").trim(),r=(n.trigger??"").trim(),h=(n.caveat??"").trim();if(o===""||r===""||h==="")return null;const i=nn(se(t));if(i===null||i.length===0||i[0].role!=="user")return null;const d=i.map(l=>({...l,body:l.lines.join(`
`).trim()})).filter(l=>l.body!=="").map(({role:l,label:c,body:m})=>c===void 0?{role:l,body:m}:{role:l,label:c,body:m});return d.length===0?null:{title:o,trigger:r,caveat:h,turns:d}}function an(e){const n=new Map;for(const[t,o]of Object.entries(e)){const r=t.split("/").filter(Boolean),h=r.length>1?r.at(-2)??"":"",i=h===""?null:tn(o);i&&n.set(h,i)}return n}const on=Object.assign({"../../agent-skills/commands/background.md":be,"../../agent-skills/commands/build-waves.md":we,"../../agent-skills/commands/cite-file-lines.md":ye,"../../agent-skills/commands/deep-research.md":ke,"../../agent-skills/commands/diagram.md":ve,"../../agent-skills/commands/docs-preview.md":_e,"../../agent-skills/commands/duck-mode.md":xe,"../../agent-skills/commands/grill-me.md":Re,"../../agent-skills/commands/handoff.md":Te,"../../agent-skills/commands/manager-children.md":Ee,"../../agent-skills/commands/native-worktree-subagents.md":Se,"../../agent-skills/commands/red-team.md":Ce,"../../agent-skills/commands/research-handoff.md":Ie,"../../agent-skills/commands/session-handoff.md":Ae,"../../agent-skills/commands/standup.md":Ne,"../../agent-skills/commands/verify.md":Pe,"../../agent-skills/commands/worktree-up.md":De}),sn=Object.assign({"../../agent-skills/command-simulations/background.md":je,"../../agent-skills/command-simulations/build-waves.md":Oe,"../../agent-skills/command-simulations/cite-file-lines.md":Ue,"../../agent-skills/command-simulations/deep-research.md":qe,"../../agent-skills/command-simulations/diagram.md":ze,"../../agent-skills/command-simulations/docs-preview.md":Me,"../../agent-skills/command-simulations/duck-mode.md":Fe,"../../agent-skills/command-simulations/grill-me.md":$e,"../../agent-skills/command-simulations/handoff.md":Be,"../../agent-skills/command-simulations/manager-children.md":Le,"../../agent-skills/command-simulations/native-worktree-subagents.md":Ge,"../../agent-skills/command-simulations/red-team.md":We,"../../agent-skills/command-simulations/research-handoff.md":He,"../../agent-skills/command-simulations/session-handoff.md":Ve,"../../agent-skills/command-simulations/standup.md":Ke,"../../agent-skills/command-simulations/verify.md":Qe,"../../agent-skills/command-simulations/worktree-up.md":Xe});function rn(e){return Object.fromEntries(Object.entries(e).map(([n,t])=>{var r;return[`commands/${((r=n.split("/").pop())==null?void 0:r.replace(/\.md$/u,""))??""}/SIMULATION.md`,t]}))}const T=ce(on,{simulations:an(rn(sn))});function zt(e){return T.find(n=>n.name===e)}const ln="https://github.com/leoncheng57/custom-dca-opencode",dn="main",N=`${ln}/blob/${dn}/agent-skills`,Mt={command:e=>`${N}/commands/${e}.md`,commandSimulation:e=>`${N}/command-simulations/${e}.md`},M={status:"unknown",directoryLabel:"",installedCommands:new Set},R=M;function cn(e){const n=e.replace(/\/+$/u,"");return n.slice(n.lastIndexOf("/")+1)||n}function hn(e,n){return!e||!n?M:{status:"ready",directoryLabel:cn(e),installedCommands:new Set(n.commands.map(t=>t.name))}}function un(){const e=P(),[n,t]=f.useState(R);return f.useEffect(()=>{const o=L(e.search,typeof localStorage>"u"?null:localStorage.getItem(G));if(!o){t(R);return}const r=new AbortController;let h=!1;return W.catalog(o,r.signal).then(i=>{h||t(hn(o,i))}).catch(()=>{h||t(R)}),()=>{h=!0,r.abort()}},[e.search]),n}const mn="_page_khz9n_1",pn="_content_khz9n_8",gn="_wipWarning_khz9n_14",fn="_eyebrow_khz9n_16",bn="_type_khz9n_16",wn="_filterLabel_khz9n_16",yn="_filterInput_khz9n_16",kn="_meta_khz9n_16",vn="_source_khz9n_16",_n="_terminal_khz9n_16",xn="_methodScope_khz9n_16",Rn="_hero_khz9n_20",Tn="_modalTitle_khz9n_37",En="_cardTitle_khz9n_37",Sn="_sectionTitle_khz9n_37",Cn="_lede_khz9n_42",In="_typeStats_khz9n_44",An="_typeStat_khz9n_44",Nn="_catalog_khz9n_49",Pn="_catalogHead_khz9n_50",Dn="_filter_khz9n_16",jn="_clear_khz9n_56",On="_cardLink_khz9n_57",Un="_grid_khz9n_60",qn="_card_khz9n_37",zn="_cardTop_khz9n_62",Mn="_typeCommand_khz9n_63",Fn="_loadState_khz9n_66",$n="_loadStateOn_khz9n_67",Bn="_loadStateOff_khz9n_68",Ln="_scopeNote_khz9n_69",Gn="_cardCommand_khz9n_70",Wn="_cardCopy_khz9n_71",Hn="_cardTags_khz9n_71",Vn="_empty_khz9n_72",Kn="_locations_khz9n_74",Qn="_tableWrap_khz9n_74",Xn="_table_khz9n_74",Yn="_dialog_khz9n_76",Zn="_dialogBody_khz9n_77",Jn="_close_khz9n_77",et="_modalHead_khz9n_78",nt="_modalDescription_khz9n_78",tt="_route_khz9n_78",at="_detailGrid_khz9n_79",ot="_side_khz9n_79",st="_terminalBar_khz9n_81",it="_light_khz9n_81",rt="_terminalPath_khz9n_81",lt="_terminalSource_khz9n_81",dt="_terminalTurns_khz9n_81",ct="_turn_khz9n_81",ht="_turnRole_khz9n_81",ut="_turnAssistant_khz9n_81",mt="_turnTool_khz9n_81",pt="_turnNote_khz9n_81",gt="_terminalControls_khz9n_85",ft="_terminalButton_khz9n_85",bt="_terminalButtonPrimary_khz9n_85",wt="_terminalStatus_khz9n_85",yt="_progress_khz9n_85",kt="_terminalCaveat_khz9n_85",vt="_disclosures_khz9n_87",_t="_disclosure_khz9n_87",xt="_disclosureMeta_khz9n_87",Rt="_disclosureBody_khz9n_87",Tt="_descriptionPanel_khz9n_87",Et="_descriptionBar_khz9n_87",St="_descriptionBody_khz9n_87",Ct="_method_khz9n_16",It="_methodHead_khz9n_87",At="_methodCopy_khz9n_87",Nt="_command_khz9n_87",Pt="_notFound_khz9n_87",s={page:mn,content:pn,wipWarning:gn,eyebrow:fn,type:bn,filterLabel:wn,filterInput:yn,meta:kn,source:vn,terminal:_n,methodScope:xn,hero:Rn,modalTitle:Tn,cardTitle:En,sectionTitle:Sn,lede:Cn,typeStats:In,typeStat:An,catalog:Nn,catalogHead:Pn,filter:Dn,clear:jn,cardLink:On,grid:Un,card:qn,cardTop:zn,typeCommand:Mn,loadState:Fn,loadStateOn:$n,loadStateOff:Bn,scopeNote:Ln,cardCommand:Gn,cardCopy:Wn,cardTags:Hn,empty:Vn,locations:Kn,tableWrap:Qn,table:Xn,dialog:Yn,dialogBody:Zn,close:Jn,modalHead:et,modalDescription:nt,route:tt,detailGrid:at,side:ot,terminalBar:st,light:it,terminalPath:rt,terminalSource:lt,terminalTurns:dt,turn:ct,turnRole:ht,turnAssistant:ut,turnTool:mt,turnNote:pt,terminalControls:gt,terminalButton:ft,terminalButtonPrimary:bt,terminalStatus:wt,progress:yt,terminalCaveat:kt,disclosures:vt,disclosure:_t,disclosureMeta:xt,disclosureBody:Rt,descriptionPanel:Tt,descriptionBar:Et,descriptionBody:St,method:Ct,methodHead:It,methodCopy:At,command:Nt,notFound:Pt};function F({install:e,installed:n}){return e.status!=="ready"?null:a.jsxs("span",{className:`${s.loadState} ${n?s.loadStateOn:s.loadStateOff}`,"data-installed":n,"data-testid":"opencode-playbook-command-load-state",title:`Reported by the OpenCode server for ${e.directoryLabel}. Installation is per project.`,children:[n?"Loaded":"Not loaded"," in ",e.directoryLabel]})}function Dt({command:e,install:n}){return a.jsxs("article",{className:`${s.card} ${s.cardCommand}`,"data-playbook-kind":"command","data-testid":"opencode-playbook-command-card",children:[a.jsxs("div",{className:s.cardTop,children:[a.jsxs("span",{className:`${s.type} ${s.typeCommand}`,children:[a.jsx(X,{"aria-hidden":"true",size:10})," Command · human-invoked"]}),a.jsx("span",{className:s.meta,children:e.subtask?"subtask":"session"})]}),a.jsx(F,{install:n,installed:n.installedCommands.has(e.name)}),a.jsx("h2",{className:s.cardTitle,children:le(e.name,e.takesArguments)}),a.jsx("p",{className:s.cardCopy,children:e.description}),a.jsxs("div",{className:s.cardTags,children:[e.runsShell&&a.jsx("span",{children:"shell input"}),e.agent&&a.jsx("span",{children:e.agent})]}),a.jsx(K,{className:s.cardLink,"data-testid":`opencode-playbook-command-${e.name}`,to:`/playbooks/commands/${e.name}`,children:"Read command →"})]})}function jt(){return a.jsxs("section",{className:s.locations,"aria-labelledby":"command-locations-heading",children:[a.jsx("div",{className:s.eyebrow,children:"Install locations"}),a.jsx("h2",{className:s.sectionTitle,id:"command-locations-heading",children:"Where commands live"}),a.jsx("p",{children:"Commands are individual OpenCode Markdown files. They add zero retrieval context until a human explicitly invokes one."}),a.jsx("div",{className:s.tableWrap,children:a.jsxs("table",{className:s.table,children:[a.jsx("thead",{children:a.jsxs("tr",{children:[a.jsx("th",{scope:"col",children:"Path"}),a.jsx("th",{scope:"col",children:"Scope"}),a.jsx("th",{scope:"col",children:"Read by"})]})}),a.jsx("tbody",{children:fe.map(e=>a.jsxs("tr",{children:[a.jsx("th",{scope:"row",children:e.path}),a.jsx("td",{children:e.scope}),a.jsxs("td",{children:[e.readBy,a.jsx("span",{children:e.note})]})]},e.path))})]})})]})}function Ot({detail:e}){var l;const[n,t]=f.useState(""),o=f.useRef(null),r=f.useRef(null),h=((l=P().state)==null?void 0:l.focusCatalog)===!0;f.useEffect(()=>{var c;h&&((c=r.current)==null||c.focus())},[h]);const i=un(),d=f.useMemo(()=>he(T,n),[n]);return a.jsxs("main",{className:s.page,"data-testid":"opencode-playbooks",ref:r,tabIndex:-1,children:[a.jsxs("div",{className:s.content,children:[a.jsx(H,{className:s.wipWarning,"data-testid":"opencode-playbooks-wip-warning",variant:"warning",children:"Playbooks is still work in progress and its UI/UX may contain bugs."}),a.jsxs("header",{className:s.hero,children:[a.jsxs("div",{children:[a.jsx("div",{className:s.eyebrow,children:"Repository-owned commands"}),a.jsx("h1",{children:"Repeatable work, invoked on purpose."}),a.jsx("p",{className:s.lede,children:"Each Playbook is an explicit slash command. Nothing is retrieved or added to agent context until a human invokes it; runtime reminders remain a separate per-message mechanism."})]}),a.jsxs("aside",{className:s.typeStats,"aria-label":"Playbook types",children:[a.jsxs("div",{className:s.typeStat,children:[a.jsx("strong",{children:T.length}),a.jsx("span",{children:"Commands"})]}),a.jsxs("div",{className:s.typeStat,children:[a.jsx("strong",{children:"0"}),a.jsx("span",{children:"At-rest tokens"})]})]})]}),a.jsxs("section",{className:s.catalog,"aria-labelledby":"playbook-catalog-heading",children:[a.jsxs("div",{className:s.catalogHead,children:[a.jsxs("div",{children:[a.jsx("div",{className:s.eyebrow,children:"Catalogue"}),a.jsxs("h2",{className:s.sectionTitle,id:"playbook-catalog-heading",children:[d.length," matching commands"]})]}),a.jsxs("label",{className:s.filter,children:[a.jsx(V,{"aria-hidden":"true",size:14}),a.jsx("span",{className:s.filterLabel,children:"filter"}),a.jsx("input",{className:s.filterInput,"data-testid":"opencode-playbook-filter",onChange:c=>t(c.target.value),placeholder:"name, description, or instruction",ref:o,type:"search",value:n}),n&&a.jsx("button",{"aria-label":"Clear filter",className:s.clear,"data-testid":"opencode-playbook-filter-clear",onClick:()=>{var c;t(""),(c=o.current)==null||c.focus()},type:"button",children:"×"})]})]}),d.length?a.jsx("div",{className:s.grid,children:d.map(c=>a.jsx(Dt,{command:c,install:i},c.name))}):a.jsxs("p",{className:s.empty,children:["No command matches ",a.jsx("code",{children:n.trim()}),"."]})]}),a.jsx(jt,{})]}),e]})}const Ft=Object.freeze(Object.defineProperty({__proto__:null,InstallState:F,PlaybooksPage:Ot},Symbol.toStringTag,{value:"Module"}));export{F as I,Ot as P,dn as a,Ft as b,qt as c,zt as f,le as i,Mt as p,s,un as u};
