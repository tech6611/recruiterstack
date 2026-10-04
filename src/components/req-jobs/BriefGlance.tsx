'use client'

import { useState } from 'react'
import {
  Compass, MapPin, Clock, ShieldCheck, Wallet, Hourglass, Plane, Truck, BadgeCheck, Search, Repeat, Languages,
  HelpCircle, Mic, Lightbulb, ChevronDown, ChevronRight, Pencil, Store, Info, type LucideIcon,
} from 'lucide-react'
import { RecruiterBriefBody } from '@/components/req-jobs/RecruiterBriefCard'
import type { NormKind, RecruiterBrief } from '@/lib/types/icp'

/**
 * The recruiter brief AT A GLANCE — the top of Scoring. Every long brief line becomes an
 * icon tile with a few words (the AI's short tag), grouped Must · Market · JD reads as ·
 * Ask; the long line is on hover. The pencil opens `editor` (talk to the brief) above
 * the brief in full. `children` sit at the foot of the card (the scoring weights).
 * Pure props.
 */
export function BriefGlance({
  brief, reasoning, reasoningShort, probes, editor, children,
}: {
  brief: RecruiterBrief | null
  reasoning?: string | null
  reasoningShort?: string | null
  /** The screen_later requirements — asked in the AI screen, never filtered on. */
  probes: { requirement: string; short?: string | null }[]
  /** Shown when the pencil is open, above the brief in full; `close` shuts the pencil. */
  editor?: (close: () => void) => React.ReactNode
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const groups = briefGroups(brief, probes)
  const thesis = reasoningShort?.trim() || (reasoning ? clip(reasoning, 110) : '')
  const persona = brief?.persona_short?.trim() || (brief?.persona ? clip(brief.persona, 70) : '')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><Compass className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">{brief?.niche || 'Recruiter brief'}</div>
          {persona && <div className="text-[11px] text-slate-500" title={brief?.persona}>{persona}</div>}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} title="Edit the brief by telling the AI what to change, and read it in full"
          className={`ml-auto grid h-8 w-8 place-items-center rounded-full ring-1 ${open ? 'bg-indigo-600 text-white ring-indigo-600' : 'text-slate-500 ring-slate-200 hover:bg-slate-50 hover:text-slate-800'}`}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {thesis && (
        <div className="mt-3 flex items-start gap-2 text-[13px] text-slate-700" title={reasoning ?? undefined}>
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{thesis}
        </div>
      )}

      {groups.length > 0 ? (
        <div className="mt-3 space-y-2">
          {groups.map(({ title, Icon, facts }) => (
            <div key={title} className="grid gap-2 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" />{title}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {facts.map((f, i) => <Tile key={i} f={f} />)}
              </div>
            </div>
          ))}
        </div>
      ) : !brief && (
        <p className="mt-3 text-xs text-slate-400">No brief yet — Regenerate, or click the pencil to steer it.</p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          {editor?.(() => setOpen(false))}
          <details className="group rounded-lg border border-slate-200 bg-slate-50/60">
            <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-800">
              <ChevronRight className="h-3 w-3 group-open:hidden" /><ChevronDown className="hidden h-3 w-3 group-open:block" /> The brief in full
            </summary>
            <RecruiterBriefBody brief={brief} />
            {reasoning && <p className="border-t border-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">{reasoning}</p>}
          </details>
        </div>
      )}

      {children}
    </div>
  )
}

type Tone = 'must' | 'ask' | 'probe' | 'means' | 'plain'
export interface GlanceFact { Icon: LucideIcon; label: string; short: string; full: string; tone: Tone }
export interface GlanceGroup { title: string; Icon: LucideIcon; facts: GlanceFact[] }

const NORM_ICON: Record<NormKind, LucideIcon> = {
  pay: Wallet, notice: Hourglass, visa: Plane, relocation: Truck, titles: BadgeCheck, findability: Search, other: Info,
}

/**
 * One brief line: no box, a thin rule, a grey icon — red only for a must-have, so the
 * lines that reject someone are the ones that stand out.
 */
