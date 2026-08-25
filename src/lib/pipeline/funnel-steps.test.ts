import { describe, it, expect } from 'vitest'
import {
  FUNNEL_STEPS,
  FUNNEL_STEP_IDS,
  funnelStep,
  funnelStepLabel,
  funnelStepsForZone,
  defaultFunnelStepForStageName,
} from './funnel-steps'

describe('funnel steps', () => {
  it('has unique ids and every step sits in a valid zone', () => {
    const ids = FUNNEL_STEPS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const zones = new Set(['lead', 'application_review', 'active', 'offer', 'completed'])
    expect(FUNNEL_STEPS.every(s => zones.has(s.zone))).toBe(true)
    expect(funnelStep('application_review')?.zone).toBe('application_review')
    expect(FUNNEL_STEP_IDS).toContain('recruiter_screen')
  })

  it('looks up label by id with a graceful fallback', () => {
    expect(funnelStepLabel('recruiter_screen')).toBe('Recruiter Screen')
    expect(funnelStep('offer')?.zone).toBe('offer')
    expect(funnelStepLabel('nonexistent')).toBe('nonexistent')
    expect(funnelStepLabel(null)).toBe('—')
  })

  it('offers only same-zone steps for a zone', () => {
    const lead = funnelStepsForZone('lead')
    expect(lead.length).toBeGreaterThan(0)
    expect(lead.every(s => s.zone === 'lead')).toBe(true)
    expect(lead.map(s => s.id)).toEqual(['sourced', 'outreach', 'engaged'])
  })

  it('maps seeded stage names to default steps (matches migration 131)', () => {
    expect(defaultFunnelStepForStageName('New lead')).toBe('sourced')
    expect(defaultFunnelStepForStageName('replied')).toBe('engaged')
    expect(defaultFunnelStepForStageName('Applied')).toBe('application_review')
    expect(defaultFunnelStepForStageName('Phone Screen')).toBe('recruiter_screen')
    expect(defaultFunnelStepForStageName('Offer')).toBe('offer')
    expect(defaultFunnelStepForStageName('Hired')).toBe('hired')
    // every default maps to a real canonical id
    for (const name of ['New lead', 'Applied', 'Interview', 'Offer', 'Hired']) {
      const id = defaultFunnelStepForStageName(name)
      expect(FUNNEL_STEP_IDS).toContain(id)
    }
  })

  it('returns null for custom stage names', () => {
    expect(defaultFunnelStepForStageName('Founder chat')).toBeNull()
    expect(defaultFunnelStepForStageName('Take-home')).toBeNull()
  })
})
