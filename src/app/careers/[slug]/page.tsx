import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCareersPageBySlug, type CareersPageBranding } from '@/modules/ats/domain/job-pipelines'
import { readableTextOn } from '@/lib/branding/contrast'
import { RichText } from '@/components/RichText'
import { RolesSection } from './roles-section'
import { ContentSections } from './content-sections'

const DEFAULT_BRAND  = '#2563eb'
const DEFAULT_ACCENT = '#10b981'
const DEFAULT_FONT   = 'Inter'

// Web fonts we serve via Google Fonts. System fonts (Georgia, Courier New) are
// available everywhere and need no stylesheet.
const GOOGLE_FONTS = new Set([
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins',
  'Merriweather', 'Source Sans 3', 'Nunito', 'Work Sans', 'DM Sans',
])

// Collect every Google font used on the page: the page-level brand font plus any
// per-text-box font a user picked inside the editor (stored as inline
// font-family styles in the branding HTML). Those custom fonts only render if
// we load them here, so we scan the HTML and request them all in one stylesheet.
function collectGoogleFonts(branding: CareersPageBranding, pageFont: string): string[] {
  const found = new Set<string>([pageFont])
  const blobs = [
    branding.hero_headline ?? '', branding.hero_subheadline ?? '',
    branding.tagline ?? '', branding.about ?? '',
    JSON.stringify(branding.content_sections ?? []),
  ]
  const re = /font-family:\s*([^;"'}]+)/gi
  for (const blob of blobs) {
    let m: RegExpExecArray | null
    while ((m = re.exec(blob)) !== null) {
      found.add(m[1].trim().replace(/^['"]|['"]$/g, ''))
    }
  }
  return Array.from(found).filter(f => GOOGLE_FONTS.has(f))
}

// Build one Google Fonts stylesheet URL requesting every family we need.
function googleFontsHref(families: string[]): string {
  const q = families
    .map(f => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${q}&display=swap`
}

// Rich fields hold HTML now; search-engine title/description must be plain text.
function toPlain(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const supabase = createAdminClient()
  const data = await getCareersPageBySlug(supabase, params.slug)
  if (!data) return { title: 'Careers' }
  const name = data.branding.company_name ?? 'Careers'
  const tagline = toPlain(data.branding.tagline)
  return {
    title: `${name} — Careers`,
    description: tagline || `Open roles at ${name}.`,
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
  const fontHref = googleFontsHref(collectGoogleFonts(branding, font))

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: `'${font}', system-ui, sans-serif` }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={fontHref} />

      <Nav branding={branding} company={company} accent={accent} />
      <Hero branding={branding} brand={brand} accent={accent} company={company} rolesCount={jobs.length} />

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* About */}
        {branding.about && (
          <section className="mb-12 max-w-3xl">
            <h2 className="text-lg font-bold text-slate-900 mb-3">About {company}</h2>
            <RichText html={branding.about} className="text-slate-600 [&_h1]:!text-2xl [&_h1]:!font-bold [&_h2]:!text-xl [&_h2]:!font-semibold" />
          </section>
        )}

        {/* Open roles — search + filters run client-side over this list */}
        <RolesSection jobs={jobs} brand={brand} accent={accent} />

        {/* Custom content blocks (benefits, stories, CTA, prose) */}
        {branding.content_sections.length > 0 && (
          <div className="mt-16">
            <ContentSections sections={branding.content_sections} brand={brand} accent={accent} />
          </div>
        )}
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
  // Copy is rich HTML now — RichText renders it (and also handles the plain
  // company-name fallback). User colour spans override the contrast colour.
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

      <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-24 text-center" style={{ color: text.strong }}>
        <RichText
          html={headline}
          className="!text-4xl sm:!text-5xl font-bold tracking-tight !text-inherit [&_p]:my-0 [&_p]:leading-tight"
        />
        {subheadline && (
          <div className="mt-4 mx-auto max-w-2xl" style={{ color: text.muted }}>
            <RichText html={subheadline} className="!text-base sm:!text-lg !text-inherit [&_p]:my-0" />
          </div>
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
