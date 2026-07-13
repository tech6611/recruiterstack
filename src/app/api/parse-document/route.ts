import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { logger } from '@/lib/logger'
import { generateFromPdf } from '@/lib/ai/llm'
import { trackUsage } from '@/lib/ai/track-usage'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

// POST /api/parse-document
// Accepts: multipart/form-data { file: File }
// Supports: PDF (via Gemini document API), TXT, MD
// Returns: { text: string }
export async function POST(request: NextRequest) {
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Could not parse form data.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 10 MB.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const fileType = file.type

  // Plain text — return directly without calling Gemini
  if (
    fileType === 'text/plain' ||
    fileType === 'text/markdown' ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.md')
  ) {
    return NextResponse.json({ text: buffer.toString('utf-8') })
  }

  // PDF — use Gemini's document API
  if (fileType === 'application/pdf' || file.name.endsWith('.pdf')) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI extraction not configured.' }, { status: 500 })
    }

    const base64 = buffer.toString('base64')

    try {
      const { text, usage, model } = await generateFromPdf(
        'Extract all the text content from this document. Return only the extracted text, preserving structure (bullet points, sections, headings) where helpful. Do not add any commentary or preamble.',
        base64,
        { model: 'gemini-2.5-pro', maxTokens: 4000 },
      )
      trackUsage('document-parser', model, usage)
      return NextResponse.json({ text })
    } catch (e) {
      logger.error('Gemini document extraction failed', e)
      return NextResponse.json({ error: 'Failed to extract text from PDF.' }, { status: 500 })
    }
  }

  // Fallback — try to read as UTF-8 text (handles some .docx or other text-like files)
  try {
    const text = buffer.toString('utf-8')
    // Sanity check: if more than 30% of chars are non-printable, reject
    const nonPrintable = (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g) || []).length
    if (nonPrintable / text.length > 0.3) {
      return NextResponse.json(
        { error: 'Unsupported file format. Please use PDF or TXT.' },
        { status: 400 },
      )
    }
    return NextResponse.json({ text })
  } catch {
    return NextResponse.json(
      { error: 'Unsupported file format. Please use PDF or TXT.' },
      { status: 400 },
    )
  }
}
