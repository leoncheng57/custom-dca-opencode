import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import TerminalPanel from './TerminalPanel'
import { invocation, type Command } from '../lib/commands'
import styles from './command-card.module.css'
import { commandPath, skillPath } from '../lib/routes'

interface CommandCardProps {
  command: Command
}

/**
 * The card leads with the literal invocation rather than a title, because that
 * string is the whole interface: a command has no retrieval description to
 * match against, so what you type *is* its identity.
 */
export default function CommandCard({ command }: CommandCardProps): ReactElement {
  const path = commandPath(command.name)

  return (
    <TerminalPanel as="article" path={`commands/${command.name}.md`}>
      <h2 className={styles.title}>
        <Link to={path}>{invocation(command.name, command.takesArguments)}</Link>
      </h2>

      <p className={styles.summary}>{command.description || 'No description in the frontmatter.'}</p>

      <ul className={styles.traits} aria-label={`Traits of /${command.name}`}>
        {command.agent ? <li className={styles.trait}>agent: {command.agent}</li> : null}
        {command.model ? <li className={styles.trait}>model: {command.model}</li> : null}
        {command.subtask ? <li className={styles.trait}>subtask</li> : null}
        {command.takesArguments ? <li className={styles.trait}>$ARGUMENTS</li> : null}
        {command.runsShell ? <li className={styles.trait}>shell</li> : null}
      </ul>

      <p className={styles.meta}>
        {command.relatedSkills.length === 0 ? (
          // Saying this out loud matters: it is the deliberate third category,
          // not an oversight. Small utilities do not earn a permanent slot in
          // the agent's retrieval context.
          <span className={styles.standalone}>standalone — no skill behind it</span>
        ) : (
          <>
            {command.relatedSkills.length === 1 ? 'short form of ' : 'builds on '}
            {command.relatedSkills.map((skill, index) => (
              <span key={skill}>
                {index > 0 ? ' + ' : ''}
                <Link to={skillPath(skill)}>{skill}</Link>
              </span>
            ))}
          </>
        )}
      </p>

      <p className={styles.cta}>
        <Link to={path}>read command &rarr;</Link>
      </p>
    </TerminalPanel>
  )
}
