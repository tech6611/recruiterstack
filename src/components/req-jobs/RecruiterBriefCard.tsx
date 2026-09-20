'use client'

import { ChevronDown, ChevronRight, Compass, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RecruiterBrief } from '@/lib/types/icp'

/**
 * The recruiter brief, compact: one header line (niche · years band · top feeder pools
 * · titles), details on click, and a small corrections box. Pure props — also used by
 * the development preview page.
 */
export function RecruiterBriefCard({ brief: b, open, onToggle, corrections, onCorrectionsChange, onSaveCorrections, saving }: {
  brief: RecruiterBrief | null
  open: boolean
  onToggle: () => void
  corrections: string
  onCorrectionsChange: (v: string) => void
  onSaveCorrections: () => void
  saving: boolean
}) {
          const pools = [...(b?.feeder_pools ?? [])].sort((x, y) => (x.priority ?? 99) - (y.priority ?? 99))
          const band = b?.experience_band
          const Chip = ({ children, tone = 'slate', title }: { children: React.ReactNode; tone?: 'slate' | 'indigo' | 'rose'; title?: string }) => (
            <span title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] ${tone === 'indigo' ? 'bg-indigo-50 text-indigo-800' : tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{children}</span>
          )
          return (
            <section className="rounded-xl border border-slate-200 bg-white">
              <button type="button" onClick={() => onToggle()} className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs">
                {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <Compass className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                <span className="font-semibold text-slate-700">{b?.niche ? b.niche : 'Recruiter brief'}</span>
                {band && (band.min_years != null || band.max_years != null) && <Chip tone="rose" title={band.rationale ?? 'Ceiling enforced'}>{band.min_years ?? '?'}–{band.max_years ?? '?'} yrs</Chip>}
                {!open && pools.slice(0, 3).map((pool) => <Chip key={pool.label} tone="indigo" title={pool.companies.join(', ')}>{pool.label}</Chip>)}
                {!open && (b?.title_families?.length ?? 0) > 0 && <Chip title={b!.title_families.join(', ')}>+{b!.title_families.length} titles</Chip>}
              </button>
              {open && (
                <div className="space-y-2.5 border-t border-slate-100 px-3 py-2.5">
                  {!b && <p className="text-xs text-slate-500">No brief yet — regenerate, or steer it below.</p>}
                  {b?.persona && <p className="line-clamp-2 text-xs text-slate-600" title={b.persona}>{b.persona}</p>}

                  {pools.length > 0 && (
                    <div className="space-y-1">
                      {pools.map((pool, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-1 text-xs" title={pool.rationale ?? undefined}>
                          <span className="w-4 shrink-0 text-[10px] font-bold text-indigo-700">{pool.priority ?? i + 1}</span>
                          <span className="mr-1 font-medium text-slate-700">{pool.label}</span>
                          {pool.companies.map((c) => <Chip key={c} tone="indigo">{c}</Chip>)}
                          {pool.role_types.length > 0 && <span className="text-[10px] text-slate-400">as {pool.role_types.join(' · ')}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {(b?.title_families?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-1 text-xs"><span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Titles</span>{b!.title_families.map((t) => <Chip key={t}>{t}</Chip>)}</div>
                  )}

                  <div className="grid gap-x-6 gap-y-1 text-[11px] md:grid-cols-2">
                    {b?.market && <div><span className="font-semibold text-slate-500">Market · </span><span className="text-slate-600">{b.market}</span></div>}
                    {b?.market_gates?.map((g, i) => <div key={`g${i}`} title={g.why ?? undefined}><span className="font-semibold text-slate-500">Gate here · </span><span className="text-slate-700">{g.requirement}</span></div>)}
                    {b?.jd_translations?.map((t, i) => <div key={`t${i}`}><span className="text-slate-400">“{t.phrase}”</span> <span className="text-slate-400">→</span> <span className="text-slate-700">{t.means_here}</span></div>)}
                    {b?.market_norms?.map((n, i) => <div key={`n${i}`}><span className="font-semibold text-slate-500">{n.topic} · </span><span className="text-slate-600">{n.norm}</span></div>)}
                    {(b?.normal_red_flags?.length ?? 0) > 0 && <div><span className="font-semibold text-slate-500">Normal here · </span><span className="text-slate-600">{b!.normal_red_flags.join(' · ')}</span></div>}
                    {(b?.unsure_about?.length ?? 0) > 0 && <div><span className="font-semibold text-amber-600">Check with HM · </span><span className="text-amber-800">{b!.unsure_about.join(' · ')}</span></div>}
                  </div>

                  <div className="flex items-start gap-2">
                    <textarea value={corrections} onChange={(e) => onCorrectionsChange(e.target.value)} rows={2} maxLength={4000}
                      placeholder="Correct this brief — companies to add or drop, what is really a gate here, market norms. Applied on the next Regenerate."
                      className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none" />
                    <Button size="sm" variant="outline" onClick={onSaveCorrections} disabled={saving || corrections === (b?.corrections ?? '')}>
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )
}
