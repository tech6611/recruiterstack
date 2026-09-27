import { describe, it, expect } from 'vitest'
import { deriveProfileChips } from './profile-chips'

const NOW = new Date('2026-09-27T00:00:00Z')
const role = (p: Partial<Parameters<typeof deriveProfileChips>[0]['experiences'][number]> & { employer: string | null }) => ({
  title: null, location: null, start_date: null, end_date: null, is_current: false, summary: null, ...p,
})
const labels = (input: Parameters<typeof deriveProfileChips>[0]) =>
  deriveProfileChips({ ...input, now: NOW }).map((c) => c.label)

describe('deriveProfileChips', () => {
  it('names the domains a person is concentrated in, from the Skill Map', () => {
    const out = labels({
      experiences: [role({ employer: 'Acme', title: 'Engineer', start_date: '2020-01-01', is_current: true })],
      skills: ['PyTorch', 'TensorFlow', 'Machine Learning', 'Deep Learning', 'Python'],
    })
    expect(out).toContain('AI / ML')
  })

  it('ignores a domain the person barely touches', () => {
    // One stray skill among many is not a domain they work in.
    const out = labels({
      experiences: [role({ employer: 'Acme', start_date: '2020-01-01', is_current: true })],
      skills: ['Python', 'Django', 'Flask', 'FastAPI', 'PostgreSQL', 'Redis', 'Figma'],
    })
    expect(out).not.toContain('Product Design & UX')
  })

  it('marks high average tenure, but only when it is genuinely high', () => {
    const settled = [
      role({ employer: 'A', start_date: '2014-01-01', end_date: '2019-01-01' }),
      role({ employer: 'B', start_date: '2019-01-01', end_date: '2024-01-01' }),
    ]
    expect(labels({ experiences: settled })).toContain('High avg. tenure')

    const middling = [
      role({ employer: 'A', start_date: '2020-01-01', end_date: '2022-01-01' }),
      role({ employer: 'B', start_date: '2022-01-01', end_date: '2024-01-01' }),
    ]
    // Two years per employer is ordinary — a chip true of everyone says nothing.
    expect(labels({ experiences: middling })).not.toContain('High avg. tenure')
  })

  it('flags short stints', () => {
    const hopper = [
      role({ employer: 'A', start_date: '2022-01-01', end_date: '2022-09-01' }),
      role({ employer: 'B', start_date: '2022-10-01', end_date: '2023-06-01' }),
      role({ employer: 'C', start_date: '2023-07-01', end_date: '2024-02-01' }),
    ]
    expect(labels({ experiences: hopper })).toContain('Short stints')
  })

  it('reads seniority from the current title', () => {
    const manager = [role({ employer: 'A', title: 'Engineering Manager', start_date: '2022-01-01', is_current: true })]
    expect(labels({ experiences: manager })).toContain('People manager')
    const vp = [role({ employer: 'A', title: 'VP of Engineering', start_date: '2022-01-01', is_current: true })]
    expect(labels({ experiences: vp })).toContain('Executive')
  })

  it('recognises a tier-1 school for the market', () => {
    const out = labels({
      experiences: [role({ employer: 'A', start_date: '2020-01-01', is_current: true })],
      education: [{ school: 'Indian Institute of Technology, Madras', year: 2019 }],
      country: 'IN',
    })
    expect(out).toContain('Top-tier school')
  })

  it('says nothing about a school it has no opinion on', () => {
    const out = labels({
      experiences: [role({ employer: 'A', start_date: '2020-01-01', is_current: true })],
      education: [{ school: 'Some Local College', year: 2019 }],
      country: 'IN',
    })
    expect(out).not.toContain('Top-tier school')
    expect(out).not.toContain('Tier-2 school')
  })

  it('never repeats itself', () => {
    const out = labels({
      experiences: [
        role({ employer: 'A', title: 'Engineer', start_date: '2014-01-01', end_date: '2019-01-01' }),
        role({ employer: 'A', title: 'Senior Engineer', start_date: '2019-01-01', is_current: true }),
      ],
      skills: ['Python', 'Django'],
    })
    expect(new Set(out).size).toBe(out.length)
  })

  it('caps the row at six, keeping the most telling', () => {
    const out = labels({
      experiences: [
        role({ employer: 'A', title: 'Engineer', start_date: '2019-01-01', end_date: '2019-09-01' }),
        role({ employer: 'B', title: 'Senior Engineer', start_date: '2019-10-01', end_date: '2020-06-01' }),
        role({ employer: 'C', title: 'VP of Engineering', start_date: '2026-06-01', is_current: true }),
      ],
      skills: ['PyTorch', 'TensorFlow', 'Machine Learning', 'Python', 'Django', 'PostgreSQL', 'Redis', 'Docker'],
      education: [{ school: 'Indian Institute of Technology, Madras', year: 2018 }],
      country: 'IN',
    })
    expect(out.length).toBeLessThanOrEqual(6)
  })

  it('returns nothing for an empty profile rather than inventing a reading', () => {
    expect(labels({ experiences: [] })).toEqual([])
  })
})
