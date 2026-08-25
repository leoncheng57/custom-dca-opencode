// server/workflows/workflows.ts — the composer workflow catalogue (issue #167).
//
// Workflows are guided, explicit user-invoked actions, distinct from reminders
// (which attach trusted instructions to the next message). Each workflow ships
// a trusted "injector": server-owned instructions appended to the submitted
// prompt when the browser names the workflow by id. Unlike reminder bodies the
// injector text IS exposed over GET /api/workflows — the contract is that the
// user can read the exact trusted content before submitting. Trust comes from
// resolution-by-id at send time (the browser can never author or alter the
// injected text), not from secrecy.

export const WORKFLOW_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const WORKFLOW_ID_MAX = 255;

export interface WorkflowPreset {
  id: string;
  title: string;
  description: string;
  /** Trusted, server-resolved instructions appended to the submitted prompt. */
  injector: string;
}

// Catalogue order is picker order. The initial catalogue deliberately contains
// only these three workflows — see issue #167.
const CATALOGUE: WorkflowPreset[] = [
  {
    id: "playwright-ui-review",
    title: "Review a UI change with Playwright",
    description:
      "Drive a focused Playwright pass over one route or component and bring back targeted evidence, without a full deployment or a complete screenshot regeneration.",
    injector: [
      'You are running the "Review a UI change with Playwright" workflow.',
      "- Start only what this check needs (prefer the dev server or the deterministic mock stack); do not run a full deployment.",
      "- Drive the named route with Playwright and exercise exactly the requested state or interaction.",
      "- Collect evidence for the affected UI only: assertions for an interaction-only scope, plus focused screenshots of the affected area when the scope asks for visual evidence. Never regenerate the complete screenshot set.",
      "- Report what was verified, what failed, and where any evidence was written.",
    ].join("\n"),
  },
  {
    id: "session-update",
    title: "Send an update to another session",
    description:
      "Deliver a hand-off message to another session in this project after an explicit preview of the target and the exact prompt.",
    injector: [
      'You are receiving the "Send an update to another session" workflow.',
      "This message was composed in another session in the same project and delivered here after an explicit preview and confirmation. Treat it as new input from the user's other workstream: read it, reconcile it with your current task, and continue accordingly.",
      "Delivery is asynchronous (POST /session/{id}/prompt_async answers 204 for accepted, not completed), so do not assume the sender is watching this transcript live.",
    ].join("\n"),
  },
  {
    id: "managed-child",
    title: "Launch a Managed Child",
    description:
      "Start an independent child session with its own transcript and a Plan or Build policy fixed at creation time. No native task card is created and no automatic hand-back occurs.",
    injector: [
      'You are a managed child session started by the "Launch a Managed Child" workflow.',
      "- You run in your own independent transcript with the Plan or Build policy fixed at creation time.",
      "- No native task card exists in the parent and no automatic hand-back will occur: the human reads your results here, in this transcript.",
      "- Complete the objective below and end with a clear summary of outcomes, remaining risks, and suggested next steps.",
    ].join("\n"),
  },
];

export function workflowCatalogue(): WorkflowPreset[] {
  return CATALOGUE;
}

export function isValidWorkflowId(id: unknown): id is string {
  return typeof id === "string" && id.length <= WORKFLOW_ID_MAX && WORKFLOW_ID_RE.test(id);
}

export function workflowTag(preset: Pick<WorkflowPreset, "id" | "injector">): string {
  return `<workflow name="${preset.id}">\n${preset.injector.trim()}\n</workflow>`;
}

export function withWorkflowTag(text: string, preset: Pick<WorkflowPreset, "id" | "injector">): string {
  return `${text}\n\n${workflowTag(preset)}`;
}

export interface SplitWorkflowMessage {
  text: string;
  workflows: Array<{ name: string; body: string }>;
}

// Keep byte-identical with client/lib/workflows.ts. Tests run one table against both.
const WORKFLOW_TAG_RE = /\n*<workflow name="([a-z0-9]+(?:-[a-z0-9]+)*)">\n?([\s\S]*?)\n?<\/workflow>/g;

export function splitWorkflowTags(input: string): SplitWorkflowMessage {
  const workflows: Array<{ name: string; body: string }> = [];
  const text = input.replace(WORKFLOW_TAG_RE, (_match, name: string, body: string) => {
    workflows.push({ name, body: body.trim() });
    return "";
  });
  return { text: text.trim(), workflows };
}