function Tile({ f }: { f: GlanceFact }) {
  return (
    <div title={f.full} className="flex items-center gap-2 border-l-2 border-slate-100 py-0.5 pl-2 text-slate-800">
      <span className={`grid h-5 w-4 shrink-0 place-items-center ${f.tone === 'must' ? 'text-rose-500' : 'text-slate-400'}`}><f.Icon className="h-3 w-3" /></span>
      <span className="min-w-0">
        <span className="block truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</span>
        <span className="block text-[12px] font-medium leading-tight">{f.short}</span>
      </span>
    </div>
  )
}

/**
 * Cut a long brief line to a tile: its first sentence when that is short enough, else
 * up to the last whole word that fits, with an ellipsis. Only for briefs written before
 * the AI wrote short tags. PURE.
 */
export function clip(text: string, max = 36): string {
  const s = text.trim().replace(/\s+/g, ' ')
  const first = s.match(/^.+?[.!?](?=\s|$)/)?.[0]
  const one = first && first.length <= max ? first.replace(/[.!?]$/, '') : s
  if (one.length <= max) return one
  const cut = one.slice(0, max + 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > max / 2 ? cut.slice(0, at) : one.slice(0, max)).replace(/[\s,;:·—-]+$/, '')}…`
}

const tag = (short: string | null | undefined, long: string) => short?.trim() || clip(long)

/** The brief's lines as tiles, in their groups; empty groups are left out. PURE. */
export function briefGroups(b: RecruiterBrief | null, probes: { requirement: string; short?: string | null }[]): GlanceGroup[] {
  const must: GlanceFact[] = []
  const band = b?.experience_band
  if (band && (band.min_years != null || band.max_years != null)) {
    const years = band.min_years != null && band.max_years != null ? `${band.min_years}–${band.max_years} yrs`
      : band.min_years != null ? `${band.min_years}+ yrs` : `Up to ${band.max_years} yrs`
    must.push({ Icon: Clock, label: 'Experience', short: years, full: band.rationale ?? years, tone: 'must' })
  }
  for (const g of b?.market_gates ?? []) {
    must.push({ Icon: ShieldCheck, label: 'Must have', short: tag(g.short, g.requirement), full: g.why ? `${g.requirement} — ${g.why}` : g.requirement, tone: 'must' })
  }
  if (b?.market) must.push({ Icon: MapPin, label: 'Where', short: tag(b.market_short, b.market), full: b.market, tone: 'plain' })

  const market: GlanceFact[] = [
    ...(b?.market_norms ?? []).map((n): GlanceFact => ({ Icon: NORM_ICON[n.kind ?? 'other'] ?? Info, label: n.topic, short: tag(n.short, n.norm), full: n.norm, tone: 'plain' })),
    ...(b?.normal_red_flags ?? []).map((f, i): GlanceFact => ({ Icon: Repeat, label: 'Fine here', short: tag(b?.normal_red_flags_short?.[i], f), full: f, tone: 'plain' })),
  ]
  const means = (b?.jd_translations ?? []).map((t): GlanceFact => ({
    Icon: Languages, label: `“${clip(t.phrase, 22)}”`, short: tag(t.short, t.means_here), full: `“${t.phrase}” → ${t.means_here}`, tone: 'means',
  }))
  const ask: GlanceFact[] = [
    ...(b?.unsure_about ?? []).map((u, i): GlanceFact => ({ Icon: HelpCircle, label: 'Ask the HM', short: tag(b?.unsure_about_short?.[i], u), full: u, tone: 'ask' })),
    ...probes.map((p): GlanceFact => ({ Icon: Mic, label: 'Screen for', short: tag(p.short, p.requirement), full: `${p.requirement} — asked in the AI screen, never a filter`, tone: 'probe' })),
  ]

  return [
    { title: 'Must', Icon: ShieldCheck, facts: must },
    { title: 'Market', Icon: Store, facts: market },
    { title: 'JD reads as', Icon: Languages, facts: means },
    { title: 'Ask', Icon: HelpCircle, facts: ask },
  ].filter((g) => g.facts.length > 0)
}
