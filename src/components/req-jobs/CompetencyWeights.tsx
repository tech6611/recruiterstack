'use client'

import { Fragment, useState } from 'react'
import { Scale, ListChecks, Minus, Plus, X, Trash2 } from 'lucide-react'
import type { IcpCompetency } from '@/lib/types/icp'

/**
 * The weighted competencies, compact: a ring of the weights beside one slim row each —
 * colour, name, behaviours (click to edit), and a −/+ weight. Pure props.
 */
/** Shades of grey, heaviest weight darkest. */
const GREYS = ['#334155', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc']

export function CompetencyWeights({
  comps, total, onName, onWeight, onRemove, onAdd, onBehaviour, onAddBehaviour, onRemoveBehaviour,
}: {
  comps: IcpCompetency[]
  total: number
  onName: (i: number, name: string) => void
  onWeight: (i: number, weight: number) => void
  onRemove: (i: number) => void
  onAdd: () => void
  onBehaviour: (i: number, bi: number, value: string) => void
  onAddBehaviour: (i: number) => void
  onRemoveBehaviour: (i: number, bi: number) => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const hex = colorsFor(comps)
  const ok = total === 100

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-xs">
        <Scale className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-semibold text-slate-700">Scoring weights</span>
        <span title={ok ? undefined : 'Weights must add up to 100% before you can approve'}
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {total}%{ok ? ' ✓' : ' ≠ 100'}
        </span>
        <button type="button" onClick={onAdd} title="Add a competency"
          className="ml-auto grid h-6 w-6 place-items-center rounded-md text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-700">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <Ring comps={comps} total={total} hex={hex} />
        <div className="grid w-full gap-x-6 gap-y-1 md:grid-cols-2">
          {comps.map((c, i) => (
            <Fragment key={c.id}>
              <div className="group flex items-center gap-2 py-0.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hex[i] }} />
                <input value={c.name} onChange={(e) => onName(i, e.target.value)} placeholder="Competency name"
                  className="min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] text-slate-800 placeholder:text-slate-300 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-200" />
                <button type="button" onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  title={c.behaviours.filter((b) => b.trim()).join('\n') || 'No behaviours yet — click to add'}
                  className={`inline-flex items-center gap-0.5 rounded px-1 text-[11px] hover:bg-slate-100 ${openId === c.id ? 'text-slate-700' : 'text-slate-400'}`}>
                  <ListChecks className="h-3 w-3" />{c.behaviours.filter((b) => b.trim()).length}
                </button>
                <span className={`inline-flex items-center rounded-md ring-1 ${ok ? 'ring-slate-200' : 'ring-amber-300'}`}>
                  <button type="button" onClick={() => onWeight(i, (c.weight || 0) - 5)} className="grid h-6 w-6 place-items-center text-slate-400 hover:text-slate-700"><Minus className="h-3 w-3" /></button>
                  <input type="number" min={0} max={100} value={c.weight} onChange={(e) => onWeight(i, parseInt(e.target.value) || 0)}
                    className="w-8 bg-transparent text-center text-xs font-semibold tabular-nums text-slate-800 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none" />
                  <button type="button" onClick={() => onWeight(i, (c.weight || 0) + 5)} className="grid h-6 w-6 place-items-center text-slate-400 hover:text-slate-700"><Plus className="h-3 w-3" /></button>
                </span>
                <button type="button" onClick={() => onRemove(i)} title="Remove" className="text-slate-300 opacity-0 hover:text-rose-500 group-hover:opacity-100 focus:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {openId === c.id && (
                <div className="space-y-1 rounded-lg bg-slate-50 p-2 md:col-span-2">
                  {c.behaviours.map((b, bi) => (
                    <div key={bi} className="flex items-center gap-2">
                      <span className="text-slate-300">•</span>
                      <input value={b} onChange={(e) => onBehaviour(i, bi, e.target.value)} placeholder="An observable behaviour of a strong candidate"
                        className="h-7 flex-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-indigo-300 focus:outline-none" />
                      <button type="button" onClick={() => onRemoveBehaviour(i, bi)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => onAddBehaviour(i)} className="ml-4 text-xs font-medium text-slate-400 hover:text-slate-600">+ behaviour</button>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The weights as a ring, the total in the middle. Over 100%, slices shrink to fit. */
function Ring({ comps, total, hex }: { comps: IcpCompetency[]; total: number; hex: string[] }) {
  const R = 34, C = 2 * Math.PI * R
  let offset = 0
  return (
    <svg viewBox="0 0 88 88" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label={`Weights total ${total}%`}>
      <circle cx="44" cy="44" r={R} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      {comps.map((c, i) => {
        const len = ((c.weight || 0) / Math.max(total, 100)) * C
        const el = (
          <circle key={c.id} cx="44" cy="44" r={R} fill="none" stroke={hex[i]} strokeWidth="10"
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}>
            <title>{`${c.name || 'Unnamed'} · ${c.weight}%`}</title>
          </circle>
        )
        offset += len
        return el
      })}
      <text x="44" y="44" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-slate-700 text-[14px] font-bold"
        style={{ transformOrigin: '44px 44px' }}>{total}%</text>
    </svg>
  )
}

/** One grey per competency, by weight: the heaviest is the darkest. PURE. */
function colorsFor(comps: IcpCompetency[]): string[] {
  const rank = comps.map((c, i) => ({ i, w: c.weight || 0 })).sort((a, b) => b.w - a.w || a.i - b.i)
  const out: string[] = []
  rank.forEach(({ i }, r) => { out[i] = GREYS[Math.min(r, GREYS.length - 1)] })
  return out
}
