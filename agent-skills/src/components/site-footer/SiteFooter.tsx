import type { ReactElement, ReactNode } from 'react'
import classNames from 'classnames'
import FeedbackTrigger from '../feedback/FeedbackTrigger'
import styles from './site-footer.module.css'

/** Where the footer's home link points. */
const HOME_URL = 'https://leoncheng.dev'

type SiteFooterProps = {
  /** Optional page-specific row rendered above the standard footer line. */
  children?: ReactNode
  /** Extra class on the footer element, e.g. for per-page theming. */
  className?: string
}

/**
 * Design-system footer (#198): every page ends with a link back home, the
 * shared Google feedback form trigger, and a copyright line. Colors route
 * through `--sf-*` custom properties so themed pages can restyle it.
 *
 * Ported from leoncheng57/leoncheng57.github.io. One deliberate difference:
 * upstream the home link is a react-router `<Link to="/">`, because there `/`
 * IS leoncheng.dev. This project site owns `/` inside its router, so the link
 * has to be a plain off-site
 * anchor — routing it through the router would land on the catalogue instead
 * of the personal site.
 */
export default function SiteFooter({
  children,
  className,
}: SiteFooterProps): ReactElement {
  return (
    <footer className={classNames(styles.footer, className)}>
      {children ? <div className={styles.extraRow}>{children}</div> : null}
      <div className={styles.mainRow}>
        <a className={styles.homeLink} href={HOME_URL}>
          <span aria-hidden="true">&larr;</span> leoncheng.dev
        </a>
        <FeedbackTrigger className={styles.feedbackTrigger} />
        <span className={styles.copyright}>
          &copy; {new Date().getFullYear()} Leon Cheng
        </span>
      </div>
    </footer>
  )
}
