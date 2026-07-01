import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { generateFromPdf } from '@/lib/ai/llm'
import { parseAiJson } from '@/lib/ai/parse-ai-response'
import { parsedCvSchema } from '@/lib/ai/schemas'
import { trackUsage } from '@/lib/ai/track-usage'
import { logger } from '@/lib/logger'
import { RESUME_BUCKET, resumeStoragePath } from '@/lib/storage/resume'

/**
 * POST /api/candidates/[id]/parse-cv
 *
 * Reads the candidate's stored CV, extracts structured fields with Gemini, and
 * fills in ONLY the blanks — title, location, years, skills, LinkedIn, phone.
 * Anything the candidate (or a recruiter) already entered is left untouched, so
 * this is safe to run automatically and to re-run.
 *
 * The public apply flow (on the Django backend) only stores the CV file, never
 * parses it, so this is what actually populates a candidate's profile from their
 * resume — both for new applicants and for existing ones opened after the fact.
 */

export const maxDuration = 60 // Gemini PDF extraction can take a while

// Only fields the extractor may fill. Kept narrow on purpose.
const CANDIDATE_FIELDS =
  'id, current_title, location, experience_years, skills, linkedin_url, phone, resume_url'

const MODEL = 'claude-sonnet-4-6' // → gemini-2.5-pro; best extraction quality

const EXTRACTION_PROMPT = `Extract candidate information from this CV/resume. Respond with ONLY valid JSON (no markdown, no explanation):
{
  "current_title": "<most recent job title, or null>",
  "location": "<city, country, or null>",
  "experience_years": <total years of professional experience as a number, or null>,
  "skills": [<technical skills, frameworks, tools, and relevant domain skills — up to 25>],
  "linkedin_url": "<LinkedIn profile URL, or null>",
  "phone": "<phone number, or null>"
}`

export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 503 })
  }

  // ── 1. Load candidate ──────────────────────────────────────────────────────
  const { data: candidate, error } = await supabase
    .from('candidates')
    .select(CANDIDATE_FIELDS)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error || !candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }

  const c = candidate as unknown as {
    id: string
    current_title: string | null
    location: string | null
    experience_years: number | null
    skills: string[] | null
    linkedin_url: string | null
    phone: string | null
    resume_url: string | null
  }

  if (!c.resume_url) {
    return NextResponse.json({ error: 'No resume on file to parse' }, { status: 400 })
  }

  // ── 2. Get the PDF bytes ───────────────────────────────────────────────────
  let buffer: ArrayBuffer
  const path = resumeStoragePath(c.resume_url)
  try {
    if (path) {
      const { data: file, error: dlErr } = await supabase.storage.from(RESUME_BUCKET).download(path)
      if (dlErr || !file) throw new Error(dlErr?.message ?? 'download failed')
      buffer = await file.arrayBuffer()
    } else {
      // External link (e.g. sourcing Drive export) — fetch it directly.
      const res = await fetch(c.resume_url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      buffer = await res.arrayBuffer()
    }
  } catch (err) {
    logger.error('parse-cv: could not read resume file', err, { candidateId: c.id })
    return NextResponse.json({ error: 'Could not read the resume file' }, { status: 502 })
  }

  const base64 = Buffer.from(buffer).toString('base64')

  // ── 3. Extract with Gemini ─────────────────────────────────────────────────
  let parsed
  try {
    const { text, usage, model } = await generateFromPdf(EXTRACTION_PROMPT, base64, {
      model: MODEL,
      maxTokens: 2048,
      json: true,
    })
    trackUsage('cv-parser', model, usage)
    parsed = parseAiJson(text, parsedCvSchema, 'CV Parser')
  } catch (err) {
    logger.error('parse-cv: extraction failed', err, { candidateId: c.id })
    return NextResponse.json(
      { error: 'Could not read this CV — ensure the PDF is text-based, not a scan.' },
      { status: 500 },
    )
  }

  // ── 4. Fill blanks only (never overwrite existing data) ────────────────────
  const update: Record<string, unknown> = {}
  if (!c.current_title && parsed.current_title) update.current_title = parsed.current_title
  if (!c.location && parsed.location) update.location = parsed.location
  if ((c.experience_years ?? 0) === 0 && parsed.experience_years) {
    update.experience_years = Math.round(parsed.experience_years)
  }
  if ((!c.skills || c.skills.length === 0) && parsed.skills.length > 0) update.skills = parsed.skills
  if (!c.linkedin_url && parsed.linkedin_url) update.linkedin_url = parsed.linkedin_url
  if (!c.phone && parsed.phone) update.phone = parsed.phone

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ data: { updated: false, fields: [] } })
  }

  const { error: updateErr } = await supabase
    .from('candidates')
    .update(update as never)
    .eq('id', c.id)
    .eq('org_id', orgId)

  if (updateErr) {
    logger.error('parse-cv: failed to save', updateErr, { candidateId: c.id })
    return NextResponse.json({ error: 'Failed to save parsed fields' }, { status: 500 })
  }

  return NextResponse.json({ data: { updated: true, fields: Object.keys(update) } })
})
