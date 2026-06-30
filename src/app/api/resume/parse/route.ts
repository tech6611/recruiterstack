import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { generateFromPdf } from '@/lib/ai/llm'

// POST /api/resume/parse
// Accepts multipart/form-data with a `file` field (PDF)
// Returns parsed candidate fields + storage path
export async function POST(request: NextRequest) {
  const rateLimited = await checkRateLimit(request)
  if (rateLimited) return rateLimited
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

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Parse with the LLM
  const { text } = await generateFromPdf(
    `Extract candidate information from this resume. Respond with ONLY valid JSON — no markdown, no extra text:
{
  "name": "<full name>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "current_title": "<most recent job title or null>",
  "location": "<city, country or null>",
  "experience_years": <total years of professional experience as integer>,
  "skills": [<array of technical skills, frameworks, tools — max 15 items>]
}`,
    base64,
    { model: 'claude-sonnet-4-6', maxTokens: 1024 },
  )

  let parsed: Record<string, unknown>
  try {
    const raw = text.trim()
    const json = raw.startsWith('```') ? raw.replace(/```(?:json)?\n?/g, '').trim() : raw
    parsed = JSON.parse(json)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response as JSON' }, { status: 500 })
  }

  // Upload to Supabase Storage
  const supabase = createAdminClient()
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, '_')
  const storagePath = `${Date.now()}-${safeName}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType: 'application/pdf',
      upsert: false,
    })

  const resume_path = uploadError ? null : uploadData?.path ?? null

  return NextResponse.json({ parsed, resume_path })
}
