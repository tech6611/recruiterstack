/**
 * Read source material the recruiter hands the copilot — a file (PDF, Word,
 * text) or a web link — into plain text the AI can extract job details from.
 *
 * Files: PDF via unpdf (free, local); if that finds almost no text (a scanned
 * PDF) we fall back to Gemini Flash reading the PDF. Word (.docx) via mammoth.
 * Links: server-side fetch with SSRF protection — http(s) only, public IPs
 * only (re-checked on every redirect), 10s timeout, 3 MB cap.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { generateFromPdf } from '@/lib/ai/llm'
import { trackUsage, type UsageIdentity } from '@/lib/ai/track-usage'

/** ~5k tokens — enough for a full JD or brief, without bloating every AI turn. */
export const MAX_SOURCE_CHARS = 20_000
export const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_PAGE_BYTES = 3 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

export class SourceMaterialError extends Error {}

export interface SourceText {
  name: string
  text: string
  truncated: boolean
}

function finish(name: string, raw: string): SourceText {
  const text = raw
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  if (!text) throw new SourceMaterialError(`Couldn't find any text in ${name}.`)
  return { name, text: text.slice(0, MAX_SOURCE_CHARS), truncated: text.length > MAX_SOURCE_CHARS }
}

// ── Files ─────────────────────────────────────────────────────────────────────

export async function readFileText(
  buffer: Buffer, name: string, mimeType: string, identity: UsageIdentity = {},
): Promise<SourceText> {
  if (buffer.length > MAX_FILE_BYTES) throw new SourceMaterialError('That file is over 10 MB.')
  const lower = name.toLowerCase()

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    let text = ''
    try {
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      text = (await extractText(pdf, { mergePages: true })).text as string
    } catch { /* fall through to the AI reader */ }
    // Scanned / image-only PDFs have no text layer — let the AI read the page images.
    if (text.replace(/\s/g, '').length < 200) {
      const { text: aiText, usage, model } = await generateFromPdf(
        'Extract all the text from this document. Keep headings and bullet points. Return only the text, no commentary.',
        buffer.toString('base64'),
        { model: 'gemini-2.5-flash', maxTokens: 8000 },
      )
      trackUsage('copilot-source-pdf', model, usage, identity)
      text = aiText
    }
    return finish(name, text)
  }

  if (lower.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = (await import('mammoth')).default
    const { value } = await mammoth.extractRawText({ buffer })
    return finish(name, value)
  }

  if (lower.endsWith('.doc')) {
    throw new SourceMaterialError('Old Word (.doc) files aren\'t supported — save it as .docx or PDF and try again.')
  }

  if (mimeType.startsWith('text/') || /\.(txt|md|markdown|csv|html?)$/.test(lower)) {
    const raw = buffer.toString('utf-8')
    return finish(name, /\.html?$/.test(lower) || mimeType === 'text/html' ? htmlToText(raw) : raw)
  }

  throw new SourceMaterialError('That file type isn\'t supported. Use PDF, Word (.docx) or a text file.')
}

// ── Links ─────────────────────────────────────────────────────────────────────

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    if (x === '::' || x === '::1') return true
    if (x.startsWith('::ffff:')) return isPrivateAddress(x.slice(7))
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x)
  }
  return true // not an IP at all → treat as unsafe
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try { url = new URL(raw) } catch { throw new SourceMaterialError('That doesn\'t look like a valid link.') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new SourceMaterialError('Only http(s) links can be read.')
  if (url.username || url.password) throw new SourceMaterialError('Links with a username or password can\'t be read.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new SourceMaterialError('That link points to a private address.')
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new SourceMaterialError('Couldn\'t find that website.')
  if (addrs.some(a => isPrivateAddress(a.address))) throw new SourceMaterialError('That link points to a private address.')
  return url
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head|nav|footer|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
}

export async function readLinkText(raw: string, identity: UsageIdentity = {}): Promise<SourceText> {
  let url = await assertPublicUrl(raw.trim())
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'RecruiterStackBot/1.0 (+https://recruiterstack.in)', Accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5' },
      })
    } catch {
      clearTimeout(timer)
      throw new SourceMaterialError('Couldn\'t open that link (it may be down or too slow).')
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer)
      url = await assertPublicUrl(new URL(res.headers.get('location')!, url).toString())
      continue
    }
    try {
      if (!res.ok) throw new SourceMaterialError(`That page returned an error (${res.status}). If it needs a login, download it as a PDF and attach it instead.`)
      const len = Number(res.headers.get('content-length') ?? 0)
      if (len > MAX_PAGE_BYTES) throw new SourceMaterialError('That page is too large to read.')
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_PAGE_BYTES) throw new SourceMaterialError('That page is too large to read.')
      const type = (res.headers.get('content-type') ?? '').toLowerCase()
      const name = url.hostname + url.pathname
      if (type.includes('pdf')) return await readFileText(buf, `${name}.pdf`, 'application/pdf', identity)
      const text = type.includes('html') || !type ? htmlToText(buf.toString('utf-8')) : buf.toString('utf-8')
      const out = finish(name, text)
      if (out.text.length < 200) {
        throw new SourceMaterialError('That page had almost no readable text (it may need a login or load its content with JavaScript). Copy the text into the chat, or attach it as a PDF.')
      }
      return out
    } finally {
      clearTimeout(timer)
    }
  }
  throw new SourceMaterialError('That link redirected too many times.')
}
