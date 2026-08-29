import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  invocation,
  isValidCommandName,
  loadCommandsFromFiles,
  type Command,
} from "../agent-skills/src/lib/commands.js";

export const SITE_BASE_PATH = "/custom-dca-opencode/agent-skills/";
const MAX_FILES = 512;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

export interface AgentSkillsSiteFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface AgentSkillsSiteManifest {
  version: 1;
  basePath: typeof SITE_BASE_PATH;
  commands: string[];
  files: AgentSkillsSiteFile[];
}

function digest(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeRelativePath(value: string): string {
  if (
    !value ||
    value.length > 240 ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`Invalid site path: ${JSON.stringify(value)}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized === ".git" ||
    normalized.startsWith(".git/")
  ) {
    throw new Error(`Unsafe site path: ${value}`);
  }
  return value;
}

function walk(root: string, directory = root): AgentSkillsSiteFile[] {
  const files: AgentSkillsSiteFile[] = [];
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const stat = lstatSync(absolute);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (stat.isSymbolicLink()) throw new Error(`Site contains a symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      files.push(...walk(root, absolute));
      continue;
    }
    if (!stat.isFile()) throw new Error(`Site contains a non-file entry: ${relative}`);
    safeRelativePath(relative);
    if (stat.size > MAX_FILE_BYTES) throw new Error(`Site file exceeds 1 MiB: ${relative}`);
    files.push({ path: relative, bytes: stat.size, sha256: digest(absolute) });
  }
  return files;
}

function expectedPaths(commands: readonly string[]): Set<string> {
  return new Set([
    "assets/site.css",
    "commands/index.html",
    "index.html",
    ...commands.map((name) => `commands/${name}/index.html`),
  ]);
}

function validateManifest(manifest: AgentSkillsSiteManifest): void {
  if (manifest.version !== 1 || manifest.basePath !== SITE_BASE_PATH) {
    throw new Error("Site manifest identity is invalid");
  }
  if (!Array.isArray(manifest.commands) || manifest.commands.length === 0) {
    throw new Error("Site manifest must contain commands");
  }
  const sortedCommands = [...manifest.commands].sort();
  if (
    sortedCommands.some((name) => !isValidCommandName(name)) ||
    new Set(sortedCommands).size !== sortedCommands.length ||
    JSON.stringify(sortedCommands) !== JSON.stringify(manifest.commands)
  ) {
    throw new Error("Site manifest command inventory is invalid");
  }
  if (manifest.files.length === 0 || manifest.files.length > MAX_FILES) {
    throw new Error(`Site file count must be between 1 and ${MAX_FILES}`);
  }
  const expected = expectedPaths(manifest.commands);
  const names = new Set<string>();
  let totalBytes = 0;
  for (const file of manifest.files) {
    safeRelativePath(file.path);
    if (!expected.has(file.path)) throw new Error(`Unexpected site file: ${file.path}`);
    if (names.has(file.path)) throw new Error(`Duplicate site path: ${file.path}`);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_FILE_BYTES) {
      throw new Error(`Invalid size for ${file.path}`);
    }
    if (!/^[0-9a-f]{64}$/u.test(file.sha256)) throw new Error(`Invalid digest for ${file.path}`);
    names.add(file.path);
    totalBytes += file.bytes;
  }
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Site exceeds 10 MiB");
  for (const required of expected) {
    if (!names.has(required)) throw new Error(`Site is missing required route or asset: ${required}`);
  }
}

