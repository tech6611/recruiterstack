import { cn } from '@/lib/utils'

interface CharCounterProps {
  value: string
  max: number
  /** When set, the counter nudges the writer until they reach this length. */
  min?: number
  className?: string
}

/**
 * Live "characters left" readout for a text field. Counts down as the writer
 * types (max − current). Turns amber while a minimum isn't met yet and red if
 * the max is exceeded, so the limits enforced server-side are visible up front.
 */
export function CharCounter({ value, max, min, className }: CharCounterProps) {
  const len = value.length
  const remaining = max - len
  const belowMin = min != null && len > 0 && len < min
  const over = remaining < 0

  const text = belowMin
    ? `${min - len} more character${min - len === 1 ? '' : 's'} needed`
    : `${remaining.toLocaleString()} character${remaining === 1 ? '' : 's'} left`

  return (
    <p
      className={cn(
        'text-right text-[11px] tabular-nums',
        over ? 'text-red-500' : belowMin ? 'text-amber-500' : 'text-slate-400',
        className,
      )}
    >
      {text}
    </p>
  )
}
