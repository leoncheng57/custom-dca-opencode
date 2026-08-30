import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FRAME_MS,
  frameDelayMs,
  nextFrame,
  previousFrame,
  SPEEDS,
} from '../client/lib/simulationPlayback.js'

describe('simulation playback timing', () => {
  it('uses three seconds as the default frame duration', () => {
    expect(DEFAULT_FRAME_MS).toBe(3_000)
  })

  it.each([
    [0.5, 6_000],
    [1, 3_000],
    [2, 1_500],
    [4, 750],
  ] as const)('maps %sx speed to %sms', (speed, delay) => {
    expect(SPEEDS).toContain(speed)
    expect(frameDelayMs(speed)).toBe(delay)
  })
})

describe('simulation playback navigation', () => {
  it('advances one frame without passing the final frame', () => {
    expect(nextFrame(0, 4)).toBe(1)
    expect(nextFrame(3, 4)).toBe(3)
  })

  it('moves back one frame without passing the first frame', () => {
    expect(previousFrame(3)).toBe(2)
    expect(previousFrame(0)).toBe(0)
  })
})
