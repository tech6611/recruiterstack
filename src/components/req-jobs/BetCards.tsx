'use client'

import { Briefcase, Rocket, Compass, Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react'
import type { SourcingMap, RecruiterBrief } from '@/lib/types/icp'
import { BrandIcon } from '@/components/ui/BrandIcon'

type Archetype = NonNullable<SourcingMap['archetypes']>[number]

/** Card looks, in order; a non-obvious bet always gets the gold one. */
const LOOKS = [
  { Icon: Briefcase, circle: 'bg-emerald-600', card: 'from-emerald-50 ring-emerald-100' },
  { Icon: Rocket,    circle: 'bg-sky-600',     card: 'from-sky-50 ring-sky-100' },
  { Icon: Compass,   circle: 'bg-violet-600',  card: 'from-violet-50 ring-violet-100' },
]
const GOLD = { Icon: Sparkles, circle: 'bg-gold-500', card: 'from-gold-50 ring-gold-200' }

/**
 * Feeder-pool companies an archetype's text names — archetypes carry no company list of
 * their own, so the two have to be matched up.
 *
 * MATCH ON THE BASE NAME, NOT THE DECORATED ONE. A pool lists "Google (Area 120, X)"
 * and "Meta (NPE)"; the archetype that draws on them says "Google Area 120, Meta NPE".
 * Comparing the full strings finds nothing, which is why the Big-Tech bet showed no
 * logos at all while the others showed four. The parenthetical is a note about WHICH
 * part of the company, so it is dropped for both the match and the logo lookup —
 * "Google (Area 120, X)" resolves to no logo either.
 *
 * Whole words only: a bare `includes` would let "Meta" match "metadata".
 */
export function companiesFor(a: Archetype, brief: RecruiterBrief | null | undefined): string[] {
  const text = `${a.where_from ?? ''} ${a.thesis ?? ''}`.toLowerCase()
  const out: string[] = []
  for (const raw of (brief?.feeder_pools ?? []).flatMap((p) => p.companies)) {
    const base = (raw ?? '').replace(/\s*\([^)]*\)/g, '').trim()
    if (!base || out.includes(base)) continue
    const word = new RegExp(`\\b${base.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (word.test(text)) out.push(base)
    if (out.length === 4) break
  }
  return out
}

/**
 * The ICP's archetypes ("bets") as compact people cards: a name, one line of thesis,
 * the companies they come from, and one 👍 / 👎 each. The full archetype text (where
 * from, risk) stays in the reasoning's Details.
 */
export function BetCards({ archetypes, brief }: { archetypes: Archetype[]; brief?: RecruiterBrief | null }) {
  let plain = 0
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
      {archetypes.map((a, i) => {
        const look = a.is_non_obvious ? GOLD : LOOKS[plain++ % LOOKS.length]
        const logos = companiesFor(a, brief)
        return (
          <div key={i} className={`rounded-xl bg-gradient-to-br to-white p-3 ring-1 ${look.card}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${look.circle}`}>
                <look.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900" title={a.name}>{a.name}</div>
                {a.is_non_obvious
                  ? <div className="text-[11px] font-semibold text-gold-700">✦ non-obvious</div>
                  : a.thesis && <div className="truncate text-[11px] text-slate-500" title={a.thesis}>{a.thesis}</div>}
              </div>
            </div>
            {logos.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {logos.map((c) => <span key={c} title={c}><BrandIcon name={c} size={20} /></span>)}
              </div>
            )}
            {(a.why_interested || a.why_no) && (
              <div className="mt-2.5 space-y-0.5 text-[11px]">
                {a.why_interested && (
                  <div className="flex items-center gap-1.5 text-emerald-700" title={a.why_interested}>
                    <ThumbsUp className="h-3 w-3 shrink-0" /><span className="truncate">{a.why_interested}</span>
                  </div>
                )}
                {a.why_no && (
                  <div className="flex items-center gap-1.5 text-rose-600" title={a.why_no}>
                    <ThumbsDown className="h-3 w-3 shrink-0" /><span className="truncate">{a.why_no}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
