import { describe, it, expect } from 'vitest'
import { callerBrief, callerMustHaves, cvSummaryOnly } from './screen-briefing'
import type { IcpMustHave, RecruiterBrief } from '@/lib/types/icp'

describe('cvSummaryOnly', () => {
  it('keeps only the first (CV) paragraph', () => {
    const s = 'Senior S&O manager, 7 years.\n\nTheir AI phone screen encountered a technical error.'
    expect(cvSummaryOnly(s)).toBe('Senior S&O manager, 7 years.')
  })
  it('handles blank and missing summaries', () => {
    expect(cvSummaryOnly(null)).toBeNull()
    expect(cvSummaryOnly('  \n\n  ')).toBeNull()
    expect(cvSummaryOnly('One paragraph only.')).toBe('One paragraph only.')
  })
})

describe('callerMustHaves', () => {
  const gate = (label: string, enforcement?: 'hard' | 'sourcing_only', bet?: number): IcpMustHave =>
    ({ id: label, label, attribute: 'x', operator: 'criterion', value: '', enforcement, bet } as IcpMustHave)

  it('drops sourcing-only rows (employers, schools, titles)', () => {
    const out = callerMustHaves([
      gate('Within 50 km of Bengaluru', 'hard'),
      gate('Currently at: McKinsey / Bain', 'sourcing_only'),
      gate('2–6 years'), // legacy rows without enforcement are hard
    ])
    expect(out).toEqual([{ label: 'Within 50 km of Bengaluru' }, { label: '2–6 years' }])
  })
  it('handles a missing list', () => {
    expect(callerMustHaves(null)).toEqual([])
  })
})

describe('callerBrief', () => {
  const brief = {
    niche: 'S&O recruiter, Bengaluru',
    persona: 'I place first ops hires.',
    market: 'Bengaluru, on-site',
    feeder_pools: [],
    title_families: [],
    market_gates: [{ requirement: 'SQL', why: 'must be self-sufficient' }],
    jd_translations: [],
    market_norms: [{ topic: 'Notice Periods', norm: '2-3 months', kind: 'notice' }],
    normal_red_flags: ['Job hopping every 12-18 months is common'],
    unsure_about: ['Finance interest requirement'],
  } as unknown as RecruiterBrief

  it('returns the persona and local knowledge a caller needs', () => {
    const out = callerBrief({ sourcing_map: { recruiter_brief: brief } } as never)
    expect(out).toMatchObject({
      niche: 'S&O recruiter, Bengaluru',
      market: 'Bengaluru, on-site',
      marketGates: [{ requirement: 'SQL', why: 'must be self-sufficient' }],
      marketNorms: [{ topic: 'Notice Periods', norm: '2-3 months' }],
      normalRedFlags: ['Job hopping every 12-18 months is common'],
      unsureAbout: ['Finance interest requirement'],
      corrections: null,
    })
  })
  it('is null without an ICP or a brief', () => {
    expect(callerBrief(null)).toBeNull()
    expect(callerBrief({ sourcing_map: null } as never)).toBeNull()
  })
})
