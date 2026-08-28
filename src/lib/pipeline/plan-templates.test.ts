import { describe, it, expect } from 'vitest'
import { serializePlanStages, resolveNextStageId, isTemplatableStage } from './plan-templates'
import type { ZonedStage } from '@/lib/types/pipeline-automations'

const mk = (over: Partial<ZonedStage> & { id: string; zone: ZonedStage['zone']; order_index: number }): ZonedStage => ({
  id: over.id,
  name: over.name ?? over.id,
  order_index: over.order_index,
  zone: over.zone,
  is_promotion_gate: over.is_promotion_gate ?? false,
  funnel_step: over.funnel_step ?? null,
  candidate_count: 0,
  interview_panel: null,
  playbook: over.playbook,
})

// A realistic plan: lead ladder + Applied (application_review) + two active + one
// offer + Hired. Only the active + offer stages are templatable.
const STAGES: ZonedStage[] = [
  mk({ id: 'lead1', zone: 'lead', order_index: -3, name: 'New lead' }),
  mk({ id: 'app', zone: 'application_review', order_index: 0, name: 'Applied' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mk({ id: 'screen', zone: 'active', order_index: 1, name: 'Screening', funnel_step: 'recruiter_screen',
       playbook: { id: 'p1', org_id: 'o', stage_id: 'screen', entry_intent: 'Call them', advance_criteria: 'fit>70', next_stage_id: 'tech', reject_to: 'archive', created_at: '', updated_at: '' } as any }),
  mk({ id: 'tech', zone: 'active', order_index: 2, name: 'Technical' }),
  mk({ id: 'offer', zone: 'offer', order_index: 4, name: 'Offer', funnel_step: 'offer' }),
  mk({ id: 'hired', zone: 'completed', order_index: 5, name: 'Hired' }),
]

describe('serializePlanStages', () => {
  it('keeps only active + offer stages, in order', () => {
    const out = serializePlanStages(STAGES)
    expect(out.map(s => s.name)).toEqual(['Screening', 'Technical', 'Offer'])
    expect(out.map(s => s.zone)).toEqual(['active', 'active', 'offer'])
  })

  it('renormalises order_index to 0..n', () => {
    expect(serializePlanStages(STAGES).map(s => s.order_index)).toEqual([0, 1, 2])
  })

  it('carries funnel_step + playbook, remapping next_stage_id to an ordinal', () => {
    const out = serializePlanStages(STAGES)
    expect(out[0].funnel_step).toBe('recruiter_screen')
    expect(out[0].playbook).toEqual({
      entry_intent: 'Call them', advance_criteria: 'fit>70', reject_to: 'archive', next_stage_index: 1, // 'tech' is index 1
    })
    expect(out[1].playbook).toBeNull()
  })

  it('sets next_stage_index null when the pointer is outside the templated set', () => {
    // 'tech' → next points at 'hired' (completed, not templated) → null
    const withPtr = STAGES.map(s => s.id === 'tech'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? mk({ id: 'tech', zone: 'active', order_index: 2, name: 'Technical', playbook: { id: 'p2', org_id: 'o', stage_id: 'tech', entry_intent: null, advance_criteria: null, next_stage_id: 'hired', reject_to: 'archive', created_at: '', updated_at: '' } as any })
      : s)
    const out = serializePlanStages(withPtr)
    expect(out[1].playbook?.next_stage_index).toBeNull()
  })
})

describe('resolveNextStageId', () => {
  it('maps a stage ordinal back to a created stage id', () => {
    const tpl = serializePlanStages(STAGES)
    const created = ['id_screen', 'id_tech', 'id_offer']
    expect(resolveNextStageId(tpl, created, 0)).toBe('id_tech') // Screening → Technical
    expect(resolveNextStageId(tpl, created, 1)).toBeNull()
  })
})

describe('isTemplatableStage', () => {
  it('is true only for active + offer', () => {
    expect(isTemplatableStage('active')).toBe(true)
    expect(isTemplatableStage('offer')).toBe(true)
    expect(isTemplatableStage('lead')).toBe(false)
    expect(isTemplatableStage('application_review')).toBe(false)
    expect(isTemplatableStage('completed')).toBe(false)
  })
})
