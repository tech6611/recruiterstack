import { describe, it, expect } from 'vitest'
import { buildScreeningQuestionsPrompt, buildScreeningScorePrompt } from './screening'
import type { Icp } from '@/lib/types/icp'

const icp = {
  competencies: [
    { id: 'technical', name: 'Technical depth', weight: 60, behaviours: ['writes clean code'], anchors: { '1': 'a', '2': 'b', '3': 'c', '4': 'd' } },
    { id: 'comms', name: 'Communication', weight: 40, behaviours: [] },
  ],
} as unknown as Icp

describe('buildScreeningQuestionsPrompt', () => {
  it('lists each competency by id and asks for tagged questions', () => {
    const p = buildScreeningQuestionsPrompt(icp, 'Backend Engineer')
    expect(p).toContain('Backend Engineer')
    expect(p).toContain('id "technical"')
    expect(p).toContain('id "comms"')
    expect(p).toContain('competency_id')
  })
})

describe('buildScreeningScorePrompt', () => {
  it('embeds the Q&A transcript and the competency weights/anchors', () => {
    const p = buildScreeningScorePrompt(icp, [
      { question: 'Tell me about a hard bug.', competency_id: 'technical', answer: 'I traced a race condition.' },
      { question: 'How do you explain tradeoffs?', competency_id: 'comms', answer: '' },
    ])
    expect(p).toContain('I traced a race condition.')
    expect(p).toContain('(no answer)') // empty answer degrades visibly
    expect(p).toContain('weight 60%')
    expect(p).toContain('Anchors')
  })
})
