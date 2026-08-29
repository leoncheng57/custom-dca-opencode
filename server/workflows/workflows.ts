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

// Catalogue order is picker order; the two review workflows sit together.
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
    id: "pr-snippet-review",
    title: "Post a snippet-by-snippet PR review",
    description:
      "Walk one pull request as an ordered sequence of explained snippets and post it as a single GitHub comment. Takes only the pull request number; the repository comes from this project directory.",
    injector: [
      'You are running the "Post a snippet-by-snippet PR review" workflow.',
      "Produce ONE GitHub comment that walks a senior engineer through the pull request as a sequence of explained snippets, then post it with `gh pr comment <number> -F -`.",
      "",
      "Gather first:",
      "- Resolve the repository from this session's project directory. NEVER take a repository, owner, or host from the prompt — the only input this workflow accepts is a pull request number.",
      "- Read `gh pr view <n>`, `gh pr diff <n>`, and the changed files themselves. The diff says what moved; the files say what it means.",
      "- Resolve the head SHA (`gh pr view <n> --json headRefOid`) and pin every link to it, so line links cannot drift when the branch moves:",
      "  https://github.com/<owner>/<repo>/blob/<headSha>/<path>#L<start>-L<end>",
      "",
      "Structure:",
      "- Order steps so each one motivates the next. Reading order is NOT file order: begin with the fact or constraint the change rests on, then the mechanism, then its consequences, then the tests.",
      "- Each step is a numbered heading, one to three sentences, a fenced snippet of the ACTUAL code, and a link to the full file.",
      "- Keep every snippet to the smallest excerpt that carries the idea, and quote it exactly — never paraphrase code inside a fence.",
      "- A step may legitimately carry no snippet when it explains an empirical finding or constraint that justifies the next one.",
      "- Explain WHY a non-obvious choice was made, not just what the code does. Where something was a judgement call rather than a fact, say so plainly.",
      "",
      "Close with a short \"where I'd focus your scrutiny\" list naming the riskiest snippet, any judgement calls, and anything the change does NOT verify.",
      "Never claim a test, lane, or verification you did not actually run. If the diff is too large to cover honestly, say so and cover the load-bearing parts rather than silently truncating.",
      "Post exactly one comment. Report the resulting comment URL when you are done.",
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
  {
    id: "start-dca-session",
    title: "Start a DCA session",
    description:
      "Start an independent root session in this project or an isolated worktree, after reviewing its Plan/Build mode, model, assignment, and trusted instructions.",
    injector: [
      'You are an independent root session started by the "Start a DCA session" workflow.',
      "- You have no parent session, task card, Managed Child relationship, automatic hand-back, or provenance link to the session that started you.",
      "- Work only on the assignment below under the Plan or Build mode selected at launch.",
      "- End with a clear summary of outcomes, verification performed, remaining risks, and suggested next steps.",
    ].join("\n"),
  },
  {
    id: "design-doc-prototype",
    title: "Capture a Durable Design Prototype",
    description:
      "Mock up an unbuilt UI change as fast static HTML, screenshot it, and publish it into a dated engineering-design document — no fields to fill in, just confirm and send.",
    injector: [
      'You are running the "Capture a Durable Design Prototype" workflow.',
      "- Use this only for a proposal that is NOT yet built. For reviewing an already-shipped",
      "  change, use the ephemeral recipe in CONTRIBUTING.md instead (screenshot-output/,",
      "  deleted spec, never committed).",
      "- Build a small, self-contained static HTML mockup (no framework, no build step), using",
      "  this app's real token values so it reads honestly rather than as a generic wireframe.",
      "- Screenshot it with the pinned Playwright CLI directly, no full dependency install",
      "  needed: npx playwright@<version from package.json> screenshot --browser=chromium",
      "  --viewport-size=W,H file://<path> <out>.png. Capture desktop at 1280x800 and mobile",
      "  at 390x740.",
      "- Commit the HTML and both PNGs to design/ on a real branch and push it. Build the",
      "  permanent raw.githubusercontent.com URL from the owner, repository, branch, and path.",
      "- Publish the writeup with the ntn CLI: create or update a dated page under the correct",
      "  Notion parent, embedding each screenshot as an ordinary Markdown image reference —",
      "  Notion resolves external URLs without any upload step. Verify the images resolved by",
      "  reading the page back.",
      "- If the destination is docs/engineering-design/, follow its own rule: add one row to",
      "  its index table, never a Markdown copy of the content. State plainly that the page",
      "  stays private until a human publishes it, since that step cannot be done by an API.",
      "- Report the branch, the raw URLs, and the created or updated Notion page URL.",
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
