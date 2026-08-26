// Composer workflows, client side (issue #167). A workflow attached to a
// message travels inside the message content wrapped in a sentinel tag whose
// body the SERVER resolved from the workflow id — the browser never authors
// it. The transcript pulls the block back out so the bubble shows what was
// typed and the trusted injector renders separately.
//
// `splitWorkflowTags` deliberately duplicates server/workflows/workflows.ts.
// Sharing the server module would cross the browser/server seam for one regex;
// drift is prevented by tests/workflows.test.ts running one case table against
// BOTH copies. Keep the regex and body byte-identical.

export interface SplitWorkflowMessage {
  text: string;
  workflows: Array<{ name: string; body: string }>;
}

const WORKFLOW_TAG_RE = /\n*<workflow name="([a-z0-9]+(?:-[a-z0-9]+)*)">\n?([\s\S]*?)\n?<\/workflow>/g;

export function splitWorkflowTags(input: string): SplitWorkflowMessage {
  const workflows: Array<{ name: string; body: string }> = [];
  const text = input.replace(WORKFLOW_TAG_RE, (_match, name: string, body: string) => {
    workflows.push({ name, body: body.trim() });
    return "";
  });
  return { text: text.trim(), workflows };
}

// ── Workflow ids (must match the server catalogue) ──────────────────────────

export const PLAYWRIGHT_REVIEW_WORKFLOW_ID = "playwright-ui-review";
export const SESSION_UPDATE_WORKFLOW_ID = "session-update";
export const MANAGED_CHILD_WORKFLOW_ID = "managed-child";

// ── Playwright review prompt generation ─────────────────────────────────────
//
// The visible prompt is generated in the browser because the user reviews and
// may edit it before sending — only the injector must be server-authored.

export const PLAYWRIGHT_CAPTURE_SCOPES = [
  { id: "interaction", label: "Focused interaction check (assertions only)" },
  { id: "targeted-screenshots", label: "Targeted screenshots of the affected UI" },
] as const;

export type PlaywrightCaptureScope = (typeof PLAYWRIGHT_CAPTURE_SCOPES)[number]["id"];

export function captureScopeLabel(scope: PlaywrightCaptureScope): string {
  return PLAYWRIGHT_CAPTURE_SCOPES.find((option) => option.id === scope)?.label ?? scope;
}

export function buildPlaywrightReviewPrompt(fields: {
  route: string;
  target: string;
  scope: PlaywrightCaptureScope;
}): string {
  return [
    "Review a UI change with Playwright.",
    "",
    `Route or component: ${fields.route.trim()}`,
    `Desired state or interaction: ${fields.target.trim()}`,
    `Capture scope: ${captureScopeLabel(fields.scope)}`,
  ].join("\n");
}
