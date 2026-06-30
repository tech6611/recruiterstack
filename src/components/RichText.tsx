'use client'

import DOMPurify from 'isomorphic-dompurify'
import { cn } from '@/lib/utils'

/**
 * Read-only renderer for rich text produced by <RichTextEditor> (Tiptap HTML).
 *
 * Why this exists: intake/JD fields are now stored as HTML so bullets, bold,
 * headings etc. survive end-to-end (recruiter input → internal detail view →
 * public apply page). Raw HTML can't be dropped onto a page as-is — especially
 * the *public* apply page — so we sanitize first with DOMPurify, then render.
 *
 * Backward-compatible: older records hold plain text (newlines, no tags). When
 * the value has no HTML markup we render it as plain text with line breaks
 * preserved (React auto-escapes), exactly like before — no bullets, but no
 * regression either.
 *
 * Tailwind's preflight strips list markers, so we re-enable them with scoped
 * arbitrary variants that mirror the editor's own list styling.
 */

const HTML_TAG = /<\/?[a-z][\s\S]*>/i

// These rules are kept in lockstep with the editor's own styling
// (RichTextEditor's [&_.tiptap_*] rules) so the saved/read-only view is a
// pixel match for what the author saw while typing — same heading weight,
// same paragraph/list spacing. If you change one, change the other.
const RICH_TEXT_CLASS = cn(
  'text-sm text-slate-700 leading-relaxed',
  '[&_p]:my-0.5',
  // Empty paragraphs are intentional blank lines the author added in the editor.
  // Without content the browser collapses them to ~0 height, so the spacing that
  // showed while editing disappears after saving. Give them a one-line height so
  // the rendered view matches the editor.
  '[&_p:empty]:min-h-[1.5em]',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-0.5',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-0.5',
  '[&_li]:my-0',
  '[&_h1]:text-base [&_h1]:font-bold [&_h1]:my-1',
  '[&_h2]:text-sm  [&_h2]:font-semibold [&_h2]:my-1',
  '[&_strong]:font-semibold',
  '[&_em]:italic',
  '[&_a]:text-emerald-600 [&_a]:underline',
)

export function RichText({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html || !html.trim()) return null

  // Legacy plain text — keep line breaks, let React escape it.
  if (!HTML_TAG.test(html)) {
    return <div className={cn('text-sm text-slate-700 leading-relaxed whitespace-pre-line', className)}>{html}</div>
  }

  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
  return (
    <div
      className={cn(RICH_TEXT_CLASS, className)}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
