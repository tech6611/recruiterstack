import { describe, it, expect } from 'vitest'
import { buildLifecycleBlocks, buildSearchResultsBlocks } from '@/lib/slack/blocks'

// Small helpers to inspect the generated Block Kit.
function actionsBlock(blocks: unknown[]) {
  return blocks.find(b => (b as { type?: string }).type === 'actions') as
    | { type: 'actions'; elements: Array<{ action_id?: string; url?: string }> }
    | undefined
}
function actionIds(blocks: unknown[]): string[] {
  return (actionsBlock(blocks)?.elements ?? []).map(e => e.action_id ?? '')
}

describe('buildLifecycleBlocks', () => {
  it('renders the summary text as a section', () => {
    const blocks = buildLifecycleBlocks({ event: 'candidate_applied', text: 'hello *world*' })
    const section = blocks[0] as { type: string; text: { type: string; text: string } }
    expect(section.type).toBe('section')
    expect(section.text.text).toBe('hello *world*')
  })

  it('candidate_applied → Move-stage, Add-note and Open buttons', () => {
    const blocks = buildLifecycleBlocks({
      event: 'candidate_applied', text: 't', applicationId: 'app-1', candidateId: 'cand-1',
    })
    expect(actionIds(blocks)).toEqual(['app:move_stage', 'app:add_note', 'app:open'])
    const open = actionsBlock(blocks)!.elements.find(e => e.action_id === 'app:open')
    expect(open?.url).toContain('/candidates/cand-1')
  })

  it('candidate_hired omits Move-to-next-stage (already at the end)', () => {
    const blocks = buildLifecycleBlocks({
      event: 'candidate_hired', text: 't', applicationId: 'app-1', candidateId: 'cand-1',
    })
    expect(actionIds(blocks)).not.toContain('app:move_stage')
    expect(actionIds(blocks)).toContain('app:add_note')
  })

  it('without an applicationId there are no interactive buttons', () => {
    const blocks = buildLifecycleBlocks({ event: 'stage_moved', text: 't' })
    expect(actionsBlock(blocks)).toBeUndefined()
    expect(blocks).toHaveLength(1)
  })

  it('without a candidateId the Open link is dropped but actions remain', () => {
    const blocks = buildLifecycleBlocks({ event: 'stage_moved', text: 't', applicationId: 'app-1' })
    expect(actionIds(blocks)).toEqual(['app:move_stage', 'app:add_note'])
  })
})

describe('buildSearchResultsBlocks', () => {
  const row = (over = {}) => ({ candidateId: 'c1', name: 'Jane', title: 'Eng', status: 'active', jobs: ['Backend'], ...over })

  it('renders a count header and a section per candidate with an Open link', () => {
    const blocks = buildSearchResultsBlocks('jane', [row(), row({ candidateId: 'c2', name: 'John' })])
    const dump = JSON.stringify(blocks)
    expect(dump).toContain('*2* candidates matching')
    expect(dump).toContain('/candidates/c1')
    expect(dump).toContain('/candidates/c2')
  })

  it('shows an empty-state message when there are no rows', () => {
    const blocks = buildSearchResultsBlocks('zzz', [])
    expect(JSON.stringify(blocks)).toContain('No candidates matching')
  })

  it('caps the list at 10 and notes the overflow', () => {
    const rows = Array.from({ length: 14 }, (_, i) => row({ candidateId: `c${i}`, name: `Cand ${i}` }))
    const blocks = buildSearchResultsBlocks('a', rows)
    const dump = JSON.stringify(blocks)
    expect(dump).toContain('and 4 more')
    // 10 candidate sections shown, not 14
    expect(dump).toContain('/candidates/c9')
    expect(dump).not.toContain('/candidates/c10')
  })
})
