import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatMonthYear,
  formatRange,
  formatYears,
  groupByEmployer,
  monthsBetween,
  roleMonths,
  seniorityRank,
  summarizeHistory,
  type WorkRole,
} from './work-history'

const NOW = new Date('2026-09-26T00:00:00Z')

const role = (p: Partial<WorkRole> & { employer: string | null }): WorkRole => ({
  title: null,
  location: null,
  start_date: null,
  end_date: null,
  is_current: false,
  summary: null,
  ...p,
})

describe('formatDuration', () => {
  it('spells out years and months', () => {
    expect(formatDuration(26)).toBe('2 yrs 2 mos')
    expect(formatDuration(12)).toBe('1 yr')
    expect(formatDuration(13)).toBe('1 yr 1 mo')
    expect(formatDuration(5)).toBe('5 mos')
  })
  it('shows a zero-month span rather than an empty string', () => {
    expect(formatDuration(0)).toBe('0 mos')
  })
  it('is empty when the span is unknown', () => {
    expect(formatDuration(null)).toBe('')
  })
})

describe('formatYears', () => {
  it('counts whole years for the header', () => {
    expect(formatYears(120)).toBe('10 years')
    expect(formatYears(13)).toBe('1 year')
  })
  it('never rounds up, so the header agrees with the precise tile beside it', () => {
    // 68 months is "5 yrs 8 mos" on the tile; the header must not say "6 years".
    expect(formatYears(68)).toBe('5 years')
    expect(formatYears(23)).toBe('1 year')
  })
  it('falls back to months under a year', () => {
    expect(formatYears(5)).toBe('5 mos')
  })
  it('does not round a sub-year span up to "1 year"', () => {
    // 9 months rounds to 1 when divided first — and "1 year average tenure" overstates
    // how long someone stays, which is the one number a recruiter reads for stability.
    expect(formatYears(9)).toBe('9 mos')
    expect(formatYears(11)).toBe('11 mos')
    expect(formatYears(12)).toBe('1 year')
  })
})

describe('formatRange / formatMonthYear', () => {
  it('renders an open-ended role as Present', () => {
    expect(formatRange('2024-07-01', null, true)).toBe('Jul 2024 – Present')
  })
  it('renders a closed role', () => {
    expect(formatRange('2022-09-01', '2024-05-01', false)).toBe('Sep 2022 – May 2024')
  })
  it('marks an unknown side rather than guessing', () => {
    expect(formatRange(null, '2024-05-01', false)).toBe('— – May 2024')
  })
  it('is empty for an unparseable date', () => {
    expect(formatMonthYear('not a date')).toBe('')
  })
})

describe('monthsBetween', () => {
  it('counts whole months', () => {
    expect(monthsBetween('2024-07-01', new Date('2026-09-01'))).toBe(26)
  })
  it('never goes negative', () => {
    expect(monthsBetween('2026-09-01', new Date('2024-07-01'))).toBe(0)
  })
  it('is null when a side is missing', () => {
    expect(monthsBetween(null, NOW)).toBeNull()
  })
})

describe('seniorityRank', () => {
  it('ranks the ladder', () => {
    expect(seniorityRank('Intern')).toBeLessThan(seniorityRank('Engineer'))
    expect(seniorityRank('Engineer')).toBeLessThan(seniorityRank('Senior Engineer'))
    expect(seniorityRank('Senior Engineer')).toBeLessThan(seniorityRank('Engineering Manager'))
    expect(seniorityRank('Director')).toBeLessThan(seniorityRank('VP of Engineering'))
  })
  it('takes the highest signal in a compound title', () => {
    expect(seniorityRank('Senior Director')).toBe(seniorityRank('Director'))
  })
  it('treats an unknown title as mid-level, not as zero', () => {
    expect(seniorityRank('Engineer')).toBe(seniorityRank(null))
  })
})

