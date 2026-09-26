'use client'

import { BrandIcon } from '@/components/ui/BrandIcon'
import { brandDomain } from '@/lib/brand-icon'
import fixture from './fixture.json'

/**
 * DEVELOPMENT ONLY. The 72 employers and 48 schools that actually appear most often in
 * our data, drawn at every size the product uses.
 *
 * The point of this page is not "do the logos work" — it is whether a screen that is
 * part logo and part monogram reads as ONE design. Roughly a fifth of rows will never
 * resolve, so the two marks have to sit together without the monogram looking like a
 * failed image. Judge the mixed columns, not the hits.
 */
function Row({ name, kind }: { name: string; kind: 'company' | 'school' }) {
  const domain = brandDomain(name, kind)
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 py-2">
      <BrandIcon name={name} kind={kind} size={32} />
      <BrandIcon name={name} kind={kind} size={20} />
      <BrandIcon name={name} kind={kind} size={16} />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-800" title={name}>{name}</span>
      <span className={`shrink-0 text-[11px] tabular-nums ${domain ? 'text-slate-400' : 'text-amber-600'}`}>
        {domain ?? 'monogram'}
      </span>
    </li>
  )
}

export function BrandIconPreview() {
  const { employers, schools } = fixture as { employers: string[]; schools: string[] }
  const monograms = [...employers, ...schools].filter((n, i) => !brandDomain(n, i < employers.length ? 'company' : 'school')).length
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-xl font-bold text-slate-900">Brand icons</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        The most common {employers.length} employers and {schools.length} schools in the database, at 32 / 20 / 16px.
        {' '}{monograms} of {employers.length + schools.length} resolve to a monogram before any request is made.
        Logos only load when you are signed in — <code>/api/brand-icon</code> requires a session.
      </p>
      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employers</h2>
          <ul>{employers.map((n) => <Row key={n} name={n} kind="company" />)}</ul>
        </section>
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Schools</h2>
          <ul>{schools.map((n) => <Row key={n} name={n} kind="school" />)}</ul>
        </section>
      </div>
    </main>
  )
}
