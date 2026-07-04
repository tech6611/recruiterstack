import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Building2, ArrowRight, Briefcase } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCareersPageBySlug, type CareersPageBranding } from '@/modules/ats/domain/job-pipelines'
import { readableTextOn } from '@/lib/branding/contrast'

const DEFAULT_BRAND  = '#2563eb'
const DEFAULT_ACCENT = '#10b981'
const DEFAULT_FONT   = 'Inter'

// Build the Google Fonts stylesheet URL for the chosen family.
function googleFontHref(family: string): string {
  const name = family.replace(/ /g, '+')
  return `https://fonts.googleapis.com/css2?family=${name}:wght@400;500;600;700&display=swap`
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const supabase = createAdminClient()
  const data = await getCareersPageBySlug(supabase, params.slug)
  if (!data) return { title: 'Careers' }
  const name = data.branding.company_name ?? 'Careers'
  return {
    title: `${name} — Careers`,
    description: data.branding.tagline ?? `Open roles at ${name}.`,
  }
}

export default async function CareersPage({ params }: { params: { slug: string } }) {
  const supabase = createAdminClient()
  const data = await getCareersPageBySlug(supabase, params.slug)
  if (!data) notFound()

  const { branding, jobs } = data
  const brand  = branding.brand_color  || DEFAULT_BRAND
  const accent = branding.accent_color || DEFAULT_ACCENT
  const font   = branding.brand_font   || DEFAULT_FONT
  const company = branding.company_name ?? 'Careers'

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: `'${font}', system-ui, sans-serif` }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={googleFontHref(font)} />

      {/* Hero */}
      <Hero branding={branding} brand={brand} company={company} />

      <main className="max-w-3xl mx-auto px-4 py-12">
        {/* About */}
        {branding.about && (
          <section className="mb-10">
            <h2 className="text-lg font-bold text-slate-900 mb-3">About {company}</h2>
            <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">{branding.about}</p>
          </section>
        )}

        {/* Open roles */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <Briefcase className="h-5 w-5" style={{ color: brand }} />
            <h2 className="text-lg font-bold text-slate-900">
              Open roles {jobs.length > 0 && <span className="text-slate-400 font-medium">· {jobs.length}</span>}
            </h2>
          </div>

          {jobs.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-sm font-semibold text-slate-700">No open roles right now</p>
              <p className="text-xs text-slate-400 mt-1">Check back soon — new positions are posted here as they open.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map(job => (
                <li key={job.apply_token}>
                  <Link
                    href={`/apply/${job.apply_token}`}
                    className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-900 truncate">{job.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {job.department && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" /> {job.department}
                          </span>
                        )}
                        {job.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" /> {job.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-opacity group-hover:opacity-90"
                      style={{ backgroundColor: brand }}
                    >
                      Apply <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="py-8 text-center">
        <p className="text-xs text-slate-400">
          Powered by <span className="font-semibold" style={{ color: accent }}>RecruiterStack</span>
        </p>
      </footer>
    </div>
  )
}

function Hero({ branding, brand, company }: { branding: CareersPageBranding; brand: string; company: string }) {
  const hasHero = !!branding.hero_image_url
  // With a hero image there's a dark overlay, so white always reads. On a solid
  // brand color, pick text that contrasts — dark on light brands, white on dark.
  const text = hasHero ? { strong: '#ffffff', muted: 'rgba(255,255,255,0.85)' } : readableTextOn(brand)

  return (
    <header
      className="relative overflow-hidden"
      style={hasHero ? undefined : { backgroundColor: brand }}
    >
      {hasHero && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.hero_image_url!} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-slate-900/55" />
        </>
      )}

      <div className="relative max-w-3xl mx-auto px-4 py-16 sm:py-20">
        {branding.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branding.logo_url}
            alt={`${company} logo`}
            className="mb-6 h-14 w-auto rounded-lg bg-white/95 p-2 object-contain"
          />
        )}
        {/* A logo already carries the brand (often the name itself), so we keep
            the name for a11y/SEO but hide it visually to avoid showing it twice. */}
        <h1
          className={branding.logo_url ? 'sr-only' : 'text-3xl sm:text-4xl font-bold'}
          style={branding.logo_url ? undefined : { color: text.strong }}
        >
          {company}
        </h1>
        {branding.tagline && (
          <p className="mt-3 max-w-2xl text-base sm:text-lg" style={{ color: text.muted }}>{branding.tagline}</p>
        )}
      </div>
    </header>
  )
}
