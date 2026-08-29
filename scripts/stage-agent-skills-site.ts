import path from "node:path";

import { validateAndStageAgentSkillsSite } from "./agent-skills-site.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const manifest = validateAndStageAgentSkillsSite(
  path.resolve(required("--build")),
  path.resolve(required("--destination")),
  path.resolve(required("--commands")),
);
console.log(JSON.stringify({ commands: manifest.commands.length, files: manifest.files.length }));
