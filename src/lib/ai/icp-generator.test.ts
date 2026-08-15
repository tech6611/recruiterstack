import { describe, it, expect } from 'vitest'
import { mergeEnrichment, type IcpEnrichment } from './icp-generator'
import type { IcpDraftInput } from '@/lib/types/icp'

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
