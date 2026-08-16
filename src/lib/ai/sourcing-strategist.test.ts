import { describe, it, expect } from 'vitest'
import { buildRoleAnalysisPrompt } from './sourcing-strategist'
import type { HiringRequest } from '@/lib/types/database'

const job = {
  position_title: 'Engineering Manager',
  level: 'senior',
  location: 'Bengaluru',
  remote_ok: false,
  key_requirements: '7+ years engineering; 3+ years managing engineers',
  nice_to_haves: 'Payments domain',
  team_context: 'Own a team of 5 building the payments platform',
  target_companies: 'Razorpay, Stripe',
  generated_jd: 'Lead a team building scalable payment services.',
} as unknown as HiringRequest

describe('buildRoleAnalysisPrompt', () => {
  it('frames the task as explain-and-pressure-test, not rewrite, and includes the drafted ICP', () => {
    const p = buildRoleAnalysisPrompt(
      job,
      [{ name: 'Team Development & Leadership', weight: 35 }, { name: 'Technical Vision', weight: 25 }],
      [{ label: '3+ years people management' }],
    )
    expect(p).toContain('Engineering Manager')
    expect(p).toContain('Team Development & Leadership (35%)')
    expect(p).toContain('3+ years people management')
    expect(p.toLowerCase()).toContain('not to rewrite it')
    // the three buckets are named
    expect(p).toContain('hard_filter')
    expect(p).toContain('ranking_signal')
    expect(p).toContain('screen_later')
    // asks for the unwritten filters
    expect(p).toContain('unwritten_filters')
    expect(p).toContain('exclusion_cost')
    // asks for 2–4 distinct archetypes incl. a non-obvious one
    expect(p).toContain('archetypes')
    expect(p.toLowerCase()).toContain('non-obvious')
    expect(p).toContain('is_non_obvious')
  })

  it('degrades gracefully with sparse inputs', () => {
    const p = buildRoleAnalysisPrompt({ position_title: 'Analyst' } as unknown as HiringRequest, [], [])
    expect(p).toContain('Analyst')
    expect(p).toContain('(none)')
  })
})
