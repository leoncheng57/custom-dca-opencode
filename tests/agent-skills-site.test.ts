import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import {
  generateAgentSkillsSite,
  readCommandSource,
  SITE_BASE_PATH,
  validateAndStageAgentSkillsSite,
  type AgentSkillsSiteManifest,
} from "../scripts/agent-skills-site.js";
import { auditPublishWorkflow, EXPECTED_TRIGGER_PATHS } from "../scripts/publish-workflow-audit.js";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "agent-skills-site-"));
  roots.push(root);
  return root;
}

function writeCommand(directory: string, name: string, description = "A useful command"): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${name}.md`), `---\ndescription: ${description}\n---\n\nRun <safe> & finish.\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("commands-only static catalogue", () => {
  it("puts every discovered command in the index and at a direct canonical route", () => {
    const root = temporaryRoot();
    const output = path.join(root, "output");
    const manifest = generateAgentSkillsSite("agent-skills/commands", output);
    const index = readFileSync(path.join(output, "agent-skills", "commands", "index.html"), "utf8");

    expect(manifest.commands.length).toBeGreaterThan(0);
    for (const name of manifest.commands) {
      expect(index).toContain(`${SITE_BASE_PATH}commands/${name}/`);
      const detail = readFileSync(path.join(output, "agent-skills", "commands", name, "index.html"), "utf8");
      expect(detail).toContain(`rel="canonical" href="${SITE_BASE_PATH}commands/${name}/"`);
    }
    expect(manifest.files.some(({ path: file }) => file.includes("skills/"))).toBe(false);
    expect(index).toContain(`href="${SITE_BASE_PATH}assets/site.css"`);
  });

  it("renders command-controlled text only as escaped text", () => {
    const root = temporaryRoot();
    const source = path.join(root, "commands");
    const output = path.join(root, "output");
    writeCommand(source, "hostile", "<script>alert(1)</script>");
    generateAgentSkillsSite(source, output);
    const detail = readFileSync(path.join(output, "agent-skills", "commands", "hostile", "index.html"), "utf8");
    const index = readFileSync(path.join(output, "agent-skills", "commands", "index.html"), "utf8");

    expect(`${index}\n${detail}`).not.toContain("<script>alert(1)</script>");
    expect(index).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(detail).toContain("Run &lt;safe&gt; &amp; finish.");
    expect(detail).not.toContain("javascript:");
  });
});

