import type { ReactElement } from 'react'
import cx from 'classnames'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import styles from './skill-markdown.module.css'

interface SkillMarkdownProps {
  content: string
  /**
   * Appended to the base prose class. The simulation panel uses this to
   * re-point the prose at the terminal palette, rather than standing up a
   * second react-markdown pipeline.
   */
  className?: string
}

/**
 * Same rendering stack as leoncheng.dev: remark-gfm for tables and task lists,
 * rehype-raw because SKILL.md bodies use raw <details> blocks, rehype-slug so
 * headings are linkable.
 */
export default function SkillMarkdown({ content, className }: SkillMarkdownProps): ReactElement {
  return (
    <div className={cx(styles.body, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSlug]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
