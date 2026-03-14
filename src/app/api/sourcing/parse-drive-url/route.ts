import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireOrg } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getValidAccessToken } from '@/lib/google/calendar'

export const maxDuration = 30

// POST /api/sourcing/parse-drive-url
// Body: { url: string }  — any Google Drive link (public or shared-with-connected-account)
// Returns: { candidate: ParsedCandidate }
//
// Uses the org's connected Google OAuth token (drive.readonly scope) to download
// the file via Drive API v3, so no need for the file to be publicly shared.

function extractDriveFileId(url: string): string | null {
  // https://drive.google.com/file/d/FILE_ID/view
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileMatch) return fileMatch[1]
  // https://drive.google.com/open?id=FILE_ID  or  /uc?id=FILE_ID
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idMatch) return idMatch[1]
  // https://docs.google.com/…/d/FILE_ID/…
  const docMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (docMatch) return docMatch[1]
  return null
}

export async function POST(request: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  let body: { url: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { url } = body
  if (!url?.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const fileId = extractDriveFileId(url.trim())
  if (!fileId) {
    return NextResponse.json(
      { error: 'Could not find a Google Drive file ID in this URL.' },
      { status: 400 },
    )
  }

  // ── Get org's stored Google OAuth token ─────────────────────────────────────
  const supabase = createAdminClient()
  const { data: settings } = await supabase
    .from('org_settings')
    .select('google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry')
    .eq('org_id', orgId)
    .single()

  if (!settings?.google_oauth_access_token || !settings?.google_oauth_refresh_token) {
    return NextResponse.json(
      { error: 'Google Drive is not connected. Go to Settings → Integrations and connect Google.' },
      { status: 400 },
    )
  }

  // Refresh token if expired
  let accessToken: string
  try {
    const result = await getValidAccessToken({
      access_token:  settings.google_oauth_access_token,
      refresh_token: settings.google_oauth_refresh_token,
      token_expiry:  settings.google_oauth_token_expiry ?? null,
    })
    accessToken = result.access_token

    // Persist refreshed tokens if they changed
    if (result.tokens.access_token !== settings.google_oauth_access_token) {
      await supabase
        .from('org_settings')
        .update({
          google_oauth_access_token: result.tokens.access_token,
          google_oauth_token_expiry: result.tokens.token_expiry,
        })
        .eq('org_id', orgId)
    }
  } catch {
    return NextResponse.json(
      { error: 'Failed to refresh Google token. Please reconnect Google in Settings.' },
      { status: 400 },
    )
  }

  // ── Check file metadata (type + name) via Drive API v3 ──────────────────────
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!metaRes.ok) {
    if (metaRes.status === 403) {
      return NextResponse.json(
        {
          error:
            'Google Drive access denied. Make sure you have reconnected Google with Drive access ' +
            '(Settings → Integrations → Reconnect Google).',
        },
        { status: 403 },
      )
    }
    if (metaRes.status === 404) {
      return NextResponse.json(
        { error: 'File not found. Check that the link is correct and the file exists in your Drive.' },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: `Google Drive returned an error (${metaRes.status})` },
      { status: 400 },
    )
  }

  const meta = await metaRes.json()
  if (meta.mimeType !== 'application/pdf') {
    return NextResponse.json(
      {
        error: `Only PDF files are supported (got: ${meta.mimeType ?? 'unknown type'}). ` +
          'Please export your resume as a PDF from Google Docs or Word.',
      },
      { status: 400 },
    )
  }

  // ── Download the actual PDF bytes ────────────────────────────────────────────
  const fileRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!fileRes.ok) {
    return NextResponse.json(
      { error: 'Failed to download the file from Google Drive.' },
      { status: 500 },
    )
  }

  const arrayBuffer = await fileRes.arrayBuffer()

  // ── Parse with Claude ────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey })
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: `Extract candidate information from this CV/resume. Return ONLY valid JSON — no markdown, no explanation:
{
  "name": "<full name>",
  "email": "<email address or null>",
  "phone": "<phone number or null>",
  "current_title": "<most recent job title or null>",
  "location": "<city, country or null>",
  "experience_years": <total years of professional experience as integer>,
  "skills": [<array of technical skills, frameworks, tools — max 15 items>],
  "linkedin_url": "<LinkedIn profile URL or null>"
}`,
          },
        ],
      }] as any,
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response from Claude' }, { status: 500 })
    }

    const raw = content.text.trim()
    const json = raw.startsWith('```') ? raw.replace(/```(?:json)?\n?/g, '').trim() : raw
    const candidate = JSON.parse(json)

    return NextResponse.json({ candidate })
  } catch {
    return NextResponse.json(
      { error: 'CV parsing failed — ensure the PDF is text-readable and not a scanned image' },
      { status: 500 },
    )
  }
}
