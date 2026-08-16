import { describe, it, expect } from 'vitest'
import { buildNotesPrompt, buildScorecardPrompt } from './notetaker'

const comps = [{ id: 'technical', name: 'Technical depth' }, { id: 'comms', name: 'Communication' }]

describe('buildNotesPrompt', () => {
  it('lists each competency and embeds the transcript, asking for objective notes', () => {
    const p = buildNotesPrompt('Candidate described sharding a database.', comps)
    expect(p).toContain('Technical depth')
    expect(p).toContain('Communication')
    expect(p).toContain('sharding a database')
    expect(p.toLowerCase()).toContain('do not invent facts')
  })
  it('handles an empty transcript and no competencies gracefully', () => {
    const p = buildNotesPrompt('', [])
    expect(p).toContain('(empty transcript)')
    expect(p).toContain('no ICP competencies')
  })
})

describe('buildScorecardPrompt', () => {
  it('asks for 1–4 ratings per criterion and no overall recommendation', () => {
    const p = buildScorecardPrompt('They shipped a payments system.', comps)
    expect(p).toContain('Technical depth')
    expect(p).toContain('shipped a payments system')
    expect(p.toLowerCase()).toContain('do not decide an overall recommendation')
    expect(p).toContain('rating 1–4')
  })
})
