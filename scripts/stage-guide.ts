import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GUIDE_PATH = path.join("guides", "runner");

async function statOrNull(candidate: string) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function validateArtifact(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("guide artifact must not contain symbolic links");
    if (!entry.isDirectory() && !entry.isFile()) {
      throw new Error("guide artifact may contain only regular files and directories");
    }
  }

  const index = await statOrNull(path.join(directory, "index.html"));
  if (!index?.isFile() || index.isSymbolicLink()) {
    throw new Error("guide artifact must contain a regular index.html");
  }
  const assets = await statOrNull(path.join(directory, "assets"));
  if (!assets?.isDirectory() || assets.isSymbolicLink()) {
    throw new Error("guide artifact must contain a regular assets directory");
  }
}

async function validateCheckout(directory: string): Promise<void> {
  const checkout = await lstat(directory);
  if (!checkout.isDirectory() || checkout.isSymbolicLink()) {
    throw new Error("destination must be a checkout directory, not a symbolic link");
  }
  const gitMarker = await statOrNull(path.join(directory, ".git"));
  if (!gitMarker || gitMarker.isSymbolicLink()) {
    throw new Error("destination must be the root of a Git checkout");
  }

  for (const relative of ["guides", GUIDE_PATH]) {
    const entry = await statOrNull(path.join(directory, relative));
    if (entry?.isSymbolicLink()) throw new Error(`destination ${relative} must not be a symbolic link`);
    if (entry && !entry.isDirectory()) throw new Error(`destination ${relative} must be a directory`);
  }
}

export async function stageGuide(sourceDirectory: string, checkoutDirectory: string): Promise<string> {
  const sourceInput = path.resolve(sourceDirectory);
  const destinationInput = path.resolve(checkoutDirectory);
  const sourceInputStat = await lstat(sourceInput);
  const destinationInputStat = await lstat(destinationInput);
  if (!sourceInputStat.isDirectory() || sourceInputStat.isSymbolicLink()) {
    throw new Error("source must be an artifact directory, not a symbolic link");
  }
  if (!destinationInputStat.isDirectory() || destinationInputStat.isSymbolicLink()) {
    throw new Error("destination must be a checkout directory, not a symbolic link");
  }

  const source = await realpath(sourceInput);
  const destination = await realpath(destinationInput);
  if (isWithin(source, destination) || isWithin(destination, source)) {
    throw new Error("source and destination directories must not overlap");
  }

  await validateArtifact(source);
  await validateCheckout(destination);

  const guidesDirectory = path.join(destination, "guides");
  const target = path.join(destination, GUIDE_PATH);
  const nonce = randomUUID();
  const staging = path.join(guidesDirectory, `.runner-stage-${nonce}`);
  const backup = path.join(guidesDirectory, `.runner-backup-${nonce}`);
  await mkdir(guidesDirectory, { recursive: true });
  await cp(source, staging, { recursive: true, errorOnExist: true, force: false });

  const existing = await statOrNull(target);
  let backedUp = false;
  try {
    if (existing) {
      await rename(target, backup);
      backedUp = true;
    }
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (backedUp && !(await statOrNull(target))) await rename(backup, target);
    throw error;
  }

  if (backedUp) await rm(backup, { recursive: true, force: true });
  return target;
}

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const target = await stageGuide(required("--source"), required("--destination"));
  console.log(`Staged guide at ${target}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  void main();
}
