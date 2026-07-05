'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, Trash2, Plus, Upload, X, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor, isHtmlEmpty } from '@/components/RichTextEditor'

// Editor drafts keep every optional field present as a string, which makes the
// controlled inputs simple. Empty strings are accepted by the server schema and
// dropped at render, so we never have to juggle undefined here.
export type SectionDraft =
  | { id: string; type: 'text'; title: string; body: string }
  | { id: string; type: 'benefits'; title: string; items: { title: string; body: string }[] }
  | { id: string; type: 'story'; title: string; body: string; image_url: string; link_label: string; link_url: string }
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
            return { title: str(r.title), body: str(r.body) }
          })
        : []
      out.push({ id, type: 'benefits', title: str(o.title), items })
    } else if (o.type === 'story') {
      out.push({
        id, type: 'story', title: str(o.title), body: str(o.body),
        image_url: str(o.image_url), link_label: str(o.link_label), link_url: str(o.link_url),
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
      out.push({ ...s, title: s.title.trim() })
    } else if (s.type === 'benefits') {
      const items = s.items.map(it => ({ title: it.title.trim(), body: it.body.trim() })).filter(it => it.title)
      if (items.length === 0) continue
      out.push({ ...s, title: s.title.trim(), items })
    } else if (s.type === 'story') {
      const body = isHtmlEmpty(s.body) ? '' : s.body
      const title = s.title.trim()
      const image = s.image_url.trim()
      if (!body && !title && !image) continue
      out.push({
        ...s, title, body, image_url: image,
        link_label: s.link_label.trim(), link_url: s.link_url.trim(),
      })
    } else if (s.type === 'cta') {
      if (!s.headline.trim()) continue
      out.push({
        ...s, headline: s.headline.trim(), subtext: s.subtext.trim(),
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
    case 'benefits': return { id, type, title: '', items: [{ title: '', body: '' }] }
    case 'story':    return { id, type, title: '', body: '', image_url: '', link_label: '', link_url: '' }
    case 'cta':      return { id, type, headline: '', subtext: '', button_label: '', button_url: '' }
  }
}

export function ContentSectionsEditor({
  value, onChange,
}: { value: SectionDraft[]; onChange: (next: SectionDraft[]) => void }) {
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

  return (
    <div className="space-y-4">
      {value.map((section, i) => (
        <SectionCard
          key={section.id}
          section={section}
          index={i}
          total={value.length}
          onUpdate={patch => update(section.id, patch)}
          onRemove={() => remove(section.id)}
          onMove={dir => move(i, dir)}
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
  section, index, total, onUpdate, onRemove, onMove,
}: {
  section: SectionDraft
  index: number
  total: number
  onUpdate: (patch: Partial<SectionDraft>) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <GripVertical className="h-3.5 w-3.5 text-slate-300" />
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

function TextFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'text' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Heading (optional)</Label>
        <Input value={section.title} maxLength={120} placeholder="Our story" onChange={e => onUpdate({ title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Text</Label>
        <RichTextEditor value={section.body} minHeight={120}
          onChange={html => onUpdate({ body: html })}
          placeholder="Write freely — use the toolbar for headings, bold, bullets, and links." />
      </div>
    </div>
  )
}

function BenefitsFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'benefits' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
  function setItem(i: number, patch: Partial<{ title: string; body: string }>) {
    onUpdate({ items: section.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Heading (optional)</Label>
        <Input value={section.title} maxLength={120} placeholder="Our unique approach to benefits" onChange={e => onUpdate({ title: e.target.value })} />
      </div>
      <div className="space-y-2">
        {section.items.map((item, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400">Benefit {i + 1}</span>
              {section.items.length > 1 && (
                <button type="button" onClick={() => onUpdate({ items: section.items.filter((_, j) => j !== i) })}
                  className="text-slate-400 hover:text-red-500" aria-label="Remove benefit">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Input value={item.title} maxLength={80} placeholder="Title (e.g. Unlimited PTO)" onChange={e => setItem(i, { title: e.target.value })} />
            <Textarea value={item.body} maxLength={400} rows={2} placeholder="Short description (optional)" className="mt-2" onChange={e => setItem(i, { body: e.target.value })} />
          </div>
        ))}
        {section.items.length < 12 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onUpdate({ items: [...section.items, { title: '', body: '' }] })}>
            <Plus className="h-3.5 w-3.5" /> Add benefit
          </Button>
        )}
      </div>
    </div>
  )
}

function StoryFields({ section, onUpdate }: { section: Extract<SectionDraft, { type: 'story' }>; onUpdate: (p: Partial<SectionDraft>) => void }) {
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
    const { url } = await res.json()
    onUpdate({ image_url: url })
    toast.success('Image uploaded')
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Heading (optional)</Label>
        <Input value={section.title} maxLength={120} placeholder="Meet the team" onChange={e => onUpdate({ title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Image (optional)</Label>
        <div className="flex items-center gap-3">
          {section.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={section.image_url} alt="" className="h-12 w-20 rounded object-cover border border-slate-200" />
          )}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
          <Button type="button" variant="outline" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {section.image_url ? 'Replace' : 'Upload'}
          </Button>
          {section.image_url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onUpdate({ image_url: '' })}>
              <X className="h-3.5 w-3.5" /> Remove
            </Button>
          )}
        </div>
      </div>
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
        <Input value={section.headline} maxLength={120} placeholder="Ready to do the best work of your career?" onChange={e => onUpdate({ headline: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Subtext (optional)</Label>
        <Textarea value={section.subtext} maxLength={300} rows={2} placeholder="A supporting line under the headline." onChange={e => onUpdate({ subtext: e.target.value })} />
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