function page(title: string, route: string, content: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${safeTitle} | OpenCode commands</title>
  <link rel="canonical" href="${SITE_BASE_PATH}${route}">
  <link rel="stylesheet" href="${SITE_BASE_PATH}assets/site.css">
</head>
<body><main>${content}</main></body>
</html>
`;
}

function commandCard(command: Command): string {
  const route = `${SITE_BASE_PATH}commands/${encodeURIComponent(command.name)}/`;
  return `<article class="card">
  <p class="eyebrow">${escapeHtml(invocation(command.name, command.takesArguments))}</p>
  <h2><a href="${route}">${escapeHtml(command.name)}</a></h2>
  <p>${escapeHtml(command.description || "No autocomplete description provided.")}</p>
</article>`;
}

function commandPage(command: Command): string {
  const metadata = [
    command.agent ? `<span>agent: ${escapeHtml(command.agent)}</span>` : "",
    command.model ? `<span>model: ${escapeHtml(command.model)}</span>` : "",
    command.subtask ? "<span>subtask</span>" : "",
    command.runsShell ? "<span>shell interpolation</span>" : "",
  ].filter(Boolean).join("");
  return page(command.name, `commands/${encodeURIComponent(command.name)}/`, `<nav><a href="${SITE_BASE_PATH}commands/">All commands</a></nav>
<header><p class="eyebrow">OpenCode command</p><h1>${escapeHtml(invocation(command.name, command.takesArguments))}</h1>
<p>${escapeHtml(command.description || "No autocomplete description provided.")}</p><div class="meta">${metadata}</div></header>
<section><h2>Command template</h2><pre><code>${escapeHtml(command.body)}</code></pre></section>`);
}

const STYLES = `:root{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#182016;background:#f5f1e8}*{box-sizing:border-box}body{margin:0}main{width:min(72rem,calc(100% - 2rem));margin:0 auto;padding:4rem 0 6rem}a{color:#27643c;text-underline-offset:.2em}header{max-width:54rem;margin:3rem 0}.eyebrow{color:#587260;text-transform:uppercase;letter-spacing:.12em;font-size:.78rem}h1{font-size:clamp(2rem,7vw,4.75rem);line-height:1;margin:.25rem 0 1rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr));gap:1rem}.card{border:1px solid #aab5a3;background:#fffdf7;padding:1.25rem}.card h2{margin:.35rem 0}.meta{display:flex;flex-wrap:wrap;gap:.5rem}.meta span{border:1px solid #8ba18f;padding:.25rem .5rem}pre{overflow:auto;background:#182016;color:#edf4e9;padding:1.25rem;line-height:1.55;border-left:.35rem solid #78ad7f}@media(prefers-color-scheme:dark){:root{color:#e5ecdf;background:#111610}.card{background:#182016;border-color:#405040}a{color:#91c99a}pre{background:#080b08}}`;

export function generateAgentSkillsSite(
  sourceDirectory: string,
  outputDirectory: string,
): AgentSkillsSiteManifest {
  const sourceRoot = path.resolve(sourceDirectory);
  const outputRoot = path.resolve(outputDirectory);
  if (!existsSync(sourceRoot)) throw new Error(`Command source does not exist: ${sourceRoot}`);
  if (
    sourceRoot === outputRoot ||
    sourceRoot.startsWith(`${outputRoot}${path.sep}`) ||
    outputRoot.startsWith(`${sourceRoot}${path.sep}`)
  ) {
    throw new Error("Command source and site output must not overlap");
  }

  const markdownNames = readdirSync(sourceRoot).filter((name) => name.endsWith(".md")).sort();
  const commandFiles = Object.fromEntries(markdownNames.map((name) => [
    `commands/${name}`,
    readFileSync(path.join(sourceRoot, name), "utf8"),
  ]));
  const commands = loadCommandsFromFiles(commandFiles);
  if (commands.length !== markdownNames.length) throw new Error("Every command Markdown file must parse as a valid command");

  const siteRoot = path.join(outputRoot, "agent-skills");
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(path.join(siteRoot, "assets"), { recursive: true });
  mkdirSync(path.join(siteRoot, "commands"), { recursive: true });
  writeFileSync(path.join(siteRoot, "assets", "site.css"), `${STYLES}\n`);
  writeFileSync(path.join(siteRoot, "index.html"), page("OpenCode commands", "", `<header><p class="eyebrow">Commands-only catalogue</p><h1>OpenCode commands</h1><p>Human-invoked playbooks that add no context until you type one.</p></header><p><a href="${SITE_BASE_PATH}commands/">Browse all ${commands.length} commands</a></p>`));
  writeFileSync(path.join(siteRoot, "commands", "index.html"), page("Commands", "commands/", `<nav><a href="${SITE_BASE_PATH}">Catalogue home</a></nav><header><p class="eyebrow">${commands.length} commands</p><h1>Choose a command</h1></header><section class="grid">${commands.map(commandCard).join("\n")}</section>`));
  for (const command of commands) {
    const routeDirectory = path.join(siteRoot, "commands", command.name);
    mkdirSync(routeDirectory, { recursive: true });
    writeFileSync(path.join(routeDirectory, "index.html"), commandPage(command));
  }

  const manifest: AgentSkillsSiteManifest = {
    version: 1,
    basePath: SITE_BASE_PATH,
    commands: commands.map(({ name }) => name),
    files: walk(siteRoot),
  };
  validateManifest(manifest);
  writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function validateAndStageAgentSkillsSite(
  buildDirectory: string,
  destinationDirectory: string,
  commandSourceDirectory: string,
): AgentSkillsSiteManifest {
  const buildRoot = path.resolve(buildDirectory);
  const destinationRoot = path.resolve(destinationDirectory);
  const commandSourceRoot = path.resolve(commandSourceDirectory);
  if (
    buildRoot === destinationRoot ||
    buildRoot.startsWith(`${destinationRoot}${path.sep}`) ||
    destinationRoot.startsWith(`${buildRoot}${path.sep}`)
  ) {
    throw new Error("Build and destination directories must not overlap");
  }
  const manifestPath = path.join(buildRoot, "manifest.json");
  const siteRoot = path.join(buildRoot, "agent-skills");
  if (!existsSync(manifestPath) || !existsSync(siteRoot)) {
    throw new Error("Build must contain manifest.json and agent-skills/");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AgentSkillsSiteManifest;
  validateManifest(manifest);
  const sourceCommands = readdirSync(commandSourceRoot)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
  if (JSON.stringify(sourceCommands) !== JSON.stringify(manifest.commands)) {
    throw new Error("Site manifest commands do not match the trusted source inventory");
  }
  const actual = walk(siteRoot);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) {
    throw new Error("Site files do not match the manifest inventory");
  }
  rmSync(destinationRoot, { recursive: true, force: true });
  mkdirSync(path.dirname(destinationRoot), { recursive: true });
  cpSync(siteRoot, destinationRoot, { recursive: true });
  return manifest;
}
