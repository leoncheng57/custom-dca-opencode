import type { ReactElement } from 'react'
import CopyButton from './CopyButton'
import { INSTALL_SCOPES, installMethods } from '../lib/install'
import styles from './install-block.module.css'

interface InstallBlockProps {
  skill: string
}

/**
 * The install methods for one skill.
 *
 * Renders the body only — the heading and the collapsed/expanded chrome belong
 * to the caller ({@link ../routes/SkillRoute}), which wraps this and the
 * instructions in matching `<details>` disclosures.
 */
export default function InstallBlock({ skill }: InstallBlockProps): ReactElement {
  return (
    <div className={styles.block}>
      <p className={styles.lede}>
        Pick one. The first four install <strong>globally</strong>, into{' '}
        <code>~/.agents/skills/{skill}/</code> — the highest-reach location, read by OpenCode, Cursor,
        Codex, Copilot, Gemini CLI, Amp, Roo and Zed. Claude Code reads the same layout under{' '}
        <code>~/.claude/skills/</code>, so swap the destination if that is your agent. The last one installs{' '}
        <strong>into a project</strong> instead, so the skill loads only in that repository.
      </p>

      <ol className={styles.methods}>
        {installMethods(skill).map((method) => (
          <li key={method.id} className={styles.method}>
            <div className={styles.methodHead}>
              <h3 className={styles.methodLabel}>{method.label}</h3>
              <span className={styles.methodScope}>{method.scope}</span>
              <CopyButton value={method.command} label={`${method.label} command`} />
            </div>
            <p className={styles.methodNote}>{method.note}</p>
            <pre className={styles.command}>
              <code>{method.command}</code>
            </pre>
          </li>
        ))}
      </ol>

      <p className={styles.footnote}>
        Committing <code>.agents/skills/</code> shares the skill with every agent and every collaborator
        working in that repository. <code>.claude/skills/{skill}/</code> is the Claude Code equivalent, and{' '}
        <code>.opencode/skills/{skill}/</code> also works for OpenCode.
      </p>
    </div>
  )
}

/** The where-do-skills-live reference, rendered once on the catalog page. */
export function InstallScopeTable(): ReactElement {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>Where a skill directory has to live</caption>
        <thead>
          <tr>
            <th scope="col">Path</th>
            <th scope="col">Scope</th>
            <th scope="col">Read by</th>
          </tr>
        </thead>
        <tbody>
          {INSTALL_SCOPES.map((scope) => (
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
  )
}
