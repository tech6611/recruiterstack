import { describe, it, expect } from 'vitest'
import { checkCriterion, rankBetSamples, hasWords, titleHas, companyQueryTerms, type BetSamplePerson } from './bet-sample-fit'
import { betMarketSpec } from './bet-sample'
import type { SearchCriterion } from '@/lib/types/search-spec'

const bet: SearchCriterion[] = [
  { id: 'ip-bet-1-companies', kind: 'employer_current', values: ['McKinsey', 'Bain', 'Boston Consulting Group', 'BCG'], relax_at: 2, bet: 1 },
  { id: 'ip-bet-1-titles', kind: 'title_current', values: ['Business Analyst', 'Associate', 'Consultant'], relax_at: 3, bet: 1 },
  { id: 'ip-location', kind: 'location', values: ['Bengaluru, Karnataka, IN'], radius_km: 50, relax_at: 4 },
  { id: 'ip-years', kind: 'years_band', values: [], min: 2, max: 6, relax_at: null },
  { id: 'ip-school', kind: 'school', values: ['Indian Institute of Technology', 'IIT', 'IIM'], relax_at: 3 },
]
const person = (over: Partial<BetSamplePerson>): BetSamplePerson => ({
  id: over.id ?? 'p', display_name: 'A Person', current_title: 'Associate', current_company: 'Bain & Company',
  location_raw: 'Bengaluru, Karnataka, India', location_city: 'Bengaluru', location_region: 'Karnataka', location_country_code: 'IN',
  experience_years: 4, education: [{ school: 'IIT Bombay', degree: 'B.Tech' }], reachable: true, ...over,
})
const result = (p: BetSamplePerson, id: string) => checkCriterion(bet.find((c) => c.id === id)!, p).result

describe('bet sample — does a pool person fit a bet', () => {
  it('matches companies and titles on whole words', () => {
    expect(hasWords('Bain & Company', 'Bain')).toBe(true)
    expect(hasWords('Bainbridge Capital', 'Bain')).toBe(false)
    expect(titleHas('Senior Business Analyst, Strategy', 'Business Analyst')).toBe(true)
    expect(titleHas('Analyst', 'Business Analyst')).toBe(false)
  })

  it('marks every line ✓ / ✗ / ? from the stored profile', () => {
    const fits = person({})
    expect(bet.map((c) => result(fits, c.id))).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    const off = person({ current_title: 'Engagement Manager', location_city: 'Mumbai', location_region: 'Maharashtra', experience_years: 9, education: [{ school: 'Delhi University' }] })
    expect(bet.map((c) => result(off, c.id))).toEqual(['pass', 'fail', 'fail', 'fail', 'fail'])
    const thin = person({ current_title: null, location_city: null, location_raw: null, experience_years: null, education: [] })
    expect(bet.slice(1).map((c) => result(thin, c.id))).toEqual(['unknown', 'unknown', 'unknown', 'unknown'])
  })

  it('an exclusion flips the result', () => {
    expect(checkCriterion({ id: 'x', kind: 'title_current', values: ['Partner'], exclude: true }, person({ current_title: 'Partner' })).result).toBe('fail')
  })

  it('ranks fewest misses first, then a fitting title, then most matches', () => {
    const ranked = rankBetSamples([
      person({ id: 'mumbai', location_city: 'Mumbai', location_region: 'Maharashtra' }),
      person({ id: 'unknown-title', current_title: null }),
      person({ id: 'perfect' }),
    ], bet)
    expect(ranked.map((r) => r.person.id)).toEqual(['perfect', 'unknown-title', 'mumbai'])
    expect(ranked[2].fails).toBe(1)
  })

  it('company terms are safe for the pool query', () => {
    expect(companyQueryTerms(['McKinsey & Company', 'Boston Consulting Group (BCG)', 'x', 'McKinsey & Company'])).toEqual(['McKinsey & Company', 'Boston Consulting Group BCG'])
  })

  it('the market search is the bet\'s companies and titles, with its lines ANDed in', () => {
    const spec = betMarketSpec(bet)!
    expect(spec.levels[0].criteria.map((c) => c.id)).toEqual(['ip-bet-1-companies', 'ip-bet-1-titles'])
    expect(spec.base.map((c) => c.id)).toEqual(['ip-location', 'ip-years', 'ip-school'])
    expect(betMarketSpec(bet.slice(1))).toBeNull()
  })
})
