import { ArrowRight } from 'lucide-react'
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
export function ContentSections({
  sections, brand, accent,
}: { sections: CareersContentSection[]; brand: string; accent: string }) {
  if (sections.length === 0) return null
  return (
    <div className="space-y-12">
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

function TextBlock({ section }: { section: CareersTextSection }) {
  return (
    <section className="max-w-3xl">
      {section.title && <h2 className="mb-3 text-lg font-bold text-slate-900">{section.title}</h2>}
      <RichText html={section.body} className="text-slate-600" />
    </section>
  )
}

function BenefitsBlock({ section, brand }: { section: CareersBenefitsSection; brand: string }) {
  return (
    <section>
      {section.title && <h2 className="mb-6 text-2xl font-bold text-slate-900">{section.title}</h2>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((item, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 h-1.5 w-8 rounded-full" style={{ backgroundColor: brand }} />
            <p className="text-base font-bold text-slate-900">{item.title}</p>
            {item.body && <p className="mt-1.5 text-sm text-slate-500">{item.body}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

function StoryBlock({ section, accent }: { section: CareersStorySection; accent: string }) {
  const external = section.link_url ? /^https?:\/\//i.test(section.link_url) : false
  return (
    <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
      {section.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={section.image_url} alt={section.title ?? ''} className="w-full rounded-2xl object-cover shadow-sm" />
      )}
      <div>
        {section.title && <h2 className="mb-3 text-2xl font-bold text-slate-900">{section.title}</h2>}
        {section.body && <RichText html={section.body} className="text-slate-600" />}
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
    </section>
  )
}

function CtaBlock({ section, brand, accent }: { section: CareersCtaSection; brand: string; accent: string }) {
  const text = readableTextOn(brand)
  const accentText = readableTextOn(accent).strong
  const external = section.button_url ? /^https?:\/\//i.test(section.button_url) : false
  return (
    <section className="rounded-3xl px-6 py-14 text-center" style={{ backgroundColor: brand }}>
      <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight" style={{ color: text.strong }}>
        {section.headline}
      </h2>
      {section.subtext && (
        <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: text.muted }}>
          {section.subtext}
        </p>
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
