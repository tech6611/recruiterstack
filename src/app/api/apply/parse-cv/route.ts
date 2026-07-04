import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { getCanonicalApplyJobByToken } from '@/modules/ats/domain/job-pipelines'
import { generateFromPdf, generateText } from '@/lib/ai/llm'
import { buildAutofill, type RawParsedResume } from '@/lib/apply/resume-autofill'
import { logger } from '@/lib/logger'

export const maxDuration = 30

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const DOC = 'application/msword'
const ALLOWED = [PDF, DOCX, DOC]

// gemini-2.5-flash (via the Haiku alias). This is a public, latency-sensitive
// endpoint and Flash is fast, cheap, and accurate enough for these always-present
// structured fields; the candidate reviews every value anyway. (Flash also
// supports thinkingBudget:0, which the pro model rejects — see llm.ts.)
const MODEL = 'claude-haiku-4-5-20251001'

// The extraction contract. Kept deliberately narrow and always-optional so the
// model has nowhere to wander; every value is re-checked against the resume
// text by buildAutofill() before it can reach the form.
const EXTRACTION_PROMPT = `Extract the candidate's details from this CV/resume.
Only use information that is explicitly written in the document — never guess or
infer. If a field is not clearly present, use null. Return ONLY valid JSON:
{
  "name": "<full name or null>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "linkedin_url": "<LinkedIn profile URL or null>",
  "current_title": "<most recent job title or null>",
  "location": "<city, country or null>",
  "experience_years": <total years of professional experience as an integer, or null>,
  "skills": [<technical skills / tools explicitly listed, max 15, or []>]
}`

/**
 * POST /api/apply/parse-cv
 * Public — no login required, but the apply token must be valid (same gate as
 * /api/apply/upload). Rate-limited by IP. Reads a resume and returns grounded,
 * hallucination-checked fields for the apply form to prefill. Never stores
 * anything; the file is uploaded separately at submit time.
 *
 * Body: multipart/form-data { file, token }
 * Returns: 200 { candidate, meta } on success. Any failure returns a non-2xx
 * status with { error }; the apply page treats that as "just fill it in manually".
 */
export async function POST(request: NextRequest) {
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited

  let fd: FormData
  try {
    fd = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file       = fd.get('file')  as File   | null
  const applyToken = fd.get('token') as string | null

  if (!file || !applyToken) {
    return NextResponse.json({ error: 'file and token are required' }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF and Word documents are accepted.' }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 10 MB.' }, { status: 413 })
  }

  // Token gate — same as the upload route, so this can't be used as an open
  // AI endpoint by anyone without a real apply link.
  const supabase = createAdminClient()
  const job = await getCanonicalApplyJobByToken(supabase, applyToken)
  if (!job) {
    return NextResponse.json({ error: 'Invalid apply token.' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Resume autofill is not configured.' }, { status: 503 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Pull the resume's plain text server-side. This is what the deterministic
  // regex and the grounding checks run against. It can come back empty (e.g. a
  // scanned/image-only PDF) — that's handled gracefully downstream.
  const sourceText = await extractResumeText(buffer, file.type)

  let raw: RawParsedResume
  try {
    if (file.type === PDF) {
      // Send the PDF to Gemini directly — vision handles multi-column layouts
      // better than dumped text. temperature 0 keeps it literal.
      const { text } = await generateFromPdf(EXTRACTION_PROMPT, buffer.toString('base64'), {
        model: MODEL,
        maxTokens: 1024,
        json: true,
        temperature: 0,
      })
      raw = JSON.parse(text)
    } else {
      // Word docs: we only have the extracted text to work from.
      if (!sourceText.trim()) {
        return NextResponse.json({ error: 'Could not read this document.' }, { status: 422 })
      }
      const { text } = await generateText(
        `${EXTRACTION_PROMPT}\n\n--- RESUME TEXT ---\n${sourceText.slice(0, 20000)}`,
        { model: MODEL, maxTokens: 1024, json: true, temperature: 0 },
      )
      raw = JSON.parse(text)
    }
  } catch {
    logger.warn('Resume autofill extraction failed', { jobId: job.id })
    return NextResponse.json({ error: 'Could not read this resume.' }, { status: 422 })
  }

  // Grounding + deterministic-contact merge happens here.
  const result = buildAutofill(raw, sourceText)
  return NextResponse.json(result)
}

/** Best-effort plain-text extraction. Returns '' if the format is unreadable. */
async function extractResumeText(buffer: Buffer, mime: string): Promise<string> {
  try {
    if (mime === PDF) {
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(buffer))
      const { text } = await extractText(pdf, { mergePages: true })
      return Array.isArray(text) ? text.join('\n') : text
    }
    if (mime === DOCX || mime === DOC) {
      const mammoth = (await import('mammoth')).default
      const { value } = await mammoth.extractRawText({ buffer })
      return value ?? ''
    }
  } catch {
    // Scanned PDFs, legacy .doc binaries, or corrupt files land here. We simply
    // proceed without grounding text; the AI still runs and the candidate still
    // reviews every field.
  }
  return ''
}