describe("agent-skills publication staging", () => {
  it("replaces only agent-skills and preserves every sibling sentinel", () => {
    const root = temporaryRoot();
    const build = path.join(root, "build");
    const pages = path.join(root, "gh-pages");
    writeCommand(path.join(root, "commands"), "verify");
    generateAgentSkillsSite(path.join(root, "commands"), build);
    mkdirSync(path.join(pages, "agent-skills"), { recursive: true });
    mkdirSync(path.join(pages, "pr-screenshots"), { recursive: true });
    mkdirSync(path.join(pages, "pr-previews"), { recursive: true });
    mkdirSync(path.join(pages, "assets"), { recursive: true });
    writeFileSync(path.join(pages, "agent-skills", "stale.txt"), "replace me");
    writeFileSync(path.join(pages, "index.html"), "root sentinel");
    writeFileSync(path.join(pages, "assets", "root.css"), "asset sentinel");
    writeFileSync(path.join(pages, "pr-screenshots", "sentinel"), "screenshots sentinel");
    writeFileSync(path.join(pages, "pr-previews", "sentinel"), "previews sentinel");

    validateAndStageAgentSkillsSite(build, path.join(pages, "agent-skills"), path.join(root, "commands"));

    expect(existsSync(path.join(pages, "agent-skills", "stale.txt"))).toBe(false);
    expect(readFileSync(path.join(pages, "index.html"), "utf8")).toBe("root sentinel");
    expect(readFileSync(path.join(pages, "assets", "root.css"), "utf8")).toBe("asset sentinel");
    expect(readFileSync(path.join(pages, "pr-screenshots", "sentinel"), "utf8")).toBe("screenshots sentinel");
    expect(readFileSync(path.join(pages, "pr-previews", "sentinel"), "utf8")).toBe("previews sentinel");
  });

  it("rejects tampering, symlinks, unsafe inventory, and overlapping paths", () => {
    const root = temporaryRoot();
    const source = path.join(root, "commands");
    const build = path.join(root, "build");
    const destination = path.join(root, "site", "agent-skills");
    writeCommand(source, "verify");
    generateAgentSkillsSite(source, build);
    writeFileSync(path.join(build, "agent-skills", "commands", "verify", "index.html"), "tampered");
    expect(() => validateAndStageAgentSkillsSite(build, destination, source)).toThrow("manifest inventory");

    generateAgentSkillsSite(source, build);
    symlinkSync(path.join(build, "agent-skills", "index.html"), path.join(build, "agent-skills", "linked.html"));
    expect(() => validateAndStageAgentSkillsSite(build, destination, source)).toThrow("symbolic link");

    rmSync(path.join(build, "agent-skills", "linked.html"));
    const manifestPath = path.join(build, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AgentSkillsSiteManifest;
    manifest.files[0].path = "../escape";
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => validateAndStageAgentSkillsSite(build, destination, source)).toThrow("Unsafe site path");
    expect(() => validateAndStageAgentSkillsSite(build, path.join(build, "agent-skills"), source)).toThrow("must not overlap");
  });

  it("refuses a destination that is not an agent-skills leaf before deleting anything", () => {
    const root = temporaryRoot();
    const build = path.join(root, "build");
    const pages = path.join(root, "gh-pages");
    writeCommand(path.join(root, "commands"), "verify");
    generateAgentSkillsSite(path.join(root, "commands"), build);
    mkdirSync(path.join(pages, "pr-previews"), { recursive: true });
    mkdirSync(path.join(pages, ".git"), { recursive: true });
    writeFileSync(path.join(pages, "index.html"), "root sentinel");
    writeFileSync(path.join(pages, "pr-previews", "sentinel"), "previews sentinel");
    writeFileSync(path.join(pages, ".git", "HEAD"), "ref: refs/heads/gh-pages");

    // The whole gh-pages clone, which the overlap check alone would have allowed.
    expect(() => validateAndStageAgentSkillsSite(build, pages, path.join(root, "commands")))
      .toThrow('must be an "agent-skills" directory');
    expect(() => validateAndStageAgentSkillsSite(build, path.join(pages, "pr-previews"), path.join(root, "commands")))
      .toThrow('must be an "agent-skills" directory');
    expect(() => validateAndStageAgentSkillsSite(build, path.join(pages, ".git", "agent-skills"), path.join(root, "commands")))
      .toThrow("must not be inside a Git directory");
    expect(() => validateAndStageAgentSkillsSite(build, path.parse(root).root, path.join(root, "commands")))
      .toThrow('must be an "agent-skills" directory');

    // Nothing was touched by any refusal.
    expect(readFileSync(path.join(pages, "index.html"), "utf8")).toBe("root sentinel");
    expect(readFileSync(path.join(pages, "pr-previews", "sentinel"), "utf8")).toBe("previews sentinel");
    expect(readFileSync(path.join(pages, ".git", "HEAD"), "utf8")).toBe("ref: refs/heads/gh-pages");
  });
});

