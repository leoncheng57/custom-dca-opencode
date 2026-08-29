---
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
       | `scripts/launchd.ts:222`
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
`client/pages/Conversation.tsx:724`
`server/routes/workspace.ts:20-40`
`client/ds/markdown.tsx#L150-L176`
[Open viewer](file:client/components/workspace-panels.tsx#L15)
Not automatically linked
-------------------------
client/pages/Conversation.tsx:724   <- ordinary prose
/etc/passwd                          <- absolute path
../../secret                         <- traversal
file:///private/key                  <- arbitrary local URL
`something-that-is-not-a-file`      <- fails validation

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
                    \-> Express BFF -> OpenCode server


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
