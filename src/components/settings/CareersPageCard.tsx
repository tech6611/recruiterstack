'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, Upload, ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { recenterLogo } from '@/lib/branding/normalize-logo'
import { readableTextOn } from '@/lib/branding/contrast'

// Curated Google Fonts the careers page can render. Phase 2b loads the chosen
// family; here we just store the name.
const FONT_OPTIONS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Poppins', 'Source Sans 3', 'Nunito', 'Work Sans', 'DM Sans',
]

// Mirror of the server-side rules (validations/org-settings.ts) so we can warn
// before the user hits Save.
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RESERVED = new Set([
  'api', 'app', 'admin', 'apply', 'intake', 'schedule', 'careers', 'settings',
  'sign-in', 'sign-up', 'dashboard', 'pricing', 'features', 'about', 'blog',
  'www', 'mail', 'support', 'help', 'docs', 'status',
])

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function slugError(slug: string): string | null {
  if (!slug) return null
  if (slug.length < 3) return 'At least 3 characters'
  if (slug.length > 40) return 'At most 40 characters'
  if (!SLUG_REGEX.test(slug)) return 'Lowercase letters, numbers, and hyphens only'
  if (RESERVED.has(slug)) return 'That name is reserved — pick another'
  return null
}

interface NavLinkForm {
  label: string
  url:   string
}

interface FormState {
  careers_slug:     string
  careers_public:   boolean
  logo_url:         string | null
  hero_image_url:   string | null
  brand_color:      string
  accent_color:     string
  brand_font:       string
  tagline:          string
  about:            string
  hero_headline:    string
  hero_subheadline: string
  nav_links:        NavLinkForm[]
  nav_cta_label:    string
  nav_cta_url:      string
  show_powered_by:  boolean
}

const EMPTY: FormState = {
  careers_slug: '', careers_public: false, logo_url: null, hero_image_url: null,
  brand_color: '#2563eb', accent_color: '#1f7a5a', brand_font: 'Inter',
  tagline: '', about: '',
  hero_headline: '', hero_subheadline: '', nav_links: [],
  nav_cta_label: '', nav_cta_url: '', show_powered_by: true,
}

