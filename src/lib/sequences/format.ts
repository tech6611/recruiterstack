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
