import { describe, it, expect } from 'vitest'
import { companiesFor } from './BetCards'

/** The real approved ICP for "Founding Engineering Manager" (v5). */
const BRIEF = {
  feeder_pools: [
    { label: 'High-Growth, Product-First Startups (Series A-C)', companies: ['Rippling', 'Deel', 'Ramp', 'Vanta', 'Notion', 'Retool', 'Brex'] },
    { label: "Established 'Unicorns' with Strong Eng Culture", companies: ['Stripe', 'Plaid', 'Airtable', 'Datadog', 'Figma'] },
    { label: "Big Tech '0-to-1' Internal Teams", companies: ['Google (Area 120, X)', 'Meta (NPE)', 'Microsoft (Incubation)'] },
  ],
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
