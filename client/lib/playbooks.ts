import { loadCommandsFromFiles, type Command } from "../../agent-skills/src/lib/commands.js";
import { loadSimulationsFromFiles } from "../../agent-skills/src/lib/simulation.js";

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

export const commands: Command[] = loadCommandsFromFiles(commandFiles, {
  simulations: loadSimulationsFromFiles(commandSimulationPaths(commandSimulationFiles)),
});

export function findCommand(name: string): Command | undefined {
  return commands.find((command) => command.name === name);
}

const REPO_ROOT = "https://github.com/leoncheng57/custom-dca-opencode";

/**
 * The revision these source links resolve against.
 *
 * Named rather than implied: the links follow the default branch, so what a
 * reader sees on GitHub can be newer than the bundle they are reading it from.
 * Stating `main` is honest; silently linking to a moving target while looking
 * like a pinned reference is not.
 */
export const PLAYBOOK_SOURCE_REVISION = "main";
const CONTENT_ROOT = `${REPO_ROOT}/blob/${PLAYBOOK_SOURCE_REVISION}/agent-skills`;

export const playbookSource = {
  command: (name: string) => `${CONTENT_ROOT}/commands/${name}.md`,
  commandSimulation: (name: string) => `${CONTENT_ROOT}/command-simulations/${name}.md`,
};

export type { Command };
