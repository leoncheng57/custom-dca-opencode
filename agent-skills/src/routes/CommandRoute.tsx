import { useEffect, type ReactElement } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import CopyButton from '../components/CopyButton'
import SimulationPanel from '../components/SimulationPanel'
import SkillMarkdown from '../components/SkillMarkdown'
import TerminalPanel from '../components/TerminalPanel'
import { commandInstallMethods } from '../lib/commandInstall'
import { invocation } from '../lib/commands'
import { findCommand } from '../lib/commandsSource'
import { commandSimulationSourceUrl, commandSourceUrl } from '../lib/repo'
import styles from './skill.module.css'
import { COMMANDS_PATH, skillPath } from '../lib/routes'

const SITE_TITLE = 'Agent Skills - custom-dca-opencode'

export default function CommandRoute(): ReactElement {
  const { name = '' } = useParams()
  const { hash } = useLocation()
  const command = findCommand(name)

  useEffect(() => {
    document.title = command ? `/${command.name} — ${SITE_TITLE}` : `Not found — ${SITE_TITLE}`
    return () => {
      document.title = SITE_TITLE
    }
  }, [command])

  /* Same deep-link handling as a skill page: a collapsed <details> ancestor
     has to be opened before the browser will scroll to the target. */
  useEffect(() => {
    const id = hash.startsWith('#') ? decodeURIComponent(hash.slice(1)) : ''
    if (!id) return

    const target = document.getElementById(id)
    if (!target) return

    for (let node: HTMLElement | null = target; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) node.open = true
    }

    const frame = requestAnimationFrame(() => target.scrollIntoView())
    return () => cancelAnimationFrame(frame)
  }, [hash, command])

  if (!command) {
    return (
      <div className={styles.page}>
        <p className={styles.back}>
          <Link to={COMMANDS_PATH}>&larr; all commands</Link>
        </p>
        <h1 className={styles.title}>No command called “{name}”</h1>
        <p className={styles.notFound}>
          It may have been renamed. The catalogue lists everything currently in the repository.
        </p>
      </div>
    )
  }

  return (
    <article className={styles.page}>
      <p className={styles.back}>
        <Link to={COMMANDS_PATH}>&larr; all commands</Link>
      </p>

      <header className={styles.header}>
        <h1 className={styles.title}>{invocation(command.name, command.takesArguments)}</h1>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>agent</dt>
            <dd>{command.agent ?? 'current'}</dd>
          </div>
          {command.model ? (
            <div className={styles.fact}>
              <dt>model</dt>
              <dd>{command.model}</dd>
            </div>
          ) : null}
          <div className={styles.fact}>
            <dt>context</dt>
            {/* The load-bearing fact about a command, so it is a first-class
                header field rather than a footnote: `subtask` runs the whole
                thing in a subagent and returns only the result. */}
            <dd>{command.subtask ? 'subagent (subtask)' : 'this session'}</dd>
          </div>
          <div className={styles.fact}>
            <dt>source</dt>
            <dd>
              <a href={commandSourceUrl(command.name)}>{command.name}.md</a>
            </dd>
          </div>
        </dl>
      </header>

      {command.description ? (
        <TerminalPanel
          path="frontmatter: description"
          className={styles.descriptionPanel}
          action={<CopyButton value={command.description} label="description" />}
        >
          {/* Unlike a skill's description this is never seen by the model. It
              is the autocomplete hint shown to the human typing `/`. */}
          <p className={styles.description}>{command.description}</p>
        </TerminalPanel>
      ) : null}

      {command.relatedSkills.length === 1 ? (
        <p className={styles.relation}>
          Short form of the <Link to={skillPath(command.relatedSkills[0])}>{command.relatedSkills[0]}</Link>{' '}
          skill. The command carries the happy path; the skill carries the failure modes. It deliberately
          does not restate them — two copies of a failure-mode table drift.
        </p>
      ) : command.relatedSkills.length > 1 ? (
        <p className={styles.relation}>
          Builds on{' '}
          {command.relatedSkills.map((skill, index) => (
            <span key={skill}>
              {index > 0 ? ' and ' : ''}
              <Link to={skillPath(skill)}>{skill}</Link>
            </span>
          ))}
          . It is a composite rather than a short form of either, so neither skill page offers it as its
          own shortcut.
        </p>
      ) : (
        <p className={styles.relation}>
          Standalone: no skill behind it. Small utilities do not earn a permanent slot in the agent's
          retrieval context.
        </p>
      )}

      {command.simulation ? (
        <details className={styles.disclosure} aria-labelledby="simulation" open>
          <summary className={styles.summary}>
            <span className={styles.marker} aria-hidden="true">
              ▸
            </span>
            <h2 id="simulation" className={styles.summaryHeading}>
              Simulation Example
            </h2>
            <span className={styles.summaryMeta}>{command.simulation.title}</span>
          </summary>
          <div className={styles.disclosureBody}>
            <SimulationPanel
              sourcePath={`command-simulations/${command.name}.md`}
              sourceUrl={commandSimulationSourceUrl(command.name)}
              simulation={command.simulation}
            />
          </div>
        </details>
      ) : null}

      <details className={styles.disclosure} aria-labelledby="template">
        <summary className={styles.summary}>
          <span className={styles.marker} aria-hidden="true">
            ▸
          </span>
          <h2 id="template" className={styles.summaryHeading}>
            Template
          </h2>
          <span className={styles.summaryMeta}>injected into the turn</span>
        </summary>
        <div className={styles.disclosureBody}>
          <div className={styles.instructionsCard}>
            <SkillMarkdown content={command.body} />
          </div>
        </div>
      </details>

      <details className={`${styles.disclosure} ${styles.installDisclosure}`} aria-labelledby="install">
        <summary className={styles.summary}>
          <span className={styles.marker} aria-hidden="true">
            ▸
          </span>
          <h2 id="install" className={styles.summaryHeading}>
            Install <code>/{command.name}</code>
          </h2>
          <span className={styles.summaryMeta}>{commandInstallMethods(command.name).length} methods</span>
        </summary>
        <div className={styles.disclosureBody}>
          <ol className={styles.methods}>
            {commandInstallMethods(command.name).map((method) => (
              <li key={method.id} className={styles.method}>
                <div className={styles.methodHead}>
                  <h3 className={styles.methodLabel}>{method.label}</h3>
                  <span className={styles.methodScope}>{method.scope}</span>
                  <CopyButton value={method.command} label={`${method.label} command`} />
                </div>
                <p className={styles.methodNote}>{method.note}</p>
                <pre className={styles.command}>
                  <code>{method.command}</code>
                </pre>
              </li>
            ))}
          </ol>
          <p className={styles.footnote}>
            Restart OpenCode after installing — commands are read at startup and are not hot-reloaded.
          </p>
        </div>
      </details>
    </article>
  )
}