describe('groupByEmployer', () => {
  const airbnb = [
    role({ employer: 'Airbnb', title: 'Engineer', start_date: '2016-06-01', end_date: '2019-04-01' }),
    role({ employer: 'Airbnb', title: 'Senior Engineer', start_date: '2019-04-01', end_date: '2022-09-01' }),
    role({ employer: 'Figma', title: 'Engineering Manager', start_date: '2024-07-01', is_current: true }),
  ]

  it('merges roles at one employer into a single stint', () => {
    const stints = groupByEmployer(airbnb, NOW)
    expect(stints.map((s) => s.employer)).toEqual(['Figma', 'Airbnb'])
    expect(stints[1].roles).toHaveLength(2)
  })

  it('spans the stint end to end rather than summing its roles', () => {
    // Jun 2016 → Sep 2022 is 75 months. Summing the two roles would also give 75 here,
    // but overlapping roles would double-count; the span is the honest number.
    const stints = groupByEmployer(airbnb, NOW)
    expect(stints[1].months).toBe(75)
  })

  it('marks a step up the ladder as a promotion, newest role first', () => {
    const [, ab] = groupByEmployer(airbnb, NOW)
    expect(ab.roles[0].title).toBe('Senior Engineer')
    expect(ab.roles[0].isPromotion).toBe(true)
    expect(ab.roles[1].isPromotion).toBe(false)
  })

  it('does not call a lateral move a promotion', () => {
    const lateral = [
      role({ employer: 'Vanta', title: 'Engineering Manager', start_date: '2020-01-01', end_date: '2021-01-01' }),
      role({ employer: 'Vanta', title: 'Product Manager', start_date: '2021-01-01', end_date: '2022-01-01' }),
    ]
    expect(groupByEmployer(lateral, NOW)[0].roles[0].isPromotion).toBe(false)
  })

  it('puts the current employer first even when a past role has no end date', () => {
    const messy = [
      role({ employer: 'Old Co', title: 'Engineer', start_date: '2025-01-01' }),
      role({ employer: 'New Co', title: 'Engineer', start_date: '2024-01-01', is_current: true }),
    ]
    expect(groupByEmployer(messy, NOW)[0].employer).toBe('New Co')
  })

  it('keeps unnamed employers apart instead of inventing one job', () => {
    const gigs = [
      role({ employer: null, title: 'Contract design', start_date: '2020-01-01', end_date: '2020-06-01' }),
      role({ employer: null, title: 'Contract build', start_date: '2021-01-01', end_date: '2021-06-01' }),
    ]
    expect(groupByEmployer(gigs, NOW)).toHaveLength(2)
  })

  it('runs an open-ended role to now', () => {
    const r = role({ employer: 'Figma', title: 'EM', start_date: '2024-07-01', is_current: true })
    expect(roleMonths(r, NOW)).toBe(26)
  })
})

describe('summarizeHistory', () => {
  it('counts months employed, not calendar time since the first job', () => {
    // Two years worked, a two-year gap, then one more year: three years, not five.
    const withGap = [
      role({ employer: 'A', start_date: '2019-01-01', end_date: '2021-01-01' }),
      role({ employer: 'B', start_date: '2023-01-01', end_date: '2024-01-01' }),
    ]
    expect(summarizeHistory(withGap, NOW).totalMonths).toBe(36)
  })

  it('counts two concurrent roles once', () => {
    const concurrent = [
      role({ employer: 'Day job', start_date: '2023-01-01', end_date: '2024-01-01' }),
      role({ employer: 'Side gig', start_date: '2023-06-01', end_date: '2024-01-01' }),
    ]
    expect(summarizeHistory(concurrent, NOW).totalMonths).toBe(12)
  })

  it('averages tenure per employer, so a promotion is not a job change', () => {
    const promoted = [
      role({ employer: 'Airbnb', title: 'Engineer', start_date: '2016-01-01', end_date: '2018-01-01' }),
      role({ employer: 'Airbnb', title: 'Senior Engineer', start_date: '2018-01-01', end_date: '2020-01-01' }),
      role({ employer: 'Vanta', title: 'Engineer', start_date: '2020-01-01', end_date: '2022-01-01' }),
    ]
    // Two employers, 48 and 24 months → 36. Averaging the three ROLES would give 24.
    expect(summarizeHistory(promoted, NOW).averageTenureMonths).toBe(36)
    expect(summarizeHistory(promoted, NOW).employerCount).toBe(2)
    expect(summarizeHistory(promoted, NOW).roleCount).toBe(3)
  })

  it('leaves the average out while every stint is still running', () => {
    const onlyCurrent = [role({ employer: 'Figma', start_date: '2026-01-01', is_current: true })]
    expect(summarizeHistory(onlyCurrent, NOW).averageTenureMonths).toBeNull()
  })

  it('reports current tenure as the whole stint, not the latest title', () => {
    const promotedRecently = [
      role({ employer: 'Figma', title: 'Engineer', start_date: '2020-01-01', end_date: '2025-01-01' }),
      role({ employer: 'Figma', title: 'Senior Engineer', start_date: '2025-01-01', is_current: true }),
    ]
    // At Figma 6 yrs 8 mos; in the senior title only 20 months.
    expect(summarizeHistory(promotedRecently, NOW).currentTenureMonths).toBe(80)
  })

  it('has no current tenure when nobody is currently employed', () => {
    const past = [role({ employer: 'A', start_date: '2019-01-01', end_date: '2021-01-01' })]
    expect(summarizeHistory(past, NOW).currentTenureMonths).toBeNull()
  })

  it('survives a history with no dates at all', () => {
    const undated = [role({ employer: 'Somewhere', title: 'Engineer' })]
    const s = summarizeHistory(undated, NOW)
    expect(s.totalMonths).toBeNull()
    expect(s.averageTenureMonths).toBeNull()
    expect(s.roleCount).toBe(1)
  })
})
