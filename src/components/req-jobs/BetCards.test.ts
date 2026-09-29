import { describe, it, expect } from 'vitest'
import { companiesFor, searchPassFor, nameVariants } from './BetCards'

/** The real approved ICP for "Founding Engineering Manager" (v5). */
const BRIEF = {
  feeder_pools: [
    { label: 'High-Growth, Product-First Startups (Series A-C)', priority: 1, companies: ['Rippling', 'Deel', 'Ramp', 'Vanta', 'Notion', 'Retool', 'Brex'] },
    { label: "Established 'Unicorns' with Strong Eng Culture", priority: 2, companies: ['Stripe', 'Plaid', 'Airtable', 'Datadog', 'Figma'] },
    { label: "Big Tech '0-to-1' Internal Teams", priority: 3, companies: ['Google (Area 120, X)', 'Meta (NPE)', 'Microsoft (Incubation)'] },
  ],
} as never

const SCALER = {
  name: 'The Startup Scaler',
  where_from: 'Rippling, Deel, Vanta, Brex.',
  thesis: 'Joined a now well-known startup (e.g., Rippling, Ramp) as an IC when it was <100 people.',
} as never
const BIGTECH = {
  name: 'The Big-Tech Intrapreneur',
  where_from: 'Google Area 120, Meta NPE, internal incubators at large tech companies.',
  thesis: "An EM from a '0-to-1' team inside Google, Meta, or similar.",
} as never
const ASPIRING = {
  name: 'The Aspiring Leader',
  where_from: 'Notion, Airtable, Plaid, Dropbox.',
  thesis: 'A high-performing Staff Engineer at a mid-stage company (e.g., Notion, Plaid).',
} as never

describe('companiesFor', () => {
  it('matches a pool company whose entry carries a parenthetical', () => {
    // The bug: the pool says "Google (Area 120, X)", the archetype says "Google Area
    // 120", and comparing the whole strings found nothing — so this card, alone among
    // the three, showed no logos.
    const bigTech = {
      name: 'The Big-Tech Intrapreneur',
      where_from: 'Google Area 120, Meta NPE, internal incubators at large tech companies.',
      thesis: "An EM from a '0-to-1' team inside Google, Meta, or similar, who has big-company technical rigor.",
    } as never
    expect(companiesFor(bigTech, BRIEF)).toEqual(['Google', 'Meta'])
  })

  it('still matches the plain names it always did', () => {
    const scaler = {
      name: 'The Startup Scaler',
      where_from: 'Rippling, Deel, Vanta, Brex.',
      thesis: 'Joined a now well-known startup (e.g., Rippling, Ramp) as an IC when it was <100 people.',
    } as never
    expect(companiesFor(scaler, BRIEF)).toEqual(['Rippling', 'Deel', 'Ramp', 'Vanta'])
  })

  it('does not let a company name match inside a longer word', () => {
    const a = { name: 'x', where_from: 'works on metadata pipelines', thesis: '' } as never
    expect(companiesFor(a, BRIEF)).toEqual([])
  })

  it('names no company the archetype does not mention', () => {
    const a = { name: 'x', where_from: 'A consultancy background.', thesis: '' } as never
    expect(companiesFor(a, BRIEF)).toEqual([])
    expect(companiesFor(a, null)).toEqual([])
  })
})

