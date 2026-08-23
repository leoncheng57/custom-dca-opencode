import cx from 'classnames'
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react'
import { InstallScopeTable } from '../components/InstallBlock'
import SkillCard from '../components/SkillCard'
import { REPO_URL } from '../lib/repo'
import { allTags, filterSkills } from '../lib/skills'
import { skills } from '../lib/skillsSource'
import styles from './catalog.module.css'

export default function CatalogRoute(): ReactElement {
  const [query, setQuery] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  // Every skill is already inlined in the bundle, so filtering is a substring
  // scan over an in-memory array — no search index, no fetch.
  const visible = useMemo(() => filterSkills(skills, query), [query])
  const tags = useMemo(() => allTags(skills), [])

  // A tag chip is just a shortcut into the existing filter. Focus moves to the
  // input afterwards for two reasons: it shows *why* the grid changed, and the
  // browser scrolls the focused field into view when the chip that was clicked
  // sat further down the page than the filter.
  const selectTag = useCallback((tag: string) => {
    setQuery(tag)
    filterInputRef.current?.focus()
  }, [])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Portable skills for coding agents</h1>
        <p className={styles.lede}>
          An <strong>agent skill</strong> is a directory holding a single <code>SKILL.md</code> file: YAML
          frontmatter with a <code>name</code> and a <code>description</code>, then a body of instructions.
          The agent keeps only the description in context and loads the body on demand, when a task matches.
          It is a way to hand an agent a procedure it would otherwise have to be told every time.
        </p>
        <p className={styles.lede}>
          These are written for <a href="https://opencode.ai">OpenCode</a> and work with any agent that reads{' '}
          <code>SKILL.md</code>, Claude Code included. MIT licensed —{' '}
          <a href={REPO_URL}>read the source</a>.
        </p>
      </section>

      <section className={styles.catalog} aria-labelledby="catalog-heading">
        <div className={styles.catalogHead}>
          <h2 id="catalog-heading" className={styles.sectionTitle}>
            Skills
            <span className={styles.count}>
              {visible.length === skills.length
                ? `${skills.length}`
                : `${visible.length} of ${skills.length}`}
            </span>
          </h2>

          {/* Not a wrapping <label>: the clear button is interactive content,
              which a label may not contain other than its own control. */}
          <div className={styles.filter}>
            <label className={styles.filterLabel} htmlFor="skill-filter">
              filter
            </label>
            <input
              id="skill-filter"
              ref={filterInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="name, tag, or trigger phrase"
              className={styles.filterInput}
              autoComplete="off"
            />
            <button
              type="button"
              className={cx(styles.filterClear, { [styles.filterClearHidden]: query === '' })}
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              aria-hidden={query === ''}
              tabIndex={query === '' ? -1 : 0}
            >
              &times;
            </button>
          </div>
        </div>

        <div className={styles.examples}>
          <span className={styles.examplesLabel}>try:</span>
          <ul className={styles.exampleList} aria-label="Filter examples">
            {tags.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  className={styles.exampleTag}
                  onClick={() => selectTag(tag)}
                  aria-label={`Filter by ${tag}`}
                >
                  <span className={styles.exampleHash} aria-hidden="true">
                    #
                  </span>
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {visible.length > 0 ? (
          <div className={styles.grid}>
            {visible.map((skill) => (
              <SkillCard key={skill.name} skill={skill} onTagSelect={selectTag} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No skill matches <code>{query.trim()}</code>.
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="scopes-heading">
        <h2 id="scopes-heading" className={styles.sectionTitle}>
          Where skills live
        </h2>
        <p className={styles.sectionLede}>
          A skill is discovered by its location on disk. <code>~/.agents/skills/</code> is the highest-reach
          one — OpenCode, Cursor, Codex, Copilot, Gemini CLI, Amp, Roo and Zed all read it.{' '}
          <code>~/.claude/skills/</code> is the Claude Code variant of the same layout. The project-scoped
          directories are committed with a repository, so the skill only loads inside it.
        </p>
        <InstallScopeTable />
      </section>
    </div>
  )
}
