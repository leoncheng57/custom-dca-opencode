import { loadSimulationsFromFiles } from './simulation'
import { loadSkillsFromFiles, type Skill } from './skills'

/**
 * Every `skills/<name>/SKILL.md` in the repository, inlined at build time.
 *
 * The app lives at the repository root precisely so this glob can reach the
 * untouched `skills/` directory — that directory must stay where it is because
 * the vercel-labs/skills CLI (`npx skills add leoncheng57/agent-skills`) treats
 * it as a priority search path.
 *
 * There is deliberately no hand-maintained list anywhere in this codebase:
 * adding a skill directory is the only step needed to get it on the site.
 */
const skillFiles = import.meta.glob('../../skills/*/SKILL.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/**
 * The optional worked example beside each skill. Same rule as above: dropping
 * a `SIMULATION.md` into a skill directory is the only step needed to get the
 * section on that skill's page.
 *
 * These are inlined into the lazily-loaded SkillRoute chunk along with the
 * skill bodies. At this catalog size that is a few kB; if the catalog ever
 * reaches a few dozen skills, drop `eager` and dynamic-import per skill.
 */
const simulationFiles = import.meta.glob('../../skills/*/SIMULATION.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export const skills: Skill[] = loadSkillsFromFiles(
  skillFiles,
  loadSimulationsFromFiles(simulationFiles)
)

export function findSkill(name: string): Skill | undefined {
  return skills.find((skill) => skill.name === name)
}
