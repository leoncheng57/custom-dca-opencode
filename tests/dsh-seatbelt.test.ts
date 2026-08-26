import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { dshSeatbeltProfile } from "../server/dsh/bridge.js";

const execFileAsync = promisify(execFile);
const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("DSH Seatbelt policy", () => {
  it.runIf(process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec"))(
    "allows state writes but denies writes in the selected workspace",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "dsh-seatbelt-"));
      temporary.push(root);
      const workspace = path.join(root, "workspace");
      const stateRoot = path.join(root, "state");
      await Promise.all([mkdir(workspace), mkdir(stateRoot)]);
      const profile = dshSeatbeltProfile({
        workspace: realpathSync(workspace),
        stateRoot: realpathSync(stateRoot),
        python: "/usr/bin/python3",
        bridgeScript: "/usr/bin/true",
        cordis: "/usr/bin/true",
      });
      await execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(stateRoot, "allowed")]);
      await expect(execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(workspace, "denied")])).rejects.toThrow();
    },
  );
});
