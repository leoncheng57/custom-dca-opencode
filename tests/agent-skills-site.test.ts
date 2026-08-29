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
import { afterEach, describe, expect, it } from "vitest";

import {
  generateAgentSkillsSite,
  SITE_BASE_PATH,
  validateAndStageAgentSkillsSite,
  type AgentSkillsSiteManifest,
} from "../scripts/agent-skills-site.js";

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
});

describe("main-only publisher workflow", () => {
  it("has narrow permissions, shared serialization, subtree staging, and a normal push", () => {
    const workflow = readFileSync(".github/workflows/publish-agent-skills.yml", "utf8");
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/u);
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).not.toContain("workflow_run:");
    expect(workflow).not.toContain("download-artifact");
    expect(workflow).toMatch(/permissions:\n\s+contents: write\n/u);
    expect(workflow).toContain("group: pr-screenshot-publication");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("git add --all agent-skills");
    expect(workflow).toContain("git push origin gh-pages");
    expect(workflow).not.toMatch(/git push[^\n]*(--force|-f\b)/u);
  });
});
