import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The single surface primitive for the app. Every "card" should be a <Card>
 * (or a section/divider) — not an inline `rounded-* border bg-white` string —
 * so surfaces stay consistent instead of drifting.
 *
 * Variants (pick by intent, not by looks):
 *  - 'flat'        (default) hairline-bordered surface, no shadow. The workhorse.
 *  - 'elevated'    a raised surface with a soft shadow. Reserve for the few
 *                  things that genuinely deserve emphasis.
 *  - 'interactive' flat, but lifts on hover. Use for clickable cards.
 *  - 'ghost'       no border/background — a grouping container only.
 *
 * `padded` adds the standard inner padding so simple cards don't need a
 * CardContent wrapper. Composite cards (header/content/footer) leave it off.
 */
type CardVariant = 'flat' | 'elevated' | 'interactive' | 'ghost'

const VARIANTS: Record<CardVariant, string> = {
  flat:        'border border-slate-200 bg-white',
  elevated:    'border border-slate-200 bg-white shadow-sm',
  interactive: 'border border-slate-200 bg-white transition-all hover:border-slate-300 hover:shadow-sm',
  ghost:       'border border-transparent bg-transparent',
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padded?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'flat', padded = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl',
        VARIANTS[variant],
        padded && 'p-5',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 pt-5 pb-3', className)} {...props} />
  ),
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('font-display text-base font-semibold tracking-tight text-slate-900', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('mt-0.5 text-sm text-slate-500', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 py-4', className)} {...props} />
  ),
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-3 px-5 pb-5 pt-3', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'

/**
 * A boxed panel with a consistent header bar (icon + title + optional meta/action)
 * on top of the shared <Card>. This is the replacement for the hand-copied
 * `rounded-2xl border bg-white` + header block that was duplicated on nearly
 * every detail screen. Children render directly below the header, so each caller
 * controls its own body padding.
 */
export function Panel({
  icon: Icon, title, meta, action, children, className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
          <h3 className="font-display text-sm font-semibold text-slate-900">{title}</h3>
          {meta && <span className="truncate text-[10px] text-slate-400">{meta}</span>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

/**
 * A titled section *without* a box — the primary tool for "dissolving" card
 * clutter. Use this instead of a Card when a region just needs a heading and
 * separation (a divider above), not its own raised surface.
 */
export const Section = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; action?: React.ReactNode }>(
  ({ className, title, action, children, ...props }, ref) => (
    <section ref={ref} className={cn('space-y-3', className)} {...props}>
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title && <h3 className="font-display text-sm font-semibold tracking-tight text-slate-900">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  ),
)
Section.displayName = 'Section'
