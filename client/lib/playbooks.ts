import { loadCommandsFromFiles, type Command } from "../../agent-skills/src/lib/commands.js";
import { loadSimulationsFromFiles } from "../../agent-skills/src/lib/simulation.js";
import { loadSkillsFromFiles, type Skill } from "../../agent-skills/src/lib/skills.js";

const skillFiles = import.meta.glob("../../agent-skills/skills/*/SKILL.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const skillSimulationFiles = import.meta.glob("../../agent-skills/skills/*/SIMULATION.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const commandFiles = import.meta.glob("../../agent-skills/commands/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const commandSimulationFiles = import.meta.glob("../../agent-skills/command-simulations/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

function commandSimulationPaths(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).map(([path, raw]) => {
    const name = path.split("/").pop()?.replace(/\.md$/u, "") ?? "";
    return [`commands/${name}/SIMULATION.md`, raw];
  }));
}

export const skills: Skill[] = loadSkillsFromFiles(
  skillFiles,
  loadSimulationsFromFiles(skillSimulationFiles),
);

export const commands: Command[] = loadCommandsFromFiles(commandFiles, {
  skillNames: new Set(skills.map((skill) => skill.name)),
  simulations: loadSimulationsFromFiles(commandSimulationPaths(commandSimulationFiles)),
});

export function findSkill(name: string): Skill | undefined {
  return skills.find((skill) => skill.name === name);
}

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name);
}

export function commandForSkill(skillName: string): Command | undefined {
  return commands.find((command) => command.relatedSkills.length === 1 && command.relatedSkills[0] === skillName);
}

const REPO_ROOT = "https://github.com/leoncheng57/custom-dca-opencode";
const CONTENT_ROOT = `${REPO_ROOT}/blob/main/agent-skills`;

export const playbookSource = {
  skill: (name: string) => `${CONTENT_ROOT}/skills/${name}/SKILL.md`,
  skillSimulation: (name: string) => `${CONTENT_ROOT}/skills/${name}/SIMULATION.md`,
  command: (name: string) => `${CONTENT_ROOT}/commands/${name}.md`,
  commandSimulation: (name: string) => `${CONTENT_ROOT}/command-simulations/${name}.md`,
};

export type { Command, Skill };
