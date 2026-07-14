'use client'

/**
 * RichTextEditor — Tiptap-powered notes field used in ScheduleInterviewModal.
 * Provides a Google-Doc-like toolbar: Bold, Italic, Underline, Strike,
 * Heading 1/2, Bullet list, Numbered list, and Left/Center/Right alignment.
 * Outputs HTML which is stored as-is in the DB and stripped to plain text
 * before being embedded in emails / Google Calendar descriptions.
 */

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit   from '@tiptap/starter-kit'
import Underline    from '@tiptap/extension-underline'
import TextAlign    from '@tiptap/extension-text-align'
import Placeholder  from '@tiptap/extension-placeholder'
import Link         from '@tiptap/extension-link'
import Image        from '@tiptap/extension-image'
import { TextStyle, FontFamily, FontSize } from '@tiptap/extension-text-style'
import { Color }     from '@tiptap/extension-color'
import Highlight     from '@tiptap/extension-highlight'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Link2, Image as ImageIcon, Link2Off,
  Baseline, Highlighter,
} from 'lucide-react'

// ── Toolbar helpers ────────────────────────────────────────────────────────

interface ToolbarBtnProps {
  active:   boolean
  title:    string
  onClick:  () => void
  children: React.ReactNode
}

function ToolbarBtn({ active, title, onClick, children }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      title={title}
      // Use onMouseDown so we don't lose editor focus before the command fires
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-slate-200 text-slate-900'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
}

// A colour picker rendered as a toolbar button: the icon sits above a thin
// colour bar showing the current value, and a hidden native <input type=color>
// captures the choice so users get the full spectrum, not a fixed palette.
interface ColorBtnProps {
  title:   string
  value:   string       // current colour ('' when none)
  fallback: string      // swatch shown when value is empty
  onPick:  (hex: string) => void
  onClear: () => void
  children: React.ReactNode
}

