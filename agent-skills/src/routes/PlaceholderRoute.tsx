import { useEffect, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import styles from './placeholder.module.css'

export interface PlaceholderPage {
  title: string
  description: string
  issue: string
}

export default function PlaceholderRoute({ title, description, issue }: PlaceholderPage): ReactElement {
  useEffect(() => {
    document.title = `${title} (work in progress) - custom-dca-opencode`
    return () => {
      document.title = 'custom-dca-opencode'
    }
  }, [title])

  return (
    <section className={styles.page}>
      <div className={styles.registration} aria-hidden="true">WIP</div>
      <p className={styles.eyebrow}>section reserved / content queued</p>
      <h1>{title}</h1>
      <p className={styles.description}>{description}</p>
      <div className={styles.notice}>
        <span className={styles.noticeLabel}>status</span>
        <p>
          This route is part of the public-site scaffold. Its final, evidence-backed content is
          tracked in <a href={issue}>the website build-out issue</a>.
        </p>
      </div>
      <Link to="/" className={styles.back} data-testid="website-placeholder-back">
        &larr; return to the project index
      </Link>
    </section>
  )
}
