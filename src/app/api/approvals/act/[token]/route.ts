import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { resolveStepToken, consumeStepToken } from '@/lib/approvals/tokens'
import { decideOnStep, ApprovalError } from '@/lib/approvals/engine'
import type { ApprovalTargetType } from '@/lib/types/approvals'

/**
 * Public, no-login Approve/Reject from an email button.
 *
 *  GET  — renders a confirm page (Approve button, or a Reject form that requires
 *         a ≥20-char comment). GET NEVER mutates: email clients and link
 *         scanners fire GET, so the decision only happens on the POST below.
 *  POST — atomically spends the one-time token, then records the decision as the
 *         token's bound user via decideOnStep (so the engine's approver guard
 *         passes unchanged). Idempotent: a spent/replayed token shows a friendly
 *         "already recorded" page instead of erroring.
 *
 * Auth is entirely token-based; `/api/approvals/act(.*)` is whitelisted in
 * middleware. Rate-limited on both verbs. Generic messaging for invalid/expired
 * tokens avoids leaking whether a token exists.
 */

const REJECT_MIN = 20

// ── HTML helpers ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )
}

function page(bg: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RecruiterStack</title></head>
    <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:${bg};margin:0;padding:64px 20px;">
      <div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#10b981;margin-bottom:20px;letter-spacing:.04em;text-transform:uppercase;">RecruiterStack</div>
        ${body}
      </div>
    </body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } },
  )
}

function invalidPage(): NextResponse {
  return page('#fef2f2', `
    <div style="font-size:48px;margin-bottom:12px;">❌</div>
    <h2 style="color:#991b1b;font-size:20px;margin:0 0 8px;">Link no longer valid</h2>
    <p style="color:#6b7280;font-size:14px;">This approval link is invalid, expired, or has already been used.</p>
  `, 410)
}

function alreadyDonePage(): NextResponse {
  return page('#f8fafc', `
    <div style="font-size:48px;margin-bottom:12px;">👍</div>
    <h2 style="color:#334155;font-size:20px;margin:0 0 8px;">Already recorded</h2>
    <p style="color:#6b7280;font-size:14px;">A decision for this step has already been captured. You can close this window.</p>
  `)
}

function resultPage(decision: 'approved' | 'rejected'): NextResponse {
  const ok = decision === 'approved'
  return page(ok ? '#f0fdf4' : '#fef2f2', `
    <div style="font-size:52px;margin-bottom:12px;">${ok ? '✅' : '🚫'}</div>
    <h2 style="color:${ok ? '#166534' : '#991b1b'};font-size:22px;margin:0 0 8px;">${ok ? 'Approved' : 'Rejected'}</h2>
    <p style="color:#374151;font-size:15px;">Your decision has been recorded and the requester has been notified.</p>
    <p style="color:#94a3b8;font-size:13px;margin-top:20px;">You can close this window.</p>
  `)
}

async function getTargetTitle(targetType: ApprovalTargetType, targetId: string): Promise<string> {
  const supabase = createAdminClient()
  if (targetType === 'opening') {
    const { data } = await supabase.from('openings').select('title').eq('id', targetId).maybeSingle()
    return (data as { title: string } | null)?.title ?? 'this requisition'
  }
  if (targetType === 'job') {
    const { data } = await supabase.from('jobs').select('title').eq('id', targetId).maybeSingle()
    return (data as { title: string } | null)?.title ?? 'this job'
  }
  return 'this offer'
}

async function approvalTitle(approvalId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('approvals')
    .select('target_type, target_id')
    .eq('id', approvalId)
    .maybeSingle()
  const a = data as { target_type: ApprovalTargetType; target_id: string } | null
  if (!a) return 'this item'
  return getTargetTitle(a.target_type, a.target_id)
}

