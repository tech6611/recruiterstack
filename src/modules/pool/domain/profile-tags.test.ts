import { describe, it, expect } from 'vitest'
import { deriveProfileTags } from './profile-tags'

const now = new Date('2026-09-20')
const r = (title: string, employer: string, start: string, end: string | null, is_current = false) => ({ title, employer, start_date: start, end_date: end, is_current })

describe('deriveProfileTags', () => {
  it('names feeder employers, current vs former', () => {
    expect(deriveProfileTags([r('Associate', 'Bain & Company', '2024-01-01', null, true)], { feederEmployers: ['Bain'], now })).toContain('At Bain')
    expect(deriveProfileTags([r('Associate', 'McKinsey & Company', '2020-01-01', '2022-01-01'), r('Manager', 'Razorpay', '2022-02-01', null, true)], { feederEmployers: ['McKinsey'], now })).toContain('Ex-McKinsey')
  })
  it('spots fast growth from promotions at one employer, and tenure patterns', () => {
    const grow = [r('Analyst', 'Flipkart', '2021-01-01', '2022-06-01'), r('Senior Analyst', 'Flipkart', '2022-06-01', '2024-01-01'), r('Manager', 'Flipkart', '2024-01-01', null, true)]
    expect(deriveProfileTags(grow, { now })).toContain('Fast career growth')
    const hopper = [r('A', 'X', '2020-01-01', '2020-10-01'), r('B', 'Y', '2020-11-01', '2021-08-01'), r('C', 'Z', '2021-09-01', '2022-05-01'), r('D', 'W', '2022-06-01', null, true)]
    expect(deriveProfileTags(hopper, { now })).toContain('Job hopper')
  })
  it('flags a recent move, ignores internships, returns nothing without dates', () => {
    expect(deriveProfileTags([r('Manager', 'Zomato', '2026-06-01', null, true)], { now })).toContain('Recently moved')
    expect(deriveProfileTags([r('Summer Intern', 'Bain', '2019-05-01', '2019-07-01')], { feederEmployers: ['Bain'], now })).toEqual([])
    expect(deriveProfileTags([{ title: 'X', employer: 'Y' }], { now })).toEqual([])
  })
})

describe('deriveProfileTags — campus roles are not employment', () => {
  const now = new Date('2026-09-20')
  it('ignores clubs, societies, campus titles and anything ending before graduation', () => {
    const exps = [
      { title: 'Manager', employer: 'E-Cell IIT Madras', start_date: '2021-05-01', end_date: '2022-03-01', is_current: false },
      { title: 'Coordinator | Blockchain Club', employer: 'Centre For Innovation (CFI)', start_date: '2021-06-01', end_date: '2022-04-01', is_current: false },
      { title: 'Business Development', employer: 'GalaxEye', start_date: '2022-12-01', end_date: '2023-01-01', is_current: false },
      { title: 'Business Analyst Intern', employer: 'McKinsey & Company', start_date: '2024-05-01', end_date: '2024-07-01', is_current: false },
      { title: 'Associate', employer: 'Boston Consulting Group (BCG)', start_date: '2026-01-01', end_date: null, is_current: true },
    ]
    const tags = deriveProfileTags(exps, { feederEmployers: ['Boston Consulting Group'], graduationYear: 2025, now })
    expect(tags).toContain('At Boston Consulting Group')
    expect(tags).not.toContain('Job hopper')
    expect(tags).not.toContain('Fast career growth')
  })
})
