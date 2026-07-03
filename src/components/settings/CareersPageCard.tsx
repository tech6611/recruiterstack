'use client'

import { useEffect, useRef, useState } from 'react'
import { Globe, Upload, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

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

interface FormState {
  careers_slug:   string
  careers_public: boolean
  logo_url:       string | null
  hero_image_url: string | null
  brand_color:    string
  accent_color:   string
  brand_font:     string
  tagline:        string
  about:          string
}

const EMPTY: FormState = {
  careers_slug: '', careers_public: false, logo_url: null, hero_image_url: null,
  brand_color: '#2563eb', accent_color: '#1f7a5a', brand_font: 'Inter',
  tagline: '', about: '',
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
        })
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function uploadImage(kind: 'logo' | 'hero', file: File) {
    setUploading(kind)
    const fd = new FormData()
    fd.append('file', file)
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
          <div className="space-y-5">
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
                </div>
                <p className="text-[11px] text-slate-400">A wide banner photo for the top of your careers page — JPG or PNG, around 1600×500.</p>
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

            {/* Tagline */}
            <div className="space-y-1.5">
              <Label htmlFor="tagline">Tagline</Label>
              <Input id="tagline" maxLength={160} placeholder="Build the future of hiring with us" value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} />
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
        )}
      </CardContent>
    </Card>
  )
}
