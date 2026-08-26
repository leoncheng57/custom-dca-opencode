import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import styles from './copy-button.module.css'

interface CopyButtonProps {
  value: string
  /** Used in the accessible label, e.g. "Copy the degit command". */
  label: string
}

const RESET_DELAY_MS = 1600

/** Fallback for insecure origins, where navigator.clipboard is undefined. */
function legacyCopy(value: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

export default function CopyButton({ value, label }: CopyButtonProps): ReactElement {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(async () => {
    let copied = false
    try {
      await navigator.clipboard.writeText(value)
      copied = true
    } catch {
      copied = legacyCopy(value)
    }

    setState(copied ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), RESET_DELAY_MS)
  }, [value])

  return (
    <button type="button" className={styles.copy} onClick={copy} aria-label={`Copy the ${label}`}>
      <span aria-hidden="true">{state === 'copied' ? 'copied' : state === 'failed' ? 'failed' : 'copy'}</span>
      <span role="status" aria-live="polite" className={styles.srOnly}>
        {state === 'copied' ? `${label} copied` : state === 'failed' ? `Could not copy the ${label}` : ''}
      </span>
    </button>
  )
}
