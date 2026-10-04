import { describe, it, expect } from 'vitest'
import { clip, briefGroups } from './BriefGlance'
import type { RecruiterBrief } from '@/lib/types/icp'

const brief = (over: Partial<RecruiterBrief> = {}): RecruiterBrief => ({
  niche: 'Strategy & Ops', persona: '', feeder_pools: [], title_families: [],
  market_gates: [], jd_translations: [], market_norms: [], normal_red_flags: [], unsure_about: [], ...over,
})

describe('clip', () => {
  it('keeps a short first sentence whole', () => {
    expect(clip('Bengaluru, Karnataka, IN. The role is on-site.')).toBe('Bengaluru, Karnataka, IN')
  })
  it('cuts a long line at a whole word', () => {
    const out = clip('For a 1-10 person startup, cash will likely be at or slightly below market')
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(37)
    expect(out).not.toMatch(/\s…$/)
  })
  it('leaves short text alone', () => {
    expect(clip('2–3 months')).toBe('2–3 months')
  })
})

describe('briefGroups', () => {
  it('uses the AI short tag, and falls back to a clipped line without one', () => {
    const groups = briefGroups(brief({
      market_gates: [{ requirement: 'Experience in coding with SQL, Python, or R', short: 'SQL / Python / R' }, { requirement: 'Degree from a top university' }],
    }), [])
    const must = groups.find((g) => g.title === 'Must')!
    expect(must.facts.map((f) => f.short)).toEqual(['SQL / Python / R', 'Degree from a top university'])
    expect(must.facts[0].full).toBe('Experience in coding with SQL, Python, or R')
  })

  it('pairs the parallel short lists by position', () => {
    const groups = briefGroups(brief({ unsure_about: ['A long question for the HM', 'Another one'], unsure_about_short: ['Q1', 'Q2'] }), [])
    expect(groups.find((g) => g.title === 'Ask')!.facts.map((f) => f.short)).toEqual(['Q1', 'Q2'])
  })

  it('writes the years band, open at either end', () => {
    const years = (min: number | null, max: number | null) =>
      briefGroups(brief({ experience_band: { min_years: min, max_years: max } }), [])[0].facts[0].short
    expect(years(2, 6)).toBe('2–6 yrs')
    expect(years(5, null)).toBe('5+ yrs')
    expect(years(null, 8)).toBe('Up to 8 yrs')
  })

  it('puts screening probes under Ask and leaves out empty groups', () => {
    const groups = briefGroups(brief(), [{ requirement: 'To enjoy working with data', short: 'Enjoys data' }])
    expect(groups.map((g) => g.title)).toEqual(['Ask'])
    expect(groups[0].facts[0].short).toBe('Enjoys data')
  })

  it('handles no brief at all', () => {
    expect(briefGroups(null, [])).toEqual([])
  })
})
