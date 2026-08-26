import { Suspense, lazy, useEffect, type ReactElement } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import styles from './App.module.css'
import SiteFooter from './components/site-footer/SiteFooter'
import { REPO_URL } from './lib/repo'
import CatalogRoute from './routes/CatalogRoute'

/* The markdown stack (react-markdown + rehype-raw's parse5) is ~450 kB and is
   only needed on a skill page, so the catalog does not download it. */
const SkillRoute = lazy(() => import('./routes/SkillRoute'))
const CommandsRoute = lazy(() => import('./routes/CommandsRoute'))
const CommandRoute = lazy(() => import('./routes/CommandRoute'))

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
          agent-skills
        </Link>
        <nav className={styles.mastheadNav} aria-label="Site">
          <Link to="/">skills</Link>
          <Link to="/commands">commands</Link>
          <a href="https://leoncheng.dev/">leoncheng.dev</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main className={styles.main}>
        <Suspense fallback={<p className={styles.loading}>loading…</p>}>
          <Routes>
            <Route path="/" element={<CatalogRoute />} />
            <Route path="/s/:name" element={<SkillRoute />} />
            <Route path="/commands" element={<CommandsRoute />} />
            <Route path="/c/:name" element={<CommandRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* The MIT/source line that used to be the whole footer now rides in the
          design-system footer's extraRow slot. */}
      <SiteFooter className={styles.siteFooter}>
        <span>
          MIT licensed. Source at <a href={REPO_URL}>{REPO_URL.replace('https://', '')}</a>.
        </span>
      </SiteFooter>
    </div>
  )
}
