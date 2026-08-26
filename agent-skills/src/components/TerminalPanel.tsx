import type { ReactElement, ReactNode } from 'react'
import cx from 'classnames'
import styles from './terminal-panel.module.css'

interface TerminalPanelProps {
  /** Monospace path shown in the title bar, e.g. skills/foo/SKILL.md. */
  path: string
  children: ReactNode
  className?: string
  /** Optional control rendered at the right edge of the title bar. */
  action?: ReactNode
  as?: 'article' | 'section' | 'div'
}

/**
 * The terminal-window chrome used for guide cards on leoncheng.dev: three
 * traffic-light dots and a monospace path in a dark title bar, wrapped in the
 * site's 3px border and hard offset shadow. These are developer docs, so the
 * treatment carries over rather than being reinvented.
 */
export default function TerminalPanel({
  path,
  children,
  className,
  action,
  as: Tag = 'div',
}: TerminalPanelProps): ReactElement {
  return (
    <Tag className={cx(styles.panel, className)}>
      <div className={styles.chrome}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <p className={styles.path}>{path}</p>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </Tag>
  )
}
