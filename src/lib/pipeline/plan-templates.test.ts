import { describe, it, expect } from 'vitest'
import { serializePlanStages, serializePlanRules, resolveNextStageId, resolveStageRef, isTemplatableStage } from './plan-templates'
import type { ZonedStage, PipelineAutomation } from '@/lib/types/pipeline-automations'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rule = (over: Partial<PipelineAutomation>): PipelineAutomation => ({
  id: over.id ?? 'r', org_id: 'o', job_id: 'j', stage_id: over.stage_id ?? 'screen',
  trigger: over.trigger ?? 'sla_elapsed', action_type: over.action_type ?? 'move_stage',
  uses_agent: false, mode: over.mode ?? 'auto', config: over.config ?? {}, guardrails: {},
  enabled: true, created_by: null, created_at: '', updated_at: '',
} as PipelineAutomation)

describe('serializePlanStages', () => {
  it('keeps only active + offer stages, in order', () => {
    const stages = serializePlanStages(STAGES)
    expect(stages.map(s => s.name)).toEqual(['Screening', 'Technical', 'Offer'])
    expect(stages.map(s => s.zone)).toEqual(['active', 'active', 'offer'])
  })

  it('renormalises order_index to 0..n', () => {
    expect(serializePlanStages(STAGES).map(s => s.order_index)).toEqual([0, 1, 2])
  })

  it('carries funnel_step + playbook, remapping next_stage_id to an ordinal', () => {
    const stages = serializePlanStages(STAGES)
    expect(stages[0].funnel_step).toBe('recruiter_screen')
    expect(stages[0].playbook).toEqual({
      entry_intent: 'Call them', advance_criteria: 'fit>70', reject_to: 'archive', next_stage_index: 1, // 'tech' is index 1
    })
    expect(stages[1].playbook).toBeNull()
  })
})

describe('serializePlanRules', () => {
  it('captures a custom-stage rule, referencing host + target by ordinal', () => {
    const rules = new Map<string, PipelineAutomation[]>([['screen', [
      rule({ stage_id: 'screen', action_type: 'move_stage', config: { conditions: [{ field: 'ai_score', operator: 'gte', value: 75 }], target_stage_id: 'tech' } }),
    ]]])
    const { rules: out, skippedRules } = serializePlanRules(STAGES, rules)
    expect(skippedRules).toEqual([])
    expect(out).toHaveLength(1)
    expect(out[0].on_stage).toEqual({ custom_index: 0 })   // Screening
    expect(out[0].target_stage).toEqual({ custom_index: 1 }) // Technical
    expect(out[0].config).not.toHaveProperty('target_stage_id')
    expect(out[0].config.conditions?.[0]).toMatchObject({ field: 'ai_score', value: 75 })
  })

  it('captures a FRAMEWORK-stage rule (e.g. on Applied), referencing it by name', () => {
    const rules = new Map<string, PipelineAutomation[]>([['app', [
      rule({ stage_id: 'app', action_type: 'move_stage', config: { conditions: [{ field: 'ai_score', operator: 'gte', value: 80 }], target_stage_id: 'screen' } }),
    ]]])
    const { rules: out } = serializePlanRules(STAGES, rules)
    expect(out).toHaveLength(1)
    expect(out[0].on_stage).toEqual({ framework: 'Applied' })  // by name — survives copy
    expect(out[0].target_stage).toEqual({ custom_index: 0 })   // Screening
  })

  it('skips-and-flags rules that reference a sequence or a panel', () => {
    const rules = new Map<string, PipelineAutomation[]>([
      ['screen', [rule({ stage_id: 'screen', action_type: 'enrol_outreach', config: { sequence_id: 'seq1' } })]],
      ['tech',   [rule({ stage_id: 'tech', action_type: 'schedule_interview' })]],
    ])
    const { rules: out, skippedRules } = serializePlanRules(STAGES, rules)
    expect(out).toHaveLength(0)
    expect(skippedRules).toEqual(['Screening: enrol outreach', 'Technical: schedule interview'])
  })

  it('drops the target ref when it points outside the current stages (stale id)', () => {
    const rules = new Map<string, PipelineAutomation[]>([['screen', [
      rule({ stage_id: 'screen', action_type: 'move_stage', config: { target_stage_id: 'ghost' } }),
    ]]])
    const { rules: out } = serializePlanRules(STAGES, rules)
    expect(out[0].target_stage).toBeNull()
  })
})

describe('resolveNextStageId', () => {
  it('maps a stage ordinal back to a created stage id', () => {
    const stages = serializePlanStages(STAGES)
    const created = ['id_screen', 'id_tech', 'id_offer']
    expect(resolveNextStageId(stages, created, 0)).toBe('id_tech') // Screening → Technical
    expect(resolveNextStageId(stages, created, 1)).toBeNull()
  })
})

describe('resolveStageRef', () => {
  const created = ['id_screen', 'id_tech', 'id_offer']
  const fw = new Map([['Applied', 'id_applied'], ['Hired', 'id_hired']])
  it('resolves a custom ordinal to the created stage id', () => {
    expect(resolveStageRef({ custom_index: 1 }, created, fw)).toBe('id_tech')
  })
  it('resolves a framework name to the target job stage id', () => {
    expect(resolveStageRef({ framework: 'Applied' }, created, fw)).toBe('id_applied')
  })
  it('returns null for null, out-of-range ordinal, or missing framework name', () => {
    expect(resolveStageRef(null, created, fw)).toBeNull()
    expect(resolveStageRef({ custom_index: 9 }, created, fw)).toBeNull()
    expect(resolveStageRef({ framework: 'Nope' }, created, fw)).toBeNull()
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
