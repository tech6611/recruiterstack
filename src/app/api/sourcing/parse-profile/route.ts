import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { generateText } from '@/lib/ai/llm'
import { trackUsage } from '@/lib/ai/track-usage'

export const maxDuration = 30

// POST /api/sourcing/parse-profile
// Body: { text: string }
// Returns: { candidate: ParsedCandidate }
export const POST = withCapability('recruiting:edit', async (request, orgId, _supabase, _ctx, _scope, userId) => {
  let body: { text: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { text } = body
  if (!text?.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  const prompt = `Extract structured candidate information from the following text. The text may be a LinkedIn profile, resume snippet, email bio, or any professional profile.

Return ONLY a valid JSON object with these fields (omit any field that is not present or cannot be reasonably inferred):
{
  "name": "full name",
  "email": "email address",
  "phone": "phone number",
  "current_title": "current job title (most recent role)",
  "current_company": "current / most recent employer name",
  "location": "city and country/state",
  "experience_years": <total years of professional experience as a number>,
  "skills": ["skill1", "skill2", ...up to 10 skills],
  "linkedin_url": "LinkedIn profile URL if present"
}

Rules:
- experience_years: estimate from career timeline if not explicitly stated (e.g. if they graduated in 2015, estimate ~9 years)
- skills: extract specific technical and professional skills, not soft skills like "communication"
- current_title: use the most recent / current role title
- Return ONLY the JSON object, no markdown, no explanation

Text to parse:
${text.slice(0, 6000)}`

  try {
    const { text, usage, model } = await generateText(prompt, {
      model:     'gemini-2.5-flash',
      maxTokens: 800,
    })
    trackUsage('sourcing-parse-profile', model, usage, { orgId, userId })

    const raw       = text.trim()
    const json      = raw.startsWith('{') ? raw : (raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
    const candidate = JSON.parse(json)

    return NextResponse.json({ candidate })
  } catch {
    return NextResponse.json({ error: 'Profile parsing failed — try pasting more structured text' }, { status: 500 })
  }
})
