export type GuideTone = "neutral" | "info" | "success" | "warning" | "danger" | "plan" | "build";

export interface GuideRow {
  label: string;
  title: string;
  detail: string;
  tone?: GuideTone;
  code?: string;
}

export interface GuideScene {
  id: string;
  title: string;
  summary: string;
  status: string;
  mode?: "Plan" | "Build";
  rows: GuideRow[];
  inspectorTitle: string;
  inspector: Array<{ label: string; value: string; tone?: GuideTone }>;
  actions?: string[];
  caveat: string;
}

export interface GuideChapter {
  id: string;
  number: string;
  shortTitle: string;
  title: string;
  description: string;
  scenes: GuideScene[];
}

export const guideChapters: GuideChapter[] = [
  {
    id: "control-plane",
    number: "01",
    shortTitle: "Architecture",
    title: "One host process, many project views",
    description:
      "The browser is a control plane over the same OpenCode process used by terminal clients. The project directory scopes almost every request.",
    scenes: [
      {
        id: "system-map",
        title: "The request path",
        summary: "Phone and desktop use the same React SPA and Express BFF; credentials never enter the browser.",
        status: "Connected to OpenCode 1.18.21",
        rows: [
          { label: "CLIENTS", title: "Desktop browser + phone over Tailscale", detail: "Responsive views of the same session", tone: "info" },
          { label: "CONTROL PLANE", title: "React SPA -> Express BFF", detail: "The BFF validates directories and owns credentials", tone: "success" },
          { label: "AGENT", title: "One long-lived opencode serve", detail: "All project sessions share one host process", code: "directory=/Users/sam/Projects/orbit" },
        ],
        inspectorTitle: "Boundary",
        inspector: [
          { label: "Runtime", value: "Host-native" },
          { label: "Container", value: "None", tone: "warning" },
          { label: "Project selector", value: "Absolute directory" },
          { label: "Credential", value: "BFF only", tone: "success" },
        ],
        caveat: "This is a topology simulation. It does not connect to an OpenCode server.",
      },
      {
        id: "async-events",
        title: "Submit quickly, reconcile authoritatively",
        summary: "A UI prompt uses prompt_async. Global SSE signals that something changed; a refetch supplies durable state.",
        status: "Turn running · browser may disconnect safely",
        mode: "Plan",
        rows: [
          { label: "1 · POLICY", title: "Activate Plan for this session", detail: "Mode policy and prompt submission share one critical section", tone: "plan" },
          { label: "2 · REQUEST", title: "POST /session/ses_demo/prompt_async", detail: "Returns 204 without blocking for the agent turn", code: "?directory=/Users/sam/Projects/orbit" },
          { label: "3 · EVENT", title: "GET /global/event emits a nudge", detail: "The client demultiplexes by directory", tone: "info" },
          { label: "4 · REFETCH", title: "Transcript and status are reconciled", detail: "Classic SSE has no replay cursor", tone: "success" },
        ],
        inspectorTitle: "Reconnect",
        inspector: [
          { label: "Agent", value: "Still running", tone: "success" },
          { label: "Event replay", value: "Unavailable", tone: "warning" },
          { label: "Recovery", value: "Refetch state" },
        ],
        actions: ["Disconnect browser", "Reconnect + refetch"],
        caveat: "SSE is treated as invalidation, never as the only copy of transcript state.",
      },
    ],
  },
  {
    id: "long-sessions",
    number: "02",
    shortTitle: "Long sessions",
    title: "Pagination without losing your place",
    description:
      "The newest transcript page opens first. Earlier pages prepend above the reader, while live output only follows when the reader is already near the bottom.",
    scenes: [
      {
        id: "pagination",
        title: "225 messages, three bounded pages",
        summary: "Load earlier preserves the visible anchor instead of jumping the reader to the top.",
        status: "Showing messages 126–225 of 225",
        rows: [
          { label: "EARLIER", title: "100 messages available before this page", detail: "The next cursor belongs to the oldest loaded message", tone: "info" },
          { label: "YOU · BUILD", title: "Please run the focused verification.", detail: "Message 224", tone: "build" },
          { label: "ASSISTANT · BUILD", title: "The focused tests pass; I am checking the full suite.", detail: "Message 225", tone: "build" },
        ],
        inspectorTitle: "Transcript window",
        inspector: [
          { label: "Loaded", value: "100" },
          { label: "Earlier", value: "125" },
          { label: "Page sizes", value: "100 / 100 / 25" },
          { label: "Scroll anchor", value: "Preserved", tone: "success" },
        ],
        actions: ["Load earlier", "Load all 225"],
        caveat: "The public fixture models page boundaries; it contains no exported conversation.",
      },
      {
        id: "live-growth",
        title: "New activity does not steal the viewport",
        summary: "When the reader scrolls up, streaming rows can grow while a Jump to latest affordance appears.",
        status: "3 new updates below",
        rows: [
          { label: "TOOL", title: "npm test", detail: "Running 142 checks…", tone: "info", code: "vitest run" },
          { label: "READER", title: "Viewing an earlier patch", detail: "Automatic follow is paused", tone: "warning" },
          { label: "LIVE", title: "Three updates arrived below", detail: "Reader position remains stable", tone: "success" },
        ],
        inspectorTitle: "Follow behavior",
        inspector: [
          { label: "Near bottom", value: "No" },
          { label: "Auto-follow", value: "Paused" },
          { label: "Unread updates", value: "3", tone: "info" },
        ],
        actions: ["Jump to latest"],
        caveat: "A reconnect uses fetched state, so missed events cannot silently erase rows.",
      },
      {
        id: "interrupted-turn",
        title: "Interrupted is detected, never auto-replayed",
        summary: "An incomplete assistant turn absent from process-local status is flagged after a restart.",
        status: "Turn may have been interrupted",
        rows: [
          { label: "ASSISTANT", title: "Updating the parser and…", detail: "No completion timestamp", tone: "warning" },
          { label: "PROCESS", title: "Session is absent from /session/status", detail: "The previous process no longer owns this run", tone: "danger" },
          { label: "RECOVERY", title: "Resume pre-fills the composer", detail: "The human reviews before sending", tone: "success" },
        ],
        inspectorTitle: "Accepted risk",
        inspector: [
          { label: "Durable running state", value: "None", tone: "warning" },
          { label: "Auto-resume", value: "Disabled", tone: "success" },
          { label: "Resume action", value: "Prefill only" },
        ],
        actions: ["Prefill resume"],
        caveat: "Automatic replay could repeat destructive work, so this guide does not pretend recovery is lossless.",
      },
    ],
  },
  {
    id: "plan-build",
    number: "03",
    shortTitle: "Plan / Build",
    title: "Mode is activated before every prompt",
    description:
      "Plan and Build are session policy transitions, not cosmetic composer states. Existing transcript pills record provenance, not guaranteed capability.",
    scenes: [
      {
        id: "plan-safety",
        title: "Plan permits research and blocks mutation",
        summary: "Discovered mutating tools receive last-match-wins denies before the prompt can start.",
        status: "Plan policy active",
        mode: "Plan",
        rows: [
          { label: "YOU · PLAN", title: "Trace how notifications are resolved.", detail: "This message selected the Plan agent", tone: "plan" },
          { label: "READ", title: "server/notifications/history.ts", detail: "Read-only investigation remains available", tone: "success" },
          { label: "EDIT", title: "Denied by Plan policy", detail: "Mutation is blocked before execution", tone: "danger" },
          { label: "BASH", title: "git status allowed; destructive pattern denied", detail: "Configured pattern-specific permissions remain authoritative", tone: "warning" },
        ],
        inspectorTitle: "Last match wins",
        inspector: [
          { label: "Wildcard", value: "Applied first" },
          { label: "Specific rules", value: "Applied after" },
          { label: "Task delegation", value: "Agent policy decides" },
        ],
        actions: ["Try edit (denied)"],
        caveat: "The UI never sends a prompt if policy activation fails.",
      },
      {
        id: "build-restoration",
        title: "Build restores resolved agent policy",
        summary: "Legacy tool overrides persist, so Build explicitly projects its resolved permissions instead of merely omitting Plan denies.",
        status: "Build policy restored · prompt accepted",
        mode: "Build",
        rows: [
          { label: "HISTORY · PLAN", title: "The earlier research row remains Plan", detail: "Past provenance never changes with the current mode", tone: "plan" },
          { label: "YOU · BUILD", title: "Implement the approved parser fix.", detail: "Build applies to this message", tone: "build" },
          { label: "EDIT", title: "Updated server/parser.ts", detail: "Allowed by the resolved Build agent policy", tone: "success" },
          { label: "VERIFY", title: "npm test", detail: "Mutation and verification are separate evidence", code: "142 passed" },
        ],
        inspectorTitle: "Provenance",
        inspector: [
          { label: "Current selection", value: "Build", tone: "build" },
          { label: "Previous rows", value: "Unchanged" },
          { label: "Build means writable", value: "Not necessarily", tone: "warning" },
        ],
        caveat: "A Build pill identifies message provenance. Sub-agents can retain historical denies.",
      },
    ],
  },
  {
    id: "human-gates",
    number: "04",
    shortTitle: "Human gates",
    title: "Permissions, questions, and review stay distinct",
    description:
      "A command approval, a structured answer, a notification checkbox, and a reviewed commit are different decisions with different evidence.",
    scenes: [
      {
        id: "permission-question",
        title: "The agent is waiting for you",
        summary: "Permissions can be allowed once, remembered, or rejected. Questions can be answered or rejected, but are never auto-approved.",
        status: "Permission requested",
        rows: [
          { label: "PERMISSION", title: "Run the focused test suite?", detail: "bash · npm test", tone: "warning", code: "npm test -- parser" },
          { label: "PATTERN", title: "Always would remember this match", detail: "The UI shows the exact proposed pattern" },
          { label: "QUESTION", title: "Which deployment target should the guide document?", detail: "Staging · Production · Custom answer", tone: "info" },
        ],
        inspectorTitle: "Available replies",
        inspector: [
          { label: "Permission", value: "Once / Always / Reject" },
          { label: "Question", value: "Submit / Reject" },
          { label: "Reply failure", value: "Retryable", tone: "warning" },
        ],
        actions: ["Allow once", "Reject", "Answer question"],
        caveat: "This control changes only fictional guide state; it cannot approve a host command.",
      },
      {
        id: "auto-permissions",
        title: "Auto permissions is volatile and directory-wide",
        summary: "When enabled, the BFF replies once to emitted permission asks. It does not modify policy or answer questions.",
        status: "Auto permissions ON for /Users/sam/Projects/orbit",
        rows: [
          { label: "WARNING", title: "Every emitted permission ask is approved once", detail: "An agent can request arbitrary commands or enter a loop", tone: "danger" },
          { label: "AUDIT", title: "Suppressed permission recorded", detail: "Hidden from the inbox by default, retained as bounded evidence", tone: "warning" },
          { label: "QUESTION", title: "Structured questions remain manual", detail: "Auto permissions never supplies semantic answers", tone: "success" },
        ],
        inspectorTitle: "Scope",
        inspector: [
          { label: "Persistence", value: "Until BFF restart" },
          { label: "Directory", value: "All sessions" },
          { label: "Policy mutation", value: "None", tone: "success" },
        ],
        actions: ["Turn auto permissions off"],
        caveat: "The warning is intentionally stronger than the convenience framing.",
      },
      {
        id: "review-control",
        title: "Review is bound to the commit you inspected",
        summary: "Description, discussion, approvals, checks, and pipeline details load lazily before merge confirmation names the head SHA.",
        status: "Review ready · one failed check",
        rows: [
          { label: "PR #184", title: "Preserve transcript position while prepending", detail: "Head 7c91e2a · mergeable", tone: "info" },
          { label: "REVIEW", title: "Approved by river-fox", detail: "One unresolved discussion remains", tone: "warning" },
          { label: "CHECK", title: "mobile-overflow failed", detail: "Desktop and unit suites passed", tone: "danger" },
          { label: "MERGE", title: "Confirmation requires head 7c91e2a", detail: "A changed SHA invalidates the reviewed state", tone: "success" },
        ],
        inspectorTitle: "Review evidence",
        inspector: [
          { label: "Authentication", value: "Server-side" },
          { label: "Checks", value: "8 / 9 passed", tone: "warning" },
          { label: "Bound SHA", value: "7c91e2a" },
        ],
        actions: ["Inspect failed check", "Open repository"],
        caveat: "The simulation refuses to claim a merge or alter a repository.",
      },
    ],
  },
  {
    id: "mobile-notifications",
    number: "05",
    shortTitle: "Mobile",
    title: "Hand off the same session to a phone",
    description:
      "A locally generated QR code transfers a configured HTTPS URL. Responsive sheets replace desktop sidebars without changing the underlying session.",
    scenes: [
      {
        id: "phone-handoff",
        title: "The QR never leaves the browser",
        summary: "The sole QR dependency renders an SVG matrix locally; no image service receives the application URL.",
        status: "Phone link ready",
        rows: [
          { label: "URL", title: "https://runner.example-tailnet.ts.net", detail: "Configured public app URL", tone: "info" },
          { label: "QR", title: "Generated in this browser", detail: "No third-party network request", tone: "success" },
          { label: "SESSION", title: "Conversation and directory stay in the link", detail: "The phone opens the same control-plane state" },
        ],
        inspectorTitle: "Transfer",
        inspector: [
          { label: "Transport", value: "HTTPS" },
          { label: "QR service", value: "None", tone: "success" },
          { label: "Fallback", value: "Copy link" },
        ],
        actions: ["Copy fictional link", "Preview mobile"],
        caveat: "The example tailnet hostname is fictional and does not resolve.",
      },
      {
        id: "notification-inbox",
        title: "Notifications are an audit trail, not truth by dismissal",
        summary: "Every record starts unresolved. Only the reversible Resolved checkbox changes that state.",
        status: "2 unresolved · 3 suppressed hidden",
        rows: [
          { label: "PERMISSION", title: "Orbit parser needs approval", detail: "Run npm test -- parser", tone: "warning" },
          { label: "SUB-AGENT", title: "Accessibility audit reported back", detail: "Suppressed from delivery; retained in bounded history", tone: "info" },
          { label: "RESOLUTION", title: "Unchecked", detail: "Replying upstream does not resolve this record" },
        ],
        inspectorTitle: "Delivery",
        inspector: [
          { label: "ntfy", value: "Sent", tone: "success" },
          { label: "Desktop pref", value: "Allowed" },
          { label: "Auto-approved hidden", value: "2" },
          { label: "Sub-agent hidden", value: "1" },
        ],
        actions: ["Mark resolved", "Show suppressed"],
        caveat: "A server preference is not proof that a device rendered a notification.",
      },
    ],
  },
  {
    id: "subagents",
    number: "06",
    shortTitle: "Sub-agents",
    title: "Child state is derived from evidence",
    description:
      "OpenCode exposes child sessions but no durable background-job list. The Runner combines process status, child transcripts, hand-backs, and task parts.",
    scenes: [
      {
        id: "subagent-ledger",
        title: "Unknown is a first-class answer",
        summary: "A launch returning is not the same as a background child finishing.",
        status: "6 delegated sessions · evidence refreshed",
        rows: [
          { label: "RUNNING", title: "Mobile overflow audit", detail: "Observed in process-local session status", tone: "info" },
          { label: "COMPLETED", title: "API contract inventory", detail: "Child transcript has a final assistant turn", tone: "success" },
          { label: "COMPLETED", title: "Accessibility review", detail: "Parent contains a child-ID hand-back", tone: "success" },
          { label: "FAILED", title: "Screenshot capture", detail: "Child transcript ended with an error", tone: "danger" },
          { label: "LAUNCHED", title: "Docs link check", detail: "Background task call returned; child outcome absent", tone: "warning" },
          { label: "UNKNOWN", title: "Cancelled dependency audit", detail: "No terminal evidence after process restart", tone: "warning" },
        ],
        inspectorTitle: "Evidence precedence",
        inspector: [
          { label: "1", value: "Observed busy" },
          { label: "2", value: "Child final turn" },
          { label: "3", value: "Parent hand-back" },
          { label: "4", value: "Synchronous task part" },
        ],
        actions: ["Open child transcript", "Stop running child"],
        caveat: "Stop appears only when the connected process reports the child busy.",
      },
      {
        id: "subagent-handback",
        title: "Machine hand-backs do not become human prompts",
        summary: "A background child reports through a user-role parent message, so the client requires an outcome word and a known child session ID.",
        status: "Child ses_child_a11y completed",
        rows: [
          { label: "TASK", title: "Delegate accessibility audit", detail: "Background launch returned", tone: "info" },
          { label: "CHILD", title: "ses_child_a11y", detail: "Final transcript: two keyboard findings", tone: "success" },
          { label: "HAND-BACK", title: "Accessibility audit completed", detail: "Rendered as a completion separator, not a prompt bubble", tone: "success" },
        ],
        inspectorTitle: "Child context",
        inspector: [
          { label: "Parent", value: "ses_demo_parent" },
          { label: "Agent", value: "explore" },
          { label: "Follow-ups", value: "Stay in child", tone: "warning" },
        ],
        caveat: "A message that merely mentions a child ID settles nothing.",
      },
    ],
  },
  {
    id: "limits",
    number: "07",
    shortTitle: "Limits",
    title: "Deliberate exclusions are part of the design",
    description:
      "The OpenCode runner removes container-era surfaces that are redundant, unavailable, or safer outside the browser.",
    scenes: [
      {
        id: "exclusions",
        title: "What this Runner does not claim",
        summary: "Fewer controls make the remaining safety boundaries easier to state honestly.",
        status: "Seven deliberate exclusions",
        rows: [
          { label: "NO CONTAINER", title: "Tools execute as the host user", detail: "Permissions replace the old container boundary", tone: "warning" },
          { label: "NO WEB PTY", title: "Commands are transcript-derived and exportable", detail: "There is no writable terminal page" },
          { label: "NO PREVIEW LIFECYCLE", title: "Only the mobile reverse proxy remains", detail: "Start, stop, logs, and status stay external" },
          { label: "NO AUTO-RESUME", title: "Interrupted turns require human review", detail: "Destructive work is never replayed automatically", tone: "success" },
          { label: "NO DURABLE JOB LIST", title: "Sub-agent outcomes are derived", detail: "Unknown remains visible" },
          { label: "NO POLICY EDITOR", title: "Author opencode.jsonc with schema support", detail: "The browser shows effective rules read-only" },
          { label: "NO SYMBOL SEARCH", title: "/find/symbol is a server stub", detail: "The UI does not build on an endpoint that always returns []" },
        ],
        inspectorTitle: "Still available",
        inspector: [
          { label: "Preview", value: "Reverse proxy" },
          { label: "Commands", value: "Read + export" },
          { label: "MCP", value: "Connection diagnostics" },
          { label: "Policy", value: "Read-only display" },
        ],
        caveat: "The predecessor comparison is architectural, not a promise of feature parity.",
      },
    ],
  },
  {
    id: "contribute",
    number: "08",
    shortTitle: "Contribute",
    title: "Troubleshoot from evidence, then follow the source",
    description:
      "The guide ends at repository-owned documentation: architecture, API audit, sub-agent derivation, deployment, and contributor checks.",
    scenes: [
      {
        id: "troubleshooting",
        title: "Common failure paths stay actionable",
        summary: "Each visible failure points to the boundary that can actually repair it.",
        status: "Diagnostics available",
        rows: [
          { label: "DIRECTORY", title: "Project moved or no longer exists", detail: "Choose a valid absolute directory", tone: "warning" },
          { label: "POLICY", title: "Mode activation failed", detail: "No prompt was submitted; inspect agent policy", tone: "danger" },
          { label: "EVENTS", title: "Global SSE disconnected", detail: "Reconnect and refetch authoritative state", tone: "info" },
          { label: "PAGINATION", title: "Earlier page failed", detail: "Keep loaded rows and retry the cursor" },
          { label: "SUB-AGENT", title: "Outcome unknown", detail: "Inspect child transcript; do not infer completion", tone: "warning" },
          { label: "REVIEW", title: "Forge authentication unavailable", detail: "Details degrade explicitly; no anonymous mutation" },
        ],
        inspectorTitle: "Verify locally",
        inspector: [
          { label: "Unit", value: "npm test" },
          { label: "Types", value: "npm run typecheck" },
          { label: "Browser", value: "npm run test:e2e" },
        ],
        caveat: "Repository links below are the maintained source; this simulation is explanatory fixture data.",
      },
    ],
  },
];

export const guideScenes = guideChapters.flatMap((chapter) => chapter.scenes);

export function findGuideScene(id: string | undefined) {
  if (!id) return undefined;
  for (const chapter of guideChapters) {
    const sceneIndex = chapter.scenes.findIndex((scene) => scene.id === id);
    if (sceneIndex >= 0) return { chapter, scene: chapter.scenes[sceneIndex], sceneIndex };
  }
  return undefined;
}
