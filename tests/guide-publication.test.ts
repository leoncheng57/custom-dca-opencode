import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { stageGuide } from "../scripts/stage-guide.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "guide-publication-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function fixture(): Promise<{ root: string; source: string; checkout: string }> {
  const root = await temporaryDirectory();
  const source = path.join(root, "dist");
  const checkout = path.join(root, "site");
  await mkdir(path.join(source, "assets"), { recursive: true });
  await writeFile(path.join(source, "index.html"), "new index");
  await writeFile(path.join(source, "assets", "app.js"), "new asset");
  await mkdir(path.join(checkout, ".git"), { recursive: true });
  return { root, source, checkout };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("guide publication staging", () => {
  it("replaces the owned guide and removes its stale files", async () => {
    const { source, checkout } = await fixture();
    const previous = path.join(checkout, "guides", "runner");
    await mkdir(path.join(previous, "assets"), { recursive: true });
    await writeFile(path.join(previous, "index.html"), "old index");
    await writeFile(path.join(previous, "assets", "stale.js"), "stale");

    await stageGuide(source, checkout);

    await expect(readFile(path.join(previous, "index.html"), "utf8")).resolves.toBe("new index");
    await expect(readFile(path.join(previous, "assets", "app.js"), "utf8")).resolves.toBe("new asset");
    await expect(readFile(path.join(previous, "assets", "stale.js"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves PR screenshots and unrelated Pages content", async () => {
    const { source, checkout } = await fixture();
    await mkdir(path.join(checkout, "pr-screenshots", "pr-53"), { recursive: true });
    await writeFile(path.join(checkout, "pr-screenshots", "pr-53", "sentinel.png"), "screenshot");
    await mkdir(path.join(checkout, "unrelated"), { recursive: true });
    await writeFile(path.join(checkout, "unrelated", "sentinel.txt"), "keep");

    await stageGuide(source, checkout);

    await expect(readFile(path.join(checkout, "pr-screenshots", "pr-53", "sentinel.png"), "utf8")).resolves.toBe("screenshot");
    await expect(readFile(path.join(checkout, "unrelated", "sentinel.txt"), "utf8")).resolves.toBe("keep");
  });

  it("rejects artifacts without index.html or assets", async () => {
    const missingIndex = await fixture();
    await rm(path.join(missingIndex.source, "index.html"));
    await expect(stageGuide(missingIndex.source, missingIndex.checkout)).rejects.toThrow("index.html");

    const missingAssets = await fixture();
    await rm(path.join(missingAssets.source, "assets"), { recursive: true });
    await expect(stageGuide(missingAssets.source, missingAssets.checkout)).rejects.toThrow("assets directory");
  });

  it("rejects symlinks in the artifact and destination path", async () => {
    const artifactLink = await fixture();
    await symlink(path.join(artifactLink.source, "index.html"), path.join(artifactLink.source, "linked.html"));
    await expect(stageGuide(artifactLink.source, artifactLink.checkout)).rejects.toThrow("symbolic links");

    const destinationLink = await fixture();
    const outside = path.join(destinationLink.root, "outside");
    await mkdir(outside);
    await symlink(outside, path.join(destinationLink.checkout, "guides"));
    await expect(stageGuide(destinationLink.source, destinationLink.checkout)).rejects.toThrow("destination guides");
  });

  it("rejects a non-checkout destination and overlapping paths", async () => {
    const notCheckout = await fixture();
    const plainDirectory = path.join(notCheckout.root, "plain");
    await mkdir(plainDirectory);
    await expect(stageGuide(notCheckout.source, plainDirectory)).rejects.toThrow("root of a Git checkout");

    const overlap = await fixture();
    const nestedSource = path.join(overlap.checkout, "dist");
    await mkdir(path.join(nestedSource, "assets"), { recursive: true });
    await writeFile(path.join(nestedSource, "index.html"), "index");
    await expect(stageGuide(nestedSource, overlap.checkout)).rejects.toThrow("must not overlap");
  });
});
