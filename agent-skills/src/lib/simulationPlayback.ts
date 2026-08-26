export const DEFAULT_FRAME_MS = 3_000

export const SPEEDS = [0.5, 1, 2, 4] as const

export type Speed = (typeof SPEEDS)[number]

export function frameDelayMs(speed: Speed): number {
  return DEFAULT_FRAME_MS / speed
}

export function nextFrame(index: number, total: number): number {
  return Math.min(index + 1, Math.max(total - 1, 0))
}

export function previousFrame(index: number): number {
  return Math.max(index - 1, 0)
}
