import { describe, it, expect } from 'vitest'
import { companyChips, type CompanyFactsMap } from './company-facts'
import type { WorkRole } from './ui/work-history'

/** Real rows from the enrichment, so the tests fail when reality would. */
const FACTS: CompanyFactsMap = {
  flipkart:      { name_norm: 'flipkart',      display_name: 'Flipkart', industries: ['e-commerce'], employees: 22000, founded_year: 2007, latest_stage: 'Series J' },
  signoz:        { name_norm: 'signoz',        display_name: 'SigNoz',   industries: ['Software Development', 'Developer Tools', 'Observability'], employees: 44, founded_year: 2021, latest_stage: 'Seed' },
  google:        { name_norm: 'google',        display_name: 'Google',   industries: ['Internet industry', 'software industry', 'internet marketing'], employees: 47756, founded_year: 1998, latest_stage: 'Public' },
  razorpay:      { name_norm: 'razorpay',      display_name: 'Razorpay', industries: ['software industry', 'payment system'], employees: 4035, founded_year: 2014, latest_stage: 'Public' },
  stripe:        { name_norm: 'stripe',        display_name: 'Stripe',   industries: ['financial services', 'mobile payment industry'], employees: 2500, founded_year: 2010, latest_stage: null },
}

const role = (employer: string, start: string, end: string | null): WorkRole => ({
  title: 'Engineer', employer, location: null, start_date: start, end_date: end, is_current: end == null, summary: null,
})

const labels = (roles: WorkRole[], facts = FACTS) =>
  companyChips(roles, facts, new Date('2026-01-01')).map((c) => c.label)

describe('companyChips', () => {
  it('says nothing at all when we hold no facts for the employers', () => {
    expect(companyChips([role('Some Unknown Co', '2020-01-01', null)], FACTS)).toEqual([])
    expect(companyChips([role('Google', '2010-01-01', null)], undefined)).toEqual([])
  })

  it('reads a small company and a huge one as Startup + Big Tech', () => {
    expect(labels([role('SigNoz', '2022-01-01', null), role('Google', '2015-01-01', '2021-12-01')]))
      .toContain('Startup + Big Tech')
  })

  it('will not call someone Big Tech for joining before the company was big', () => {
    // Flipkart has 22,000 people TODAY. In 2008 it had a handful, so this is a startup
    // stint, and reading today's headcount back over it would be a false claim.
    expect(labels([role('Flipkart', '2008-06-01', '2012-01-01')])).not.toContain('Big Tech')
    expect(labels([role('Flipkart', '2008-06-01', '2012-01-01')])).toContain('Early employee')
    // Joining in 2019, it really was a big company.
    expect(labels([role('Flipkart', '2019-06-01', null)])).toContain('Big Tech')
  })

  it('claims early-stage only from a company that is STILL early', () => {
    // SigNoz is at seed, so whenever you were there it was at most seed — and that is
    // the stronger claim, so it outranks the plain "Startup" its headcount would give.
    expect(labels([role('SigNoz', '2023-01-01', null)])).toContain('Early-stage')
    // Razorpay is public now, so nothing about its stage can be claimed for 2015.
    const chips = companyChips([role('Razorpay', '2015-01-01', '2018-01-01')], FACTS, new Date('2026-01-01'))
    expect(chips.map((c) => c.label)).not.toContain('Early-stage')
  })

  it('names the sector that most of the career sits in', () => {
    // Eight years in payments, one at Google.
    expect(labels([role('Razorpay', '2016-01-01', '2024-01-01'), role('Google', '2024-02-01', null)]))
      .toContain('Fintech')
  })

  it('does not name a sector someone merely passed through', () => {
    // Seven years e-commerce, six months fintech — fintech is not their industry.
    expect(labels([role('Flipkart', '2018-01-01', '2025-01-01'), role('Stripe', '2025-06-01', null)]))
      .toContain('E-commerce & Retail')
  })

  it('never returns more than two chips', () => {
    const many = [role('SigNoz', '2023-01-01', null), role('Google', '2015-01-01', '2022-01-01'), role('Razorpay', '2012-01-01', '2015-01-01')]
    expect(companyChips(many, FACTS, new Date('2026-01-01')).length).toBeLessThanOrEqual(2)
  })

  it('makes no claim about unicorns or valuations', () => {
    const all = companyChips(
      [role('Flipkart', '2008-01-01', null), role('Stripe', '2015-01-01', '2020-01-01')],
      FACTS, new Date('2026-01-01'),
    )
    expect(JSON.stringify(all).toLowerCase()).not.toContain('unicorn')
    expect(JSON.stringify(all)).not.toMatch(/\$\d/)
  })
})
