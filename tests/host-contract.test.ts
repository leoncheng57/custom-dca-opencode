// tests/host-contract.test.ts
//
// Issue #204 adds an OPTIONAL Docker (Linux) lane for the Playwright E2E suite.
// That lane buys reproducibility, but it buys it by moving the tests off the
// machine the product actually runs on: `opencode serve` is a host process
// owned by the developer's user (AGENTS.md decision #2, "No Docker"), so every
// path the BFF hardens is a path on a macOS filesystem. A Linux container
// cannot demonstrate that hardening, and — worse — it cannot demonstrate that
// it FAILS either. A container run is green in exactly the same way whether the
// macOS behaviour still holds or not.
//
// So the container lane is additive, and this file is what survives it: the
// host-native contract lane. It asserts the facts that only a run on the real
// host can establish — macOS path canonicalisation, real symlink escapes
// through a real `realpath`, the presence and behaviour of the host `git`
// binary, and POSIX file modes on state the BFF writes.
//
// The cost of getting this wrong is asymmetric. If the container lane silently
// replaces the host lane, the first thing to rot is `server/paths.ts`, which is
// the ONLY thing standing between a browser on the tailnet and every readable
// file on the host (see the comment on `requireProjectDirectory`). A regression
// there does not look like a failing test; it looks like a passing suite and an
// open door. Everything below is therefore written to pass on Linux by SKIPPING
// with a stated reason, never by asserting a weaker fact that happens to hold
// in both places.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PathError, isSensitiveWorkspacePath, requireReadableWorkspacePath } from "../server/paths.js";
import { PushSubscriptionStore } from "../server/notifications/webpush.js";

const DARWIN = process.platform === "darwin";
const POSIX = process.platform !== "win32";

/**
 * Every directory this file creates. Cleanup only ever removes paths that came
 * back from `mkdtempSync`, and never globs: a sibling worktree may be mid-run
 * in the same temp directory right now, and the whole point of issue #80's
 * `tests/e2e/state-files.ts` was that a broad delete turns an isolation fix
 * into a worse bug.
 */
const created: string[] = [];

function tempDir(label: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), `custom-dca-host-contract-${label}-`));
  created.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/**
 * Assert a rejection is a real `PathError` with the expected status. Matching on
 * the message would let a 404 ("not found") pass as a 403 ("refused"), and those
 * two answers say very different things to a caller about whether the path is
 * reachable at all.
 */
async function expectPathError(promise: Promise<unknown>, status: number): Promise<PathError> {
  const error = await promise.then(
    (value) => new Error(`expected a PathError, resolved with ${JSON.stringify(value)}`),
    (reason: unknown) => reason,
  );
  expect(error, String(error)).toBeInstanceOf(PathError);
  expect((error as PathError).status).toBe(status);
  return error as PathError;
}

describe("host contract: macOS path canonicalisation", () => {
  // Unprovable in a Linux container: there, `/tmp` is an ordinary directory and
  // `realpath("/tmp")` is `/tmp`. macOS ships `/tmp` as a symlink to
  // `/private/tmp`, which is why fourteen Playwright specs carry
  // `process.platform === "darwin" ? "/private/tmp/..." : "/tmp/..."` for the
  // mock project directories — the BFF canonicalises the `?directory=` it is
  // given (server/paths.ts), so the value that comes back out is the private
  // form. If that ternary ever gets "simplified" away because the container
  // lane is green without it, the host lane breaks and this test is the thing
  // that says why.
  it.runIf(DARWIN)("resolves /tmp to /private/tmp on darwin", () => {
    expect(realpathSync("/tmp")).toBe("/private/tmp");
  });

  it.skipIf(DARWIN)("skips the /tmp canonicalisation assertion off darwin (a Linux /tmp is a real directory)", () => {
    // Recorded rather than silently absent: a skipped test in the report is the
    // signal that this run did not cover the platform fact, whereas asserting
    // `realpath("/tmp") === "/tmp"` here would be a tautology dressed as coverage.
    expect(DARWIN).toBe(false);
  });
});

describe("host contract: real symlink containment", () => {
  // Unprovable without a real filesystem: `requireReadableWorkspacePath` closes
  // this hole with `realpath`, and a mocked `realpath` proves only that the test
  // author remembered to make the mock lie. The escape has to be a link the
  // kernel actually follows. This is also the exact failure mode the route-level
  // reference validation in decision #20 delegates to, so a false negative here
  // hands out arbitrary host reads.
  it("rejects a symlink that leaves the workspace with 403", async () => {
    const workspace = tempDir("workspace");
    const outside = tempDir("outside");
    writeFileSync(path.join(outside, "secret-outside.txt"), "not yours\n");
    symlinkSync(outside, path.join(workspace, "escape"));

    const error = await expectPathError(
      requireReadableWorkspacePath(workspace, "escape/secret-outside.txt"),
      403,
    );
    // The refusal must be about containment, not about the file being missing:
    // the target genuinely exists, which is what makes this a security answer
    // rather than a lookup failure.
    expect(error.message).toMatch(/outside the project/);
  });

  // Unprovable in a Linux container for the reason that matters in production:
  // on macOS the workspace path the BFF is handed is ALREADY an alias
  // (`/var/folders/...` reaches the canonical `/private/var/folders/...`, and
  // `/tmp` reaches `/private/tmp`), so containment is evaluated between two
  // canonical paths while the caller only ever saw the alias. A container's
  // temp directory is canonical, so the alias branch is never taken there and a
  // regression that only misbehaves under aliasing would go unseen. The return
  // value is the load-bearing part: `requireReadableWorkspacePath` promises a
  // canonical RELATIVE path and its own comment requires callers to forward
  // that rather than the alias, because a link re-read after validation could
  // point somewhere else by then (TOCTOU).
  it("resolves an in-workspace file through an aliased parent to a canonical relative path", async () => {
    const parent = tempDir("alias-parent");
    const real = path.join(parent, "real");
    mkdirSync(path.join(real, "nested"), { recursive: true });
    writeFileSync(path.join(real, "nested", "ok.txt"), "visible\n");
    symlinkSync(real, path.join(parent, "alias"));

    const alias = path.join(parent, "alias");
    // Guard the premise: if this were not actually an alias the test below would
    // be asserting the trivial case.
    expect(realpathSync(alias)).not.toBe(alias);

    const resolved = await requireReadableWorkspacePath(alias, "nested/ok.txt");
    expect(resolved).toBe("nested/ok.txt");
    // And the contract is a relative path, not the absolute alias or the
    // absolute canonical target. Callers join it onto the canonical workspace
    // themselves.
    expect(path.isAbsolute(resolved)).toBe(false);
    expect(resolved).not.toContain("alias");
  });
});

