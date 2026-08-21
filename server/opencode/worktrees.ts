import path from "node:path";
import { realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { request, type OpencodeConfig } from "./client.js";
import type { EventBus, OpencodeEvent } from "./events.js";
import { requireProjectDirectory, worktreesRoot } from "../paths.js";

const execFileAsync = promisify(execFile);

export interface Worktree {
  name: string;
  branch?: string;
  directory: string;
}

export async function listWorktrees(config: OpencodeConfig, directory: string): Promise<Worktree[]> {
  const directories = await request<string[]>(config, "/experimental/worktree", { directory });
  return directories.map((item) => ({ name: path.basename(item), directory: item }));
}

function worktreeFromEvent(event: OpencodeEvent): Worktree | null {
  const source =
    event.properties.info && typeof event.properties.info === "object"
      ? (event.properties.info as Record<string, unknown>)
      : event.properties;
  // Real OpenCode puts the new directory on the global-event envelope and
  // emits only {name, branch} in properties.
  const directory = event.directory ?? (typeof source.directory === "string" ? source.directory : undefined);
  if (!directory) return null;
  return {
    name: typeof source.name === "string" ? source.name : path.basename(directory),
    ...(typeof source.branch === "string" ? { branch: source.branch } : {}),
    directory,
  };
}

/** Create before prompting, and wait for checkout/bootstrap to actually finish. */
export async function createWorktree(
  config: OpencodeConfig,
  bus: EventBus,
  directory: string,
  name?: string,
): Promise<Worktree> {
  let created: Worktree | null = null;
  const buffered: OpencodeEvent[] = [];
  let resolveReady!: (value: Worktree) => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<Worktree>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // The POST may itself hang; attach a handler immediately so the readiness
  // timeout cannot become an unhandled rejection while we are still awaiting it.
  void ready.catch(() => undefined);
  const onEvent = (event: OpencodeEvent) => {
    if (event.type !== "worktree.ready" && event.type !== "worktree.failed") return;
    if (!created) {
      buffered.push(event);
      return;
    }
    const worktree = worktreeFromEvent(event);
    if (event.type === "worktree.ready" && worktree?.directory !== created.directory) return;
    if (event.type === "worktree.failed" && worktree?.name !== created.name) return;
    if (event.type === "worktree.failed") {
      rejectReady(new Error(String(event.properties.message ?? event.properties.error ?? "worktree setup failed")));
    } else if (worktree) {
      resolveReady(worktree);
    }
  };
  bus.on("event", onEvent);
  const timeout = setTimeout(() => rejectReady(new Error("worktree setup timed out")), 60_000);
  try {
    created = await request<Worktree>(config, "/experimental/worktree", {
      method: "POST",
      directory,
      body: name ? { name } : {},
      signal: AbortSignal.timeout(60_000),
    });
    for (const event of buffered) onEvent(event);
    return await ready;
  } finally {
    clearTimeout(timeout);
    bus.off("event", onEvent);
  }
}

async function requireListedWorktree(
  config: OpencodeConfig,
  projectDirectory: string,
  worktreeDirectory: string,
): Promise<void> {
  const [project, target] = await Promise.all([
    realpath(projectDirectory),
    requireProjectDirectory(worktreeDirectory, worktreesRoot()),
  ]);
  if (target === project) throw new Error("the primary checkout is not a removable worktree");
  const listed = await listWorktrees(config, projectDirectory);
  const canonicalListed = await Promise.all(listed.map((worktree) => realpath(worktree.directory).catch(() => "")));
  if (!canonicalListed.includes(target)) {
    throw new Error("worktree is not registered for this project");
  }
  const commonDirectory = async (directory: string) => {
    const { stdout } = await execFileAsync("git", ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      timeout: 5_000,
      encoding: "utf8",
    });
    return realpath(stdout.trim());
  };
  const [projectCommon, targetCommon] = await Promise.all([commonDirectory(project), commonDirectory(target)]);
  if (projectCommon !== targetCommon) throw new Error("worktree does not belong to this project");
}

export async function resetWorktree(
  config: OpencodeConfig,
  projectDirectory: string,
  worktreeDirectory: string,
): Promise<void> {
  await requireListedWorktree(config, projectDirectory, worktreeDirectory);
  await request<boolean>(config, "/experimental/worktree/reset", {
    method: "POST",
    directory: projectDirectory,
    body: { directory: worktreeDirectory },
  });
}

export async function deleteWorktree(
  config: OpencodeConfig,
  projectDirectory: string,
  worktreeDirectory: string,
): Promise<void> {
  await requireListedWorktree(config, projectDirectory, worktreeDirectory);
  await request<boolean>(config, "/experimental/worktree", {
    method: "DELETE",
    directory: projectDirectory,
    body: { directory: worktreeDirectory },
  });
}
