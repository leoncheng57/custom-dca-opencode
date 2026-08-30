import{c as D,d as P,r as b,e as z,D as K,f as O,j as n,A as $,L as k,S as Y,g as X}from"./index-B3lRImxm.js";/**
 * @license lucide-react v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],J=D("sparkles",Q);/**
 * @license lucide-react v1.33.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z=[["path",{d:"m7 11 2-2-2-2",key:"1lz0vl"}],["path",{d:"M11 13h4",key:"1p7l4v"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2",key:"1m3agn"}]],ee=D("square-terminal",Z),ne=/^([|>])([+-]?)(\d*)([+-]?)$/,C=/^(\s*)([A-Za-z0-9_.-]+)\s*:\s?(.*)$/,A=/^(\s*)-\s+(.*)$/;function _(e){return e.length-e.trimStart().length}function x(e,t){if(e.length<2||!e.startsWith(t)||!e.endsWith(t))return!1;const a=e.slice(1,-1);if(t==="'"){for(let s=0;s<a.length;s+=1)if(a[s]==="'"){if(a[s+1]==="'"){s+=1;continue}return!1}return!0}for(let s=0;s<a.length;s+=1){if(a[s]==="\\"){s+=1;continue}if(a[s]==='"')return!1}return!0}function q(e){return x(e,'"')?e.slice(1,-1).replace(/\\(["\\])/g,"$1"):x(e,"'")?e.slice(1,-1).replace(/''/g,"'"):e}function U(e){if(e.startsWith('"')||e.startsWith("'"))return e;const t=e.search(/(^|\s)#/);return t===-1?e:e.slice(0,t)}function I(e){const t=U(e.trim()).trim();return q(t)}function te(e){const t=U(e.trim()).trim();if(x(t,'"')||x(t,"'"))return q(t);if(t==="true")return!0;if(t==="false")return!1;if(t!==""){const a=Number(t);if(!Number.isNaN(a))return a}return t}function ae(e){let t="",a=0;for(const s of e){if(s===""){a+=1;continue}t===""?t=s:(t+=a>0?`
`.repeat(a):" ",t+=s),a=0}return t}function se(e,t,a){return a==="strip"?e:a==="keep"?e+`
`.repeat(t+1):e===""?"":`${e}
`}function oe(e,t,a,s,r){const l=[];let i=t;for(;i+1<e.length;){const u=e[i+1];if(u.trim()===""){l.push(""),i+=1;continue}if(_(u)<=a)break;l.push(u),i+=1}let d=l.length-1;for(;d>=0&&l[d]==="";)d-=1;const c=l.length-1-d,h=l.slice(0,d+1),p=h.reduce((u,m)=>m===""?u:Math.min(u,_(m)),Number.MAX_SAFE_INTEGER),y=h.map(u=>u===""?"":u.slice(Math.min(p,_(u)))),w=s==="|"?y.join(`
`):ae(y);return{value:se(w,c,r),endIndex:i}}function ie(e){const t=e[2]||e[4];return t==="-"?"strip":t==="+"?"keep":"clip"}function re(e,t){for(let a=t+1;a<e.length;a+=1){const s=e[a];if(!(s.trim()===""||s.trimStart().startsWith("#")))return s}}function ce(e){return e.replace(/^\uFEFF/,"").replace(/\r\n?/g,`
`)}function M(e){const t=ce(e);if(!/^---[ \t]*(\n|$)/.test(t))return{data:{},content:t};const a=t.split(`
`);let s=-1;for(let h=1;h<a.length;h+=1){const p=a[h];if(p==="---"||p==="..."||/^(---|\.\.\.)[ \t]+$/.test(p)){s=h;break}}if(s===-1)return{data:{},content:t};const r=a.slice(1,s),l=a.slice(s+1).join(`
`),i={};let d=null,c=null;for(let h=0;h<r.length;h+=1){const p=r[h];if(p.trim()===""||p.trimStart().startsWith("#"))continue;const y=p.match(A);if(y&&d){const g=i[d];Array.isArray(g)&&g.push(I(y[2]));continue}const w=p.match(C);if(!w){d=null,c=null;continue}const[,u,m,f]=w,v=u.length>0;if(v&&!c)continue;v||(c=null,d=null);const E=f.trim(),T=E.match(ne);if(T){const{value:g,endIndex:V}=oe(r,h,u.length,T[1],ie(T));h=V,v&&c?i[c][m]=g:i[m]=g;continue}if(E===""){const g=re(r,h);if(g&&A.test(g)&&_(g)>=u.length){i[m]=[],d=m,c=null;continue}if(g&&_(g)>u.length&&C.test(g)){i[m]={},c=m,d=null;continue}v&&c?i[c][m]="":i[m]="";continue}if(v&&c){i[c][m]=I(f);continue}i[m]=te(f),d=null}return{data:i,content:l}}function de(e){return e.replace(/^\s*#\s+.+?(\n+|$)/,"")}const le=/\$ARGUMENTS\b|\$[1-9]\b/,he=/!`[^`]+`/;function F(e){return/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e)}function ue(e,t){return e<t?-1:e>t?1:0}function L(e){const t=e.split("/").filter(Boolean).pop()??"";return t.endsWith(".md")?t.slice(0,-3):""}function pe(e,t){return t?`/${e} <arguments>`:`/${e}`}function me(e,t,a={}){const s=L(e);if(!F(s))return null;const{data:r,content:l}=M(t),i=l.trim(),d=(r.description??"").trim();return i===""?null:{name:s,description:d,agent:r.agent,model:r.model,subtask:r.subtask===!0,body:i,takesArguments:le.test(i),runsShell:he.test(i),...a.simulation?{simulation:a.simulation}:{},bytes:typeof TextEncoder>"u"?t.length:new TextEncoder().encode(t).length}}function ge(e,t={}){return Object.entries(e).map(([a,s])=>{var r;return me(a,s,{simulation:(r=t.simulations)==null?void 0:r.get(L(a))})}).filter(a=>a!==null).sort((a,s)=>ue(a.name,s.name))}function fe(e,t){const a=t.trim().toLowerCase();return a===""?e:e.filter(s=>[s.name,s.description,s.body].join(" ").toLowerCase().includes(a))}const be="leoncheng57",ye="custom-dca-opencode",B=`${be}/${ye}`,we=`https://github.com/${B}`,N="agent-skills",ve="main";function ha(e){if(!F(e))throw new Error(`Invalid command name: ${e}`);const t=`https://raw.githubusercontent.com/${B}/${ve}/${N}/commands/${e}.md`;return[{id:"curl-global",label:"curl",scope:"global",note:"Recommended. Available in every project you open with OpenCode.",command:["mkdir -p ~/.config/opencode/commands && \\",`curl -sL ${t} \\`,`  -o ~/.config/opencode/commands/${e}.md`].join(`
`)},{id:"curl-project",label:"curl into a project",scope:"project",note:"Commits with the repo, so the command travels with the codebase and loads only there.",command:["# from the root of your project","mkdir -p .opencode/commands && \\",`curl -sL ${t} \\`,`  -o .opencode/commands/${e}.md`].join(`
`)},{id:"symlink",label:"clone + symlink",scope:"global",note:"Stays updatable: git pull in the clone refreshes the live command.",command:[`git clone ${we}.git ~/src/custom-dca-opencode   # once`,"mkdir -p ~/.config/opencode/commands",`ln -s ~/src/custom-dca-opencode/${N}/commands/${e}.md \\`,`      ~/.config/opencode/commands/${e}.md`].join(`
`)}]}const ke=[{path:"~/.config/opencode/commands/<name>.md",scope:"Global",readBy:"OpenCode",note:"Every project. Start here."},{path:".opencode/commands/<name>.md",scope:"Project",readBy:"OpenCode",note:"Committed with the repo; loads only inside it."},{path:".claude/commands/<name>.md",scope:"Project",readBy:"Claude Code",note:"Different frontmatter dialect (argument-hint, allowed-tools). Not shipped here."}],_e=`---
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
`,xe=`---
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
`,Te=`---
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
`,Re=`---
description: Operate DCA sessions through the native BFF API
agent: build
---

Use DCA's BFF API for \`$ARGUMENTS\`. This is the agent-facing HTTP workflow for
creating, prompting, and observing sessions. It is distinct from DCA's
human-only "Start a DCA session" composer workflow: that UI asks a human to
review and launch a session, while this command calls already-authorized BFF
endpoints directly.

First establish the boundary:

1. Set \`DCA_BASE_URL\` to the deployment's canonical BFF origin, without a
   trailing slash. Do not assume \`127.0.0.1\`, a port, or even that loopback is
   reachable from this shell. A remote, containerized, sandboxed, or phone-side
   shell may need a private DNS/Tailscale URL or may have no route at all.
2. Use the deployment's existing authentication mechanism. The examples below
   omit auth headers; that is valid only for a private deployment that actually
   has no app-level auth. Never invent a token or put a secret in a tracked file.
3. Confirm network access and upstream health before creating anything:

\`\`\`bash
: "\${DCA_BASE_URL:?Set DCA_BASE_URL to the reachable DCA BFF origin}"
curl -sS --fail-with-body "$DCA_BASE_URL/api/health" | jq .
\`\`\`

\`healthy: true\` proves the BFF answered. Also inspect \`upstream.reachable\`,
\`upstream.versionMatches\`, and \`events.connected\`; do not flatten those distinct
signals into one claim.

Use an absolute project path and URL-encode it. List root sessions:

\`\`\`bash
PROJECT=/absolute/path/to/project
curl -sS --fail-with-body --get "$DCA_BASE_URL/api/sessions" \\
  --data-urlencode "directory=$PROJECT" \\
  --data-urlencode "roots=true" \\
  --data-urlencode "limit=50" | jq .
\`\`\`

Create a root and submit its first prompt in one request. \`mode\` is \`plan\` or
\`build\`; the server validates any \`model\` and optional isolated worktree fields.

\`\`\`bash
BODY=$(jq -n \\
  --arg directory "$PROJECT" \\
  --arg title "Investigate flaky export test" \\
  --arg prompt "Diagnose the flaky export test. Do not edit files; report evidence." \\
  '{directory:$directory,title:$title,prompt:$prompt,mode:"plan"}')
CREATED=$(curl -sS --fail-with-body -X POST "$DCA_BASE_URL/api/sessions" \\
  -H 'Content-Type: application/json' -d "$BODY")
SESSION_ID=$(jq -er '.session.id' <<<"$CREATED")
printf '%s\\n' "$SESSION_ID"
\`\`\`

For an existing session, submit a prompt asynchronously. HTTP \`202\` and
\`{"accepted":true}\` mean accepted, not completed:

\`\`\`bash
KNOWN_ASSISTANTS=$(curl -sS --fail-with-body --get \\
  "$DCA_BASE_URL/api/sessions/$SESSION_ID/messages" \\
  --data-urlencode "directory=$PROJECT" --data-urlencode "limit=100" \\
  | jq -c '[.messages[]? | select(.info.role == "assistant") | .info.id]')
BODY=$(jq -n --arg directory "$PROJECT" --arg text "Continue and verify the fix." \\
  '{directory:$directory,text:$text,mode:"build"}')
curl -sS --fail-with-body -X POST \\
  "$DCA_BASE_URL/api/sessions/$SESSION_ID/prompt" \\
  -H 'Content-Type: application/json' -d "$BODY" | jq .
\`\`\`

Poll messages with the same directory until the submitted turn has a completed
assistant response and \`running\` is false. Responses contain raw OpenCode
\`{info,parts}\` messages, plus \`nextCursor\` and \`running\`; inspect the payload
rather than guessing a fixed array position. Use \`before=<nextCursor>\` for older
pages and keep \`limit\` between 1 and 100.

\`\`\`bash
while :; do
  PAGE=$(curl -sS --fail-with-body --get \\
    "$DCA_BASE_URL/api/sessions/$SESSION_ID/messages" \\
    --data-urlencode "directory=$PROJECT" --data-urlencode "limit=100") || exit
  jq '{running, messages}' <<<"$PAGE"
  # Stop only after identifying this turn's completed assistant message.
  jq -e --argjson known "$KNOWN_ASSISTANTS" '.running == false and
    any(.messages[]?; .info.role == "assistant" and
      .info.time.completed != null and
      (.info.id as $id | ($known | index($id)) == null))' \\
    >/dev/null <<<"$PAGE" && break
  sleep 3
done
\`\`\`

Use a Managed Child instead of a root when parent/child accounting, inherited
project scope, child status, or parent-scoped abort authority matters. Query the
server-owned agent catalogue first. Read-only agents reject \`authorization\`;
agents whose catalogue entry has \`access: "can-modify"\` require the explicit
\`authorization: "modify"\` field. The idempotency key must be stable for a retry
of the same launch and unique for different work.

\`\`\`bash
PARENT_ID=ses_parent
curl -sS --fail-with-body --get "$DCA_BASE_URL/api/managed-child-agents" \\
  --data-urlencode "directory=$PROJECT" | jq .

KEY="audit-export-$(date -u +%Y%m%dT%H%M%SZ)"
BODY=$(jq -n --arg directory "$PROJECT" --arg key "$KEY" \\
  --arg prompt "Audit export error handling and report findings with file lines." \\
  '{directory:$directory,prompt:$prompt,agent:"explore",idempotencyKey:$key}')
CHILD=$(curl -sS --fail-with-body -X POST \\
  "$DCA_BASE_URL/api/sessions/$PARENT_ID/managed-children" \\
  -H 'Content-Type: application/json' -d "$BODY")
CHILD_ID=$(jq -er '.session.id' <<<"$CHILD")
\`\`\`

The creation request submits the Managed Child's initial prompt. Poll the child
through \`/api/sessions/$CHILD_ID/messages\`; later prompts use the ordinary
\`/api/sessions/$CHILD_ID/prompt\` route, which re-verifies its managed
configuration. Inspect parent accounting with
\`GET /api/sessions/$PARENT_ID/subagents?directory=...\`. Abort a verified child
with \`POST /api/sessions/$PARENT_ID/subagents/$CHILD_ID/abort\` and the directory
in the JSON body; do not use abort as routine completion handling.

Useful read surfaces are \`GET /api/sessions/:id\`, \`todos\`, \`diff\` with a
\`userMessageID\`, \`/api/session-agents\`, \`/api/models\`, and \`/api/events\` for SSE.
Sharing, deleting, auto-approval, aborting, isolated worktree creation, and
modify-capable Managed Children are mutations or privilege-bearing operations;
call them only when the user's request and current permissions authorize them.

Prefer this BFF API over cmux for DCA session lifecycle. cmux is optional
presentation or orchestration only when its app, CLI/socket access, and current
environment are actually available; it is not a transport fallback and this
command never assumes it exists.
`,Se=`---
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
`,Ee=`---
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
`,Ce=`---
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
`,Ae=`---
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
`,Ie=`---
description: Complete an objective autonomously with durable checkpoints
agent: build
---

Complete the rest of this objective as one sustained run: \`$ARGUMENTS\`

Do not ask whether to continue. Work through research, implementation, fixes,
and final verification until the objective is complete or a real user decision
blocks it.

Before changing code:

1. Read repository instructions and inspect the relevant code, tests, current
   branch, and worktree state. Do not overwrite unrelated changes.
2. Translate the objective into acceptance criteria and a task list that
   includes final verification. Record assumptions separately from facts.
3. Create a durable checkpoint using the project's existing status/plan
   convention. If none exists, write a clearly named progress file outside the
   git worktree in a persistent user-state directory, not a temporary directory,
   and report its absolute path. Include the objective, criteria, assumptions,
   current task, completed tasks, touched files, verification, and restart
   instructions. Mirror the active task in the session todo list.

During the run:

- Make the best reasonable guess for ambiguous, reversible, non-safety choices.
  Record the guess and rationale in the checkpoint, implement it, and continue.
- Prefer the smallest correct change and established repository conventions.
- Update the checkpoint and todo list after each meaningful boundary, before a
  long operation, and after any verification failure. Keep timestamps in UTC.
- Treat failed checks as work to diagnose and fix, not as a reason to ask whether
  to proceed. Rerun affected checks after each bounded fix.
- Preserve Plan/Build and tool permissions. Never switch modes, alter policy, or
  bypass a permission denial to gain authority the session does not have.
- Obey every confirmation gate. Do not invent credentials, tokens, approvals,
  facts, test results, or access. Never expose secrets in checkpoints or output.
- Ask one focused question only when progress requires a genuinely irreversible
  or destructive action, security/privacy authorization, privilege escalation,
  spending decision, unavailable credential/access grant, or product choice
  whose plausible answers have materially different consequences. State what
  was tried, the exact decision needed, safe options, and what remains preserved.
- Do not turn inconvenience, ordinary ambiguity, or a recoverable test failure
  into a user question. Continue all independent work before declaring blocked.

At completion, run the repository's relevant focused and broad verification.
Inspect the final diff and status for accidental or unrelated changes. Update
the durable checkpoint to completed or blocked, with exact commands and results.
Report acceptance criteria, changed files, assumptions made, verification,
remaining risks, and any work that exists only locally. Never claim completion
from an accepted asynchronous operation; poll or otherwise verify its outcome.
`,Ne=`---
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
`,je=`---
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
`,De=`---
description: Stop safely, push authorized progress, and leave an accurate status
agent: build
---

Wrap up the current run now. \`$ARGUMENTS\` may name the branch, PR, issue, or
human update destination. Complete these steps in order; do not stop after a
chat-only summary.

1. Stop work owned by this run. Cancel this run's background agents, test
   runners, preview servers, and other processes that could keep mutating state.
   Verify they stopped. Never kill a process merely because its name or port
   looks familiar: establish that this run started or owns it. Leave unrelated
   user and sibling-worktree processes alone.
2. Inspect the repository root, branch, worktree, status, diff, staged diff, and
   recent commits. Separate this run's intended changes from pre-existing or
   unrelated user changes. Scan intended paths for credentials and generated
   secret files. Never stage or commit secrets, and never absorb unrelated
   changes just to make the tree clean.
3. Run the most relevant affordable verification for this run's changes. Record
   each check as green, red, or not run, including the command and concise reason.
   A red check does not justify hiding otherwise useful progress.
4. Preserve real progress under the repository's permissions and the user's
   explicit commit/push instructions. If authorized, stage only owned files,
   commit them, and push the current feature branch even when verification is
   red, with the failure stated plainly. Never push \`main\` or another protected
   default branch. Do not force-push. If commit or push is not authorized, is
   rejected, or would include unsafe/unrelated content, leave it uncommitted or
   local and report that fact as a blocker instead of bypassing the gate.
5. Refresh every project-defined status artifact with the current UTC timestamp,
   exact branch/commit/push state, verification results, blockers, and next
   action. Supersede stale claims. Reconcile the task list immediately: completed
   work is completed, intentionally dropped work is cancelled, and only genuine
   remaining work stays pending. If a status artifact is tracked, include its
   final update in the authorized push, using a small follow-up commit when the
   progress commit already exists. Do not let status sync create new local-only
   state.
6. Post one human-readable update to each destination the project explicitly
   defines and this run is authorized to use, such as its PR or issue. Do not
   invent a destination or leak details to a public channel. Include what is
   green and red, why anything is red, what is committed and pushed versus only
   local, open decisions requiring a human, and the next command or owner.
7. If there is a PR, end the posted update and final response with exactly one
   accurate verdict: \`SAFE TO MERGE\` only when the intended change is pushed,
   required checks are green, and no blocking decision remains; otherwise \`DO
   NOT MERGE\`, followed by the blocking facts. Re-read remote/PR state after the
   push before choosing the verdict.

Finish with the branch, pushed commit (or \`not pushed\`), stopped-work evidence,
verification matrix, status destinations updated, open decisions, and merge
verdict. Accuracy is more important than making the wrap-up look green.
`,Pe=`---
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
`,Oe=`---
description: Produce a five-minute transcript-first technical design narrative
agent: plan
---

Write a mini design doc for \`$ARGUMENTS\`. If no subject is supplied, use the
medium-sized technical or product decision currently under discussion.

This command is self-contained. Do not load or defer to a skill. The result
belongs in the current transcript, must take less than five minutes to read, and
must not create files or expand into a multi-artifact RFC unless explicitly
requested.

Inspect the relevant code, callers, tests, contracts, and existing decisions
before recommending anything. Identify the single decision the reader needs to
make. Label load-bearing statements as \`Verified\`, \`Inferred\`, or \`Proposed\`
when prose alone could blur their status, and cite repository-relative
\`path:line-line\` or primary sources for claims that determine the decision.

Use the smallest useful subset of this sequence:

1. **Today / Problem:** concrete current behavior and the friction or failure.
2. **Proposed Experience or Design:** make the target state tangible.
3. **Flow:** trace the main user action, request, state, or data path.
4. **Rules and Boundaries:** accepted/rejected inputs, trust and authority,
   state ownership, constraints, and the expensive direction to be wrong.
5. **Alternatives:** compare only credible options on decision-relevant axes.
6. **Why Not:** reject the most tempting oversized or unsafe choice with facts.
7. **Scope Split:** \`Now\`, \`Later\`, and \`Non-goals\`.
8. **Recommendation:** one clear sentence naming the central choice and why.

Omit a section that adds no decision value. Do not fill headings to imitate
rigor, pad alternatives with strawmen, or repeat a diagram in prose.

Use compact ASCII only when spatial grouping, sequence, side-by-side comparison,
architecture, or a UI sketch is faster to understand than prose. Prefer at most
one current/target comparison and one execution flow. Use realistic names,
values, and actions; annotate risks at the step where they occur; keep lines at
or below 100 columns when practical. Use a compact table for alternatives and a
short list for linear scope or acceptance rules.

Explicitly cover security, mobile, accessibility, operations, compatibility,
and dependencies only when they can change the choice. Keep follow-up work
separate from the immediate recommendation. End with the recommendation, not a
generic summary or an open-ended list of options.
`,$e=`---
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
`,qe=`---
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
`,Ue=`---
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
`,Me=`---
description: Review code or a PR with findings first and exact learning excerpts
agent: plan
---

Review \`$ARGUMENTS\` as a senior engineer and turn the result into a concise
learning walkthrough. If no target is supplied, review the current diff. Honor
any requested subsystem or boundary first, such as authentication or an
external-runtime integration.

This command is self-contained. Do not load or defer to a skill. Do not change
code, post comments, open issues, or persist the walkthrough unless the user
explicitly asks after the review.

## Review before teaching

Inspect the complete diff and enough surrounding code, callers, tests,
configuration, and contracts to understand behavior across layers. For a PR,
review the whole change at its pinned head revision rather than only the latest
commit. Reproduce or run focused checks when safe and feasible.

Return findings first, ordered by severity. Each finding must contain:

- severity and a precise title;
- repository-relative \`path:line-line\` at the defect or risky behavior;
- concrete failure mode and affected user/system;
- evidence establishing the claim;
- the smallest useful remediation direction, without implementing it.

Separate \`Verified findings\` from \`Unverified risks\`. A verified finding is
supported by implementation, a reproducer, test output, or an authoritative
contract. An unverified risk names exactly what evidence is missing and the
cheapest check. Do not inflate educational observations into findings.

If there are no findings, say that explicitly before teaching and name residual
risks and test gaps. "No findings" never means "proved correct".

## Then teach from a small evidence set

After findings, select two to five high-value excerpts. Choose code that explains
an invariant, boundary, state transition, failure strategy, or non-obvious
tradeoff. Do not quote routine plumbing, the whole diff, or several snippets
that teach the same lesson.

For every excerpt:

1. give an exact repository-relative \`path:line-line\` verified against the
   reviewed revision;
2. quote the smallest contiguous source range that is independently readable;
3. state whether it is \`Finding evidence\` or \`Educational\`;
4. explain the engineering lesson and why the implementation shape matters;
5. connect it to the preceding and following layer;
6. state what the excerpt does not prove.

Use this output shape:

\`\`\`text
Verified findings
1. [severity] Title — path:line-line
   Failure, evidence, remediation direction.

Unverified risks
- Risk — missing evidence; cheapest verification.

Layer map
HTTP route -> service/pool -> sidecar protocol -> external SDK

Learning excerpts
1. path:line-line — Finding evidence | Educational
   <minimal exact quote>
   Lesson: ...
   Connection: previous layer -> this code -> next layer.
   Does not prove: ...

Residual risks and test gaps
- ...
\`\`\`

Adapt the layer map to the repository. Distinguish control flow from authority:
a route calling a service does not prove the service may trust browser input,
and a mock sidecar does not prove the external SDK behaves the same way. Keep
quoted lines exact, explanations concise, and educational value subordinate to
the correctness review.
`,Fe=`---
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
`,Le=`---
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
`,Be=`---
description: Build an evidence-led senior system-design review package
agent: build
---

Create a senior-SWE system-design review package for \`$ARGUMENTS\`. If the
subject is omitted, use the system or proposal currently under discussion.

This command is self-contained. Do not load or defer to a skill.

## Establish the assignment

Before writing, state one mode:

- \`current-state\`: explain only behavior supported by present evidence;
- \`target-state\`: design proposed behavior without presenting it as shipped;
- \`mixed\`: keep current and target views visibly separate in every artifact.

Identify the audience, decision they need to make, repository boundary, and
whether the user requested transcript output, repository files, or publication.
Do not create files or publish anything unless requested. Never publish directly
to a default branch. If publication is requested, use a draft PR.

## Audit evidence first

Inspect the relevant implementation, callers, tests, fixtures, schemas/live
contracts, decisions, incidents, and operational configuration. Prefer the live
contract over secondary documentation when the repository says it is
authoritative. Do not run destructive probes, production operations, migrations,
or writes merely to strengthen a document. Ask before a probe that has cost,
external effects, credentials, or production reach.

Tag important claims in notes and artifacts with exactly one evidence class:

| Class | Meaning |
| --- | --- |
| \`observed\` | Reproduced by a named command or live probe, with environment and date |
| \`code-supported\` | Directly established by cited implementation or tests |
| \`mock-only\` | Demonstrated only by a fixture, fake, simulator, or test double |
| \`inferred\` | Best explanation from evidence, but not directly established |
| \`unknown\` | Evidence is absent, contradictory, inaccessible, or intentionally unprobed |

Mocks never prove live upstream behavior. A test proves only the contract it
actually exercises. Keep proposed behavior out of current-state claims. Cite
repository-relative \`path:line-line\`, a command plus bounded output, or a primary
source URL for every load-bearing claim.

## Build the system model

Before selecting artifacts, identify:

1. system and trust boundaries;
2. state owner for every important datum;
3. durable, process-local, derived, cached, and presentation-only state;
4. authority and permission checks at each mutation boundary;
5. concurrency units, serialization points, dedupe keys, replay, and idempotency;
6. lifecycle state separately from transport events and UI presentation;
7. failure boundaries, restart reconciliation, partial success, and rollback;
8. the expensive direction to be wrong for each uncertain decision.

Write down the load-bearing invariants. Examples of useful invariant shapes are
"absence from a process-local status map is not proof of idle" and "a browser
candidate grants no authority until the server validates it". Use repository
facts, not these examples, in the package.

## Select artifacts; do not generate a checklist blindly

Start with a manifest and include an artifact only when it gives a distinct
review perspective:

\`\`\`yaml
mode: current-state | target-state | mixed
subject: <specific system or decision>
audience: senior-swe
decision: <what the reviewer must decide or understand>
evidence:
  live_probes: required | optional | prohibited
  destructive_actions: prohibited-by-default
artifacts:
  - id: <artifact-id>
    question: <unique review question this artifact answers>
    evidence_classes: [observed, code-supported]
omissions:
  - artifact: <catalogue item>
    reason: <why it adds no distinct review value>
\`\`\`

Use this selection logic:

| Review question | Prefer |
| --- | --- |
| Why does the system behave this way? | executive system guide or implementation RFC |
| What changes between now and target? | paired architecture/data-flow diagrams |
| Which transitions are legal? | state machine plus normative transition table |
| What crosses a boundary? | API contract, sequence diagram, and data model |
| Who owns and persists state? | ownership/persistence matrix |
| What happens on crash, retry, or restart? | failure/reconciliation diagram and catalogue |
| What can an attacker or confused deputy do? | threat model and security-test matrix |
| Why this choice? | focused ADRs for consequential alternatives only |
| How can this ship safely? | dependency graph, milestones, migration, rollout, rollback |
| How will operators know? | signals, SLOs, alerts, dashboards, and runbook |
| How can a reviewer safely verify it? | non-destructive lab or commands with expected output |
| Does interaction or motion carry the idea? | responsive HTML, accessible SVG, or short demo |

Do not create interactive HTML, animation, video, or a machine-readable failure
catalogue unless the medium itself answers a review question. Decorative copies
of prose are omissions, not deliverables.

## Artifact contracts

Every selected artifact begins with: purpose, mode, evidence classes used,
authoritative sources, uncertainties, and links to related artifacts. Then apply
the relevant contract:

- **Guide/RFC:** problem and decision first; explain causality, invariants,
  boundaries, ownership, failure behavior, and consequences.
- **Diagram:** include a legend; label authority/state boundaries; annotate races
  and failure points where they occur; pair mixed-mode views instead of blending
  them.
- **State table:** name state owner and persistence; include trigger, guard,
  transition, side effect, retry/idempotency behavior, invalid transition, and
  restart outcome.
- **API/data contract:** include caller, authority, validation, request/response,
  errors, idempotency, compatibility, limits, and redaction. Mark illustrative
  schemas as proposals.
- **Ownership matrix:** include datum, authority, writer, readers, persistence,
  cache/derivation, reconciliation, and deletion/retention.
- **Threat model:** identify assets, actors, entry points, trust boundaries,
  abuse cases, mitigations, residual risk, and executable security checks.
- **ADR:** one decision and status; context, credible alternatives, choice,
  consequences, reversibility, and evidence that would reopen it.
- **Implementation plan:** order by dependencies; name ownership, acceptance
  evidence, rollout gates, migration, rollback, and intentionally deferred work.
- **Operations:** connect each SLO and alert to a user-visible failure, then give
  diagnosis, safe mitigation, escalation, and recovery verification.
- **Failure catalogue:** stable scenario ID, preconditions, injection, expected
  state/events, invariant, observability, cleanup, and safety classification.
- **Interactive artifact:** keyboard and touch operation, reduced motion,
  semantic structure, no secret/live data, responsive checks, and a static
  fallback carrying the same information.

## Link and verify the package

Create one index with a recommended review order. For each artifact list its
question, mode, evidence status, prerequisite, and unresolved gaps. Cross-link
concepts by stable anchors or relative paths. Do not make the reviewer hunt for
the current/target boundary or the source behind a claim.

Verify only what exists:

1. check every cited path and line range against the reviewed revision;
2. lint/parse Markdown, Mermaid, YAML, JSON, OpenAPI, and HTML with repository
   tooling where available;
3. execute safe examples and contract validation in an isolated environment;
4. render diagrams and inspect labels, clipping, and legibility;
5. test interactive output at desktop and mobile widths, keyboard-only, screen
   reader semantics, contrast, and reduced motion;
6. run relevant repository typechecks/tests and record exact commands/results;
7. list anything not run and why; never turn "not checked" into "passed".

Return or commit only the requested output. If a draft PR was requested, ensure
it clearly says \`Draft\`, separates current facts from proposals, links the
package index, reports verification and gaps, includes human verification steps,
and does not claim that opening the PR deploys or operates the system.
`,We=`---
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
`,Ge=`---
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
`,He=`---
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
`,Ve=`---
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
`,ze=`---
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
`,Ke=`---
title: A root worker is launched and observed without cmux
trigger: /dca
caveat: >-
  Authentication is omitted because the example deployment is explicitly a
  private unauthenticated BFF. Poll payloads are shortened to one message.
---

# Worked example

## user

/dca start a read-only root worker to inspect the export tests

## assistant

I will use the DCA BFF directly. This shell has \`DCA_BASE_URL\` set to the
deployment's private Tailscale origin; I will verify that route rather than
assuming loopback or cmux access.

## tool — bash

\`\`\`
$ curl -sS --fail-with-body "$DCA_BASE_URL/api/health" | jq .
{
  "healthy": true,
  "upstream": {"reachable": true, "versionMatches": true},
  "events": {"connected": true}
}
$ curl -sS --fail-with-body -X POST "$DCA_BASE_URL/api/sessions" \\
    -H 'Content-Type: application/json' \\
    -d '{"directory":"/srv/app","title":"Export test audit","prompt":"Inspect export tests read-only and report findings with file lines.","mode":"plan"}'
{"session":{"id":"ses_audit_42","title":"Export test audit"}}
\`\`\`

## assistant

The root session is \`ses_audit_42\`. Creation accepted its initial prompt; that
does not prove the turn finished, so I am polling its messages.

## tool — bash

\`\`\`
$ curl -sS --fail-with-body --get \\
    "$DCA_BASE_URL/api/sessions/ses_audit_42/messages" \\
    --data-urlencode 'directory=/srv/app' --data-urlencode 'limit=100' | jq .
{"messages":[{"info":{"role":"assistant","time":{"completed":1788031234000}},"parts":[{"type":"text","text":"Found two uncovered branches..."}]}],"nextCursor":null,"running":false}
\`\`\`

## assistant

The submitted turn now has a completed assistant message and the session is not
running. The audit found two uncovered branches and made no file changes. I used
a root because no parent accounting was requested; a Managed Child would be the
correct route if this work needed to appear under an existing parent.

## note

The example checks the BFF, upstream, and event stream separately, and it treats
session creation as acceptance rather than completion. cmux is absent because it
is not required for the lifecycle being demonstrated.
`,Ye=`---
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
`,Xe=`---
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
`,Qe=`---
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
`,Je=`---
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
`,Ze=`---
title: A long objective survives an assumption and a failed check
trigger: /goal
caveat: >-
  Repository discovery, several implementation edits, and broad test output are
  abbreviated. The checkpoint updates represent boundaries across a longer run.
---

# Worked example

## user

/goal finish CSV export, including tests and the empty state

## assistant

I found no repository-owned plan artifact, so I created
\`/Users/you/.local/state/opencode-goals/app-csv-export.md\` and mirrored its queue
in the session todo list.
The objective is complete when export escapes cells, preserves column order,
handles zero rows, and passes focused plus full verification.

Assumption A1: an empty result should download a header-only CSV. That is
reversible, matches the existing JSON export's stable schema, and needs no
security or destructive authorization, so I recorded it and continued.

## tool — bash

\`\`\`
$ npm test -- tests/csv-export.test.ts
Tests  8 passed, 1 failed
FAIL empty export: expected "name,email\\n", received ""
\`\`\`

## assistant

The failure confirms the empty-state path bypasses the serializer. I updated the
checkpoint with the failure, fixed that path, and continued without asking for
permission to retry.

## tool — bash

\`\`\`
$ npm test -- tests/csv-export.test.ts
Tests  9 passed
$ npm run typecheck
typecheck passed
$ npm test
Tests  247 passed
$ git status --short
 M src/export/csv.ts
 M tests/csv-export.test.ts
\`\`\`

## assistant

Objective complete. The durable checkpoint is marked completed with the exact
commands above and restart state \`none\`.

- Acceptance criteria: 4/4 met
- Assumptions: A1, header-only empty export, implemented and documented
- Verification: focused 9/9, typecheck green, full suite 247/247
- Final diff: only the serializer and its focused test
- Remaining risk: spreadsheet formula interpretation is unchanged and outside
  this objective
- Local state: two modified files, not committed because no commit was requested

## note

The agent made a reversible product guess and documented it. It did not ask
"should I fix the test?" after a normal failure, and it did not confuse passing
the focused test with final completion.
`,en=`---
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
`,nn=`---
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
`,tn=`---
title: A red but recoverable run is pushed and labelled honestly
trigger: /leaving-now-wrap-up
caveat: >-
  The repository inspection, secret scan, status write, and remote reread are
  compressed. The example shows one owned process and one unrelated dirty file.
---

# Worked example

## user

/leaving-now-wrap-up post what you have to the current pull request

## assistant

I am stopping only work this run owns, then I will preserve and report the
current state. I will not include the pre-existing \`.env.local\` change.

## tool — bash

\`\`\`
$ kill 48120 && wait 48120
owned Playwright PID 48120 stopped
$ git status --short
 M .env.local
?? src/retry-policy.ts
?? tests/retry-policy.test.ts
$ npm test -- tests/retry-policy.test.ts
1 failed, 7 passed
failure: retry deadline is exceeded by 4 ms
\`\`\`

## assistant

The focused test is red, but the two owned files are useful progress and the
user authorized a push. I am staging only those files; \`.env.local\` remains
untouched.

## tool — bash

\`\`\`
$ git add src/retry-policy.ts tests/retry-policy.test.ts
$ git commit -m "wip: add bounded retry policy"
[feat/retry-policy 31b87da] wip: add bounded retry policy
$ git push -u origin feat/retry-policy
$ date -u +%Y-%m-%dT%H:%M:%SZ
2026-08-29T20:14:05Z
$ gh pr view 412 --json url,headRefName,statusCheckRollup
https://github.com/acme/app/pull/412
\`\`\`

## assistant

Posted to the current pull request and refreshed \`.agent-status.json\` at
\`2026-08-29T20:14:05Z\`.

- Branch: \`feat/retry-policy\`
- Pushed: \`31b87da\`
- Stopped: owned Playwright PID 48120; unrelated processes were not touched
- Green: 7 focused assertions
- Red: retry deadline assertion exceeds the bound by 4 ms
- Local only: pre-existing \`.env.local\`, intentionally excluded
- Human decision: none; next owner should fix the deadline accounting and rerun
  the full suite

DO NOT MERGE: required focused verification is red.

## note

The command does not equate "wrap up" with "make the tree clean." It preserves
owned progress while leaving an unrelated local file alone, and it derives the
merge verdict from the reread remote state rather than from an earlier snapshot.
`,an=`---
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
`,sn=`---
title: File-viewer mini design doc quality example
trigger: /mini-design-doc
caveat: >-
  This verbatim issue-supplied quality example predates the implemented command;
  its cited paths and product choices are illustrative, not re-verified here.
---

# Worked example

## user

/mini-design-doc propose direct transcript-to-file navigation

## assistant

oday

Transcript message                  Workspace drawer
-----------------                  ----------------
"See scripts/launchd.ts:222"        Files | Changes | Preview
        |                                  |
        v                                  v
Rendered as plain inline code         Flat folder listing
                                      |
                                      v
                                      Plain <pre> file content
Result: the human must manually:
1. Open Workspace
2. Browse to scripts/
3. Select launchd.ts
4. Find line 222

Structured file attachments are slightly better, but still inert:

OpenCode file part
       |
       v
Attachment chip: [ paperclip launchd.ts ]
       |
       v
Not clickable
Proposed Experience

Transcript message
------------------
"See [scripts/launchd.ts:222]"
click
          |
          v
+--------------------------------------------------------------+
| Workspace drawer                                       Close |
| Files | Changes | Preview                                    |
+------------------------+-------------------------------------+
| Filter files...        | scripts / launchd.ts                |
|                        | [launchd.ts] [dev.sh]               |
| v scripts              |-------------------------------------|
|   - dev-preflight.ts   | 218 | ...                            |
|   - dev.sh             | 219 | ...                            |
|   - launchd.ts   M     | 220 | ...                            |
|                         | 221 | ...                            |
|                         |>222 | const DEFAULT_PORT = 3210;    |
| v client               | 223 | ...                            |
+------------------------+-------------------------------------+


The drawer opens, the file loads, and line 222 receives a
temporary highlight.

The transcript remains where it was. The drawer is still temporary, as you chose.

Click Flow

Assistant response
       |
       | contains:
       | \`scripts/launchd.ts:222\`
       v
Markdown/file-reference parser
       |
       | Is this an allowed workspace-relative path?
       v
BFF validates it
       |
       | rejects: ../secrets, .env, ignored files,
       |          symlink escapes, absolute paths
       v
Render an accessible file button
       |
       | user clicks
       v
Conversation state sets:
{ path: "scripts/launchd.ts", startLine: 222 }
       |
       v
Workspace drawer:
opens Files tab
expands scripts/
selects launchd.ts
loads content
scrolls to and highlights line 222
Reference Rules

Safe and supported
------------------
\`client/pages/Conversation.tsx:724\`
\`server/routes/workspace.ts:20-40\`
\`client/ds/markdown.tsx#L150-L176\`
[Open viewer](file:client/components/workspace-panels.tsx#L15)
Not automatically linked
-------------------------
client/pages/Conversation.tsx:724   <- ordinary prose
/etc/passwd                          <- absolute path
../../secret                         <- traversal
file:///private/key                  <- arbitrary local URL
\`something-that-is-not-a-file\`      <- fails validation

This avoids turning every code-formatted word into a misleading or unsafe link.

Viewer Choice

Option                  Mobile   Lines/Search   Size/Complexity   Decision
----------------------  -------  -------------  ----------------  --------
Plain <pre>             Yes      No             Tiny              Replace
Shiki/Refractor         Yes      Partial        Small             Not enough
Monaco / VS Code editor No       Yes            Large/workers     Reject
Theia / OpenVSCode      Mixed    Yes            Entire platform   Reject
CodeMirror 6            Yes      Yes            Modular           Use
CodeMirror 6 gives us a read-only code-reading surface:

+ syntax highlighting
+ line-number gutter
+ Cmd/Ctrl+F search
+ copy and text selection
+ programmatic jump to a line/range
+ large-file viewport rendering
+ mobile support
no need to become a text editor
Why Not Embed Another App

Current application
Browser -> React SPA -> Express BFF -> OpenCode server
Embedding Theia/OpenVSCode
Browser -> React SPA -> embedded IDE -> extra backend/process
                    \\-> Express BFF -> OpenCode server


More infrastructure, security surface, and competing workspace state.

Instead, borrow proven interaction patterns from OpenCode upstream:

OpenCode upstream concepts        This drawer
--------------------------        ----------------------------
Recursive tree                    Recursive tree
Active file row                   Active file row
Changed M/A/D markers             Changed M/A/D markers
File tabs                         File tabs
Path filter                       Path filter
Breadcrumb navigation             Breadcrumb navigation
Do not import its SolidJS UI or its whole application state.

Scope Split

Now: file inspection
--------------------
Transcript links -> file/line
Recursive tree
Tabs + breadcrumbs
Read-only CodeMirror viewer
Search/copy/line highlighting
Mobile Tree -> File flow
Later GitHub issue: change review
---------------------------------
Richer working-tree UI
Split/hunk diffs
Turn-specific change navigation
Review-oriented interactions

The core product idea is: the agent cites a file, and the workspace drawer makes that citation immediately inspectable.

## note

The response above is reproduced verbatim from issue #142 as the required
quality example. The command itself carries the reusable constraints so this
large example is not submitted on every invocation.
`,on=`---
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
`,rn=`---
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
`,cn=`---
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
`,dn=`---
title: Authentication review before an educational layer walkthrough
trigger: /review-learning
caveat: >-
  The excerpts are intentionally short and illustrative; a real review would
  quote exact lines from the pinned PR head and include actual test output.
---

# Worked example

## user

/review-learning PR #123, first focus on authentication

## assistant

Verified findings

1. [high] Tenant identity is accepted from the request body -
   \`server/routes/export.ts:41-46\`

   The route passes caller-authored \`tenantId\` to the export service without
   comparing it to the authenticated principal. A user can request another
   tenant's export. This is established by the route and the service accepting
   that value; bind tenant identity server-side before calling the service.

Unverified risks

- The sidecar may accept unsigned callbacks - its production configuration is
  not in this repository; inspect the deployed callback-auth policy.

Layer map

\`HTTP route -> ExportService -> worker protocol -> object store SDK\`

Learning excerpts

1. \`server/routes/export.ts:41-46\` - Finding evidence

   \`\`\`ts
   const { tenantId, format } = req.body
   const job = await exports.start({ tenantId, format })
   res.status(202).json(job)
   \`\`\`

   Lesson: parsing input and authorizing its authority are separate operations.
   Connection: authenticated HTTP request -> route boundary -> privileged export
   service. Does not prove: whether a gateway rejects cross-tenant values first.

2. \`server/export/service.ts:72-79\` - Educational

   \`\`\`ts
   const key = \`\${request.tenantId}/\${job.id}.\${request.format}\`
   await worker.enqueue({ jobId: job.id, key })
   \`\`\`

   Lesson: an authorization miss becomes durable namespace selection at the
   service boundary. Connection: route input -> service key -> worker/object
   store. Does not prove: the object store's own IAM policy.

Residual risks and test gaps

- No focused test attempts a cross-tenant export.
- The production sidecar and object-store policies were not available.

## note

The authorization defect is ranked before the teaching material. The second
excerpt is labelled educational rather than promoted into another finding.
`,ln=`---
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
`,hn=`---
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
`,un=`---
title: Selecting a mixed-state queue review package
trigger: /system-design-artifacts
caveat: >-
  The transcript shows package selection and evidence discipline, not the many
  linked files or rendered artifacts that a real requested package would contain.
---

# Worked example

## user

/system-design-artifacts document the current queue and propose durable replay

## tool — grep

Searched queue ownership, event subscription, persistence, reconnect, and replay
terms in the server, client, tests, and architecture decisions.

## assistant

Mode: \`mixed\`. The current-state and target-state views will be paired, never
combined into one ambiguous diagram.

Decision: reviewers need to decide whether durable replay is justified and where
its watermark belongs.

Evidence ledger:

| Claim | Class | Evidence |
| --- | --- | --- |
| reconnect refetches state | \`code-supported\` | \`client/lib/events.ts:88-112\` |
| classic SSE has no cursor | \`observed\` | live OpenAPI probe, 2026-08-29 |
| fixture replays missed events | \`mock-only\` | \`tests/mock-server.ts:410-438\` |
| a durable watermark closes every gap | \`unknown\` | retention semantics unprobed |

Selected package:

1. System guide: explains current ownership, transport, and why refetch exists.
2. Paired current/target sequence diagrams: isolates the proposed watermark.
3. Ownership matrix: answers who persists cursor, events, and projections.
4. Failure catalogue: disconnect during write, expired cursor, duplicate replay,
   and restart between persistence and delivery.
5. ADR: compares refetch-only, bounded replay, and full event sourcing.
6. Rollout/runbook: shadow watermark, mismatch signal, rollback to refetch.

Omitted: interactive HTML and animation add no review perspective; an OpenAPI
contract is deferred until the target endpoint is chosen.

Review order: system guide -> paired sequences -> ownership matrix -> failure
catalogue -> ADR -> rollout. Every target artifact will carry a \`Proposed\`
banner and link back to the current-state source evidence.

## note

The mock claim remains explicitly mock-only even though it demonstrates the
desired UX. Artifact omissions are deliberate and reviewable rather than silent.
`,pn=`---
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
`,mn=`---
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
`,gn=["user","assistant","tool","note"],fn=/^##[ \t]+([a-z]+)(?:[ \t]+—[ \t]*(.*))?[ \t]*$/,bn=/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;function yn(e){return gn.includes(e)}function wn(e){const t=[];let a=null,s=null;for(const r of e.split(`
`)){const l=r.match(bn);if(l){const[,d,c]=l;s===null?s=d:d[0]===s[0]&&d.length>=s.length&&c.trim()===""&&(s=null),a==null||a.lines.push(r);continue}const i=s===null?r.match(fn):null;if(i){const[,d,c]=i;if(!yn(d))return null;a={role:d,label:(c==null?void 0:c.trim())||void 0,lines:[]},t.push(a);continue}if(a){a.lines.push(r);continue}if(r.trim()!=="")return null}return t}function vn(e){const{data:t,content:a}=M(e),s=(t.title??"").trim(),r=(t.trigger??"").trim(),l=(t.caveat??"").trim();if(s===""||r===""||l==="")return null;const i=wn(de(a));if(i===null||i.length===0||i[0].role!=="user")return null;const d=i.map(c=>({...c,body:c.lines.join(`
`).trim()})).filter(c=>c.body!=="").map(({role:c,label:h,body:p})=>h===void 0?{role:c,body:p}:{role:c,label:h,body:p});return d.length===0?null:{title:s,trigger:r,caveat:l,turns:d}}function kn(e){const t=new Map;for(const[a,s]of Object.entries(e)){const r=a.split("/").filter(Boolean),l=r.length>1?r.at(-2)??"":"",i=l===""?null:vn(s);i&&t.set(l,i)}return t}const _n=Object.assign({"../../agent-skills/commands/background.md":_e,"../../agent-skills/commands/build-waves.md":xe,"../../agent-skills/commands/cite-file-lines.md":Te,"../../agent-skills/commands/dca.md":Re,"../../agent-skills/commands/deep-research.md":Se,"../../agent-skills/commands/diagram.md":Ee,"../../agent-skills/commands/docs-preview.md":Ce,"../../agent-skills/commands/duck-mode.md":Ae,"../../agent-skills/commands/goal.md":Ie,"../../agent-skills/commands/grill-me.md":Ne,"../../agent-skills/commands/handoff.md":je,"../../agent-skills/commands/leaving-now-wrap-up.md":De,"../../agent-skills/commands/manager-children.md":Pe,"../../agent-skills/commands/mini-design-doc.md":Oe,"../../agent-skills/commands/native-worktree-subagents.md":$e,"../../agent-skills/commands/red-team.md":qe,"../../agent-skills/commands/research-handoff.md":Ue,"../../agent-skills/commands/review-learning.md":Me,"../../agent-skills/commands/session-handoff.md":Fe,"../../agent-skills/commands/standup.md":Le,"../../agent-skills/commands/system-design-artifacts.md":Be,"../../agent-skills/commands/verify.md":We,"../../agent-skills/commands/worktree-up.md":Ge}),xn=Object.assign({"../../agent-skills/command-simulations/background.md":He,"../../agent-skills/command-simulations/build-waves.md":Ve,"../../agent-skills/command-simulations/cite-file-lines.md":ze,"../../agent-skills/command-simulations/dca.md":Ke,"../../agent-skills/command-simulations/deep-research.md":Ye,"../../agent-skills/command-simulations/diagram.md":Xe,"../../agent-skills/command-simulations/docs-preview.md":Qe,"../../agent-skills/command-simulations/duck-mode.md":Je,"../../agent-skills/command-simulations/goal.md":Ze,"../../agent-skills/command-simulations/grill-me.md":en,"../../agent-skills/command-simulations/handoff.md":nn,"../../agent-skills/command-simulations/leaving-now-wrap-up.md":tn,"../../agent-skills/command-simulations/manager-children.md":an,"../../agent-skills/command-simulations/mini-design-doc.md":sn,"../../agent-skills/command-simulations/native-worktree-subagents.md":on,"../../agent-skills/command-simulations/red-team.md":rn,"../../agent-skills/command-simulations/research-handoff.md":cn,"../../agent-skills/command-simulations/review-learning.md":dn,"../../agent-skills/command-simulations/session-handoff.md":ln,"../../agent-skills/command-simulations/standup.md":hn,"../../agent-skills/command-simulations/system-design-artifacts.md":un,"../../agent-skills/command-simulations/verify.md":pn,"../../agent-skills/command-simulations/worktree-up.md":mn});function Tn(e){return Object.fromEntries(Object.entries(e).map(([t,a])=>{var r;return[`commands/${((r=t.split("/").pop())==null?void 0:r.replace(/\.md$/u,""))??""}/SIMULATION.md`,a]}))}const S=ge(_n,{simulations:kn(Tn(xn))});function ua(e){return S.find(t=>t.name===e)}const Rn="https://github.com/leoncheng57/custom-dca-opencode",Sn="main",j=`${Rn}/blob/${Sn}/agent-skills`,pa={command:e=>`${j}/commands/${e}.md`,commandSimulation:e=>`${j}/command-simulations/${e}.md`},W={status:"unknown",directoryLabel:"",installedCommands:new Set},R=W;function En(e){const t=e.replace(/\/+$/u,"");return t.slice(t.lastIndexOf("/")+1)||t}function Cn(e,t){return!e||!t?W:{status:"ready",directoryLabel:En(e),installedCommands:new Set(t.commands.map(a=>a.name))}}function An(){const e=P(),[t,a]=b.useState(R);return b.useEffect(()=>{const s=z(e.search,typeof localStorage>"u"?null:localStorage.getItem(K));if(!s){a(R);return}const r=new AbortController;let l=!1;return O.catalog(s,r.signal).then(i=>{l||a(Cn(s,i))}).catch(()=>{l||a(R)}),()=>{l=!0,r.abort()}},[e.search]),t}const In="_page_nt2c5_1",Nn="_content_nt2c5_8",jn="_wipWarning_nt2c5_14",Dn="_eyebrow_nt2c5_16",Pn="_type_nt2c5_16",On="_filterLabel_nt2c5_16",$n="_filterInput_nt2c5_16",qn="_meta_nt2c5_16",Un="_source_nt2c5_16",Mn="_terminal_nt2c5_16",Fn="_methodScope_nt2c5_16",Ln="_hero_nt2c5_20",Bn="_modalTitle_nt2c5_37",Wn="_cardTitle_nt2c5_37",Gn="_sectionTitle_nt2c5_37",Hn="_lede_nt2c5_42",Vn="_typeStats_nt2c5_44",zn="_typeStat_nt2c5_44",Kn="_catalog_nt2c5_49",Yn="_catalogHead_nt2c5_50",Xn="_catalogHeading_nt2c5_51",Qn="_categoryNav_nt2c5_53",Jn="_filter_nt2c5_16",Zn="_clear_nt2c5_60",et="_cardLink_nt2c5_61",nt="_grid_nt2c5_64",tt="_card_nt2c5_37",at="_cardTop_nt2c5_66",st="_typeCommand_nt2c5_67",ot="_typeWorkflow_nt2c5_68",it="_loadState_nt2c5_71",rt="_loadStateOn_nt2c5_72",ct="_loadStateOff_nt2c5_73",dt="_scopeNote_nt2c5_74",lt="_cardCommand_nt2c5_75",ht="_cardWorkflow_nt2c5_76",ut="_cardCopy_nt2c5_77",pt="_cardTags_nt2c5_77",mt="_empty_nt2c5_78",gt="_workflowState_nt2c5_79",ft="_workflowGroup_nt2c5_80",bt="_injectorPreview_nt2c5_81",yt="_injectorDetail_nt2c5_81",wt="_locations_nt2c5_83",vt="_tableWrap_nt2c5_83",kt="_table_nt2c5_83",_t="_dialog_nt2c5_85",xt="_dialogBody_nt2c5_86",Tt="_close_nt2c5_86",Rt="_modalHead_nt2c5_87",St="_modalDescription_nt2c5_87",Et="_route_nt2c5_87",Ct="_detailGrid_nt2c5_88",At="_side_nt2c5_88",It="_terminalBar_nt2c5_91",Nt="_light_nt2c5_91",jt="_terminalPath_nt2c5_91",Dt="_terminalSource_nt2c5_91",Pt="_terminalTurns_nt2c5_91",Ot="_turn_nt2c5_91",$t="_turnRole_nt2c5_91",qt="_turnAssistant_nt2c5_91",Ut="_turnTool_nt2c5_91",Mt="_turnNote_nt2c5_91",Ft="_terminalControls_nt2c5_95",Lt="_terminalButton_nt2c5_95",Bt="_terminalButtonPrimary_nt2c5_95",Wt="_terminalStatus_nt2c5_95",Gt="_progress_nt2c5_95",Ht="_terminalCaveat_nt2c5_95",Vt="_disclosures_nt2c5_97",zt="_disclosure_nt2c5_97",Kt="_disclosureMeta_nt2c5_97",Yt="_disclosureBody_nt2c5_97",Xt="_descriptionPanel_nt2c5_97",Qt="_descriptionBar_nt2c5_97",Jt="_descriptionBody_nt2c5_97",Zt="_method_nt2c5_16",ea="_methodHead_nt2c5_97",na="_methodCopy_nt2c5_97",ta="_command_nt2c5_97",aa="_notFound_nt2c5_97",o={page:In,content:Nn,wipWarning:jn,eyebrow:Dn,type:Pn,filterLabel:On,filterInput:$n,meta:qn,source:Un,terminal:Mn,methodScope:Fn,hero:Ln,modalTitle:Bn,cardTitle:Wn,sectionTitle:Gn,lede:Hn,typeStats:Vn,typeStat:zn,catalog:Kn,catalogHead:Yn,catalogHeading:Xn,categoryNav:Qn,filter:Jn,clear:Zn,cardLink:et,grid:nt,card:tt,cardTop:at,typeCommand:st,typeWorkflow:ot,loadState:it,loadStateOn:rt,loadStateOff:ct,scopeNote:dt,cardCommand:lt,cardWorkflow:ht,cardCopy:ut,cardTags:pt,empty:mt,workflowState:gt,workflowGroup:ft,injectorPreview:bt,injectorDetail:yt,locations:wt,tableWrap:vt,table:kt,dialog:_t,dialogBody:xt,close:Tt,modalHead:Rt,modalDescription:St,route:Et,detailGrid:Ct,side:At,terminalBar:It,light:Nt,terminalPath:jt,terminalSource:Dt,terminalTurns:Pt,turn:Ot,turnRole:$t,turnAssistant:qt,turnTool:Ut,turnNote:Mt,terminalControls:Ft,terminalButton:Lt,terminalButtonPrimary:Bt,terminalStatus:Wt,progress:Gt,terminalCaveat:Ht,disclosures:Vt,disclosure:zt,disclosureMeta:Kt,disclosureBody:Yt,descriptionPanel:Xt,descriptionBar:Qt,descriptionBody:Jt,method:Zt,methodHead:ea,methodCopy:na,command:ta,notFound:aa};function G(e=!0){const[t,a]=b.useState({status:"loading",workflows:[]});return b.useEffect(()=>{if(!e)return;let s=!1;return a({status:"loading",workflows:[]}),O.workflows().then(({workflows:r})=>{s||a({status:"ready",workflows:r})},()=>{s||a({status:"error",workflows:[]})}),()=>{s=!0}},[e]),t}function H({install:e,installed:t}){return e.status!=="ready"?null:n.jsxs("span",{className:`${o.loadState} ${t?o.loadStateOn:o.loadStateOff}`,"data-installed":t,"data-testid":"opencode-playbook-command-load-state",title:`Reported by the OpenCode server for ${e.directoryLabel}. Installation is per project.`,children:[t?"Loaded":"Not loaded"," in ",e.directoryLabel]})}function sa({command:e,install:t}){return n.jsxs("article",{className:`${o.card} ${o.cardCommand}`,"data-playbook-kind":"command","data-testid":"opencode-playbook-command-card",children:[n.jsxs("div",{className:o.cardTop,children:[n.jsxs("span",{className:`${o.type} ${o.typeCommand}`,children:[n.jsx(ee,{"aria-hidden":"true",size:10})," Command - human-invoked"]}),n.jsx("span",{className:o.meta,children:e.subtask?"subtask":"session"})]}),n.jsx(H,{install:t,installed:t.installedCommands.has(e.name)}),n.jsx("h2",{className:o.cardTitle,children:pe(e.name,e.takesArguments)}),n.jsx("p",{className:o.cardCopy,children:e.description}),n.jsxs("div",{className:o.cardTags,children:[e.runsShell&&n.jsx("span",{children:"shell input"}),e.agent&&n.jsx("span",{children:e.agent})]}),n.jsx(k,{className:o.cardLink,"data-testid":`opencode-playbook-command-${e.name}`,to:`/playbooks/commands/${e.name}`,children:"Read command ->"})]})}function oa({workflow:e,group:t}){return n.jsxs("article",{className:`${o.card} ${o.cardWorkflow}`,"data-playbook-kind":"workflow","data-testid":"opencode-playbook-workflow-card",children:[n.jsxs("div",{className:o.cardTop,children:[n.jsxs("span",{className:`${o.type} ${o.typeWorkflow}`,children:[n.jsx(J,{"aria-hidden":"true",size:10})," Workflow - guided action"]}),n.jsx("span",{className:o.meta,children:t})]}),n.jsx("h2",{className:o.cardTitle,children:e.title}),n.jsx("p",{className:o.cardCopy,children:e.description}),n.jsxs("details",{className:o.injectorPreview,children:[n.jsx("summary",{"data-testid":`opencode-playbook-workflow-injector-${e.id}`,children:"Trusted injector"}),n.jsx("pre",{children:n.jsx("code",{children:e.injector})})]}),n.jsx(k,{className:o.cardLink,"data-testid":`opencode-playbook-workflow-${e.id}`,to:`/playbooks/workflows/${e.id}`,children:"Read workflow ->"})]})}function ia(){return n.jsxs("section",{className:o.locations,"aria-labelledby":"command-locations-heading",children:[n.jsx("div",{className:o.eyebrow,children:"Install locations"}),n.jsx("h2",{className:o.sectionTitle,id:"command-locations-heading",children:"Where commands live"}),n.jsx("p",{children:"Commands are individual OpenCode Markdown files. They add zero retrieval context until a human explicitly invokes one."}),n.jsx("div",{className:o.tableWrap,children:n.jsxs("table",{className:o.table,children:[n.jsx("thead",{children:n.jsxs("tr",{children:[n.jsx("th",{scope:"col",children:"Path"}),n.jsx("th",{scope:"col",children:"Scope"}),n.jsx("th",{scope:"col",children:"Read by"})]})}),n.jsx("tbody",{children:ke.map(e=>n.jsxs("tr",{children:[n.jsx("th",{scope:"row",children:e.path}),n.jsx("td",{children:e.scope}),n.jsxs("td",{children:[e.readBy,n.jsx("span",{children:e.note})]})]},e.path))})]})})]})}function ra({query:e}){const t=An(),a=b.useMemo(()=>fe(S,e),[e]);return n.jsxs(n.Fragment,{children:[n.jsxs("div",{className:o.catalogHeading,children:[n.jsx("div",{className:o.eyebrow,children:"Commands"}),n.jsxs("h2",{className:o.sectionTitle,children:[a.length," matching commands"]})]}),a.length?n.jsx("div",{className:o.grid,children:a.map(s=>n.jsx(sa,{command:s,install:t},s.name))}):n.jsxs("p",{className:o.empty,children:["No command matches ",n.jsx("code",{children:e.trim()}),"."]}),n.jsx(ia,{})]})}function ca({commandsRendered:e,query:t,state:a}){if(a.status==="loading")return n.jsx("p",{className:o.empty,"data-testid":"opencode-playbook-workflows-loading",children:"Loading workflows..."});if(a.status==="error")return n.jsxs($,{className:o.workflowState,"data-testid":"opencode-playbook-workflows-error",variant:"danger",children:["Workflows could not be loaded. ",e?"Commands remain available.":"Try again after the catalogue is available."]});const s=t.trim().toLowerCase(),r=X(a.workflows).map(({label:i,workflows:d})=>({label:i,workflows:d.filter(c=>!s||`${c.title} ${c.description} ${c.id} ${c.injector}`.toLowerCase().includes(s))})).filter(({workflows:i})=>i.length),l=r.reduce((i,d)=>i+d.workflows.length,0);return n.jsxs("div",{"data-testid":"opencode-playbook-workflows-ready",children:[n.jsxs("div",{className:o.catalogHeading,children:[n.jsx("div",{className:o.eyebrow,children:"Workflows"}),n.jsxs("h2",{className:o.sectionTitle,children:[l," matching workflows"]})]}),a.workflows.length===0?n.jsx("p",{className:o.empty,"data-testid":"opencode-playbook-workflows-empty",children:"No workflows are available."}):l===0?n.jsxs("p",{className:o.empty,children:["No workflow matches ",n.jsx("code",{children:t.trim()}),"."]}):r.map(({label:i,workflows:d})=>n.jsxs("section",{"aria-labelledby":`workflow-group-${i.toLowerCase()}`,className:o.workflowGroup,"data-testid":"opencode-playbook-workflow-group",children:[n.jsx("h3",{id:`workflow-group-${i.toLowerCase()}`,children:i}),n.jsx("div",{className:o.grid,children:d.map(c=>n.jsx(oa,{group:i,workflow:c},c.id))})]},i))]})}function da({detail:e,workflowState:t}){var m;const[a,s]=b.useState(""),r=b.useRef(null),l=b.useRef(null),i=P(),d=((m=i.state)==null?void 0:m.focusCatalog)===!0,c=i.pathname.startsWith("/playbooks/commands"),h=i.pathname.startsWith("/playbooks/workflows"),p=!h,y=!c,w=G(y&&t===void 0),u=t??w;return b.useEffect(()=>{var f;d&&((f=l.current)==null||f.focus())},[d]),n.jsxs("main",{className:o.page,"data-testid":"opencode-playbooks",ref:l,tabIndex:-1,children:[n.jsxs("div",{className:o.content,children:[n.jsx($,{className:o.wipWarning,"data-testid":"opencode-playbooks-wip-warning",variant:"warning",children:"Playbooks is still work in progress and its UI/UX may contain bugs."}),n.jsxs("header",{className:o.hero,children:[n.jsxs("div",{children:[n.jsx("div",{className:o.eyebrow,children:"Commands and live workflows"}),n.jsx("h1",{children:"Repeatable work, invoked on purpose."}),n.jsx("p",{className:o.lede,children:"Commands are repository-owned procedures. Workflows are guided actions loaded live from the trusted server catalogue; runtime reminders remain a separate per-message mechanism."})]}),n.jsxs("aside",{className:o.typeStats,"aria-label":"Playbook types",children:[n.jsxs("div",{className:o.typeStat,children:[n.jsx("strong",{children:S.length}),n.jsx("span",{children:"Commands"})]}),n.jsxs("div",{className:o.typeStat,children:[n.jsx("strong",{children:u.status==="ready"?u.workflows.length:"-"}),n.jsx("span",{children:"Workflows"})]}),n.jsxs("div",{className:o.typeStat,children:[n.jsx("strong",{children:"0"}),n.jsx("span",{children:"At-rest tokens"})]})]})]}),n.jsxs("nav",{"aria-label":"Playbook categories",className:o.categoryNav,children:[n.jsx(k,{"aria-current":!c&&!h?"page":void 0,"data-testid":"opencode-playbooks-all",to:"/playbooks",children:"All"}),n.jsx(k,{"aria-current":c?"page":void 0,"data-testid":"opencode-playbooks-commands",to:"/playbooks/commands",children:"Commands"}),n.jsx(k,{"aria-current":h?"page":void 0,"data-testid":"opencode-playbooks-workflows",to:"/playbooks/workflows",children:"Workflows"})]}),n.jsxs("section",{className:o.catalog,"aria-labelledby":"playbook-catalog-heading",children:[n.jsxs("div",{className:o.catalogHead,children:[n.jsxs("div",{children:[n.jsx("div",{className:o.eyebrow,children:"Catalogue"}),n.jsx("h2",{className:o.sectionTitle,id:"playbook-catalog-heading",children:c?"Commands":h?"Workflows":"All Playbooks"})]}),n.jsxs("label",{className:o.filter,children:[n.jsx(Y,{"aria-hidden":"true",size:14}),n.jsx("span",{className:o.filterLabel,children:"filter"}),n.jsx("input",{className:o.filterInput,"data-testid":"opencode-playbook-filter",onChange:f=>s(f.target.value),placeholder:"name, description, or instruction",ref:r,type:"search",value:a}),a&&n.jsx("button",{"aria-label":"Clear filter",className:o.clear,"data-testid":"opencode-playbook-filter-clear",onClick:()=>{var f;s(""),(f=r.current)==null||f.focus()},type:"button",children:"x"})]})]}),p&&n.jsx(ra,{query:a}),y&&n.jsx(ca,{commandsRendered:p,query:a,state:u})]})]}),e]})}const ma=Object.freeze(Object.defineProperty({__proto__:null,InstallState:H,PlaybooksPage:da,useWorkflowCatalogue:G},Symbol.toStringTag,{value:"Module"}));export{H as I,da as P,Sn as a,G as b,ha as c,ma as d,ua as f,pe as i,pa as p,o as s,An as u};
