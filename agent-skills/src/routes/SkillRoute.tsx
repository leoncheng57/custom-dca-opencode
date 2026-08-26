import { useEffect, type ReactElement } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import CopyButton from '../components/CopyButton'
import InstallBlock from '../components/InstallBlock'
import SimulationPanel from '../components/SimulationPanel'
import SkillMarkdown from '../components/SkillMarkdown'
import TerminalPanel from '../components/TerminalPanel'
import { installMethods } from '../lib/install'
import { skillSourceUrl } from '../lib/repo'
import { commandForSkill } from '../lib/commandsSource'
import { findSkill } from '../lib/skillsSource'
import styles from './skill.module.css'

const SITE_TITLE = 'agent-skills'

export default function SkillRoute(): ReactElement {
  const { name = '' } = useParams()
  const { hash } = useLocation()
  const skill = findSkill(name)
  const command = skill ? commandForSkill(skill.name) : undefined

  useEffect(() => {
    document.title = skill ? `${skill.title} — ${SITE_TITLE}` : `Not found — ${SITE_TITLE}`
    return () => {
      document.title = SITE_TITLE
    }
  }, [skill])

  /* Both sections are collapsed on load, and rehype-slug gives every heading in
     the body an id — so a deep link like /s/<skill>#usage targets an element
     the browser will not scroll to while its <details> ancestor is shut. Open
     the ancestors first, then scroll on the next frame once layout has settled. */
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
  }, [hash, skill])

  if (!skill) {
    return (
      <div className={styles.page}>
        <p className={styles.back}>
          <Link to="/">&larr; all skills</Link>
        </p>
        <h1 className={styles.title}>No skill called “{name}”</h1>
        <p className={styles.notFound}>
          It may have been renamed. The catalog lists everything currently in the repository.
        </p>
      </div>
    )
  }

  return (
    <article className={styles.page}>
      <p className={styles.back}>
        <Link to="/">&larr; all skills</Link>
      </p>

      <header className={styles.header}>
        <h1 className={styles.title}>{skill.title}</h1>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>name</dt>
            <dd>
              <code>{skill.name}</code>
            </dd>
          </div>
          <div className={styles.fact}>
            <dt>read</dt>
            <dd>{skill.readingTimeMinutes} min</dd>
          </div>
          {skill.license ? (
            <div className={styles.fact}>
              <dt>license</dt>
              <dd>{skill.license}</dd>
            </div>
          ) : null}
          {skill.compatibility ? (
            <div className={styles.fact}>
              <dt>compatibility</dt>
              <dd>{skill.compatibility}</dd>
            </div>
          ) : null}
          <div className={styles.fact}>
            <dt>source</dt>
            <dd>
              <a href={skillSourceUrl(skill.name)}>SKILL.md</a>
            </dd>
          </div>
        </dl>

        {skill.tags.length > 0 ? (
          <ul className={styles.tagRow} aria-label="Tags">
            {skill.tags.map((tag) => (
              <li key={tag} className={styles.tag}>
                #{tag}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {skill.description ? (
        <TerminalPanel
          path="frontmatter: description"
          className={styles.descriptionPanel}
          action={<CopyButton value={skill.description} label="description" />}
        >
          {/* This is the only text always in the agent's context — it is what
              decides whether the skill gets loaded, so it is shown in full
              rather than summarised. */}
          <p className={styles.description}>{skill.description}</p>
        </TerminalPanel>
      ) : null}

      {command ? (
        <p className={styles.relation}>
          Short form available: <Link to={`/c/${command.name}`}>/{command.name}</Link> fires the happy path
          in one line, and defers back here for the failure modes.
        </p>
      ) : null}

      {/* Cheapest question first. The page reads description (always visible)
          → one concrete example → the full procedure → install. A visitor
          deciding whether they want this skill is served by seeing it fire
          before reading two hundred lines of instructions.

          Skills without a SIMULATION.md render nothing here. Absent is a
          normal state, not a gap, so there is no placeholder. */}
      {skill.simulation ? (
        <details className={styles.disclosure} aria-labelledby="simulation" open>
          <summary className={styles.summary}>
            <span className={styles.marker} aria-hidden="true">
              ▸
            </span>
            <h2 id="simulation" className={styles.summaryHeading}>
              Simulation Example
            </h2>
            <span className={styles.summaryMeta}>{skill.simulation.title}</span>
          </summary>
          <div className={styles.disclosureBody}>
            <SimulationPanel skillName={skill.name} simulation={skill.simulation} />
          </div>
        </details>
      ) : null}

      {/* Instructions next: what the skill does is the reason to read the
          page, and the install methods used to bury it below the fold. */}
      <details className={styles.disclosure} aria-labelledby="instructions">
        <summary className={styles.summary}>
          <span className={styles.marker} aria-hidden="true">
            ▸
          </span>
          <h2 id="instructions" className={styles.summaryHeading}>
            Full Instructions
          </h2>
          <span className={styles.summaryMeta}>{skill.readingTimeMinutes} min read</span>
        </summary>
        <div className={styles.disclosureBody}>
          <div className={styles.instructionsCard}>
            <SkillMarkdown content={skill.body} />
          </div>
        </div>
      </details>

      <details className={`${styles.disclosure} ${styles.installDisclosure}`} aria-labelledby="install">
        <summary className={styles.summary}>
          <span className={styles.marker} aria-hidden="true">
            ▸
          </span>
          <h2 id="install" className={styles.summaryHeading}>
            Install <code>{skill.name}</code>
          </h2>
          <span className={styles.summaryMeta}>{installMethods(skill.name).length} methods</span>
        </summary>
        <div className={styles.disclosureBody}>
          <InstallBlock skill={skill.name} />
        </div>
      </details>
    </article>
  )
}
