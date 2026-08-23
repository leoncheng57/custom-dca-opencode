import { Suspense, lazy, useEffect, type ReactElement } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import styles from './App.module.css'
import SiteFooter from './components/site-footer/SiteFooter'
import { REPO_URL } from './lib/repo'
import { AGENT_SKILLS_PATH, COMMANDS_PATH } from './lib/routes'
import CatalogRoute from './routes/CatalogRoute'
import HomeRoute from './routes/HomeRoute'
import PlaceholderRoute, { type PlaceholderPage } from './routes/PlaceholderRoute'

/* The markdown stack (react-markdown + rehype-raw's parse5) is ~450 kB and is
   only needed on a skill page, so the catalog does not download it. */
const SkillRoute = lazy(() => import('./routes/SkillRoute'))
const CommandsRoute = lazy(() => import('./routes/CommandsRoute'))
const CommandRoute = lazy(() => import('./routes/CommandRoute'))

const WEBSITE_ISSUE = 'https://github.com/leoncheng57/custom-dca-opencode/issues/110'

const placeholders: Record<string, PlaceholderPage> = {
  features: {
    title: 'Features',
    description: 'The cockpit, session workflow, mobile controls, and review surfaces will be documented here.',
    issue: WEBSITE_ISSUE,
  },
  docs: {
    title: 'Documentation',
    description: 'Installation, configuration, deployment, operations, and contributor paths will live here.',
    issue: WEBSITE_ISSUE,
  },
  architecture: {
    title: 'Architecture',
    description: 'The browser, BFF, OpenCode server, state ownership, and failure boundaries will be mapped here.',
    issue: WEBSITE_ISSUE,
  },
  roadmap: {
    title: 'Roadmap',
    description: 'Implemented work, active proposals, accepted limits, and deferred ideas will be sorted here.',
    issue: WEBSITE_ISSUE,
  },
  changelog: {
    title: 'Changelog',
    description: 'User-visible changes, migrations, and operational updates will be recorded here.',
    issue: WEBSITE_ISSUE,
  },
}

/** Route changes should land at the top of the new page, not mid-article. */
function ScrollToTop(): null {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

export default function App(): ReactElement {
  return (
    <div className={styles.shell}>
      <ScrollToTop />

      <header className={styles.masthead}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandPrompt} aria-hidden="true">
            $
          </span>
          custom-dca-opencode
        </Link>
        <nav className={styles.mastheadNav} aria-label="Site">
          <Link to="/" data-testid="website-nav-home">home</Link>
          <Link to={AGENT_SKILLS_PATH} data-testid="website-nav-agent-skills">agent skills</Link>
          <Link to={COMMANDS_PATH} data-testid="website-nav-commands">commands</Link>
          <a href="https://leoncheng.dev/">leoncheng.dev</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main className={styles.main}>
        <Suspense fallback={<p className={styles.loading}>loading…</p>}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            {Object.entries(placeholders).map(([path, page]) => (
              <Route key={path} path={`/${path}`} element={<PlaceholderRoute {...page} />} />
            ))}
            <Route path={AGENT_SKILLS_PATH} element={<CatalogRoute />} />
            <Route path={`${AGENT_SKILLS_PATH}/s/:name`} element={<SkillRoute />} />
            <Route path={COMMANDS_PATH} element={<CommandsRoute />} />
            <Route path={`${AGENT_SKILLS_PATH}/c/:name`} element={<CommandRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* The MIT/source line that used to be the whole footer now rides in the
          design-system footer's extraRow slot. */}
      <SiteFooter className={styles.siteFooter}>
        <span>
          Public project notes and MIT-licensed Agent Skills. Source at{' '}
          <a href={REPO_URL}>{REPO_URL.replace('https://', '')}</a>.
        </span>
      </SiteFooter>
    </div>
  )
}
