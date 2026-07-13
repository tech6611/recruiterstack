'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export interface Opt { value: string; label: string }

// A searchable multi-select: the header is a search box, selected values show as
// chips (so the current filter is always visible), and options fold into a
// dropdown that opens on focus. Shared by the Bulk-filter enrollment panel and
// the per-rule auto-enrollment filter builder.
export function MultiSelect({ label, options, selected, onToggle }: {
  label: string; options: Opt[]; selected: string[]; onToggle: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const selectedOpts = options.filter(o => selected.includes(o.value))

  return (
    <div ref={ref}>
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      <div className="relative mt-1">
        <div
          className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 focus-within:border-emerald-400"
          onClick={() => setOpen(true)}
        >
          {selectedOpts.map(o => (
            <span key={o.value} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {o.label}
              <button onClick={e => { e.stopPropagation(); onToggle(o.value) }} className="text-emerald-500 hover:text-emerald-800"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={selectedOpts.length ? 'Add more…' : `Search ${label.toLowerCase()}…`}
            className="min-w-[90px] flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
          />
        </div>
        {open && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-slate-400">None available</p>
            ) : shown.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-slate-400">No matches</p>
            ) : shown.map(o => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} className="text-emerald-600 focus:ring-emerald-500" />
                <span className="truncate text-slate-700">{o.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
