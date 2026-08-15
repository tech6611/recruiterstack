import { describe, it, expect } from 'vitest'
import { pickCalibrationSet } from './calibration'

const matches = (scores: number[]) => scores.map((score, i) => ({ id: `m${i}`, score }))

describe('pickCalibrationSet', () => {
  it('returns everything when the pool is at or below the limit', () => {
    const m = matches([90, 50, 10])
    expect(pickCalibrationSet(m, 5)).toHaveLength(3)
  })

  it('returns exactly `limit` distinct matches for a larger pool', () => {
    const m = matches(Array.from({ length: 40 }, (_, i) => i * 2)) // 0..78
    const picked = pickCalibrationSet(m, 15)
    expect(picked).toHaveLength(15)
    expect(new Set(picked.map((p) => p.id)).size).toBe(15)
  })

  it('spans the score range — includes the top and bottom, plus the middle', () => {
    const m = matches(Array.from({ length: 30 }, (_, i) => i * 3)) // 0..87
    const picked = pickCalibrationSet(m, 5).map((p) => p.score).sort((a, b) => a - b)
    expect(picked[0]).toBe(0) // clear-no end
    expect(picked[picked.length - 1]).toBe(87) // clear-yes end
    // a middle (borderline) pick sits between the extremes
    expect(picked.some((s) => s > 30 && s < 60)).toBe(true)
  })

  it('is deterministic', () => {
    const m = matches([80, 20, 60, 40, 95, 10, 55, 70])
    expect(pickCalibrationSet(m, 4)).toEqual(pickCalibrationSet(m, 4))
  })
})
