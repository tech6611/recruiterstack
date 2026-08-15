import { describe, it, expect } from 'vitest'
import { candidateEmbeddingText, icpEmbeddingText } from './embeddings'
import type { Candidate } from '@/lib/types/database'
import type { Icp } from '@/lib/types/icp'

describe('candidateEmbeddingText', () => {
  it('joins title, company and skills, dropping empties', () => {
    const c = { current_title: 'Growth Lead', current_company: 'Acme', skills: ['SQL', 'Python'] } as Pick<Candidate, 'current_title' | 'current_company' | 'skills'>
    expect(candidateEmbeddingText(c)).toBe('Growth Lead · Acme · SQL, Python')
  })

  it('handles missing fields', () => {
    const c = { current_title: null, current_company: null, skills: [] } as Pick<Candidate, 'current_title' | 'current_company' | 'skills'>
    expect(candidateEmbeddingText(c)).toBe('')
  })
})

describe('icpEmbeddingText', () => {
  it('includes competency names with behaviours and must-have labels', () => {
    const icp = {
      competencies: [
        { id: 't', name: 'Technical', weight: 60, behaviours: ['builds models', 'queries SQL'] },
        { id: 'c', name: 'Culture', weight: 40, behaviours: [] },
      ],
      must_haves: [{ id: 'g', label: '5+ years', attribute: 'min_experience', operator: 'gte', value: '5' }],
    } as Pick<Icp, 'competencies' | 'must_haves'>
    const text = icpEmbeddingText(icp)
    expect(text).toContain('Technical: builds models; queries SQL')
    expect(text).toContain('Culture')
    expect(text).toContain('5+ years')
  })
})
