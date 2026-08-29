/**
 * Structural audit of the catalogue publication workflow.
 *
 * This exists because substring assertions over the YAML text are not a
 * security check. `git push origin +HEAD:gh-pages` contains neither `--force`
 * nor `-f` and force-pushes anyway; an added `pull_request:` trigger or a
 * second job-level `permissions:` block changes nothing a `toContain` call
 * would notice. The audit therefore walks the parsed document and reports what
 * is actually there, and the test drives it with hostile mutations.
 */

export const EXPECTED_TRIGGER_PATHS = [
  "agent-skills/**",
  "scripts/agent-skills-site.ts",
  "scripts/generate-agent-skills-site.ts",
  "scripts/stage-agent-skills-site.ts",
  "package.json",
  "package-lock.json",
  ".github/workflows/publish-agent-skills.yml",
] as const;

export const EXPECTED_PERMISSIONS = { contents: "write" } as const;
export const EXPECTED_STAGING_DESTINATION = "../site/agent-skills";
export const PUBLISH_DIRECTORY_NAME = "agent-skills";

type Unknown = Record<string, unknown>;

function isRecord(value: unknown): value is Unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A bare `on:` key is `true` under YAML 1.1 and the string `"on"` under the
 * 1.2 core schema. Accept both rather than depending on the parser's schema.
 */
function triggerSection(document: Unknown): unknown {
  return document.on ?? (document as Record<string, unknown>)["true"] ?? document[true as unknown as string];
}

function collect(value: unknown, key: string, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, key, found);
    return found;
  }
  if (!isRecord(value)) return found;
  for (const [name, child] of Object.entries(value)) {
    if (name === key) found.push(child);
    collect(child, key, found);
  }
  return found;
}

function runScripts(document: Unknown): string[] {
  return collect(document, "run").filter((value): value is string => typeof value === "string");
}

function commandLines(document: Unknown): string[] {
  return runScripts(document)
    .flatMap((script) => script.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
}

function auditTriggers(document: Unknown, violations: string[]): void {
  const triggers = triggerSection(document);
  if (!isRecord(triggers)) {
    violations.push("workflow has no parsable trigger section");
    return;
  }
  const names = Object.keys(triggers).sort();
  if (names.length !== 1 || names[0] !== "push") {
    violations.push(`trigger set must be exactly [push], found [${names.join(", ")}]`);
  }
  const push = triggers.push;
  if (!isRecord(push)) {
    violations.push("push trigger must be a mapping");
    return;
  }
  const branches = Array.isArray(push.branches) ? push.branches : [];
  if (branches.length !== 1 || branches[0] !== "main") {
    violations.push(`push branches must be exactly [main], found [${branches.join(", ")}]`);
  }
  const paths = Array.isArray(push.paths) ? push.paths.map(String) : [];
  const expected = [...EXPECTED_TRIGGER_PATHS].sort();
  if (JSON.stringify([...paths].sort()) !== JSON.stringify(expected)) {
    violations.push(`push paths must be exactly [${expected.join(", ")}], found [${[...paths].sort().join(", ")}]`);
  }
  for (const key of ["pull_request", "pull_request_target", "workflow_run", "workflow_dispatch", "schedule"]) {
    if (key in triggers) violations.push(`forbidden trigger: ${key}`);
  }
}

function auditPermissions(document: Unknown, violations: string[]): void {
  const blocks = collect(document, "permissions");
  if (blocks.length === 0) {
    violations.push("workflow declares no permissions block");
    return;
  }
  for (const block of blocks) {
    if (block === "write-all" || block === "read-all") {
      violations.push(`permissions must not be ${block}`);
      continue;
    }
    if (!isRecord(block)) {
      violations.push("permissions block must be a mapping");
      continue;
    }
    for (const [scope, level] of Object.entries(block)) {
      const allowed = EXPECTED_PERMISSIONS[scope as keyof typeof EXPECTED_PERMISSIONS];
      if (allowed === undefined) {
        violations.push(`permissions grants an unexpected scope: ${scope}: ${String(level)}`);
        continue;
      }
      if (level !== allowed) {
        violations.push(`permissions.${scope} must be ${allowed}, found ${String(level)}`);
      }
    }
  }
}

function auditGitAdd(document: Unknown, violations: string[]): void {
  const adds = commandLines(document).filter((line) => /^git\s+add\b/u.test(line));
  if (adds.length === 0) violations.push("workflow never stages the catalogue");
  for (const line of adds) {
    const pathspecs = line
      .replace(/^git\s+add\s*/u, "")
      .split(/\s+/u)
      .filter((token) => token && !token.startsWith("-"));
    if (pathspecs.length === 0) {
      violations.push(`git add is unscoped: ${line}`);
      continue;
    }
    for (const pathspec of pathspecs) {
      if (pathspec !== PUBLISH_DIRECTORY_NAME && !pathspec.startsWith(`${PUBLISH_DIRECTORY_NAME}/`)) {
        violations.push(`git add pathspec escapes ${PUBLISH_DIRECTORY_NAME}: ${line}`);
      }
    }
  }
}

function auditGitPush(document: Unknown, violations: string[]): void {
  const pushes = commandLines(document).filter((line) => /^git\s+push\b/u.test(line));
  if (pushes.length === 0) violations.push("workflow never pushes gh-pages");
  for (const line of pushes) {
    for (const token of line.split(/\s+/u).slice(2)) {
      if (token === "-f" || token === "--force" || token.startsWith("--force-with-lease")) {
        violations.push(`push uses a force flag: ${line}`);
      }
      if (token.startsWith("+")) {
        violations.push(`push uses a force refspec: ${line}`);
      }
    }
  }
}

function auditStagingDestination(document: Unknown, violations: string[]): void {
  const staging = commandLines(document).filter((line) => line.includes("stage-agent-skills-site.ts"));
  if (staging.length !== 1) {
    violations.push(`expected exactly one staging invocation, found ${staging.length}`);
    return;
  }
  const tokens = staging[0].split(/\s+/u);
  const destination = tokens[tokens.indexOf("--destination") + 1];
  if (!tokens.includes("--destination") || destination !== EXPECTED_STAGING_DESTINATION) {
    violations.push(`staging --destination must be ${EXPECTED_STAGING_DESTINATION}, found ${destination ?? "nothing"}`);
  }
}

/** Returns every structural violation; an empty array means the workflow is safe. */
export function auditPublishWorkflow(document: unknown): string[] {
  const violations: string[] = [];
  if (!isRecord(document)) return ["workflow is not a mapping"];
  auditTriggers(document, violations);
  auditPermissions(document, violations);
  auditGitAdd(document, violations);
  auditGitPush(document, violations);
  auditStagingDestination(document, violations);
  return violations;
}
