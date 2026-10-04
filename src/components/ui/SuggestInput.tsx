'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { BrandIcon } from '@/components/ui/BrandIcon'

/**
 * A typeahead over a list of real values that still accepts anything typed.
 *
 * WHY NOT A PLAIN <select>. The lists here are open-ended — a recruiter will name a
 * company or a title we have never seen, and a closed dropdown would make the field
 * worse than the free-text box it replaces. What a picker is actually for is stopping
 * one idea being spelled five ways ("Sr. Engineer", "Senior Engineer", "Sr Software
 * Engineer"): a filter written in the fifth spelling silently matches nobody. So the
 * list leads, and typing something new is still one Enter away.
 *
 * WHY NOT <datalist>. Browsers render it inconsistently, it cannot show a logo beside
 * an option, and it gives no way to say "keep what I typed". This is a few more lines
 * for a control that behaves the same everywhere.
 *
 * Keyboard: ↓/↑ move, Enter takes the highlighted option (or the typed text when
 * nothing is highlighted), Esc closes without changing anything.
 */
export function SuggestInput({
  value,
  onChange,
  onCommit,
  options,
  placeholder,
  withLogos = false,
  autoFocus = false,
  className = '',
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  /** Enter or a click on an option. Used by the chip fields to add and clear. */
  onCommit?: (v: string) => void
  options: string[]
  placeholder?: string
  withLogos?: boolean
  autoFocus?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // A combobox has to name the list it controls for a screen reader to follow it.
  const listId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    // Each row is keyed by its text, so a repeated option would leave stale rows
    // behind as the list changes — show every value once.
    const seen = new Set<string>()
    const unique = options.filter((o) => { const k = o.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    if (!q) return unique.slice(0, 50)
    // Values that START with what was typed first — typing "eng" should reach
    // "Engineering Manager" before "Software Engineering Manager".
    const starts: string[] = []
    const holds: string[] = []
    for (const o of unique) {
      const l = o.toLowerCase()
      if (l.startsWith(q)) starts.push(o)
      else if (l.includes(q)) holds.push(o)
      if (starts.length >= 50) break
    }
    return [...starts, ...holds].slice(0, 50)
  }, [value, options])

  useEffect(() => { setActive(0) }, [value])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open) return
    list.current?.querySelectorAll('li')[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const take = (v: string) => {
    onChange(v)
    onCommit?.(v)
    setOpen(false)
  }

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 focus-within:border-emerald-400">
        {withLogos && value.trim() && <BrandIcon name={value.trim()} size={16} />}
        <input
          value={value}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, matches.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
            else if (e.key === 'Enter') {
              e.preventDefault()
              take(open && matches[active] ? matches[active] : value)
            } else if (e.key === 'Escape') { setOpen(false) }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show suggestions"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 text-slate-300 hover:text-slate-500"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && matches.length > 0 && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full min-w-[14rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((m, i) => (
            <li
              key={m}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); take(m) }}
              className={`flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[13px] ${
                i === active ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700'
              }`}
            >
              {withLogos && <BrandIcon name={m} size={16} />}
              <span className="truncate">{m}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
