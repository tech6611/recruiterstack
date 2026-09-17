import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCareersPageBySlug } from '@/modules/ats/domain/job-pipelines'

/**
 * GET /careers/:slug/feed.xml — Indeed-style XML job feed of the LIVE, LISTED
 * postings on this careers page, for external boards / aggregators to poll.
 * Public (the path has a dot so it bypasses the Clerk middleware matcher), and
 * CDN-cached for 5 minutes. Reuses the exact list the careers page renders.
 */
export const dynamic = 'force-dynamic'

const CACHE_SECONDS = 300

function esc(v: string | null | undefined): string {
  return (v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
// Descriptions carry HTML (Tiptap) — wrap in CDATA; a "]]>" inside would end the
// block early, so split it.
function cdata(v: string | null | undefined): string {
  return `<![CDATA[${(v ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
}
function rfc822(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  return (Number.isNaN(d.getTime()) ? new Date() : d).toUTCString()
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await getCareersPageBySlug(createAdminClient(), params.slug)
  if (!data) return new NextResponse('Not found', { status: 404 })

  const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
  const company = data.branding.company_name ?? 'Careers'

  const items = data.jobs.map(j => {
    const url = `${origin}${j.apply_url}`
    return [
      '  <job>',
      `    <title>${cdata(j.title)}</title>`,
      `    <date>${cdata(rfc822(j.published_at))}</date>`,
      `    <referencenumber>${cdata(j.posting_id ?? j.apply_token)}</referencenumber>`,
      `    <url>${cdata(url)}</url>`,
      `    <company>${cdata(company)}</company>`,
      `    <city>${cdata(j.city ?? j.location)}</city>`,
      `    <country>${cdata(j.country)}</country>`,
      j.department ? `    <category>${cdata(j.department)}</category>` : null,
      `    <description>${cdata(j.description ?? '')}</description>`,
      `    <salary>${cdata(j.compensation)}</salary>`,
      `    <jobtype>${cdata(j.employment_type)}</jobtype>`,
      j.remote_ok ? '    <remotetype>Fully remote</remotetype>' : null,
      '  </job>',
    ].filter(Boolean).join('\n')
  })

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<source>',
    `  <publisher>${esc(company)}</publisher>`,
    `  <publisherurl>${esc(`${origin}/careers/${params.slug}`)}</publisherurl>`,
    `  <lastBuildDate>${esc(new Date().toUTCString())}</lastBuildDate>`,
    ...items,
    '</source>',
    '',
  ].join('\n')

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60`,
    },
  })
}
