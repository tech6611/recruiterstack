import { describe, it, expect } from 'vitest'
import { roleContextFromRows } from './job-role-context'

describe('roleContextFromRows', () => {
  it('builds market from the linked location and company from the org profile', () => {
    const ctx = roleContextFromRows(
      {
        custom_fields: { intake: { work_model: 'onsite', location: 'Bangalore Back Office' } },
        location: { name: 'Bangalore Back Office', city: 'Bengaluru', state: 'Karnataka', country: 'IN', timezone: 'IST', remote_type: 'onsite' },
      },
      { company_name: 'RecruiterStack', industry: 'SaaS', company_size: '11-50', website: 'https://recruiterstack.in', about: '<p><strong>We are</strong> an ATS.</p>' },
    )
    expect(ctx.market).toEqual({ site: 'Bangalore Back Office', city: 'Bengaluru', state: 'Karnataka', country: 'IN', timezone: 'IST', work_model: 'onsite' })
    expect(ctx.company).toEqual({ name: 'RecruiterStack', industry: 'SaaS', size: '11-50', website: 'https://recruiterstack.in', about: 'We are an ATS.' })
  })

  it('lets the intake work model win over the location default, and falls back to remote_ok', () => {
    const loc = { name: 'HQ', city: 'London', country: 'GB', remote_type: 'onsite' }
    expect(roleContextFromRows({ custom_fields: { intake: { work_model: 'hybrid' } }, location: loc }, null).market?.work_model).toBe('hybrid')
    expect(roleContextFromRows({ custom_fields: { intake: { remote_ok: true } }, location: loc }, null).market?.work_model).toBe('remote')
    expect(roleContextFromRows({ custom_fields: {}, location: loc }, null).market?.work_model).toBe('onsite')
  })

  it('returns null halves when nothing is known, and truncates a long about', () => {
    const empty = roleContextFromRows({ custom_fields: null, location: null }, { company_name: null })
    expect(empty).toEqual({ market: null, company: null })
    const long = roleContextFromRows(null, { about: 'x'.repeat(700) })
    expect(long.company?.about?.length).toBe(601)
    expect(long.company?.about?.endsWith('…')).toBe(true)
  })
})
