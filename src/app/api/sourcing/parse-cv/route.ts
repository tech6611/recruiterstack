import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { generateFromPdf } from '@/lib/ai/llm'
import { trackUsage } from '@/lib/ai/track-usage'

export const maxDuration = 30

// POST /api/sourcing/parse-cv
// Body: multipart/form-data { file: PDF }
// Returns: { candidate: ParsedCandidate }
export const POST = withCapability('recruiting:edit', async (request, orgId, _supabase, _ctx, _scope, userId) => {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10 MB' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  try {
    const { text, usage, model } = await generateFromPdf(
      `Extract candidate information from this CV/resume. Return ONLY valid JSON — no markdown, no explanation:
{
  "name": "<full name>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "current_title": "<most recent job title or null>",
  "current_company": "<most recent / current employer name or null>",
  "location": "<city, country or null>",
  "experience_years": <total years of professional experience as integer>,
  "skills": [<array of technical skills, frameworks, tools — max 15 items>],
  "linkedin_url": "<LinkedIn profile URL or null>"
}`,
      base64,
      { model: 'gemini-2.5-pro', maxTokens: 1024 },
    )
    trackUsage('sourcing-parse-cv', model, usage, { orgId, userId })

    const raw  = text.trim()
    const json = raw.startsWith('```') ? raw.replace(/```(?:json)?\n?/g, '').trim() : raw
    const candidate = JSON.parse(json)

    return NextResponse.json({ candidate })
  } catch {
    return NextResponse.json(
      { error: 'CV parsing failed — ensure the PDF is text-readable and not scanned' },
      { status: 500 }
    )
  }
})
