// tests/e2e-shared-state-ownership.test.ts
//
// Playwright runs spec *files* in parallel (tests within a file are serial,
// files are not) against ONE mock OpenCode process and ONE BFF process. So any
// state that is not per-request is shared across files, and two files that both
// mutate and assert the same key will flip it under each other.
//
// That bug is invisible the way you normally look for it: each spec passes in
// isolation, and a full run fails somewhere else each time depending on which
// worker won. `test.describe.serial` does not help — it orders tests inside one
// file and says nothing about the other four workers. It has now shipped three
// times, in two different flavours:
//
//   * auto permissions — directory-scoped in-memory BFF state (PR #86);
//   * the mock's `/test/*/reset` endpoints — sharing/reset used to wipe `share`
//     from every session in every directory, so share-export.ui.spec.ts revoked
//     the URL smoke.api.spec.ts was mid-assertion on.
//
// Both are the same rule: one key, one owning spec file. This guard makes that
// mechanical, so the next person gets a clear failure instead of an
// intermittent one somewhere else.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const E2E_DIR = path.resolve(__dirname, "e2e");

/** `const NAME = process.platform === "darwin" ? "/private/tmp/x" : "/tmp/x";` */
const DIRECTORY_CONSTANT =
  /const\s+(\w+)\s*=\s*process\.platform\s*===\s*"darwin"\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*;/g;

/** Any `.patch("/api/auto-approve?directory=${expr}"...)`, the only mutation route. */
const AUTO_APPROVE = /\.patch\(\s*`\/api\/auto-approve\?directory=\$\{([^}]+)\}/g;

/** Any `` `${MOCK_URL}/test/<name>/reset[?query]` `` inside a spec file. */
const RESET = /\$\{MOCK_URL\}\/test\/([\w-]+)\/reset(\?[^`]*)?/g;

/**
 * A reset with no query resets everything the endpoint knows about, so it
 * conflicts with every other caller of that endpoint, including itself.
 */
const EVERYTHING = "(unscoped: resets every key)";

function specFiles(): string[] {
  return readdirSync(E2E_DIR).filter((name) => name.endsWith(".spec.ts")).sort();
}

/** Reduce `encodeURIComponent(DIR)` and friends to the bare identifier. */
function identifier(expression: string): string {
  return expression.replace(/encodeURIComponent\(/g, "").replace(/[()\s]/g, "");
}

interface Mutation {
  file: string;
  /** What is being mutated, e.g. `auto-approve` or `/test/sharing/reset`. */
  state: string;
  /** Which slice of it, e.g. `/tmp/mock-project` or `session=ses_mock_done`. */
  key: string;
}

/** Resolve one query-string value, which may interpolate a directory constant. */
function value(raw: string, constants: Map<string, string>, context: string): string {
  const interpolated = /\$\{([^}]*)\}/.exec(raw);
  if (!interpolated) return raw;
  const constant = identifier(interpolated[1]);
  const resolved = constants.get(constant);
  // Unresolvable is a failure, not a skip: silently ignoring a key spelled some
  // other way would reopen exactly the hole this closes.
  expect(
    resolved,
    `${context} is scoped by "${constant}", which is not declared in that file as a platform-aware directory constant. Declare it so ownership can be checked.`,
  ).toBeDefined();
  return resolved!;
}

function mutations(): Mutation[] {
  const found: Mutation[] = [];
  for (const file of specFiles()) {
    const source = readFileSync(path.join(E2E_DIR, file), "utf8");
    const constants = new Map<string, string>();
    for (const [, name, , linuxPath] of source.matchAll(DIRECTORY_CONSTANT)) {
      constants.set(name, linuxPath);
    }

    for (const [, expression] of source.matchAll(AUTO_APPROVE)) {
      const constant = identifier(expression);
      const directory = constants.get(constant);
      expect(
        directory,
        `${file} toggles auto permissions on "${constant}", which is not declared there as a platform-aware directory constant. Declare it so ownership can be checked.`,
      ).toBeDefined();
      found.push({ file, state: "auto-approve", key: directory! });
    }

    for (const [, endpoint, query] of source.matchAll(RESET)) {
      const state = `/test/${endpoint}/reset`;
      const pairs = (query ?? "").replace(/^\?/, "").split("&").filter(Boolean);
      if (pairs.length === 0) {
        found.push({ file, state, key: EVERYTHING });
        continue;
      }
      // Every parameter is treated as part of the key, so a reset that names
      // several sessions owns each of them separately.
      for (const pair of pairs) {
        const separator = pair.indexOf("=");
        const name = separator === -1 ? pair : pair.slice(0, separator);
        const raw = separator === -1 ? "" : pair.slice(separator + 1);
        found.push({ file, state, key: `${name}=${value(raw, constants, `${file} resets ${state}, which`)}` });
      }
    }
  }
  return found;
}

describe("e2e shared-state ownership", () => {
  it("finds the mutations it is supposed to be guarding", () => {
    // If a refactor renames a route or a helper, the guard must fail loudly
    // rather than pass by matching nothing.
    const found = mutations();
    const states = new Set(found.map((mutation) => mutation.state));
    expect(states).toContain("auto-approve");
    expect(found.filter((mutation) => mutation.state === "auto-approve").length).toBeGreaterThanOrEqual(3);
    // sharing, permissions, questions and mobile all have reset endpoints today.
    expect([...states].filter((state) => state.startsWith("/test/")).length).toBeGreaterThanOrEqual(4);
    expect(new Set(found.map((mutation) => mutation.file)).size).toBeGreaterThanOrEqual(3);
  });

  it("gives every mutated key exactly one owning spec file", () => {
    const found = mutations();
    const owners = new Map<string, Set<string>>();
    for (const { file, state, key } of found) {
      const scope = `${state} ${key}`;
      owners.set(scope, (owners.get(scope) ?? new Set<string>()).add(file));
    }
    // An unscoped reset clears every key of its endpoint, so it collides with
    // that endpoint's scoped callers too, not just with another unscoped one.
    for (const [scope, files] of owners) {
      if (!scope.endsWith(EVERYTHING)) continue;
      const endpoint = scope.slice(0, -EVERYTHING.length);
      for (const [other, otherFiles] of owners) {
        if (other === scope || !other.startsWith(endpoint)) continue;
        for (const file of otherFiles) files.add(file);
      }
    }

    const shared = [...owners.entries()]
      .filter(([, files]) => files.size > 1)
      .map(([scope, files]) => `${scope} is reset by ${[...files].sort().join(" and ")}`)
      .sort();

    expect(
      shared,
      "Playwright runs these files in parallel against one mock and one BFF, so a shared key means each file mutates it under the other. Give the new file its own key — its own mock directory, question scope, or share fixture session — or scope the reset so it only clears what its caller owns.",
    ).toEqual([]);
  });
});
