/**
 * Approval-flow email templates.
 *
 * Plain HTML strings — minimal styling, works in every client. We use simple
 * tables for layout because a) we don't need a full design system here and
 * b) tables are the only reliable email layout primitive.
 *
 * Each template returns { subject, html }. Callers wrap them in sendEmail.
 */

interface BaseCtx {
  appUrl:      string
  targetTitle: string
  targetType:  'opening' | 'job' | 'offer'
  targetId:    string
}

function deepLink(ctx: BaseCtx, suffix: string): string {
  const path = ctx.targetType === 'opening' ? `/openings/${ctx.targetId}` : `/${ctx.targetType}s/${ctx.targetId}`
  return `${ctx.appUrl}${path}${suffix}`
}

const SHELL = (innerHtml: string, footer: string) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e293b;background:#f8fafc;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
        <tr><td style="font-size:14px;line-height:1.6;color:#1e293b;">
          <div style="font-size:13px;font-weight:700;color:#10b981;margin-bottom:16px;letter-spacing:0.04em;text-transform:uppercase;">RecruiterStack</div>
          ${innerHtml}
        </td></tr>
      </table>
      <p style="font-size:11px;color:#94a3b8;margin-top:16px;">${footer}</p>
    </td></tr>
  </table>
</body>
</html>`

const BTN = (href: string, label: string, color = '#10b981') => `
  <a href="${href}" style="display:inline-block;background:${color};color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">${label}</a>`

// ── approval_requested ──────────────────────────────────────────────

export interface ApprovalRequestedCtx extends BaseCtx {
  approverName:   string
  requesterName:  string
  stepName:       string
  approvalId:     string
  stepId:         string
  dueAt?:         string | null
}

export function renderApprovalRequested(ctx: ApprovalRequestedCtx): { subject: string; html: string } {
  const link = `${ctx.appUrl}/approvals/inbox`
  const due = ctx.dueAt ? `<p style="font-size:13px;color:#92400e;margin:0 0 16px;">⏰ Due ${new Date(ctx.dueAt).toLocaleString()}</p>` : ''
  const html = SHELL(`
    <h2 style="margin:0 0 16px;font-size:18px;">Approval requested</h2>
    <p>Hi ${ctx.approverName},</p>
    <p><strong>${ctx.requesterName}</strong> needs your decision on:</p>
    <p style="font-size:15px;font-weight:600;margin:0 0 8px;">${escapeHtml(ctx.targetTitle)}</p>
    <p style="font-size:13px;color:#64748b;margin:0 0 24px;">Step: ${escapeHtml(ctx.stepName)}</p>
    ${due}
    <div>${BTN(link, 'Open inbox')}</div>
  `, 'You received this because you are listed as an approver. Manage notifications in Settings.')
  return { subject: `Approval needed: ${ctx.targetTitle}`, html }
}

// ── approval_step_decided (to requester) ───────────────────────────

export interface ApprovalStepDecidedCtx extends BaseCtx {
  requesterName: string
  stepName:      string
  decision:      'approved' | 'rejected'
  approverName:  string
  comment:       string | null
}

export function renderApprovalStepDecided(ctx: ApprovalStepDecidedCtx): { subject: string; html: string } {
  const isApprove = ctx.decision === 'approved'
  const html = SHELL(`
    <h2 style="margin:0 0 16px;font-size:18px;">${isApprove ? '✅ Step approved' : '❌ Approval rejected'}</h2>
    <p>Hi ${ctx.requesterName},</p>
    <p><strong>${ctx.approverName}</strong> ${isApprove ? 'approved' : 'rejected'} the &ldquo;${escapeHtml(ctx.stepName)}&rdquo; step on:</p>
    <p style="font-size:15px;font-weight:600;margin:0 0 8px;">${escapeHtml(ctx.targetTitle)}</p>
    ${ctx.comment ? `<blockquote style="border-left:3px solid #cbd5e1;padding-left:12px;margin:16px 0;color:#475569;">${escapeHtml(ctx.comment)}</blockquote>` : ''}
    <p style="margin:16px 0;">${isApprove ? 'The next step has been activated.' : 'The opening has been returned to draft. You can edit and resubmit.'}</p>
    <div>${BTN(deepLink(ctx, ''), 'View opening')}</div>
  `, 'You received this because you submitted this approval request.')
  return { subject: `${isApprove ? 'Approved' : 'Rejected'}: ${ctx.targetTitle}`, html }
}

// ── approval_completed (final approve, to requester) ───────────────

export interface ApprovalCompletedCtx extends BaseCtx {
  requesterName: string
}

export function renderApprovalCompleted(ctx: ApprovalCompletedCtx): { subject: string; html: string } {
  const html = SHELL(`
    <h2 style="margin:0 0 16px;font-size:18px;">🎉 Approved</h2>
    <p>Hi ${ctx.requesterName},</p>
    <p>All steps have been approved. Your opening is ready:</p>
    <p style="font-size:15px;font-weight:600;margin:0 0 24px;">${escapeHtml(ctx.targetTitle)}</p>
    <div>${BTN(deepLink(ctx, ''), 'View opening')}</div>
  `, 'You received this because you submitted this approval request.')
  return { subject: `Approved: ${ctx.targetTitle}`, html }
}

// ── approval_sla_breach ─────────────────────────────────────────────

export interface ApprovalSlaBreachCtx extends BaseCtx {
  recipientName: string
  recipientRole: 'approver' | 'manager' | 'requester'
  approverName:  string
  stepName:      string
  dueAt:         string
}

export function renderApprovalSlaBreach(ctx: ApprovalSlaBreachCtx): { subject: string; html: string } {
  const link = `${ctx.appUrl}/approvals/inbox`
  const tail =
    ctx.recipientRole === 'approver' ? 'Please review when you can.' :
    ctx.recipientRole === 'manager'  ? `${ctx.approverName} hasn't acted yet — gentle nudge.` :
    `Your approval is overdue at ${ctx.approverName}. We've notified them.`

  const html = SHELL(`
    <h2 style="margin:0 0 16px;font-size:18px;color:#b45309;">⏰ Approval SLA breached</h2>
    <p>Hi ${ctx.recipientName},</p>
    <p>The &ldquo;${escapeHtml(ctx.stepName)}&rdquo; step on the following item is past its SLA (was due ${new Date(ctx.dueAt).toLocaleString()}):</p>
    <p style="font-size:15px;font-weight:600;margin:0 0 8px;">${escapeHtml(ctx.targetTitle)}</p>
    <p style="margin:16px 0;">${tail}</p>
    <div>${BTN(link, 'Open inbox', '#b45309')}</div>
  `, 'SLA escalation. We send these once when the step crosses its due time.')
  return { subject: `Overdue: ${ctx.targetTitle}`, html }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