export function CareersPageCard() {
  const [form,   setForm]   = useState<FormState>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [slugTouched, setSlugTouched] = useState(false)
  const [companyName, setCompanyName] = useState('')

  const logoInput = useRef<HTMLInputElement>(null)
  const heroInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<'logo' | 'hero' | null>(null)

  useEffect(() => {
    fetch('/api/org-settings/company')
      .then(r => r.json())
      .then(({ data }) => {
        setCompanyName(data?.company_name ?? '')
        const hasSlug = !!data?.careers_slug
        setSlugTouched(hasSlug)
        setForm({
          careers_slug:   data?.careers_slug ?? (data?.company_name ? slugify(data.company_name) : ''),
          careers_public: !!data?.careers_public,
          logo_url:       data?.logo_url ?? null,
          hero_image_url: data?.hero_image_url ?? null,
          brand_color:    data?.brand_color ?? '#2563eb',
          accent_color:   data?.accent_color ?? '#1f7a5a',
          brand_font:     data?.brand_font ?? 'Inter',
          tagline:        data?.tagline ?? '',
          about:          data?.about ?? '',
          hero_headline:    data?.hero_headline ?? '',
          hero_subheadline: data?.hero_subheadline ?? '',
          nav_links:        Array.isArray(data?.nav_links)
            ? data.nav_links
                .filter((l: unknown): l is NavLinkForm =>
                  !!l && typeof l === 'object' &&
                  typeof (l as NavLinkForm).label === 'string' &&
                  typeof (l as NavLinkForm).url === 'string')
                .map((l: NavLinkForm) => ({ label: l.label, url: l.url }))
            : [],
          nav_cta_label:    data?.nav_cta_label ?? '',
          nav_cta_url:      data?.nav_cta_url ?? '',
          show_powered_by:  data?.show_powered_by ?? true,
        })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function uploadImage(kind: 'logo' | 'hero', file: File) {
    setUploading(kind)
    // Re-center the logo's artwork so uneven padding can't make it look
    // off-center on the careers/apply pages. Hero banners are left untouched.
    const prepared = kind === 'logo' ? await recenterLogo(file) : file
    const fd = new FormData()
    fd.append('file', prepared)
    fd.append('kind', kind)
    const res = await fetch('/api/org-settings/branding-upload', { method: 'POST', body: fd })
    setUploading(null)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Upload failed')
      return
    }
    const { url } = await res.json()
    setForm(f => ({ ...f, [kind === 'logo' ? 'logo_url' : 'hero_image_url']: url }))
    toast.success(`${kind === 'logo' ? 'Logo' : 'Hero image'} uploaded`)
  }

  const slugErr = slugError(form.careers_slug)

  async function save() {
    if (form.careers_public && !form.careers_slug) {
      toast.error('Pick a page address before going live')
      return
    }
    if (slugErr) {
      toast.error(slugErr)
      return
    }
    setSaving(true)
    const res = await fetch('/api/org-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        careers_slug:   form.careers_slug || null,
        careers_public: form.careers_public,
        logo_url:       form.logo_url,
        hero_image_url: form.hero_image_url,
        brand_color:    form.brand_color || null,
        accent_color:   form.accent_color || null,
        brand_font:     form.brand_font || null,
        tagline:        form.tagline.trim() || null,
        about:          form.about.trim() || null,
        hero_headline:    form.hero_headline.trim() || null,
        hero_subheadline: form.hero_subheadline.trim() || null,
        nav_links:        form.nav_links
          .map(l => ({ label: l.label.trim(), url: l.url.trim() }))
          .filter(l => l.label && l.url),
        nav_cta_label:    form.nav_cta_label.trim() || null,
        nav_cta_url:      form.nav_cta_url.trim() || null,
        show_powered_by:  form.show_powered_by,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Save failed')
      return
    }
    toast.success('Careers page saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-emerald-600" /> Careers page
        </CardTitle>
        <CardDescription>A branded public page listing your open jobs at recruiterstack.in/careers/your-name.</CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            {/* Form column */}
            <div className="space-y-5 order-2 lg:order-1">
            {/* Page address (slug) */}
            <div className="space-y-1.5">
              <Label htmlFor="careers_slug">Page address</Label>
              <div className="flex items-center gap-1 text-sm">
                <span className="text-slate-400 whitespace-nowrap">recruiterstack.in/careers/</span>
                <Input
                  id="careers_slug"
                  value={form.careers_slug}
                  placeholder="acme"
                  onChange={e => {
                    setSlugTouched(true)
                    setForm({ ...form, careers_slug: slugify(e.target.value) })
                  }}
                />
              </div>
              {slugErr ? (
                <p className="text-[11px] text-red-500">{slugErr}</p>
              ) : !slugTouched && companyName ? (
                <p className="text-[11px] text-slate-400">Suggested from your company name — edit if you like.</p>
              ) : (
                <p className="text-[11px] text-slate-400">Lowercase letters, numbers, and hyphens. Must be unique.</p>
              )}
            </div>

            {/* Logo + hero uploads */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  {form.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="Logo" className="h-10 w-10 rounded object-contain border border-slate-200 bg-white" />
                  )}
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('logo', f) }}
                  />
                  <Button type="button" variant="outline" size="sm" loading={uploading === 'logo'} onClick={() => logoInput.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> {form.logo_url ? 'Replace' : 'Upload'}
                  </Button>
                  {form.logo_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, logo_url: null }))}>
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">PNG with a transparent background works best — it sits cleanly on any color. Square or wide both work.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Hero image</Label>
                <div className="flex items-center gap-3">
                  {form.hero_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.hero_image_url} alt="Hero" className="h-10 w-16 rounded object-cover border border-slate-200 bg-white" />
                  )}
                  <input
                    ref={heroInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('hero', f) }}
                  />
                  <Button type="button" variant="outline" size="sm" loading={uploading === 'hero'} onClick={() => heroInput.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> {form.hero_image_url ? 'Replace' : 'Upload'}
                  </Button>
                  {form.hero_image_url && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, hero_image_url: null }))}>
                      <X className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">A wide banner photo for the top of your careers page — JPG or PNG, around 1600×500. Optional — leave empty for a clean solid-color banner. Don’t upload your logo here; use the Logo slot.</p>
              </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="brand_color">Primary color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.brand_color}
                    onChange={e => setForm({ ...form, brand_color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                    aria-label="Primary color"
                  />
                  <Input id="brand_color" value={form.brand_color} onChange={e => setForm({ ...form, brand_color: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accent_color">Accent color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.accent_color}
                    onChange={e => setForm({ ...form, accent_color: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                    aria-label="Accent color"
                  />
                  <Input id="accent_color" value={form.accent_color} onChange={e => setForm({ ...form, accent_color: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Font */}
            <div className="space-y-1.5">
              <Label htmlFor="brand_font">Font</Label>
              <Select id="brand_font" value={form.brand_font} onChange={e => setForm({ ...form, brand_font: e.target.value })}>
                {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </div>

            {/* Hero copy */}
            <div className="space-y-1.5">
              <Label htmlFor="hero_headline">Hero headline</Label>
              <Input id="hero_headline" maxLength={80} placeholder="Advance your career with us" value={form.hero_headline} onChange={e => setForm({ ...form, hero_headline: e.target.value })} />
              <p className="text-[11px] text-slate-400">The big line at the top of the page. Leave empty to use your company name.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hero_subheadline">Hero subheadline</Label>
              <Input id="hero_subheadline" maxLength={200} placeholder="Come do the best work of your life with a world-class team." value={form.hero_subheadline} onChange={e => setForm({ ...form, hero_subheadline: e.target.value })} />
              <p className="text-[11px] text-slate-400">The supporting line under the headline. Leave empty to use your tagline.</p>
            </div>

            {/* Tagline */}
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" maxLength={160} placeholder="Build the future of hiring with us" value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} />
              <p className="text-[11px] text-slate-400">A short line used for search-engine previews (and the hero subheadline if you leave that empty).</p>
            </div>

            {/* Top navigation */}
            <div className="space-y-2">
              <Label>Top navigation links</Label>
              <p className="-mt-1 text-[11px] text-slate-400">Links shown in the top bar, e.g. “About us” or “Our vision”. Up to 6.</p>
              {form.nav_links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Link ${i + 1} label`}
                    maxLength={40}
                    placeholder="About us"
                    value={link.label}
                    onChange={e => setForm(f => ({ ...f, nav_links: f.nav_links.map((l, j) => j === i ? { ...l, label: e.target.value } : l) }))}
                  />
                  <Input
                    aria-label={`Link ${i + 1} URL`}
                    maxLength={300}
                    placeholder="https://yoursite.com/about"
                    value={link.url}
                    onChange={e => setForm(f => ({ ...f, nav_links: f.nav_links.map((l, j) => j === i ? { ...l, url: e.target.value } : l) }))}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, nav_links: f.nav_links.filter((_, j) => j !== i) }))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {form.nav_links.length < 6 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, nav_links: [...f.nav_links, { label: '', url: '' }] }))}>
                  Add link
                </Button>
              )}
            </div>

            {/* Top-right CTA button */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nav_cta_label">Top-right button label</Label>
                <Input id="nav_cta_label" maxLength={30} placeholder="View open roles" value={form.nav_cta_label} onChange={e => setForm({ ...form, nav_cta_label: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nav_cta_url">Top-right button link</Label>
                <Input id="nav_cta_url" maxLength={300} placeholder="#roles" value={form.nav_cta_url} onChange={e => setForm({ ...form, nav_cta_url: e.target.value })} />
              </div>
              <p className="text-[11px] text-slate-400 sm:col-span-2">Leave both empty for a default “View open roles” button that jumps to your job list.</p>
            </div>

            {/* About */}
            <div className="space-y-1.5">
              <Label htmlFor="about">About</Label>
              <Textarea id="about" maxLength={4000} placeholder="A few sentences about your company, culture, and mission." value={form.about} onChange={e => setForm({ ...form, about: e.target.value })} />
            </div>

            {/* Public toggle */}
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.careers_public}
                onChange={e => setForm({ ...form, careers_public: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Make this page public</span>
                <span className="block text-xs text-slate-400">When on, anyone with the link can see your open jobs. When off, the page is hidden.</span>
              </span>
            </label>

            {/* Powered-by toggle */}
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.show_powered_by}
                onChange={e => setForm({ ...form, show_powered_by: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Show “Powered by RecruiterStack”</span>
                <span className="block text-xs text-slate-400">A small credit in the page footer. Turn off to hide it.</span>
              </span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-between">
              {form.careers_slug && !slugErr ? (
                <a
                  href={`/careers/${form.careers_slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Preview page
                </a>
              ) : <span />}
              <Button onClick={save} loading={saving}>Save</Button>
            </div>
            </div>

            {/* Preview column — sticky beside the form on wide screens */}
            <div className="order-1 lg:order-2">
              <div className="lg:sticky lg:top-6">
                <CareersPreview form={form} company={companyName} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Loads the chosen Google Font into the document so the preview renders in the
// real family, not a fallback. Leaves the <link> in place across font switches.
function useGoogleFont(family: string) {
  useEffect(() => {
    if (!family) return
    const id = `gf-${family.replace(/\s+/g, '-')}`
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
    document.head.appendChild(link)
  }, [family])
}

// A miniature, live-updating render of the public careers page. Faithfully
// mirrors the hero + roles markup (colors, font, logo, hero, tagline, name) so
// customers see exactly how their branding lands before they publish.
function CareersPreview({ form, company }: { form: FormState; company: string }) {
  const brand = form.brand_color || '#2563eb'
  const accent = form.accent_color || '#1f7a5a'
  const font = form.brand_font || 'Inter'
  const name = company || 'Your company'
  const hasHero = !!form.hero_image_url
  const text = hasHero ? { strong: '#ffffff', muted: 'rgba(255,255,255,0.85)' } : readableTextOn(brand)
  const accentText = readableTextOn(accent).strong

  useGoogleFont(font)

  return (
    <div className="space-y-1.5">
      <Label>Live preview</Label>
      <div
        className="overflow-hidden rounded-xl border border-slate-200 shadow-sm"
        style={{ fontFamily: `'${font}', system-ui, sans-serif` }}
      >
        {/* Top nav: logo (or name) left, brand-accent CTA right */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
          {form.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logo_url} alt="" className="h-6 w-auto max-w-[110px] object-contain" />
          ) : (
            <span className="text-xs font-bold text-slate-900">{name}</span>
          )}
          <div className="flex items-center gap-2">
            {form.nav_links.slice(0, 3).map((link, i) => (
              link.label.trim() ? (
                <span key={i} className="hidden text-[10px] font-semibold text-slate-500 sm:inline">
                  {link.label}
                </span>
              ) : null
            ))}
            <span
              className="rounded-md px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: accent, color: accentText }}
            >
              {form.nav_cta_label || 'View open roles'}
            </span>
          </div>
        </div>

        {/* Hero */}
        <div className="relative overflow-hidden" style={hasHero ? undefined : { backgroundColor: brand }}>
          {hasHero && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.hero_image_url!} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-slate-900/55" />
            </>
          )}
          <div className="relative px-5 py-9 text-center">
            <p className="text-xl font-bold leading-tight" style={{ color: text.strong }}>{form.hero_headline || name}</p>
            {(form.hero_subheadline || form.tagline) && (
              <p className="mt-1.5 text-xs" style={{ color: text.muted }}>{form.hero_subheadline || form.tagline}</p>
            )}
            <span
              className="mt-4 inline-flex rounded-lg px-3 py-1.5 text-[10px] font-bold"
              style={{ backgroundColor: accent, color: accentText }}
            >
              Explore open roles
            </span>
          </div>
        </div>

        {/* Body: a sample role card */}
        <div className="bg-slate-50 px-5 py-5">
          <p className="mb-2.5 text-xs font-bold text-slate-900">Open roles</p>
          <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <span
              className="mb-2 inline-flex w-fit rounded-full px-2 py-0.5 text-[9px] font-semibold"
              style={{ backgroundColor: `${brand}14`, color: brand }}
            >
              Customer Success
            </span>
            <p className="text-xs font-bold text-slate-900">Senior Customer Success Manager</p>
            <p className="mt-1 text-[10px] text-slate-500">Bengaluru · Full-time · Hybrid</p>
            <span
              className="mt-3 inline-flex w-fit rounded-lg px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: accent, color: accentText }}
            >
              Apply
            </span>
          </div>
          <p className="mt-3 text-center text-[10px] text-slate-400">
            Powered by <span className="font-semibold" style={{ color: accent }}>RecruiterStack</span>
          </p>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">Updates as you edit — this is how your public careers page will look.</p>
    </div>
  )
}
