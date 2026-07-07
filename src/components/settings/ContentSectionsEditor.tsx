'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, Trash2, Plus, Upload, X, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor, isHtmlEmpty } from '@/components/RichTextEditor'

// Editor drafts keep every optional field present as a string, which makes the
// controlled inputs simple. Empty strings are accepted by the server schema and
// dropped at render, so we never have to juggle undefined here.
export type ImageAlign = 'left' | 'right' | 'center'
export type ImageFit = 'cover' | 'contain'
export type BenefitItemDraft = { title: string; body: string; image_url: string }
export type SectionDraft =
  | { id: string; type: 'text'; title: string; body: string }
  | { id: string; type: 'benefits'; title: string; card_color: string; items: BenefitItemDraft[] }
  | { id: string; type: 'story'; title: string; body: string; image_url: string; image_width: string; image_height: string; image_fit: ImageFit; image_align: ImageAlign; link_label: string; link_url: string }
  | { id: string; type: 'cta'; headline: string; subtext: string; button_label: string; button_url: string }

const TYPE_LABELS: Record<SectionDraft['type'], string> = {
  text: 'Text',
  benefits: 'Benefits grid',
  story: 'Story / spotlight',
  cta: 'Call-to-action banner',
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `s${Date.now()}${Math.random().toString(36).slice(2, 7)}`
}

function str(v: unknown): string { return typeof v === 'string' ? v : '' }
// Rich HTML fields collapse to '' when the editor only holds an empty "<p></p>".
function rich(v: string): string { return isHtmlEmpty(v) ? '' : v }

// Coerce stored JSON (loaded from the API) into editor drafts, filling in any
// missing fields so every input is controlled from the first render.
export function toDrafts(raw: unknown): SectionDraft[] {
  if (!Array.isArray(raw)) return []
  const out: SectionDraft[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = str(o.id) || newId()
    if (o.type === 'text') {
      out.push({ id, type: 'text', title: str(o.title), body: str(o.body) })
    } else if (o.type === 'benefits') {
      const items = Array.isArray(o.items)
        ? o.items.map(it => {
            const r = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>
            return { title: str(r.title), body: str(r.body), image_url: str(r.image_url) }
          })
        : []
      out.push({ id, type: 'benefits', title: str(o.title), card_color: str(o.card_color), items })
    } else if (o.type === 'story') {
      out.push({
        id, type: 'story', title: str(o.title), body: str(o.body),
        image_url: str(o.image_url),
        image_width: str(o.image_width),
        image_height: str(o.image_height),
        image_fit: o.image_fit === 'contain' ? 'contain' : 'cover',
        image_align: (o.image_align === 'left' || o.image_align === 'right' || o.image_align === 'center') ? o.image_align : 'left',
        link_label: str(o.link_label), link_url: str(o.link_url),
      })
    } else if (o.type === 'cta') {
      out.push({
        id, type: 'cta', headline: str(o.headline), subtext: str(o.subtext),
        button_label: str(o.button_label), button_url: str(o.button_url),
      })
    }
  }
  return out
}

// Strip empty inputs and drop blocks with no real content before saving, so a
// half-filled block never fails server validation (which would block the whole
// settings save). Mirrors the render-time sanitizer in the domain layer.
export function cleanDrafts(drafts: SectionDraft[]): SectionDraft[] {
  const out: SectionDraft[] = []
  for (const s of drafts) {
    if (s.type === 'text') {
      if (isHtmlEmpty(s.body)) continue
      out.push({ ...s, title: rich(s.title) })
    } else if (s.type === 'benefits') {
      const items = s.items
        .map(it => ({ title: rich(it.title), body: rich(it.body), image_url: it.image_url.trim() }))
        .filter(it => it.title || it.body || it.image_url)
      if (items.length === 0) continue
      out.push({ ...s, title: rich(s.title), card_color: s.card_color.trim(), items })
    } else if (s.type === 'story') {
      const body = rich(s.body)
      const title = rich(s.title)
      const image = s.image_url.trim()
      if (!body && !title && !image) continue
      out.push({
        ...s, title, body, image_url: image,
        image_width: image ? s.image_width.trim() : '',
        image_height: image ? s.image_height.trim() : '',
        image_fit: s.image_fit,
        image_align: s.image_align,
        link_label: s.link_label.trim(), link_url: s.link_url.trim(),
      })
    } else if (s.type === 'cta') {
      if (isHtmlEmpty(s.headline)) continue
      out.push({
        ...s, headline: rich(s.headline), subtext: rich(s.subtext),
        button_label: s.button_label.trim(), button_url: s.button_url.trim(),
      })
    }
  }
  return out
}

function blankSection(type: SectionDraft['type']): SectionDraft {
  const id = newId()
  switch (type) {
    case 'text':     return { id, type, title: '', body: '' }
    case 'benefits': return { id, type, title: '', card_color: '', items: [{ title: '', body: '', image_url: '' }] }
    case 'story':    return { id, type, title: '', body: '', image_url: '', image_width: '', image_height: '', image_fit: 'cover', image_align: 'left', link_label: '', link_url: '' }
    case 'cta':      return { id, type, headline: '', subtext: '', button_label: '', button_url: '' }
  }
}

