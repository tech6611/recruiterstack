import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/intake/:token/approve — one-click approval from email link
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('hiring_requests')
    .update({ status: 'jd_approved' } as any)
    .eq('intake_token', params.token)
    .in('status', ['jd_sent', 'jd_generated'])
    .select('position_title')
    .single()

  if (error || !data) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>RecruiterStack</title></head>
      <body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 20px;background:#fef2f2;">
        <div style="max-width:400px;margin:0 auto;">
          <div style="font-size:48px;margin-bottom:16px;">❌</div>
          <h2 style="color:#991b1b;">Invalid or expired link</h2>
          <p style="color:#6b7280;">This approval link is no longer valid.</p>
        </div>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } },
    )
  }

  return new NextResponse(
    `<!DOCTYPE html><html><head><title>JD Approved — RecruiterStack</title></head>
    <body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 20px;background:#f0fdf4;">
      <div style="max-width:440px;margin:0 auto;">
        <div style="font-size:56px;margin-bottom:16px;">✅</div>
        <h2 style="color:#166534;font-size:24px;">JD Approved!</h2>
        <p style="color:#374151;font-size:16px;">The Job Description for <strong>${data.position_title}</strong> has been approved and is ready to post.</p>
        <p style="color:#6b7280;font-size:14px;margin-top:24px;">The recruiter has been notified. You can close this window.</p>
      </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}
