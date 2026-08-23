export const AGENT_SKILLS_PATH = '/agent-skills'

export function skillPath(name: string): string {
  return `${AGENT_SKILLS_PATH}/s/${name}`
}

export function commandPath(name: string): string {
  return `${AGENT_SKILLS_PATH}/c/${name}`
}

export const COMMANDS_PATH = `${AGENT_SKILLS_PATH}/commands`
