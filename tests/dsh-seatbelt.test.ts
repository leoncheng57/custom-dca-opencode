import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
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
        mode: "read-only",
      });
      await execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(stateRoot, "allowed")]);
      await expect(execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(workspace, "denied")])).rejects.toThrow();
    },
  );

  it.runIf(process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec"))(
    "allows a virtualenv interpreter to load its canonical runtime without making it writable",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "dsh-seatbelt-python-"));
      temporary.push(root);
      const workspace = path.join(root, "workspace");
      const stateRoot = path.join(root, "state");
      const venv = path.join(root, "venv", "bin");
      const runtime = path.join(root, "runtime");
      await Promise.all([mkdir(workspace), mkdir(stateRoot), mkdir(venv, { recursive: true }), mkdir(runtime)]);
      const realPython = path.join(runtime, "python-real");
      await writeFile(realPython, "#!/bin/sh\nexec /usr/bin/python3 \"$@\"\n", { mode: 0o700 });
      const pythonLink = path.join(venv, "python");
      await symlink(realPython, pythonLink);
      const profile = dshSeatbeltProfile({
        workspace: realpathSync(workspace),
        stateRoot: realpathSync(stateRoot),
        python: pythonLink,
        bridgeScript: "/usr/bin/true",
        cordis: "/usr/bin/true",
        mode: "read-only",
      });
      await execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, pythonLink, "-c", "print('ok')"]);
      await expect(execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(runtime, "denied")])).rejects.toThrow();
    },
  );

  it.runIf(process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec"))(
    "allows Build writes only inside the selected workspace and DSH state",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "dsh-seatbelt-build-"));
      temporary.push(root);
      const workspace = path.join(root, "workspace");
      const stateRoot = path.join(root, "state");
      const outside = path.join(root, "outside");
      await Promise.all([mkdir(workspace), mkdir(stateRoot), mkdir(outside)]);
      await symlink(outside, path.join(workspace, "escape"));
      const profile = dshSeatbeltProfile({
        workspace: realpathSync(workspace),
        stateRoot: realpathSync(stateRoot),
        python: "/usr/bin/python3",
        bridgeScript: "/usr/bin/true",
        cordis: "/usr/bin/true",
        mode: "build",
      });
      await execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(workspace, "allowed")]);
      await execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(stateRoot, "state-allowed")]);
      await expect(execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(outside, "denied")])).rejects.toThrow();
      await expect(execFileAsync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/touch", path.join(workspace, "escape", "denied")])).rejects.toThrow();
    },
  );
});
