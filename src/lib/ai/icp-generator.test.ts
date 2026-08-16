import { describe, it, expect } from 'vitest'
import { mergeEnrichment, normalizeWeights, buildIcpFromGeneration, type IcpEnrichment } from './icp-generator'
import type { IcpDraftInput } from '@/lib/types/icp'
import type { HiringRequest } from '@/lib/types/database'

const seed: IcpDraftInput = {
  source: 'seed',
  must_haves: [
    { id: 'location', label: 'Based in Bengaluru', attribute: 'location', operator: 'equals', value: 'Bengaluru' },
  ],
  competencies: [
    { id: 'technical', name: 'Technical Skills', weight: 35, behaviours: [] },
    { id: 'culture', name: 'Culture Fit', weight: 20, behaviours: [] },
  ],
}

describe('mergeEnrichment', () => {
  it('attaches behaviours/anchors/verbatim by id while preserving weights and names', () => {
    const enrichment: IcpEnrichment = {
      must_haves: [],
      competencies: [
        {
          id: 'technical',
          behaviours: ['ships without hand-holding', 'owns a service end to end'],
          anchors: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' },
          verbatim: 'must be able to de-risk a launch',
        },
      ],
    }
    const out = mergeEnrichment(seed, enrichment)
    const tech = out.competencies.find((c) => c.id === 'technical')!
    expect(tech).toMatchObject({ name: 'Technical Skills', weight: 35 }) // untouched
    expect(tech.behaviours).toEqual(['ships without hand-holding', 'owns a service end to end'])
    expect(tech.anchors).toEqual({ '1': 'a', '2': 'b', '3': 'c', '4': 'd' })
    expect(tech.verbatim).toBe('must be able to de-risk a launch')
    // source flips to 'intake' (LLM-enriched)
    expect(out.source).toBe('intake')
  })

  it('leaves competencies without a matching enrichment id unchanged', () => {
    const out = mergeEnrichment(seed, { must_haves: [], competencies: [{ id: 'technical', behaviours: ['x'] }] })
    const culture = out.competencies.find((c) => c.id === 'culture')!
    expect(culture.behaviours).toEqual([]) // no enrichment for 'culture'
  })

  it('caps behaviours at 6 and drops empties', () => {
    const enrichment: IcpEnrichment = {
      must_haves: [],
      competencies: [{ id: 'technical', behaviours: ['a', '', '  ', 'b', 'c', 'd', 'e', 'f', 'g'] }],
    }
    const tech = mergeEnrichment(seed, enrichment).competencies.find((c) => c.id === 'technical')!
    expect(tech.behaviours).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('keeps seed gates first and appends only novel model gates, de-duped', () => {
    const enrichment: IcpEnrichment = {
      must_haves: [
        // duplicate of the seed location gate (different casing) — should drop
        { label: 'Bengaluru', attribute: 'location', operator: 'equals', value: 'bengaluru' },
        // novel gate — should be kept and get an id
        { label: '5+ years', attribute: 'min_experience', operator: 'gte', value: '5' },
      ],
      competencies: [],
    }
    const out = mergeEnrichment(seed, enrichment)
    expect(out.must_haves.map((g) => g.attribute)).toEqual(['location', 'min_experience'])
    expect(out.must_haves[1].id).toMatch(/^g-ai-/)
  })
})

describe('normalizeWeights', () => {
  it('rescales arbitrary weights to sum exactly 100', () => {
    expect(normalizeWeights([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(normalizeWeights([30, 30, 30]).reduce((a, b) => a + b, 0)).toBe(100)
    expect(normalizeWeights([50, 25, 25])).toEqual([50, 25, 25])
  })
  it('handles empty / zero input without NaN', () => {
    expect(normalizeWeights([])).toEqual([])
    expect(normalizeWeights([0, 0]).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('buildIcpFromGeneration', () => {
  const job = { position_title: 'Payments Engineer', level: 'senior', location: 'Bengaluru', remote_ok: false } as unknown as HiringRequest

  it('derives role-specific competencies with slugged ids and weights summing to 100', () => {
    const out = buildIcpFromGeneration(job, {
      competencies: [
        { name: 'Payments domain depth', weight: 40, behaviours: ['designs ledgers'] },
        { name: 'Systems reliability', weight: 35, behaviours: [] },
        { name: 'Communication', weight: 25, behaviours: [] },
      ],
      must_haves: [{ label: '5+ yrs payments', attribute: 'min_experience', operator: 'gte', value: '5' }],
    })
    expect(out.competencies.map((c) => c.id)).toContain('payments-domain-depth')
    expect(out.competencies.reduce((s, c) => s + c.weight, 0)).toBe(100)
    // structural seed gates (location/seniority) are preserved, model gate appended
    expect(out.must_haves.some((g) => g.attribute === 'location')).toBe(true)
    expect(out.must_haves.some((g) => g.attribute === 'min_experience')).toBe(true)
  })

  it('makes duplicate competency names unique', () => {
    const out = buildIcpFromGeneration(job, {
      competencies: [
        { name: 'Depth', weight: 50, behaviours: [] },
        { name: 'Depth', weight: 50, behaviours: [] },
      ],
      must_haves: [],
    })
    const ids = out.competencies.map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })
})
