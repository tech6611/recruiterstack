'use client'

import { useEffect, useState } from 'react'
import { Users, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BrandIcon } from '@/components/ui/BrandIcon'
import type { Persona, PersonaChip, PersonaTab, PersonaTabKey } from '@/lib/persona-tabs'

/**
 * The ideal-candidate persona as Juicebox-style tabs. Each tab shows the values the
 * job's ideal profile TARGETS (with a company logo for employers) and, when the org
 * has pool access, the distribution actually present in the pool ("the market map").
 * Read-only view of the search spec + pool facets — no credits spent.
 */
export function PersonaTabs({ jobId }: { jobId: string }) {
  const [persona, setPersona] = useState<Persona | null>(null)
  const [active, setActive] = useState<PersonaTabKey>('employers')
  const [loading, setLoading] = useState(true)

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-emerald-500" /> Ideal candidate persona
        </CardTitle>
        <CardDescription>
          Who to target for this role, dimension by dimension.
          {persona.poolTotal != null && (
            <span className="text-slate-400"> · mapped against {persona.poolTotal.toLocaleString()} profile{persona.poolTotal === 1 ? '' : 's'} in your pool</span>
          )}
        </CardDescription>
      </CardHeader>

      {/* tab strip */}
      <div className="border-y border-slate-100 bg-slate-50/50">
        <div className="flex gap-1 overflow-x-auto px-3">
          {persona.tabs.map((t) => {
            const on = t.key === tab.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-xs transition-colors ${
                  on ? 'border-emerald-500 font-semibold text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
                {t.summary !== '—' && <span className={`ml-1.5 ${on ? 'text-emerald-400' : 'text-slate-400'}`}>· {t.summary}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <CardContent className="space-y-4 pt-4">
        <TabBody tab={tab} hasPool={persona.hasPool} />
      </CardContent>
    </Card>
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

