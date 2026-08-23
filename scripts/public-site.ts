import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export const PUBLIC_SITE_PATHS = [
  ".nojekyll",
  "index.html",
  "404.html",
  "assets",
  "features",
  "docs",
  "architecture",
  "roadmap",
  "changelog",
  "agent-skills",
] as const;

const REQUIRED_BUILD_PATHS = [
  "index.html",
  "404.html",
  "agent-skills/index.html",
  "agent-skills/commands/index.html",
] as const;

function containsPath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Replace only public-site-owned paths inside a checked-out gh-pages tree. */
export function stagePublicSite(buildDirectory: string, pagesDirectory: string): string[] {
  const buildRoot = path.resolve(buildDirectory);
  const pagesRoot = path.resolve(pagesDirectory);
  if (containsPath(buildRoot, pagesRoot) || containsPath(pagesRoot, buildRoot)) {
    throw new Error("Build and Pages directories must not overlap");
  }

  for (const required of REQUIRED_BUILD_PATHS) {
    if (!existsSync(path.join(buildRoot, required))) {
      throw new Error(`Public site build is missing ${required}`);
    }
  }

  mkdirSync(pagesRoot, { recursive: true });

  const copied: string[] = [];
  for (const ownedPath of PUBLIC_SITE_PATHS) {
    const source = path.join(buildRoot, ownedPath);
    const destination = path.join(pagesRoot, ownedPath);
    rmSync(destination, { recursive: true, force: true });
    if (!existsSync(source)) continue;
    cpSync(source, destination, { recursive: true });
    copied.push(ownedPath);
  }

  return copied;
}
