import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCareersPageBySlug, type CareersPageBranding } from '@/modules/ats/domain/job-pipelines'
import { readableTextOn } from '@/lib/branding/contrast'
import { RichText } from '@/components/RichText'
import { RolesSection } from './roles-section'

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

      <Nav branding={branding} company={company} accent={accent} />
      <Hero branding={branding} brand={brand} accent={accent} company={company} rolesCount={jobs.length} />

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* About */}
        {branding.about && (
          <section className="mb-12 max-w-3xl">
            <h2 className="text-lg font-bold text-slate-900 mb-3">About {company}</h2>
            <RichText html={branding.about} className="text-slate-600" />
          </section>
        )}

        {/* Open roles — search + filters run client-side over this list */}
        <RolesSection jobs={jobs} brand={brand} accent={accent} />
      </main>

      {branding.show_powered_by && (
        <footer className="py-8 text-center">
          <p className="text-xs text-slate-400">
            Powered by <span className="font-semibold" style={{ color: accent }}>RecruiterStack</span>
          </p>
        </footer>
      )}
    </div>
  )
}

// Sticky top bar: logo (or name) on the left, a brand-colored "View open roles"
// button on the right — the standard careers-site nav shape.
function Nav({ branding, company, accent }: { branding: CareersPageBranding; company: string; accent: string }) {
  const accentText = readableTextOn(accent).strong
  const external = (url: string) => /^https?:\/\//i.test(url)
  // The top-right CTA is customizable; default to a jump down to the roles grid.
  const ctaLabel = branding.nav_cta_label || 'View open roles'
  const ctaUrl = branding.nav_cta_url || '#roles'

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
        {branding.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logo_url} alt={`${company} logo`} className="h-8 w-auto max-w-[200px] object-contain" />
        ) : (
          <span className="text-base font-bold text-slate-900">{company}</span>
        )}

        <nav className="flex items-center gap-1 sm:gap-2">
          {branding.nav_links.map(link => (
            <a
              key={`${link.label}-${link.url}`}
              href={link.url}
              {...(external(link.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 sm:inline-flex"
            >
              {link.label}
            </a>
          ))}
          <a
            href={ctaUrl}
            {...(external(ctaUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent, color: accentText }}
          >
            {ctaLabel}
          </a>
        </nav>
      </div>
    </header>
  )
}

function Hero({
  branding, brand, accent, company, rolesCount,
}: { branding: CareersPageBranding; brand: string; accent: string; company: string; rolesCount: number }) {
  const hasHero = !!branding.hero_image_url
  // With a hero image there's a dark overlay, so white always reads. On a solid
  // brand color, pick text that contrasts — dark on light brands, white on dark.
  const text = hasHero ? { strong: '#ffffff', muted: 'rgba(255,255,255,0.85)' } : readableTextOn(brand)
  const accentText = readableTextOn(accent).strong
  // Custom hero copy when set, else fall back to the company name + tagline.
  const headline = branding.hero_headline || company
  const subheadline = branding.hero_subheadline || branding.tagline

  return (
    <section
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

      <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight" style={{ color: text.strong }}>
          {headline}
        </h1>
        {subheadline && (
          <p className="mt-4 mx-auto max-w-2xl text-base sm:text-lg" style={{ color: text.muted }}>
            {subheadline}
          </p>
        )}
        {rolesCount > 0 && (
          <a
            href="#roles"
            className="mt-8 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90 shadow-sm"
            style={{ backgroundColor: accent, color: accentText }}
          >
            Explore open roles <ArrowRight className="h-4 w-4" />
          </a>
        )}
      </div>
    </section>
  )
}