function ColorBtn({ title, value, fallback, onPick, onClear, children }: ColorBtnProps) {
  return (
    <div className="relative flex items-center">
      <label
        title={title}
        onMouseDown={e => e.preventDefault()}
        className="flex cursor-pointer flex-col items-center gap-0.5 rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        {children}
        <span className="h-[3px] w-4 rounded-full" style={{ backgroundColor: value || fallback }} />
        <input
          type="color"
          value={value || fallback}
          onChange={e => onPick(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      {value && (
        <button
          type="button"
          title="Clear"
          onMouseDown={e => { e.preventDefault(); onClear() }}
          className="ml-0.5 text-[10px] font-bold text-slate-400 hover:text-slate-700"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// A compact dropdown rendered inside the toolbar. The first option is the
// "default" (empty value) — leaving it selected applies no inline font/size, so
// the text keeps the page's font and the editor's default size untouched.
interface SelectFieldProps {
  title:   string
  value:   string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  width?:  string
}

function SelectField({ title, value, onChange, options, width = 'w-[92px]' }: SelectFieldProps) {
  return (
    <select
      title={title}
      value={value}
      // Prevent the mousedown from stealing editor selection before change fires
      onMouseDown={e => e.stopPropagation()}
      onChange={e => onChange(e.target.value)}
      className={`${width} rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-600 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400`}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// Curated font families offered inline. The empty-value first entry keeps the
// surrounding page font, so untouched text renders exactly as it does today.
const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Font',        value: '' },
  { label: 'Inter',       value: 'Inter' },
  { label: 'Roboto',      value: 'Roboto' },
  { label: 'Open Sans',   value: 'Open Sans' },
  { label: 'Lato',        value: 'Lato' },
  { label: 'Montserrat',  value: 'Montserrat' },
  { label: 'Poppins',     value: 'Poppins' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Georgia',     value: 'Georgia' },
  { label: 'Courier New', value: 'Courier New' },
]

// Font sizes offered inline. The empty first entry means "default size".
const FONT_SIZES: { label: string; value: string }[] = [
  { label: 'Size', value: '' },
  { label: 'Small',  value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Medium', value: '18px' },
  { label: 'Large',  value: '24px' },
  { label: 'Huge',   value: '32px' },
]

// ── Public helper — strip HTML → plain text for emails / GCal ────────────

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,  '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** True when the HTML content is empty (Tiptap emits "<p></p>" for blank editors) */
export function isHtmlEmpty(html: string): boolean {
  return !html || stripHtml(html).trim() === ''
}

// ── Component ──────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value:        string
  onChange:     (html: string) => void
  placeholder?: string
  minHeight?:   number
  /** Callback that receives the Tiptap editor instance after init — use for inserting text at cursor */
  onEditorReady?: (editor: ReturnType<typeof useEditor>) => void
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Topics to cover, prep instructions…',
  minHeight   = 96,
  onEditorReady,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-emerald-600 underline cursor-pointer' },
        // Merge tokens like {{phone_screen_scheduler}} are valid link targets in
        // this app: they're rewritten to a real URL at send-time. Without this,
        // Tiptap's URL sanitiser strips the token href, leaving a dead/blank link.
        isAllowedUri: (url, ctx) => url.includes('{{') || ctx.defaultValidate(url),
      }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded-lg my-2' } }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
  })

  // Expose editor instance to parent
  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor)
  }, [editor, onEditorReady])

  if (!editor) return null

  const sz = 14 // icon size

  return (
    <div className="rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-400 overflow-hidden bg-white">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 bg-slate-50 flex-wrap">

        {/* Inline formatting */}
        <ToolbarBtn title="Bold (⌘B)"          active={editor.isActive('bold')}       onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Italic (⌘I)"        active={editor.isActive('italic')}     onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Underline (⌘U)"     active={editor.isActive('underline')}  onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Strikethrough"       active={editor.isActive('strike')}     onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={sz} />
        </ToolbarBtn>

        <Divider />

        {/* Text colour + highlight — full spectrum via native colour input */}
        <ColorBtn
          title="Text colour"
          value={editor.getAttributes('textStyle').color ?? ''}
          fallback="#0f172a"
          onPick={hex => editor.chain().focus().setColor(hex).run()}
          onClear={() => editor.chain().focus().unsetColor().run()}
        >
          <Baseline size={sz} />
        </ColorBtn>
        <ColorBtn
          title="Highlight colour"
          value={editor.getAttributes('highlight').color ?? ''}
          fallback="#fef08a"
          onPick={hex => editor.chain().focus().setHighlight({ color: hex }).run()}
          onClear={() => editor.chain().focus().unsetHighlight().run()}
        >
          <Highlighter size={sz} />
        </ColorBtn>

        <Divider />

        {/* Font family + size — leaving either on its default keeps current look */}
        <SelectField
          title="Font"
          value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={v => {
            const chain = editor.chain().focus()
            if (v) chain.setFontFamily(v).run()
            else chain.unsetFontFamily().run()
          }}
          options={FONT_FAMILIES}
          width="w-[104px]"
        />
        <SelectField
          title="Font size"
          value={editor.getAttributes('textStyle').fontSize ?? ''}
          onChange={v => {
            const chain = editor.chain().focus()
            if (v) chain.setFontSize(v).run()
            else chain.unsetFontSize().run()
          }}
          options={FONT_SIZES}
          width="w-[84px]"
        />

        <Divider />

        {/* Headings */}
        <ToolbarBtn title="Heading 1"           active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 2"           active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={sz} />
        </ToolbarBtn>

        <Divider />

        {/* Lists */}
        <ToolbarBtn title="Bullet list"         active={editor.isActive('bulletList')}  onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list"       active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={sz} />
        </ToolbarBtn>

        <Divider />

        {/* Alignment */}
        <ToolbarBtn title="Align left"          active={editor.isActive({ textAlign: 'left' })}   onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Align centre"        active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter size={sz} />
        </ToolbarBtn>
        <ToolbarBtn title="Align right"         active={editor.isActive({ textAlign: 'right' })}  onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight size={sz} />
        </ToolbarBtn>

        <Divider />

        {/* Link — click to set, click again to remove */}
        <ToolbarBtn
          title={editor.isActive('link') ? 'Remove link' : 'Insert link'}
          active={editor.isActive('link')}
          onClick={() => {
            if (editor.isActive('link')) { editor.chain().focus().unsetLink().run(); return }
            const url = window.prompt('Link URL:', 'https://')
            if (url) editor.chain().focus().setLink({ href: url }).run()
          }}
        >
          {editor.isActive('link') ? <Link2Off size={sz} /> : <Link2 size={sz} />}
        </ToolbarBtn>

        {/* Image — insert by URL */}
        <ToolbarBtn
          title="Insert image"
          active={false}
          onClick={() => {
            const url = window.prompt('Image URL:', 'https://')
            if (url) editor.chain().focus().setImage({ src: url }).run()
          }}
        >
          <ImageIcon size={sz} />
        </ToolbarBtn>
      </div>

      {/* ── Editable area ───────────────────────────────────────────────── */}
      <div
        className="px-3 py-2 text-sm text-slate-800 overflow-y-auto cursor-text"
        style={{ minHeight }}
        onClick={() => editor.chain().focus().run()}
      >
        {/* Tiptap renders its own editable div; we wrap for min-height + click-to-focus */}
        <EditorContent
          editor={editor}
          className={`
            [&_.tiptap]:outline-none
            [&_.tiptap_p]:my-0.5
            [&_.tiptap_h1]:text-base [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:my-1
            [&_.tiptap_h2]:text-sm   [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:my-1
            [&_.tiptap_ul]:list-disc  [&_.tiptap_ul]:ml-4 [&_.tiptap_ul]:my-0.5
            [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:ml-4 [&_.tiptap_ol]:my-0.5
            [&_.tiptap_li]:my-0
            [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
            [&_.tiptap_.is-editor-empty:first-child::before]:text-slate-400
            [&_.tiptap_.is-editor-empty:first-child::before]:float-left
            [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none
            [&_.tiptap_.is-editor-empty:first-child::before]:h-0
          `}
        />
      </div>
    </div>
  )
}
