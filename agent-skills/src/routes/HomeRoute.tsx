import { useEffect, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { AGENT_SKILLS_PATH } from '../lib/routes'
import styles from './home.module.css'

const placeholders = [
  {
    path: '/features',
    title: 'Features',
    description: 'The cockpit, session workflow, mobile controls, and review surfaces.',
  },
  {
    path: '/docs',
    title: 'Documentation',
    description: 'Installation, configuration, deployment, operations, and contributor guides.',
  },
  {
    path: '/architecture',
    title: 'Architecture',
    description: 'How the browser, BFF, and long-lived OpenCode server divide responsibility.',
  },
  {
    path: '/roadmap',
    title: 'Roadmap',
    description: 'Implemented work, active proposals, accepted limits, and deferred ideas.',
  },
  {
    path: '/changelog',
    title: 'Changelog',
    description: 'A durable account of user-visible changes, migrations, and operational updates.',
  },
] as const

export default function HomeRoute(): ReactElement {
  useEffect(() => {
    document.title = 'custom-dca-opencode - public project index'
  }, [])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>public project index / work in progress</p>
        <h1 className={styles.title}>A browser cockpit for OpenCode.</h1>
        <p className={styles.lede}>
          <strong>custom-dca-opencode</strong> is a React/Vite interface and Express BFF for a
          long-lived <code>opencode serve</code> process. It adds a project hub, session controls,
          notifications, reviews, and a phone-friendly view without replacing the OpenCode CLI.
        </p>
        <p className={styles.lede}>
          The Runner stays on your own machine and can be exposed privately over Tailscale. This
          public site documents the project; it does not host an OpenCode server or your sessions.
        </p>
        <div className={styles.statusLine} aria-label="Website status">
          <span className={styles.statusDot} aria-hidden="true" />
          <span>1 section live</span>
          <span className={styles.statusDivider} aria-hidden="true">/</span>
          <span>5 sections queued</span>
        </div>
      </section>

      <section className={styles.directory} aria-labelledby="site-map-heading">
        <div className={styles.directoryHeading}>
          <div>
            <p className={styles.sectionLabel}>site map</p>
            <h2 id="site-map-heading">Open the finished part. Inspect the scaffolding.</h2>
          </div>
          <span className={styles.revision}>rev. 0.1</span>
        </div>

        <div className={styles.grid}>
          <Link
            to={AGENT_SKILLS_PATH}
            className={`${styles.card} ${styles.liveCard}`}
            data-testid="website-card-agent-skills"
          >
            <span className={styles.cardIndex}>01</span>
            <span className={styles.liveBadge}>live</span>
            <h3>Agent Skills</h3>
            <p>Portable workflows, custom commands, install paths, and worked simulations.</p>
            <span className={styles.cardAction}>browse the catalog &rarr;</span>
          </Link>

          {placeholders.map((page, index) => (
            <Link
              key={page.path}
              to={page.path}
              className={`${styles.card} ${styles.placeholderCard}`}
              data-testid={`website-card-${page.path.slice(1)}`}
            >
              <span className={styles.cardIndex}>{String(index + 2).padStart(2, '0')}</span>
              <span className={styles.wipBadge}>work in progress</span>
              <h3>{page.title}</h3>
              <p>{page.description}</p>
              <span className={styles.cardAction}>view placeholder &rarr;</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
