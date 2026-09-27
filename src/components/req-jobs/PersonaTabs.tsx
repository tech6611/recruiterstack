'use client'

import { useEffect, useState } from 'react'
import { Users, Sparkles, ChevronDown, ChevronRight, UserRound, MapPin, Clock, Building2, Briefcase, Code2, BarChart3, Ban } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { BrandIcon } from '@/components/ui/BrandIcon'
import type { Persona, PersonaChip, PersonaTab, PersonaTabKey } from '@/lib/persona-tabs'

/**
 * The ideal-candidate persona as a profile card (IdCard) of the values the job's ideal
 * profile TARGETS. When the org has pool access, "See your pool" opens Juicebox-style
 * tabs with the distribution actually present in the pool ("the market map").
 * Read-only view of the search spec + pool facets — no credits spent.
 */
export function PersonaTabs({ jobId, onOpenScoring }: { jobId: string; onOpenScoring?: () => void }) {
  const [persona, setPersona] = useState<Persona | null>(null)
  const [active, setActive] = useState<PersonaTabKey>('employers')
  const [loading, setLoading] = useState(true)
  const [showPool, setShowPool] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/jobs/${jobId}/source/persona`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (live) setPersona(j.data?.persona ?? null) })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [jobId])

  if (loading) {
    return <Card><CardContent className="py-6 text-center text-sm text-slate-400">Mapping the market…</CardContent></Card>
  }
  if (!persona) return null

  const hasAnyIdeal = persona.tabs.some((t) => t.ideal.length > 0)
  if (!hasAnyIdeal && !persona.hasPool) {
    return (
      <Card>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-slate-500">Approve an ICP for this job to see the ideal candidate persona.</p>
          <p className="mt-1 text-xs text-slate-400">The persona is built from the ICP&apos;s ideal profile — who to target, by employer, title, skill, seniority, experience and location.</p>
        </CardContent>
      </Card>
    )
  }

  const tab = persona.tabs.find((t) => t.key === active) ?? persona.tabs[0]

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-emerald-500" /> Ideal candidate persona
          </div>
          {/* Read-only here: the ideal profile is edited in one place, the Scoring tab. */}
          {onOpenScoring && (
            <button type="button" onClick={onOpenScoring} className="text-xs font-medium text-emerald-600 hover:text-emerald-800">
              Edit on Scoring
            </button>
          )}
        </div>

        <IdCard persona={persona} />

        {/* The market map — the per-dimension pool breakdown, one click away. */}
        {persona.hasPool && (
          <div className="border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setShowPool((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">
              <Users className="h-3.5 w-3.5" />
              See your pool{persona.poolTotal != null && ` · ${persona.poolTotal.toLocaleString()} profile${persona.poolTotal === 1 ? '' : 's'}`}
              {showPool ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {showPool && (
              <div className="mt-3 rounded-xl border border-slate-100">
                <div className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-3">
                  {persona.tabs.map((t) => {
                    const on = t.key === tab.key
                    return (
                      <button key={t.key} type="button" onClick={() => setActive(t.key)}
                        className={`shrink-0 border-b-2 px-3 py-2.5 text-xs transition-colors ${
                          on ? 'border-emerald-500 font-semibold text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}>
                        {t.label}
                        {t.summary !== '—' && <span className={`ml-1.5 ${on ? 'text-emerald-400' : 'text-slate-400'}`}>· {t.summary}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-4 p-4">
                  <TabBody tab={tab} hasPool={persona.hasPool} />
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The persona as a profile card (option P3): a green identity panel — first ideal
 * title, location, years — and, beside it, where they come from (logos), what they
 * are now, what they know, and who is excluded. Faded = only at a widened level.
 */
function IdCard({ persona }: { persona: Persona }) {
  const get = (k: PersonaTabKey) => persona.tabs.find((t) => t.key === k)?.ideal ?? []
  const keep = (k: PersonaTabKey) => get(k).filter((c) => !c.exclude)
  const titles = keep('titles')
  const headline = titles.find((c) => !c.relaxed)?.label ?? titles[0]?.label ?? 'Ideal candidate'
  const where = keep('locations')[0]?.label
  const years = keep('years')[0]?.label
  const excluded = persona.tabs.flatMap((t) => t.ideal.filter((c) => c.exclude))
  const rows: { label: string; Icon: typeof Users; color: string; chips: PersonaChip[]; logo?: boolean; chipCls: string }[] = [
    { label: 'Comes from', Icon: Building2, color: 'text-emerald-600', chips: keep('employers'), logo: true, chipCls: 'bg-slate-50 text-slate-700' },
    { label: 'Is now', Icon: Briefcase, color: 'text-sky-500', chips: titles, chipCls: 'bg-sky-50 text-sky-800' },
    { label: 'Knows', Icon: Code2, color: 'text-violet-500', chips: keep('skills'), chipCls: 'bg-violet-50 text-violet-800' },
    { label: 'Level', Icon: BarChart3, color: 'text-teal-600', chips: keep('seniority'), chipCls: 'bg-teal-50 text-teal-800' },
    { label: 'Not from', Icon: Ban, color: 'text-slate-400', chips: excluded, chipCls: 'bg-slate-100 text-slate-500 line-through' },
  ]
  const shown = rows.filter((r) => r.chips.length > 0)

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 px-6 py-5 text-white md:w-52">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/15 ring-4 ring-white/20">
          <UserRound className="h-7 w-7" />
        </span>
        <div className="mt-3 text-center font-display text-[15px] font-bold leading-tight">{headline}</div>
        {(where || years) && (
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-emerald-100">
            {where && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{where}</span>}
            {years && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{years}</span>}
          </div>
        )}
      </div>
      <div className="grid flex-1 grid-cols-1 content-start gap-3 sm:grid-cols-2">
        {shown.length === 0 && <p className="text-xs text-slate-400">No targets set yet — add them on Scoring.</p>}
        {shown.map((r) => (
          <div key={r.label} className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-500">
              <r.Icon className={`h-3.5 w-3.5 ${r.color}`} /> {r.label}
            </div>
            <div className="flex flex-wrap gap-1">
              {r.chips.slice(0, 8).map((c, i) => (
                <span key={i} title={c.relaxed ? `${c.label} — only at a widened search level` : c.label}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ${r.chipCls} ${c.relaxed ? 'opacity-50' : ''}`}>
                  {r.logo && <BrandIcon name={c.label} />}
                  {c.label}
                </span>
              ))}
              {r.chips.length > 8 && <span className="px-1 text-xs text-slate-400">+{r.chips.length - 8}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TabBody({ tab, hasPool }: { tab: PersonaTab; hasPool: boolean }) {
  const core = tab.ideal.filter((c) => !c.relaxed)
  const widened = tab.ideal.filter((c) => c.relaxed)
  const showLogos = tab.key === 'employers'

  return (
    <>
      {/* the targeted values (the ideal profile) */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ideal profile</div>
        {core.length === 0 && widened.length === 0 ? (
          <p className="text-xs text-slate-400">No target set for this dimension.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {core.map((c, i) => <Chip key={`c-${i}`} chip={c} logo={showLogos} />)}
            {widened.map((c, i) => <Chip key={`w-${i}`} chip={c} logo={showLogos} />)}
          </div>
        )}
        {widened.length > 0 && (
          <p className="mt-1.5 text-[11px] text-slate-400">Faded = widened at a broader search level, not core to the persona.</p>
        )}
      </div>

      {/* the distribution actually in the pool (the market map) */}
      {hasPool && tab.pool.length > 0 && <PoolDistribution tab={tab} />}
      {hasPool && tab.pool.length === 0 && (tab.key === 'employers' || tab.key === 'titles' || tab.key === 'skills' || tab.key === 'locations') && (
        <p className="text-[11px] text-slate-400">No {tab.label.toLowerCase()} data in your pool yet.</p>
      )}
    </>
  )
}

function PoolDistribution({ tab }: { tab: PersonaTab }) {
  const withBars = tab.key === 'employers' || tab.key === 'titles'
  const max = Math.max(1, ...tab.pool.map((p) => p.count ?? 0))
  const showLogos = tab.key === 'employers'

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Users className="h-3 w-3" /> In your pool
      </div>
      {withBars ? (
        <ul className="space-y-1">
          {tab.pool.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              {showLogos && <BrandIcon name={p.label} />}
              <span className="w-40 shrink-0 truncate text-slate-700" title={p.label}>{p.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(((p.count ?? 0) / max) * 100)}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right tabular-nums text-slate-500">{p.count ?? 0}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tab.pool.map((p, i) => (
            <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{p.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ chip, logo }: { chip: PersonaChip; logo: boolean }) {
  const base = chip.exclude
    ? 'bg-rose-50 text-rose-700 ring-rose-100'
    : chip.relaxed
      ? 'bg-white text-slate-400 ring-slate-200'
      : 'bg-emerald-50 text-emerald-800 ring-emerald-100'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ${base}`}>
      {chip.exclude && <span className="text-[9px] font-bold uppercase text-rose-500">not</span>}
      {logo && !chip.exclude && <BrandIcon name={chip.label} />}
      {chip.label}
      {chip.count != null && chip.count > 0 && (
        <span className="rounded-full bg-white/70 px-1 text-[10px] tabular-nums text-slate-500">{chip.count}</span>
      )}
    </span>
  )
}

