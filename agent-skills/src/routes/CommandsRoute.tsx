import cx from 'classnames'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import CommandCard from '../components/CommandCard'
import { COMMAND_SCOPES } from '../lib/commandInstall'
import { filterCommands } from '../lib/commands'
import { commands } from '../lib/commandsSource'
import styles from './catalog.module.css'
import { AGENT_SKILLS_PATH } from '../lib/routes'

export default function CommandsRoute(): ReactElement {
  const [query, setQuery] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => filterCommands(commands, query), [query])

  useEffect(() => {
    document.title = 'Commands - Agent Skills - custom-dca-opencode'
    return () => {
      document.title = 'custom-dca-opencode'
    }
  }, [])

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Custom commands for OpenCode</h1>
        <p className={styles.lede}>
          A <strong>custom command</strong> is a single markdown file in <code>commands/</code>. You fire it by
          typing <code>/name</code> in the TUI, and its template is injected into that turn — with your{' '}
          <code>$ARGUMENTS</code> substituted, shell output from{' '}
          <code>
            !<span aria-hidden="true">`</span>cmd<span aria-hidden="true">`</span>
          </code>{' '}
          already run, and files you referenced with <code>@</code> already inlined.
        </p>
        <p className={styles.lede}>
          The difference from a <Link to={AGENT_SKILLS_PATH}>skill</Link> is who invokes it and what it costs. A skill's
          description sits in the agent's context on <em>every</em> turn so retrieval can match it; a command
          costs nothing until you type it. That makes a command the right tool for re-asserting exact
          instructions late in a long session, after the skill body injected at turn one has been compacted
          away.
        </p>
        <p className={styles.lede}>
          These are <strong>OpenCode only</strong>. Claude Code reads <code>.claude/commands/</code> with a
          different frontmatter dialect, so unlike <code>SKILL.md</code> these files are not portable — and
          pretending otherwise would be worse than saying so.
        </p>
      </section>

      <section className={styles.catalog} aria-labelledby="commands-heading">
        <div className={styles.catalogHead}>
          <h2 id="commands-heading" className={styles.sectionTitle}>
            Commands
            <span className={styles.count}>
              {visible.length === commands.length
                ? `${commands.length}`
                : `${visible.length} of ${commands.length}`}
            </span>
          </h2>

          <div className={styles.filter}>
            <label className={styles.filterLabel} htmlFor="command-filter">
              filter
            </label>
            <input
              id="command-filter"
              ref={filterInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="name, description, or template"
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

        {visible.length > 0 ? (
          <div className={styles.grid}>
            {visible.map((command) => (
              <CommandCard key={command.name} command={command} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No command matches <code>{query.trim()}</code>.
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="command-scopes-heading">
        <h2 id="command-scopes-heading" className={styles.sectionTitle}>
          Where commands live
        </h2>
        <p className={styles.sectionLede}>
          Two paths, both OpenCode — against a skill's six across three agent families. That gap is the honest
          trade for everything a command can do that a skill cannot.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.caption}>Where a command file has to live</caption>
            <thead>
              <tr>
                <th scope="col">Path</th>
                <th scope="col">Scope</th>
                <th scope="col">Read by</th>
              </tr>
            </thead>
            <tbody>
              {COMMAND_SCOPES.map((scope) => (
                <tr key={scope.path}>
                  <th scope="row">
                    <code>{scope.path}</code>
                  </th>
                  <td>{scope.scope}</td>
                  <td>
                    {scope.readBy}
                    <span className={styles.scopeNote}>{scope.note}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