describe('searchPassFor', () => {
  it('reads the pass off the pools, not off the order the model wrote the bets in', () => {
    expect(searchPassFor(SCALER, BRIEF)).toEqual({ pass: 1, pool: 'High-Growth, Product-First Startups (Series A-C)' })
    expect(searchPassFor(BIGTECH, BRIEF)?.pass).toBe(3)
  })

  it('lets two bets share a pass', () => {
    // The Aspiring Leader draws on Notion, which is in pool 1 — so it is reached
    // alongside the Startup Scaler, not after it. Assuming one bet per pool would have
    // put this third.
    expect(searchPassFor(ASPIRING, BRIEF)?.pass).toBe(1)
  })

  it('takes the EARLIEST pool a bet appears in', () => {
    // Its companies span pools 1 and 2; the search reaches it in the first.
    const spanning = { name: 'x', where_from: 'Notion and Plaid.', thesis: '' } as never
    expect(searchPassFor(spanning, BRIEF)?.pass).toBe(1)
  })

  it('is null for a bet no pool aims at', () => {
    const orphan = { name: 'x', where_from: 'Consultancies and agencies.', thesis: '' } as never
    expect(searchPassFor(orphan, BRIEF)).toBeNull()
    expect(searchPassFor(SCALER, null)).toBeNull()
  })

  it('honours priority over array order', () => {
    const reversed = { feeder_pools: [
      { label: 'Late', priority: 9, companies: ['Stripe'] },
      { label: 'First', priority: 1, companies: ['Rippling'] },
    ] } as never
    expect(searchPassFor(SCALER, reversed)).toEqual({ pass: 1, pool: 'First' })
  })
})

describe('matching a bet to its pool by the names people actually use', () => {
  // The Strategy & Operations Manager job, as stored: the pool writes formal names, the
  // bet writes "McKinsey, Bain, or BCG". Matching only the formal name left the consulting
  // bet with no pass and sorted it LAST, though its pool is searched first.
  const SO_BRIEF = { feeder_pools: [
    { label: 'Top-Tier Management Consulting', priority: 1, companies: ['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group (BCG)'] },
    { label: 'High-Growth Startup BizOps/Strategy', priority: 2, companies: ['Udaan', 'Swiggy', 'Google (Strategy/BizOps teams)'] },
    { label: 'Investment Banking / Venture Capital', priority: 3, companies: ['Goldman Sachs', 'Sequoia Capital', 'Lightspeed Venture Partners'] },
  ] } as never
  const CONSULTING = { name: 'The Classic Post-Consulting Operator', thesis: 'A purebred problem-solver from an MBB firm.', where_from: '2-3 years as a Business Analyst or Associate at McKinsey, Bain, or BCG in Bangalore/Gurgaon.' } as never
  const IBVC = { name: 'The IB/VC Analyst', thesis: '', where_from: '2-4 years at Goldman Sachs, or as an Associate at Sequoia or Lightspeed.' } as never

  it('reads "McKinsey" as McKinsey & Company and "BCG" as Boston Consulting Group (BCG)', () => {
    expect(searchPassFor(CONSULTING, SO_BRIEF)).toEqual({ pass: 1, pool: 'Top-Tier Management Consulting' })
    expect(companiesFor(CONSULTING, SO_BRIEF)).toEqual(['McKinsey & Company', 'Bain & Company', 'Boston Consulting Group'])
  })

  it('drops fund suffixes too ("Sequoia" is Sequoia Capital)', () => {
    expect(searchPassFor(IBVC, SO_BRIEF)?.pass).toBe(3)
    expect(companiesFor(IBVC, SO_BRIEF)).toEqual(['Goldman Sachs', 'Sequoia Capital', 'Lightspeed Venture Partners'])
  })

  it('never treats a note in brackets as a short name', () => {
    expect(nameVariants('Google (Strategy/BizOps teams)')).toEqual(['Google'])
    expect(nameVariants('Boston Consulting Group (BCG)')).toEqual(['Boston Consulting Group', 'Boston Consulting', 'BCG'])
  })

  it('trusts the pool a bet names outright over its company names', () => {
    const tagged = { name: 'x', thesis: '', where_from: 'Goldman Sachs.', feeder_pool: 'top-tier management consulting' } as never
    expect(searchPassFor(tagged, SO_BRIEF)?.pass).toBe(1)
    // A label that matches no pool falls back to the company names.
    expect(searchPassFor({ ...(tagged as object), feeder_pool: 'Nowhere' } as never, SO_BRIEF)?.pass).toBe(3)
  })
})
