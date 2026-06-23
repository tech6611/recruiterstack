'use client'

/**
 * Autocomplete (typeahead) department picker.
 *
 * Type to filter the org's departments as you go; if what you typed isn't an
 * existing department, an "Add '<name>'" row creates it inline (POST
 * /api/departments) and selects it. Self-contained: fetches its own list on
 * mount. Controlled by `value` (a department id, or '' for none).
 *
 * Note: creating a department is admin-only (settings:edit). For non-admins the
 * "Add" row surfaces the server's permission error via a toast and the field
 * stays unchanged — they can still pick an existing department.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, Plus, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Dept {
  id:   string
  name: string
}

interface Props {
  value:        string
  onChange:     (id: string) => void
  placeholder?: string
}

export function DepartmentCombobox({ value, onChange, placeholder = 'Search or add a department…' }: Props) {
  const [depts, setDepts]   = useState<Dept[]>([])
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const [creating, setCreating] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Load the org's departments once.
  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(({ data }) => setDepts(data ?? []))
      .catch(() => setDepts([]))
  }, [])

  const selected = useMemo(() => depts.find(d => d.id === value) ?? null, [depts, value])

  // When not actively typing, the input reflects the selected department's name.
  useEffect(() => {
    if (!open) setQuery(selected?.name ?? '')
  }, [selected, open])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim()
  const filtered = useMemo(
    () => (q ? depts.filter(d => d.name.toLowerCase().includes(q.toLowerCase())) : depts),
    [depts, q],
  )
  const exact = useMemo(
    () => depts.find(d => d.name.toLowerCase() === q.toLowerCase()) ?? null,
    [depts, q],
  )
  const canCreate = q.length > 0 && !exact

  // Rows = filtered departments, then optionally the "Add" row.
  const rowCount = filtered.length + (canCreate ? 1 : 0)

  function pick(d: Dept) {
    onChange(d.id)
    setQuery(d.name)
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
    setOpen(true)
  }

  async function create() {
    if (!q || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? 'Could not add department')
        return
      }
      const created = body.data as Dept
      setDepts(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      pick(created)
      toast.success(`Added “${created.name}”`)
    } finally {
      setCreating(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rowCount - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (active < filtered.length) pick(filtered[active])
      else if (canCreate) create()
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={query}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setActive(0) }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={onKeyDown}
          className={cn(
            'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pr-16 text-sm',
            'placeholder:text-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent',
          )}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-slate-400">
          {value && (
            <button type="button" onClick={clear} aria-label="Clear" className="hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronsUpDown className="h-4 w-4" />
        </div>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(d)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-left text-sm',
                i === active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700',
              )}
            >
              {d.name}
              {d.id === value && <Check className="h-4 w-4 text-emerald-600" />}
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              onMouseEnter={() => setActive(filtered.length)}
              onClick={create}
              disabled={creating}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                active === filtered.length ? 'bg-emerald-50 text-emerald-800' : 'text-emerald-700',
              )}
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Adding…' : <>Add “{q}”</>}
            </button>
          )}

          {filtered.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-sm text-slate-400">No departments yet — type a name to add one.</p>
          )}
        </div>
      )}
    </div>
  )
}
