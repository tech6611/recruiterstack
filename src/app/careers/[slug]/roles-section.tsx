'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, ArrowRight, Briefcase, Home, BarChart3, Search } from 'lucide-react'
import { readableTextOn } from '@/lib/branding/contrast'
import type { CareersPageJob } from '@/modules/ats/domain/job-pipelines'

const ALL = '__all__'

// The open-roles section: server-provided job list plus client-side search and
// department/location filters. The full list is rendered on the server (so the
// jobs are in the initial HTML for SEO); filtering runs in the browser.
export function RolesSection({
  jobs, brand, accent,
}: { jobs: CareersPageJob[]; brand: string; accent: string }) {
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState(ALL)
  const [loc, setLoc] = useState(ALL)

  const departments = useMemo(
    () => Array.from(new Set(jobs.map(j => j.department).filter((d): d is string => !!d))).sort(),
    [jobs],
  )
  const locations = useMemo(
    () => Array.from(new Set(jobs.map(j => j.location).filter((l): l is string => !!l))).sort(),
    [jobs],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return jobs.filter(j => {
      if (dept !== ALL && j.department !== dept) return false
      if (loc !== ALL && j.location !== loc) return false
      if (q) {
        const hay = [j.title, j.department, j.location].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [jobs, query, dept, loc])

  // Show the search + filter bar whenever there are roles. Each dropdown appears
  // only when there's at least one value to pick from, so we never render an
  // empty "All locations" control on a page whose jobs carry no location.
  const showFilters = jobs.length > 0

  return (
    <section id="roles" className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-6">
        <Briefcase className="h-5 w-5" style={{ color: brand }} />
        <h2 className="text-lg font-bold text-slate-900">
          Open roles {jobs.length > 0 && <span className="text-slate-400 font-medium">· {jobs.length}</span>}
        </h2>
      </div>

      {showFilters && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search roles"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>
          {departments.length >= 1 && (
            <select
              value={dept}
              onChange={e => setDept(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            >
              <option value={ALL}>All departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {locations.length >= 1 && (
            <select
              value={loc}
              onChange={e => setLoc(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            >
              <option value={ALL}>All locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No open roles right now</p>
          <p className="text-xs text-slate-400 mt-1">Check back soon — new positions are posted here as they open.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">No roles match your filters</p>
          <button
            onClick={() => { setQuery(''); setDept(ALL); setLoc(ALL) }}
            className="mt-2 text-xs font-semibold text-slate-500 underline hover:text-slate-700"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(job => (
            <li key={job.apply_token}>
              <JobCard job={job} brand={brand} accent={accent} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// One role in the grid. The whole card is the apply link; a brand-accent pill at
// the bottom carries the call to action with contrast-aware text so it never
// washes out on a pale brand color.
function JobCard({ job, brand, accent }: { job: CareersPageJob; brand: string; accent: string }) {
  const accentText = readableTextOn(accent).strong
  return (
    <Link
      href={`/apply/${job.apply_token}`}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      {job.department && (
        <span
          className="mb-3 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: `${brand}14`, color: brand }}
        >
          {job.department}
        </span>
      )}
      <p className="text-lg font-bold text-slate-900">{job.title}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        {job.location && <MetaChip icon={MapPin} label={job.location} />}
        {job.employment_type && <MetaChip icon={Briefcase} label={job.employment_type} />}
        {job.remote_ok !== null && <MetaChip icon={Home} label={job.remote_ok ? 'Remote' : 'On-site'} />}
        {job.level && <MetaChip icon={BarChart3} label={job.level} />}
      </div>

      <div className="mt-auto pt-6">
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity group-hover:opacity-90"
          style={{ backgroundColor: accent, color: accentText }}
        >
          Apply <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  )
}

function MetaChip({ icon: Icon, label }: { icon: typeof MapPin; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 text-slate-400" /> {label}
    </span>
  )
}
