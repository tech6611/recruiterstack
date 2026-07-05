import type { CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readableTextOn } from '@/lib/branding/contrast'
import { RichText } from '@/components/RichText'
import type {
  CareersContentSection,
  CareersBenefitsSection,
  CareersStorySection,
  CareersCtaSection,
  CareersTextSection,
} from '@/modules/ats/domain/job-pipelines'

// Renders the org's custom content blocks below "About" on the public careers
// page. Server component — static markup, so the sections are in the initial
// HTML for SEO. Brand color tints headings/accents; accent color drives the CTA.
// Every copy field is rich HTML (colour, highlight, bold…), rendered via RichText.
export function ContentSections({
  sections, brand, accent,
}: { sections: CareersContentSection[]; brand: string; accent: string }) {
  if (sections.length === 0) return null
  return (
    <div className="space-y-14">
      {sections.map(section => {
        switch (section.type) {
          case 'text':     return <TextBlock key={section.id} section={section} />
          case 'benefits': return <BenefitsBlock key={section.id} section={section} brand={brand} />
          case 'story':    return <StoryBlock key={section.id} section={section} accent={accent} />
          case 'cta':      return <CtaBlock key={section.id} section={section} brand={brand} accent={accent} />
          default:         return null
        }
      })}
    </div>
  )
}

// A heading rendered from rich HTML. `size` sets the font size (with ! so it
// beats RichText's default text-sm); tone picks a dark colour on light
// backgrounds or inherits (for the coloured CTA banner). User colour spans in
// the HTML always win over these defaults.
function RichHeading({
  html, size, tone = 'dark', className,
}: { html: string; size: string; tone?: 'dark' | 'inherit'; className?: string }) {
  return (
    <RichText
      html={html}
      className={cn(size, 'font-bold [&_p]:my-0 [&_p]:leading-tight', tone === 'dark' ? '!text-slate-900' : '!text-inherit', className)}
    />
  )
}

// Applied to careers body copy so heading buttons (H1/H2) render as real,
// larger headings instead of RichText's compact defaults (where H2 is smaller
// than body text). Users' own inline font-size picks still win over these.
const BODY_HEADINGS = '[&_h1]:!text-2xl [&_h1]:!font-bold [&_h2]:!text-xl [&_h2]:!font-semibold'

function TextBlock({ section }: { section: CareersTextSection }) {
  return (
    <section className="max-w-3xl">
      {section.title && <RichHeading html={section.title} size="!text-xl" className="mb-3" />}
      <RichText html={section.body} className={cn('text-base text-slate-600', BODY_HEADINGS)} />
    </section>
  )
}

function BenefitsBlock({ section, brand }: { section: CareersBenefitsSection; brand: string }) {
  const cardBg = section.card_color || '#ffffff'
  return (
    <section>
      {section.title && <RichHeading html={section.title} size="!text-2xl" className="mb-6" />}
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((item, i) => (
          <div key={i} className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 shadow-sm" style={{ backgroundColor: cardBg }}>
            {item.image_url ? (
              // Natural shape: the image spans the card top edge-to-edge with no
              // side gaps and shows in full (no crop). Illustrations that share
              // one aspect ratio stay aligned across cards.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="block w-full" />
            ) : null}
            <div className="flex flex-1 flex-col p-5">
              {!item.image_url && <div className="mb-3 h-1.5 w-8 rounded-full" style={{ backgroundColor: brand }} />}
              {item.title && <RichHeading html={item.title} size="!text-lg" className="[&_p]:leading-snug" />}
              {item.body && <RichText html={item.body} className="mt-1.5 text-sm text-slate-500 [&_h1]:!text-lg [&_h2]:!text-base" />}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function StoryBlock({ section, accent }: { section: CareersStorySection; accent: string }) {
  const external = section.link_url ? /^https?:\/\//i.test(section.link_url) : false
  const align = section.image_align ?? 'left'
  const hasImg = !!section.image_url

  const fit = section.image_fit ?? 'cover'
  const imgStyle: CSSProperties = {}
  if (section.image_width) imgStyle.width = section.image_width
  if (section.image_height) imgStyle.height = section.image_height
  const image = hasImg ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={section.image_url!}
      alt=""
      style={Object.keys(imgStyle).length ? imgStyle : undefined}
      className={cn(
        'rounded-2xl shadow-sm',
        fit === 'contain' ? 'object-contain' : 'object-cover',
        align === 'center' ? 'mx-auto w-full max-w-3xl' : 'w-full',
      )}
    />
  ) : null

  const copy = (
    <div>
      {section.title && <RichHeading html={section.title} size="!text-2xl" className="mb-3" />}
      {section.body && <RichText html={section.body} className={cn('text-base text-slate-600', BODY_HEADINGS)} />}
      {section.link_url && section.link_label && (
        <a
          href={section.link_url}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold hover:opacity-80"
          style={{ color: accent }}
        >
          {section.link_label} <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </div>
  )

  // Stacked layout when the image spans full width (or there's no image).
  if (align === 'center' || !hasImg) {
    return <section className="space-y-6">{image}{copy}</section>
  }

  // Side-by-side; 'right' swaps the columns so the image sits on the right.
  return (
    <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
      <div className={align === 'right' ? 'md:order-2' : undefined}>{image}</div>
      <div className={align === 'right' ? 'md:order-1' : undefined}>{copy}</div>
    </section>
  )
}

function CtaBlock({ section, brand, accent }: { section: CareersCtaSection; brand: string; accent: string }) {
  const text = readableTextOn(brand)
  const accentText = readableTextOn(accent).strong
  const external = section.button_url ? /^https?:\/\//i.test(section.button_url) : false
  return (
    <section className="rounded-3xl px-6 py-14 text-center" style={{ backgroundColor: brand, color: text.strong }}>
      <RichHeading html={section.headline} size="!text-3xl" tone="inherit" className="mx-auto max-w-2xl tracking-tight" />
      {section.subtext && (
        <div className="mx-auto mt-3 max-w-xl" style={{ color: text.muted }}>
          <RichText html={section.subtext} className="!text-inherit text-base" />
        </div>
      )}
      {section.button_url && section.button_label && (
        <a
          href={section.button_url}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="mt-7 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: accent, color: accentText }}
        >
          {section.button_label} <ArrowRight className="h-4 w-4" />
        </a>
      )}
    </section>
  )
}
