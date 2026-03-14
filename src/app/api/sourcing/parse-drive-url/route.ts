import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireOrg } from '@/lib/auth'

export const maxDuration = 30

// POST /api/sourcing/parse-drive-url
// Body: { url: string }  — must be a publicly-shared Google Drive PDF
// Returns: { candidate: ParsedCandidate }

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
      { error: 'Could not find a Google Drive file ID in this URL. Make sure it is a valid Drive share link.' },
      { status: 400 },
    )
  }

  // Direct download URL for publicly shared files
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`

  let arrayBuffer: ArrayBuffer
  try {
    const fileRes = await fetch(downloadUrl, { redirect: 'follow' })
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: 'Could not download the file. Make sure the file is publicly shared ("Anyone with the link can view").' },
        { status: 400 },
      )
    }
    const contentType = fileRes.headers.get('content-type') ?? ''
    if (!contentType.includes('pdf')) {
      return NextResponse.json(
        { error: 'Only PDF files are supported from Google Drive. Please export your resume as a PDF first.' },
        { status: 400 },
      )
    }
    arrayBuffer = await fileRes.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Failed to download from Google Drive' }, { status: 500 })
  }

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
