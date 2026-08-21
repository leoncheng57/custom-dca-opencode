import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { PathError, projectsRoot, requireProjectDirectory, worktreesRoot } from "./paths.js";

export const PROJECT_SCAN_MAX_DEPTH = 5;
export const PROJECT_SCAN_MAX_RESULTS = 500;
export const PROJECT_SCAN_MAX_DIRECTORIES = 5_000;
export const PROJECT_PINS_MAX = 500;

const EXCLUDED_NAMES = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  "cache",
  "caches",
  "__pycache__",
  ".git",
]);

export interface DiscoveredProject {
  name: string;
  relativePath: string;
  directory: string;
  kind: "repository" | "directory";
}

export interface ProjectDiscovery {
  root: string;
  projects: DiscoveredProject[];
}

function isContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function repositoryMarker(directory: string): Promise<boolean> {
  try {
    const marker = await lstat(path.join(directory, ".git"));
    return !marker.isSymbolicLink() && (marker.isDirectory() || marker.isFile());
  } catch {
    return false;
  }
}

async function canonicalProjectsRoot(root: string): Promise<string> {
  try {
    const canonical = await realpath(root);
    await readdir(canonical);
    return canonical;
  } catch {
    throw new PathError(500, "PROJECTS_DIR must identify a readable directory");
  }
}

export async function discoverProjects(options: {
  root?: string;
  excludedWorktreesRoot?: string;
} = {}): Promise<ProjectDiscovery> {
  const canonicalRoot = await canonicalProjectsRoot(options.root ?? projectsRoot());
  const configuredWorktrees = options.excludedWorktreesRoot ?? worktreesRoot();
  const canonicalWorktrees = await realpath(configuredWorktrees).catch(() => path.resolve(configuredWorktrees));
  const projects: DiscoveredProject[] = [];
  let visited = 0;

  async function scan(directory: string, depth: number): Promise<void> {
    if (depth >= PROJECT_SCAN_MAX_DEPTH || projects.length >= PROJECT_SCAN_MAX_RESULTS) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (projects.length >= PROJECT_SCAN_MAX_RESULTS || visited >= PROJECT_SCAN_MAX_DIRECTORIES) return;
      if (entry.name.startsWith(".") || EXCLUDED_NAMES.has(entry.name.toLowerCase())) continue;
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

      const candidate = path.join(directory, entry.name);
      let canonicalCandidate: string;
      try {
        const candidateStat = await lstat(candidate);
        if (candidateStat.isSymbolicLink() || !candidateStat.isDirectory()) continue;
        canonicalCandidate = await realpath(candidate);
      } catch {
        continue;
      }
      if (!isContained(canonicalRoot, canonicalCandidate) || isContained(canonicalWorktrees, canonicalCandidate)) continue;
      visited += 1;
      const candidateDepth = depth + 1;
      const repository = await repositoryMarker(canonicalCandidate);

      if (candidateDepth === 1 || repository) {
        try {
          const canonical = await requireProjectDirectory(canonicalCandidate, canonicalRoot);
          const relativePath = path.relative(canonicalRoot, canonical).replaceAll(path.sep, "/");
          projects.push({
            name: path.basename(canonical),
            relativePath,
            directory: canonical,
            kind: repository ? "repository" : "directory",
          });
        } catch {
          // Entries can disappear or become unreadable while a scan is active.
        }
      }

      await scan(canonicalCandidate, candidateDepth);
    }
  }

  await scan(canonicalRoot, 0);
  projects.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { root: canonicalRoot, projects };
}

function pinPayload(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { directories?: unknown }).directories)) {
    throw new PathError(400, "directories must be an array of absolute project paths");
  }
  const directories = (value as { directories: unknown[] }).directories;
  if (directories.length > PROJECT_PINS_MAX) {
    throw new PathError(400, `directories must contain at most ${PROJECT_PINS_MAX} projects`);
  }
  return directories;
}

export async function normalizeProjectPins(value: unknown, root = projectsRoot()): Promise<string[]> {
  const directories = pinPayload(value);
  const canonicalRoot = await canonicalProjectsRoot(root);
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const directory of directories) {
    const canonical = await requireProjectDirectory(directory, canonicalRoot);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      normalized.push(canonical);
    }
  }
  return normalized;
}

export class ProjectPinStore {
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(
    readonly file = process.env.PROJECT_PINS_FILE || path.resolve(process.cwd(), ".state/project-pins.json"),
    readonly root = projectsRoot(),
  ) {}

  async read(): Promise<string[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error("project pins could not be read");
    }

    const directories = pinPayload(parsed);
    const canonicalRoot = await canonicalProjectsRoot(this.root);
    const valid: string[] = [];
    for (const directory of directories) {
      try {
        const canonical = await requireProjectDirectory(directory, canonicalRoot);
        if (canonical && !valid.includes(canonical)) valid.push(canonical);
      } catch {
        // A moved or deleted project should not make the shared picker unusable.
      }
    }
    return valid;
  }

  async write(value: unknown): Promise<string[]> {
    const directories = await normalizeProjectPins(value, this.root);
    const operation = this.pendingWrite.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ version: 1, directories }, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, this.file);
    });
    this.pendingWrite = operation.catch(() => undefined);
    await operation;
    return directories;
  }
}
