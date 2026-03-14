'use client'

/**
 * RichTextEditor — Tiptap-powered notes field used in ScheduleInterviewModal.
 * Provides a Google-Doc-like toolbar: Bold, Italic, Underline, Strike,
 * Heading 1/2, Bullet list, Numbered list, and Left/Center/Right alignment.
 * Outputs HTML which is stored as-is in the DB and stripped to plain text
 * before being embedded in emails / Google Calendar descriptions.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit   from '@tiptap/starter-kit'
import Underline    from '@tiptap/extension-underline'
import TextAlign    from '@tiptap/extension-text-align'
import Placeholder  from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
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
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Topics to cover, prep instructions…',
  minHeight   = 96,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
  })

  if (!editor) return null

  const sz = 14 // icon size

  return (
    <div className="rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-400 overflow-hidden bg-white">

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
