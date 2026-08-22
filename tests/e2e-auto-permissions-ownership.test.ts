// tests/e2e-auto-permissions-ownership.test.ts
//
// Auto permissions is per-directory state held in memory by a single BFF
// process, and Playwright runs spec *files* in parallel (tests within a file
// are serial, files are not). So two files that toggle the flag on the same
// directory will flip it under each other.
//
// That bug is invisible the way you normally look for it: each spec passes in
// isolation, and a full run fails somewhere else each time depending on which
// worker won. It shipped twice before it was diagnosed. This guard makes the
// ownership rule mechanical — one directory, one owning file — so the next
// person to add an auto-permissions test gets a clear failure instead of an
// intermittent one.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const E2E_DIR = path.resolve(__dirname, "e2e");

/** `const NAME = process.platform === "darwin" ? "/private/tmp/x" : "/tmp/x";` */
const DIRECTORY_CONSTANT =
  /const\s+(\w+)\s*=\s*process\.platform\s*===\s*"darwin"\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*;/g;

/** Any `.patch("/api/auto-approve?directory=${expr}"...)`, the only mutation route. */
const MUTATION = /\.patch\(\s*`\/api\/auto-approve\?directory=\$\{([^}]+)\}/g;

function specFiles(): string[] {
  return readdirSync(E2E_DIR).filter((name) => name.endsWith(".spec.ts")).sort();
}

/** Reduce `encodeURIComponent(DIR)` and friends to the bare identifier. */
function identifier(expression: string): string {
  return expression.replace(/encodeURIComponent\(/g, "").replace(/[()\s]/g, "");
}

interface Mutation {
  file: string;
  constant: string;
  directory: string;
}

function mutations(): Mutation[] {
  const found: Mutation[] = [];
  for (const file of specFiles()) {
    const source = readFileSync(path.join(E2E_DIR, file), "utf8");
    const constants = new Map<string, string>();
    for (const [, name, , linuxPath] of source.matchAll(DIRECTORY_CONSTANT)) {
      constants.set(name, linuxPath);
    }
    for (const [, expression] of source.matchAll(MUTATION)) {
      const constant = identifier(expression);
      const directory = constants.get(constant);
      // Unresolvable is a failure, not a skip: silently ignoring a directory
      // spelled some other way would reopen exactly the hole this closes.
      expect(
        directory,
        `${file} toggles auto permissions on "${constant}", which is not declared there as a platform-aware directory constant. Declare it so ownership can be checked.`,
      ).toBeDefined();
      found.push({ file, constant, directory: directory! });
    }
  }
  return found;
}

describe("e2e auto-permissions directory ownership", () => {
  it("finds the mutations it is supposed to be guarding", () => {
    // If a refactor renames the route or the helper, the guard must fail loudly
    // rather than pass by matching nothing.
    const found = mutations();
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(new Set(found.map((mutation) => mutation.file)).size).toBeGreaterThanOrEqual(2);
  });

  it("gives every toggled directory exactly one owning spec file", () => {
    const owners = new Map<string, Set<string>>();
    for (const { file, directory } of mutations()) {
      const existing = owners.get(directory) ?? new Set<string>();
      existing.add(file);
      owners.set(directory, existing);
    }

    const shared = [...owners.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([directory, files]) => `${directory} is toggled by ${[...files].sort().join(" and ")}`);

    expect(
      shared,
      "Playwright runs these files in parallel against one BFF, so a shared directory means each file flips the flag under the other. Give the new file its own mock directory.",
    ).toEqual([]);
  });
});
