import { useEffect, useState, type ReactElement } from 'react'
import SkillMarkdown from './SkillMarkdown'
import TerminalPanel from './TerminalPanel'
import { simulationSourceUrl } from '../lib/repo'
import type { Simulation, TurnRole } from '../lib/simulation'
import {
  frameDelayMs,
  nextFrame,
  previousFrame,
  SPEEDS,
  type Speed,
} from '../lib/simulationPlayback'
import styles from './simulation-panel.module.css'

interface SimulationPanelProps {
  /**
   * Skill directory name. Supplies the chrome path and the source link for the
   * common case; a command page passes {@link sourcePath} and {@link sourceUrl}
   * instead, because its transcript lives outside `skills/`.
   */
  skillName?: string
  /** Monospace path shown in the terminal title bar. Overrides `skillName`. */
  sourcePath?: string
  /** Href for the `source` link in the title bar. Overrides `skillName`. */
  sourceUrl?: string
  simulation: Simulation
}

/**
 * How each role is announced. These are real text nodes rather than CSS
 * content, so a screen reader reads "assistant" before the reply instead of
 * an unattributed wall of prose.
 */
const ROLE_LABEL: Record<TurnRole, string> = {
  user: 'user',
  assistant: 'assistant',
  tool: 'tool',
  note: 'note',
}

const ROLE_CLASS: Record<TurnRole, string> = {
  user: styles.user,
  assistant: styles.assistant,
  tool: styles.tool,
  note: styles.note,
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function delayLabel(milliseconds: number): string {
  const seconds = Math.max(0, milliseconds) / 1000
  return `${seconds >= 1 ? Math.ceil(seconds) : Math.ceil(seconds * 10) / 10}s`
}

/**
 * The one renderer for every skill's worked example.
 *
 * There is deliberately no per-skill component and no registry keyed by skill
 * name: the transcript is content, discovered by a glob, and this walks
 * whatever the parser produced. Adding a worked example to a skill must never
 * mean writing React.
 */
export default function SimulationPanel({
  skillName,
  sourcePath,
  sourceUrl,
  simulation,
}: SimulationPanelProps): ReactElement {
  const path = sourcePath ?? `skills/${skillName}/SIMULATION.md`
  const href = sourceUrl ?? simulationSourceUrl(skillName ?? '')
  const totalFrames = simulation.turns.length
  const [currentFrame, setCurrentFrame] = useState(0)
  const [speed, setSpeed] = useState<Speed>(1)
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  const [isPlaying, setIsPlaying] = useState(() => !prefersReducedMotion() && totalFrames > 1)
  const [remainingMs, setRemainingMs] = useState(() => frameDelayMs(1))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches)
      if (event.matches) setIsPlaying(false)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!isPlaying || reducedMotion || currentFrame >= totalFrames - 1) return

    const delay = frameDelayMs(speed)
    const deadline = Date.now() + delay
    setRemainingMs(delay)

    // The frame timeout controls playback. The interval is display-only and
    // derives from an absolute deadline, so throttled ticks cannot accumulate
    // drift or make the countdown claim more time than remains.
    const countdown = window.setInterval(() => {
      setRemainingMs(Math.max(0, deadline - Date.now()))
    }, 100)

    const timer = window.setTimeout(() => {
      const next = nextFrame(currentFrame, totalFrames)
      setCurrentFrame(next)
      if (next >= totalFrames - 1) setIsPlaying(false)
    }, delay)

    return () => {
      window.clearInterval(countdown)
      window.clearTimeout(timer)
    }
  }, [currentFrame, isPlaying, reducedMotion, speed, totalFrames])

  const moveTo = (frame: number) => {
    setIsPlaying(false)
    setCurrentFrame(frame)
  }

  const frameStatus = `frame ${currentFrame + 1} of ${totalFrames}`
  const playbackStatus = reducedMotion
    ? 'Autoplay off (reduced motion)'
    : isPlaying
      ? `next frame in ${delayLabel(remainingMs)}`
      : currentFrame >= totalFrames - 1
        ? 'playback complete'
        : 'paused'
  const delay = frameDelayMs(speed)

  return (
    <section className={styles.simulation} aria-label="Simulation playback">
      <div className={styles.controls}>
        <button
          type="button"
          onClick={() => setIsPlaying((playing) => !playing)}
          disabled={reducedMotion || currentFrame >= totalFrames - 1}
        >
          {isPlaying ? '❚❚ Pause' : '▶ Play'}
        </button>
        <button type="button" onClick={() => moveTo(previousFrame(currentFrame))} disabled={currentFrame === 0}>
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => moveTo(nextFrame(currentFrame, totalFrames))}
          disabled={currentFrame >= totalFrames - 1}
        >
          Next →
        </button>
        <button type="button" onClick={() => moveTo(0)}>
          ↺ Reset
        </button>
        <label className={styles.speed}>
          <span>speed</span>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as Speed)}>
            {SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.playbackStatus}>
        <p className={styles.status}>
          {/* Announce frame changes, not every countdown tick. A live region
              saying "3, 2, 1" on every frame would make autoplay unusable for
              screen-reader users. */}
          <span aria-live="polite">{frameStatus}</span>
          <span aria-hidden="true"> · {playbackStatus}</span>
          <span className={styles.srOnly}>
            {isPlaying ? ' Autoplay active.' : ` ${playbackStatus}.`}
          </span>
        </p>
        {isPlaying ? (
          <progress
            className={styles.progress}
            max={delay}
            value={Math.min(delay, Math.max(0, delay - remainingMs))}
            aria-label="Time until next frame"
          />
        ) : null}
      </div>

      <TerminalPanel
        as="section"
        path={path}
        className={styles.panel}
        action={
          <a className={styles.source} href={href}>
            source
          </a>
        }
      >
        <ol className={styles.turns}>
          {simulation.turns.map((turn, index) => {
            const isNote = turn.role === 'note'
            const isVisible = index <= currentFrame
            // Notes are editorial: they explain why the assistant did that.
            // Marking them up as an aside keeps them out of the reply itself.
            const Body = isNote ? 'aside' : 'div'

            return (
              <li
                key={index}
                className={`${styles.turn} ${ROLE_CLASS[turn.role]} ${isVisible ? styles.visible : styles.hidden}`}
                hidden={!isVisible}
              >
                <p className={styles.speaker}>
                  <span className={styles.marker} aria-hidden="true">
                    {isNote ? '←' : '▌'}
                  </span>
                  <span className={styles.role}>{ROLE_LABEL[turn.role]}</span>
                  {turn.label ? <span className={styles.label}>{turn.label}</span> : null}
                </p>
                <Body className={styles.body}>
                  <SkillMarkdown content={turn.body} className={styles.prose} />
                </Body>
              </li>
            )
          })}
        </ol>
      </TerminalPanel>

      {/* Every static transcript compresses something. Saying what is what
          stops the example being read as a promise. */}
      <p className={styles.caveat}>
        <span className={styles.caveatLabel} aria-hidden="true">
          ⚠
        </span>
        <span className={styles.srOnly}>Caveat: </span>
        {simulation.caveat}
      </p>
    </section>
  )
}
