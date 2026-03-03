'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Search } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import type { Candidate } from '@/lib/types/database'

interface CandidateTableProps {
  candidates: Candidate[]
  clickable?: boolean
}

type SortField = 'name' | 'experience_years' | 'current_title' | 'location' | 'status'
type SortDir = 'asc' | 'desc'

export function CandidateTable({ candidates, clickable = false }: CandidateTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = candidates
    .filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.current_title ?? '').toLowerCase().includes(q) ||
        (c.location ?? '').toLowerCase().includes(q) ||
        c.skills.some(s => s.toLowerCase().includes(q))
      )
    })
    .sort((a, b) => {
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ChevronUp className="h-3.5 w-3.5 text-slate-300" />
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ChevronDown className="h-3.5 w-3.5 text-blue-600" />
    )
  }

  const ColHeader = ({
    label,
    field,
    className = '',
  }: {
    label: string
    field: SortField
    className?: string
  }) => (
    <th
      onClick={() => toggleSort(field)}
      className={`cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700 ${className}`}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} />
      </div>
    </th>
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Table header / search */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Candidates</h2>
          <p className="text-sm text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search name, skill, title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <ColHeader label="Name"       field="name" className="pl-6" />
              <ColHeader label="Title"      field="current_title" />
              <ColHeader label="Location"   field="location" />
              <ColHeader label="Exp (yrs)"  field="experience_years" />
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Skills
              </th>
              <ColHeader label="Status"     field="status" className="pr-6" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-50 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                  No candidates match your search.
                </td>
              </tr>
            ) : (
              filtered.map(candidate => (
                <tr
                  key={candidate.id}
                  onClick={() => clickable && router.push(`/candidates/${candidate.id}`)}
                  className={`group hover:bg-slate-50 transition-colors${clickable ? ' cursor-pointer' : ''}`}
                >
                  {/* Name + email */}
                  <td className="py-3.5 pl-6 pr-4">
                    <div className="font-medium text-slate-900 group-hover:text-blue-700 transition-colors">
                      {candidate.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{candidate.email}</div>
                  </td>

                  {/* Title */}
                  <td className="px-4 py-3.5 text-sm text-slate-600">
                    {candidate.current_title ?? '—'}
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3.5 text-sm text-slate-500">
                    {candidate.location ?? '—'}
                  </td>

                  {/* Experience */}
                  <td className="px-4 py-3.5 text-sm text-slate-700 font-medium">
                    {candidate.experience_years}
                    <span className="text-slate-400 font-normal"> yrs</span>
                  </td>

                  {/* Skills */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {candidate.skills.slice(0, 3).map(skill => (
                        <span
                          key={skill}
                          className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                      {candidate.skills.length > 3 && (
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                          +{candidate.skills.length - 3}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 pl-4 pr-6">
                    <StatusBadge status={candidate.status} variant="candidate" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