export function ContentSectionsEditor({
  value, onChange,
}: { value: SectionDraft[]; onChange: (next: SectionDraft[]) => void }) {
  // Drag-to-reorder state. dragIndex = the card being dragged; overIndex = the
  // card it's currently hovering, so we can highlight the drop target.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function add(type: SectionDraft['type']) {
    onChange([...value, blankSection(type)])
  }
  function update(id: string, patch: Partial<SectionDraft>) {
    onChange(value.map(s => (s.id === id ? { ...s, ...patch } as SectionDraft : s)))
  }
  function remove(id: string) {
    onChange(value.filter(s => s.id !== id))
  }
  function move(index: number, dir: -1 | 1) {
    const next = [...value]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= value.length || to >= value.length) return
    const next = [...value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }
  function drop(target: number) {
    if (dragIndex !== null) reorder(dragIndex, target)
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="space-y-4">
      {value.map((section, i) => (
        <SectionCard
          key={section.id}
          section={section}
          index={i}
          total={value.length}
          dragging={dragIndex === i}
          over={overIndex === i && dragIndex !== null && dragIndex !== i}
          onUpdate={patch => update(section.id, patch)}
          onRemove={() => remove(section.id)}
          onMove={dir => move(i, dir)}
          onDragStart={() => setDragIndex(i)}
          onDragOver={() => { if (dragIndex !== null && overIndex !== i) setOverIndex(i) }}
          onDrop={() => drop(i)}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Add section:</span>
        {(Object.keys(TYPE_LABELS) as SectionDraft['type'][]).map(type => (
          <Button key={type} type="button" variant="outline" size="sm" onClick={() => add(type)}>
            <Plus className="h-3.5 w-3.5" /> {TYPE_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  )
}

function SectionCard({
  section, index, total, dragging, over, onUpdate, onRemove, onMove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  section: SectionDraft
  index: number
  total: number
  dragging: boolean
  over: boolean
  onUpdate: (patch: Partial<SectionDraft>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onDragStart: () => void
  onDragOver: () => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDrop={e => { e.preventDefault(); onDrop() }}
      className={cn(
        'rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition',
        dragging && 'opacity-40',
        over && 'border-emerald-400 ring-2 ring-emerald-200',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {/* Drag handle — the whole card follows when you drag this grip. */}
          <button
            type="button"
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
            onDragEnd={onDragEnd}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            className="cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          {TYPE_LABELS[section.type]}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={onRemove}
            className="rounded p-1 text-slate-400 hover:text-red-500" aria-label="Remove section">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {section.type === 'text' && <TextFields section={section} onUpdate={onUpdate} />}
      {section.type === 'benefits' && <BenefitsFields section={section} onUpdate={onUpdate} />}
      {section.type === 'story' && <StoryFields section={section} onUpdate={onUpdate} />}
      {section.type === 'cta' && <CtaFields section={section} onUpdate={onUpdate} />}
    </div>
  )
}

// A short, single-line-ish rich editor for headings — same toolbar (colour,
// highlight, bold…) as body fields, just less tall.
function HeadingEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder: string }) {
  return <RichTextEditor value={value} minHeight={40} onChange={onChange} placeholder={placeholder} />
}

// Reusable image uploader — used by Story and by each Benefit card. Reuses the
// branding-upload endpoint ('story' kind → company-assets bucket).
function ImageUpload({
  url, onChange, previewClass = 'h-12 w-20',
}: { url: string; onChange: (u: string) => void; previewClass?: string }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  async function upload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('kind', 'story')
    const res = await fetch('/api/org-settings/branding-upload', { method: 'POST', body: fd })
    setUploading(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Upload failed')
      return
    }
    const { url: uploaded } = await res.json()
    onChange(uploaded)
    toast.success('Image uploaded')
  }
  return (
    <div className="flex items-center gap-3">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={`${previewClass} rounded object-cover border border-slate-200`} />
      )}
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
        <Upload className="h-3.5 w-3.5" /> {url ? 'Replace' : 'Upload'}
      </Button>
      {url && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
          <X className="h-3.5 w-3.5" /> Remove
        </Button>
      )}
    </div>
  )
}

// A colour field with a swatch + hex input + clear, for card fill colours.
function ColorField({ label, value, onChange, hint }: { label: string; value: string; onChange: (hex: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
        <Input value={value} maxLength={7} placeholder="#f8fafc" className="w-28" onChange={e => onChange(e.target.value)} />
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function TextFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'text' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Heading (optional)</Label>
        <HeadingEditor value={section.title} placeholder="Our story" onChange={html => onUpdate({ title: html })} />
      </div>
      <div className="space-y-1.5">
        <Label>Text</Label>
        <RichTextEditor value={section.body} minHeight={120}
          onChange={html => onUpdate({ body: html })}
          placeholder="Write freely — use the toolbar for headings, colour, highlight, bold, bullets, and links." />
      </div>
    </div>
  )
}

function BenefitsFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'benefits' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
  function setItem(i: number, patch: Partial<BenefitItemDraft>) {
    onUpdate({ items: section.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Heading (optional)</Label>
        <HeadingEditor value={section.title} placeholder="Our unique approach to benefits" onChange={html => onUpdate({ title: html })} />
      </div>
      <ColorField label="Card fill colour (optional)" value={section.card_color}
        onChange={card_color => onUpdate({ card_color })}
        hint="Fills the card behind the text. Set it to match your artwork's background. Leave blank for white." />
      <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        <strong>Image tip:</strong> each card image sits in a fixed <strong>4:3 box</strong>.
        For the sharpest result use a landscape image around <strong>800&nbsp;×&nbsp;600&nbsp;px (4:3)</strong>,
        ideally with a background matching your card colour. Images of other shapes
        are stretched to fit the box, which can look squished or blurry.
      </p>
      <div className="space-y-2">
        {section.items.map((item, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Benefit {i + 1}</span>
              {section.items.length > 1 && (
                <button type="button" onClick={() => onUpdate({ items: section.items.filter((_, j) => j !== i) })}
                  className="text-slate-400 hover:text-red-500" aria-label="Remove benefit">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <HeadingEditor value={item.title} placeholder="Title (e.g. Unlimited PTO)" onChange={html => setItem(i, { title: html })} />
            <RichTextEditor value={item.body} minHeight={70}
              onChange={html => setItem(i, { body: html })}
              placeholder="Short description (optional)" />
            <ImageUpload url={item.image_url} onChange={u => setItem(i, { image_url: u })} previewClass="h-12 w-16" />
          </div>
        ))}
        {section.items.length < 12 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate({ items: [...section.items, { title: '', body: '', image_url: '' }] })}>
            <Plus className="h-3.5 w-3.5" /> Add benefit
          </Button>
        )}
      </div>
    </div>
  )
}

const ALIGN_LABELS: { value: ImageAlign; label: string }[] = [
  { value: 'left', label: 'Left of text' },
  { value: 'right', label: 'Right of text' },
  { value: 'center', label: 'Full width' },
]

function StoryFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'story' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Heading (optional)</Label>
        <HeadingEditor value={section.title} placeholder="Meet the team" onChange={html => onUpdate({ title: html })} />
      </div>
      <div className="space-y-1.5">
        <Label>Image (optional)</Label>
        <ImageUpload url={section.image_url} onChange={u => onUpdate({ image_url: u })} />
      </div>
      {section.image_url && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="space-y-1.5">
            <Label>Image placement</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALIGN_LABELS.map(a => (
                <button key={a.value} type="button" onClick={() => onUpdate({ image_align: a.value })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    section.image_align === a.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  {a.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">Tip: pick <strong>Full width</strong> to let the image span the whole page — side placements share the row with your text, so the image can be at most half the width.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Image width (optional)</Label>
              <Input value={section.image_width} maxLength={12} placeholder="e.g. 60% or 320px"
                onChange={e => onUpdate({ image_width: e.target.value })} />
              <p className="text-xs text-slate-400">Percentage (10%–100%) or pixels. Blank = default.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Image height (optional)</Label>
              <Input value={section.image_height} maxLength={12} placeholder="e.g. 320px or 60%"
                onChange={e => onUpdate({ image_height: e.target.value })} />
              <p className="text-xs text-slate-400">Pixels or percentage. Blank = keep the natural shape.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>When a height is set</Label>
            <div className="flex flex-wrap gap-1.5">
              {([['cover', 'Fill (crop to fit)'], ['contain', 'Fit (show whole image)']] as [ImageFit, string][]).map(([value, label]) => (
                <button key={value} type="button" onClick={() => onUpdate({ image_fit: value })}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    section.image_fit === value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Text (optional)</Label>
        <RichTextEditor value={section.body} minHeight={100}
          onChange={html => onUpdate({ body: html })}
          placeholder="Tell the story — founder note, team culture, a documentary link…" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Link label (optional)</Label>
          <Input value={section.link_label} maxLength={60} placeholder="Watch our story" onChange={e => onUpdate({ link_label: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Link URL (optional)</Label>
          <Input value={section.link_url} maxLength={300} placeholder="https://…" onChange={e => onUpdate({ link_url: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

function CtaFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'cta' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Headline</Label>
        <HeadingEditor value={section.headline} placeholder="Ready to do the best work of your career?" onChange={html => onUpdate({ headline: html })} />
      </div>
      <div className="space-y-1.5">
        <Label>Subtext (optional)</Label>
        <RichTextEditor value={section.subtext} minHeight={70}
          onChange={html => onUpdate({ subtext: html })}
          placeholder="A supporting line under the headline." />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Button label (optional)</Label>
          <Input value={section.button_label} maxLength={40} placeholder="See open roles" onChange={e => onUpdate({ button_label: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Button link (optional)</Label>
          <Input value={section.button_url} maxLength={300} placeholder="#roles" onChange={e => onUpdate({ button_url: e.target.value })} />
        </div>
      </div>
    </div>
  )
}
