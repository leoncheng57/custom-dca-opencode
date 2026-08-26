import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import TerminalPanel from './TerminalPanel'
import styles from './skill-card.module.css'
import type { Skill } from '../lib/skills'

interface SkillCardProps {
  skill: Skill
  /**
   * Called with the tag text when a tag chip is activated. The catalog wires
   * this to its filter query — `filterSkills` already matches tag text, so a
   * chip needs no filtering machinery of its own.
   */
  onTagSelect: (tag: string) => void
}

export default function SkillCard({ skill, onTagSelect }: SkillCardProps): ReactElement {
  const skillPath = `/s/${skill.name}`

  return (
    <TerminalPanel as="article" path={`skills/${skill.name}/SKILL.md`}>
      <h2 className={styles.title}>
        <span className={styles.prompt} aria-hidden="true">
          $
        </span>
        <Link to={skillPath}>{skill.title}</Link>
      </h2>

      {/* The card shows the first sentence only: the full frontmatter
          description is written for an agent's retrieval step, not for a
          human skimming a list. */}
      <p className={styles.summary}>{skill.summary || 'No description in the frontmatter.'}</p>

      <p className={styles.meta}>
        <span>{skill.name}</span>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <span>{skill.readingTimeMinutes} min read</span>
        {skill.license ? (
          <>
            <span className={styles.separator} aria-hidden="true">
              ·
            </span>
            <span>{skill.license}</span>
          </>
        ) : null}
      </p>

      {skill.tags.length > 0 ? (
        <ul className={styles.tagRow} aria-label={`Tags for ${skill.title}`}>
          {skill.tags.map((tag) => (
            <li key={tag}>
              {/* A real button, not a clickable span: it has to be reachable
                  by keyboard and announced as an action. The `#` is decorative
                  so that the accessible name stays the tag itself. */}
              <button
                type="button"
                className={styles.tag}
                onClick={() => onTagSelect(tag)}
                aria-label={`Filter by ${tag}`}
              >
                <span className={styles.hash} aria-hidden="true">
                  #
                </span>
                {tag}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className={styles.cta}>
        <Link to={skillPath}>read skill &rarr;</Link>
      </p>
    </TerminalPanel>
  )
}