describe("command source guards", () => {
  it("skips a stray non-command Markdown file instead of failing the publish", () => {
    const root = temporaryRoot();
    const source = path.join(root, "commands");
    const output = path.join(root, "output");
    writeCommand(source, "verify");
    writeFileSync(path.join(source, "README.md"), "# Notes\n\nNot a command.\n");
    writeFileSync(path.join(source, "empty-body.md"), "---\ndescription: no template\n---\n\n");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const manifest = generateAgentSkillsSite(source, output);
      expect(manifest.commands).toEqual(["verify"]);
      expect(warn.mock.calls.flat().join("\n")).toContain("skipping README.md");
      expect(warn.mock.calls.flat().join("\n")).toContain("skipping empty-body.md");
    } finally {
      warn.mockRestore();
    }

    // The staging cross-check applies the same skip rule, so it still agrees.
    const destination = path.join(root, "site", "agent-skills");
    expect(validateAndStageAgentSkillsSite(output, destination, source).commands).toEqual(["verify"]);
  });

  it("refuses a symlinked command file rather than following it", () => {
    const root = temporaryRoot();
    const source = path.join(root, "commands");
    const outside = path.join(root, "outside.md");
    writeCommand(source, "verify");
    writeFileSync(outside, "---\ndescription: injected\n---\n\nInjected body.\n");
    symlinkSync(outside, path.join(source, "injected.md"));

    expect(() => generateAgentSkillsSite(source, path.join(root, "output"))).toThrow("symbolic link");
  });

  it("fails loudly when no valid command survives", () => {
    const root = temporaryRoot();
    const source = path.join(root, "commands");
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "README.md"), "# Notes\n");

    expect(() => readCommandSource(source)).toThrow("No valid command Markdown files");
  });
});

describe("main-only publisher workflow", () => {
  const source = readFileSync(".github/workflows/publish-agent-skills.yml", "utf8");
  const document = parse(source) as Record<string, any>;

  it("passes a structural audit of triggers, permissions, staging, and pushes", () => {
    expect(auditPublishWorkflow(document)).toEqual([]);
    expect(document.on.push.paths).toEqual([...EXPECTED_TRIGGER_PATHS]);
    expect(document.permissions).toEqual({ contents: "write" });
    expect(document.concurrency).toEqual({ group: "pr-screenshot-publication", "cancel-in-progress": false });
    expect(source).not.toContain("download-artifact");
  });

  // Each mutation is a real escalation that the previous substring assertions
  // accepted. The audit must reject every one of them.
  const mutations: Array<[string, (workflow: Record<string, any>) => void]> = [
    ["an added pull_request trigger", (workflow) => { workflow.on.pull_request = null; }],
    ["an added pull_request_target trigger", (workflow) => { workflow.on.pull_request_target = null; }],
    ["an added workflow_dispatch trigger", (workflow) => { workflow.on.workflow_dispatch = null; }],
    ["a widened trigger branch set", (workflow) => { workflow.on.push.branches = ["main", "attacker"]; }],
    ["a widened trigger path set", (workflow) => { workflow.on.push.paths = ["**"]; }],
    ["a wider top-level permission", (workflow) => { workflow.permissions = { contents: "write", "pull-requests": "write" }; }],
    ["a write-all shorthand", (workflow) => { workflow.permissions = "write-all"; }],
    ["a wider job-level permissions block", (workflow) => { workflow.jobs.publish.permissions = { contents: "write", actions: "write" }; }],
    ["a second unscoped git add", (workflow) => {
      workflow.jobs.publish.steps.at(-1).run += "\n          git add --all";
    }],
    ["a git add that escapes the subtree", (workflow) => {
      workflow.jobs.publish.steps.at(-1).run += "\n          git add ../site/pr-previews";
    }],
    ["a flagless force push via a + refspec", (workflow) => {
      workflow.jobs.publish.steps.at(-1).run = "git push origin +HEAD:gh-pages";
    }],
    ["an explicit --force push", (workflow) => {
      workflow.jobs.publish.steps.at(-1).run = "git push --force origin gh-pages";
    }],
    ["a force-with-lease push", (workflow) => {
      workflow.jobs.publish.steps.at(-1).run = "git push --force-with-lease origin gh-pages";
    }],
    ["a redirected staging destination", (workflow) => {
      const step = workflow.jobs.publish.steps.find((entry: any) => entry.run?.includes("stage-agent-skills-site.ts"));
      step.run = step.run.replace("../site/agent-skills", "../site");
    }],
  ];

  it.each(mutations)("rejects %s", (_label, mutate) => {
    const mutated = parse(source) as Record<string, any>;
    mutate(mutated);
    expect(auditPublishWorkflow(mutated)).not.toEqual([]);
  });
});