function confirmPage(token: string, title: string, decision: 'approved' | 'rejected'): NextResponse {
  const action = `/api/approvals/act/${encodeURIComponent(token)}`
  if (decision === 'rejected') {
    const body = `
      <div style="font-size:40px;margin-bottom:12px;">🚫</div>
      <h2 style="color:#334155;font-size:20px;margin:0 0 4px;">Reject this approval?</h2>
      <p style="color:#64748b;font-size:14px;margin:0 0 20px;">${esc(title)}</p>
      <form method="POST" action="${action}" style="text-align:left;">
        <input type="hidden" name="decision" value="rejected" />
        <label style="display:block;font-size:13px;color:#475569;margin-bottom:6px;">Reason (required, at least ${REJECT_MIN} characters)</label>
        <textarea name="comment" required minlength="${REJECT_MIN}" rows="4"
          style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:14px;font-family:inherit;"></textarea>
        <button type="submit"
          style="margin-top:16px;width:100%;background:#ef4444;color:#fff;border:0;padding:12px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Reject</button>
      </form>
      <p style="margin-top:16px;"><a href="${action}?decision=approved" style="color:#64748b;font-size:13px;">Approve instead</a></p>`
    return page('#f8fafc', body)
  }
  const body = `
    <div style="font-size:40px;margin-bottom:12px;">✅</div>
    <h2 style="color:#334155;font-size:20px;margin:0 0 4px;">Approve this?</h2>
    <p style="color:#64748b;font-size:14px;margin:0 0 20px;">${esc(title)}</p>
    <form method="POST" action="${action}">
      <input type="hidden" name="decision" value="approved" />
      <button type="submit"
        style="width:100%;background:#10b981;color:#fff;border:0;padding:12px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Confirm approval</button>
    </form>
    <p style="margin-top:16px;"><a href="${action}?decision=rejected" style="color:#ef4444;font-size:13px;">Reject instead</a></p>`
  return page('#f8fafc', body)
}

// ── GET: confirm page (no mutation) ─────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = await checkRateLimit(req)
  if (limited) return limited

  const supabase = createAdminClient()
  const resolved = await resolveStepToken(supabase, params.token).catch(() => null)
  if (!resolved || resolved.expired) return invalidPage()
  if (resolved.used) return alreadyDonePage()

  const decision = req.nextUrl.searchParams.get('decision') === 'rejected' ? 'rejected' : 'approved'
  const title = await approvalTitle(resolved.approvalId)
  return confirmPage(params.token, title, decision)
}

// ── POST: record the decision ───────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = await checkRateLimit(req)
  if (limited) return limited

  const supabase = createAdminClient()

  // Parse the confirm-page form (falls back to JSON for programmatic callers).
  let decision: string | null = null
  let comment: string | null = null
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({}))
    decision = typeof body.decision === 'string' ? body.decision : null
    comment = typeof body.comment === 'string' ? body.comment : null
  } else {
    const form = await req.formData().catch(() => null)
    decision = (form?.get('decision') as string | null) ?? null
    comment = (form?.get('comment') as string | null) ?? null
  }

  if (decision !== 'approved' && decision !== 'rejected') return invalidPage()
  if (decision === 'rejected' && (!comment || comment.trim().length < REJECT_MIN)) {
    // Re-show the reject form so they can add a reason.
    const resolved = await resolveStepToken(supabase, params.token).catch(() => null)
    if (!resolved || resolved.expired || resolved.used) return invalidPage()
    return confirmPage(params.token, await approvalTitle(resolved.approvalId), 'rejected')
  }

  // Atomically spend the token (one-time). Null = already used / expired / bad.
  const consumed = await consumeStepToken(supabase, params.token).catch(() => null)
  if (!consumed) {
    const resolved = await resolveStepToken(supabase, params.token).catch(() => null)
    // Already-used tokens are an idempotent success from the approver's view.
    if (resolved?.used) return alreadyDonePage()
    return invalidPage()
  }

  try {
    await decideOnStep({
      approvalId: consumed.approvalId,
      stepId:     consumed.stepId,
      userId:     consumed.userId,
      decision,
      comment:    decision === 'rejected' ? (comment as string).trim() : null,
    })
    return resultPage(decision)
  } catch (err) {
    if (err instanceof ApprovalError) {
      // 409 = step already decided / not awaiting a decision → treat as done.
      if (err.status === 409) return alreadyDonePage()
      return invalidPage()
    }
    throw err
  }
}
