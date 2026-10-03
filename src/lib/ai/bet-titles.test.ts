import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ai/llm', () => ({ generateText: vi.fn() }))
vi.mock('@/lib/ai/track-usage', () => ({ trackUsage: vi.fn() }))

import { generateText } from '@/lib/ai/llm'
import { onlyLevelWords, buildBetTitlesPrompt, suggestBetTitles } from './bet-titles'
import { repairLevelWordPools, type ReasoningFirstGeneration } from './icp-generator'
import type { HiringRequest } from '@/lib/types/database'

const reply = (o: unknown) => vi.mocked(generateText).mockResolvedValueOnce({ text: JSON.stringify(o), usage: {}, model: 'gemini-2.5-flash' } as never)

describe('bet titles from the recruiter brain', () => {
  it('a list of bare level words is unsearchable, in any industry', () => {
    expect(onlyLevelWords(['Analyst', 'Associate'])).toBe(true)
    expect(onlyLevelWords(['Senior', 'Lead'])).toBe(true)
    expect(onlyLevelWords(['Charge Nurse', 'Associate'])).toBe(false)
    expect(onlyLevelWords([])).toBe(false)
  })

  it('the prompt carries the job, the bet and the real titles seen at its companies', () => {
    const p = buildBetTitlesPrompt({
      role: { title: 'ICU Nurse Manager', niche: 'Critical-care nursing recruiter, Pune' },
      bet: { label: 'Tertiary-care ICU leads', companies: ['Ruby Hall Clinic'], titles: ['Senior', 'Lead'] },
      observed: [{ title: 'Staff Nurse - ICU', count: 9 }, { title: 'Billing Executive', count: 4 }],
    })
    expect(p).toContain('ICU Nurse Manager')
    expect(p).toContain('Ruby Hall Clinic')
    expect(p).toContain('Staff Nurse - ICU (9)')
    expect(p).not.toMatch(/Investment Banking|Goldman/)
  })

  it('drops any bare level word the model still returns', async () => {
    reply({ line_of_work: 'IB deal teams', titles: [{ title: 'Investment Banking Analyst' }, { title: 'Associate' }], exclusions: [{ title: 'Software Engineer' }] })
    const out = await suggestBetTitles({ role: { title: 'S&O Manager' }, bet: { label: 'IB', companies: ['Goldman Sachs'], titles: ['Analyst'] } })
    expect(out.titles.map((t) => t.title)).toEqual(['Investment Banking Analyst'])
    expect(out.exclusions.map((t) => t.title)).toEqual(['Software Engineer'])
  })

  it('the brief repairs only the pools written as level words; the rest cost nothing', async () => {
    vi.mocked(generateText).mockClear()
    reply({ line_of_work: 'investment banking', titles: [{ title: 'Investment Banking Analyst' }, { title: 'Private Equity Associate' }], exclusions: [{ title: 'Software Engineer' }] })
    const g = {
      recruiter_brief: { niche: 'S&O recruiter', feeder_pools: [
        { label: 'MBB', companies: ['McKinsey'], role_types: ['Business Analyst', 'Associate'] },
        { label: 'IB / VC', companies: ['Goldman Sachs'], role_types: ['Analyst', 'Associate'] },
      ] },
      archetypes: [{ name: 'The IB/VC Analyst', thesis: 'quant', feeder_pool: 'IB / VC' }],
      competencies: [{ name: 'x', weight: 100 }],
    } as unknown as ReasoningFirstGeneration
    const out = await repairLevelWordPools(g, { position_title: 'Strategy & Operations Manager' } as HiringRequest)
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(out.recruiter_brief!.feeder_pools[0].role_types).toEqual(['Business Analyst', 'Associate'])
    expect(out.recruiter_brief!.feeder_pools[1]).toMatchObject({ role_types: ['Investment Banking Analyst', 'Private Equity Associate'], title_exclusions: ['Software Engineer'], line_of_work: 'investment banking' })
  })

  it('a failed repair keeps the pool as written', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('down'))
    const g = { recruiter_brief: { feeder_pools: [{ label: 'IB', companies: ['Goldman Sachs'], role_types: ['Analyst'] }] }, archetypes: [], competencies: [] } as unknown as ReasoningFirstGeneration
    const out = await repairLevelWordPools(g, { position_title: 'X' } as HiringRequest)
    expect(out.recruiter_brief!.feeder_pools[0].role_types).toEqual(['Analyst'])
  })
})
