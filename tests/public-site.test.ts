import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { stagePublicSite } from "../scripts/public-site.js";

const temporaryDirectories: string[] = [];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "custom-dca-public-site-"));
  temporaryDirectories.push(root);
  const build = path.join(root, "build");
  const pages = path.join(root, "pages");

  for (const file of [
    "index.html",
    "404.html",
    "agent-skills/index.html",
    "agent-skills/commands/index.html",
    "assets/new.js",
    "features/index.html",
  ]) {
    const destination = path.join(build, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, `new:${file}`);
  }
  writeFileSync(path.join(build, ".nojekyll"), "");

  mkdirSync(path.join(pages, "assets"), { recursive: true });
  writeFileSync(path.join(pages, "assets/old.js"), "stale");
  mkdirSync(path.join(pages, "pr-screenshots/pr-999"), { recursive: true });
  writeFileSync(path.join(pages, "pr-screenshots/pr-999/sentinel.png"), "keep");
  mkdirSync(path.join(pages, "unrelated"), { recursive: true });
  writeFileSync(path.join(pages, "unrelated/sentinel.txt"), "keep");

  return { build, pages };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("stagePublicSite", () => {
  it("replaces website paths while preserving screenshots and unrelated content", () => {
    const { build, pages } = fixture();

    stagePublicSite(build, pages);

    expect(readFileSync(path.join(pages, "index.html"), "utf8")).toBe("new:index.html");
    expect(existsSync(path.join(pages, "assets/old.js"))).toBe(false);
    expect(readFileSync(path.join(pages, "assets/new.js"), "utf8")).toBe("new:assets/new.js");
    expect(readFileSync(path.join(pages, "pr-screenshots/pr-999/sentinel.png"), "utf8")).toBe("keep");
    expect(readFileSync(path.join(pages, "unrelated/sentinel.txt"), "utf8")).toBe("keep");
  });

  it("refuses to publish an incomplete build", () => {
    const { build, pages } = fixture();
    rmSync(path.join(build, "agent-skills/index.html"));

    expect(() => stagePublicSite(build, pages)).toThrow("missing agent-skills/index.html");
  });

  it("refuses overlapping source and destination trees", () => {
    const { build } = fixture();

    expect(() => stagePublicSite(build, build)).toThrow("must not overlap");
    expect(() => stagePublicSite(build, path.join(build, "pages"))).toThrow("must not overlap");
  });
});
