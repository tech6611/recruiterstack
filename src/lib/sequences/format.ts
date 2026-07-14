// Human-readable label for a stage's configured delay. Unlike the scheduler
// (which also applies business-hours windows and next-occurrence rules), this is
// a plain description of the delay the user set — days + hours + minutes.

export function formatStageDelay(opts: {
  delayDays: number
  delayMinutes?: number | null
  businessDays?: boolean | null
}): string {
  const days = opts.delayDays || 0
  const totalMinutes = opts.delayMinutes ?? 0
  if (days === 0 && totalMinutes === 0) return 'Immediate'

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${opts.businessDays ? 'business ' : ''}day${days > 1 ? 's' : ''}`)

  const hours = Math.floor(totalMinutes / 60)
  const mins  = totalMinutes % 60
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`)
  if (mins > 0)  parts.push(`${mins} min`)

  return `+${parts.join(' ')}`
}

// Plain-language description of an auto-enroll rule's trigger, e.g.
// "When a candidate is tagged “passive-lead”". Used to show the rules a sequence
// runs on before any candidate has actually been enrolled.

export type SequenceRuleTrigger = 'tag_added' | 'stage_moved' | 'applied' | 'status_changed'

const RULE_TRIGGER_LABEL: Record<SequenceRuleTrigger, string> = {
  tag_added: 'When a candidate is tagged',
  stage_moved: 'When an application moves to stage',
  applied: 'When someone applies',
  status_changed: 'When application status changes to',
}

export function describeSequenceRule(rule: {
  trigger_type: SequenceRuleTrigger
  trigger_value?: string | null
}): string {
  const base = RULE_TRIGGER_LABEL[rule.trigger_type] ?? 'When an event fires'
  const val = (rule.trigger_value ?? '').trim()
  if (rule.trigger_type !== 'applied' && val) return `${base} \u201C${val}\u201D`
  return base
}
