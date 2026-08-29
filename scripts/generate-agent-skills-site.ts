import path from "node:path";

import { generateAgentSkillsSite } from "./agent-skills-site.js";

const output = path.resolve(process.argv[2] ?? "dist/agent-skills-site");
const manifest = generateAgentSkillsSite("agent-skills/commands", output);
console.log(JSON.stringify({ commands: manifest.commands.length, files: manifest.files.length }));
