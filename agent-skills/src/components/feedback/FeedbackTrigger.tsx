import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import classNames from 'classnames'
import styles from './feedback.module.css'
import {
  buildEmbeddedFeedbackUrl,
  buildFeedbackUrl,
  currentPagePath,
} from './feedbackConfig'

type FeedbackTriggerProps = {
  /**
   * Button content. Defaults to a "Send feedback" text label; pass an icon
   * (with `variant="unstyled"` and your own class) for compact triggers.
   */
  children?: ReactNode
  /** Extra class for the trigger button. */
  className?: string
  /**
   * `link` renders the trigger as an inline link-like button that inherits
   * the surrounding font and color (fits inside footers). `unstyled` leaves
   * all styling to `className`.
   */
  variant?: 'link' | 'unstyled'
}

/**
 * Design-system feedback entry point (#152, #198): a button that opens the
 * shared Google feedback form in an accessible dialog, prefilled with the
 * current page path. Dialog colors follow the `--fb-*` custom properties so
 * themed pages can restyle it from a parent class; this repo maps them onto
 * its own palette in `src/styles/tokens.css`.
 *
 * Ported from leoncheng57/leoncheng57.github.io (design-system #198). The only
 * change from the original is that the page path comes from
 * `currentPagePath()` rather than reading `window` inline, so the component
 * can be rendered to a string in tests without a DOM.
 */
export default function FeedbackTrigger({
  children,
  className,
  variant = 'link',
}: FeedbackTriggerProps): ReactElement | null {
  const [isOpen, setIsOpen] = useState(false)
  const dialogId = useId()
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pagePath = currentPagePath()
  const feedbackUrl = buildFeedbackUrl(pagePath)
  const embeddedFeedbackUrl = buildEmbeddedFeedbackUrl(pagePath)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    closeRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  if (import.meta.env.PROD && !feedbackUrl) {
    return null
  }

  const close = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={classNames(
          variant === 'link' && styles.linkTrigger,
          className
        )}
        type="button"
        aria-label="Send feedback"
        aria-expanded={isOpen}
        aria-controls={isOpen ? dialogId : undefined}
        onClick={() => setIsOpen(true)}
      >
        {children ?? (
          <>
            <svg
              className={styles.triggerIcon}
              aria-hidden="true"
              viewBox="0 0 24 24"
            >
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
            </svg>
            Send feedback
          </>
        )}
      </button>

      {isOpen && (
        <div
          className={styles.backdrop}
          data-testid="feedback-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              close()
            }
          }}
        >
          <section
            id={dialogId}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              ref={closeRef}
              className={styles.close}
              type="button"
              aria-label="Close feedback"
              onClick={close}
            >
              <span aria-hidden="true">&#215;</span>
            </button>
            <p id={titleId} className={styles.copy}>
              Found a bug or have an idea? Feedback may be reviewed and turned
              into a public GitHub issue.
            </p>
            {embeddedFeedbackUrl && feedbackUrl ? (
              <>
                <iframe
                  className={styles.frame}
                  src={embeddedFeedbackUrl}
                  title="Feedback form"
                  loading="lazy"
                />
                <footer className={styles.dialogFooter}>
                  <a
                    className={styles.newTabLink}
                    href={feedbackUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open feedback form in a new tab &#8599;
                  </a>
                </footer>
              </>
            ) : (
              <span className={styles.unconfigured}>
                Form URL not configured
              </span>
            )}
          </section>
        </div>
      )}
    </>
  )
}