describe("host contract: sensitive path refusal", () => {
  // Host-independent by construction — `SENSITIVE_SEGMENT` is a regex, and the
  // container would prove it just as well. It lives here anyway because the
  // host lane is the one that must never shrink to "only the things Linux
  // cannot do": this is the cheapest assertion in the file and the one whose
  // absence is least likely to be noticed, and it is the refusal that keeps
  // `.env` and `.ssh` out of a browser on the tailnet. The `.env` case is run
  // through the real entry point as well, because the segment check being
  // correct is worth nothing if the route stops consulting it.
  it("refuses git metadata, dotenv files and ssh keys but not ordinary documents", async () => {
    for (const sensitive of [".git", ".git/config", ".env", ".env.local", ".ssh/id_rsa"]) {
      expect(isSensitiveWorkspacePath(sensitive), sensitive).toBe(true);
    }
    expect(isSensitiveWorkspacePath("docs/guide.md")).toBe(false);

    const workspace = tempDir("sensitive");
    writeFileSync(path.join(workspace, ".env"), "SECRET=1\n");
    const error = await expectPathError(requireReadableWorkspacePath(workspace, ".env"), 403);
    expect(error.message).toMatch(/sensitive workspace paths/);
    // A non-sensitive sibling in the same workspace still resolves, so the
    // refusal above is about the name and not about the workspace being broken.
    writeFileSync(path.join(workspace, "guide.md"), "# fine\n");
    await expect(requireReadableWorkspacePath(workspace, "guide.md")).resolves.toBe("guide.md");
  });
});

describe("host contract: host git binary", () => {
  // Unprovable as a HOST fact inside a container: `requireReadableWorkspacePath`
  // shells out to the `git` on PATH (`git -C <ws> check-ignore -q --`) and reads
  // its exit code — 0 ignored, 1 visible, 128 not a repo. A container image can
  // pin its own git and would pass whether or not the developer's machine has
  // one, so a missing or too-old host git would surface as every workspace file
  // suddenly becoming readable (exit 128 is treated as "not ignored"). That is a
  // silent widening, not an error, which is precisely why it needs a host test.
  it("treats a gitignored file as unreadable and a tracked sibling as readable", async () => {
    const workspace = tempDir("git");
    writeFileSync(path.join(workspace, ".gitignore"), "secret.txt\n");
    writeFileSync(path.join(workspace, "secret.txt"), "ignored\n");
    writeFileSync(path.join(workspace, "ok.txt"), "visible\n");
    execFileSync("git", ["-C", workspace, "init", "-q"]);

    // Proves the binary is really there and really answering, so a 403 below
    // cannot be an exec failure wearing a refusal's clothes.
    expect(execFileSync("git", ["-C", workspace, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).trim())
      .toBe("true");

    const error = await expectPathError(requireReadableWorkspacePath(workspace, "secret.txt"), 403);
    expect(error.message).toMatch(/ignored workspace paths/);
    await expect(requireReadableWorkspacePath(workspace, "ok.txt")).resolves.toBe("ok.txt");
  });
});

describe("host contract: state file permissions", () => {
  // Unprovable off a POSIX host, and unprovable ABOUT the host from inside a
  // container: the container writes into its own overlay with its own umask and
  // its own uid, so a mode assertion there says nothing about the file that ends
  // up in the developer's `.state/` directory. Verified in source before
  // asserting: `PushSubscriptionStore.write` (server/notifications/webpush.ts:88)
  // does `writeFile(temporary, ..., { mode: 0o600 })` and then `rename`s it into
  // place, so the explicit mode is real and `rename` carries it over. The same
  // 0o600 appears in preferences.ts, history.ts, projects.ts, modelPins.ts and
  // instruction-audit.ts, so this is the house rule for BFF state rather than a
  // one-off. It matters because AGENTS.md decision #18 puts VAPID-bound device
  // subscriptions in this file: group- or world-readable would leak the push
  // endpoints of every registered device to any local process.
  it.runIf(POSIX)("writes the push subscription store with mode 0600", async () => {
    const directory = tempDir("webpush");
    const file = path.join(directory, "nested", "web-push-subscriptions.json");
    const store = new PushSubscriptionStore(file);

    await store.add({
      endpoint: "https://web.push.apple.com/host-contract-endpoint",
      keys: { p256dh: "p256dh-host-contract", auth: "auth-host-contract" },
    });

    // 0o777 masks off the file-type bits; setuid/setgid/sticky are deliberately
    // included in the comparison because any of them on a state file is wrong.
    expect((statSync(file).mode & 0o7777).toString(8)).toBe("600");
  });

  it.skipIf(POSIX)("skips the mode assertion where POSIX permission bits are not meaningful", () => {
    expect(POSIX).toBe(false);
  });
});
