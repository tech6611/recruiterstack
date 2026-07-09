import { createAdminClient } from '@/lib/supabase/server'
import { parseUnsubscribeToken, unsubscribeCandidate } from '@/modules/crm/domain/unsubscribe'

export const dynamic = 'force-dynamic'

// Public one-click unsubscribe. The token encodes {org, candidate}; decoding it
// server-side both authenticates the request and tells us who to suppress. We do
// the work here (server component) so the link works with a plain GET.
export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const parsed = parseUnsubscribeToken(params.token)

  let ok = false
  if (parsed) {
    try {
      const supabase = createAdminClient()
      await unsubscribeCandidate(supabase, parsed.orgId, parsed.candidateId)
      ok = true
    } catch {
      ok = false
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8fafc', fontFamily: 'Arial, sans-serif', padding: '24px',
    }}>
      <div style={{
        maxWidth: 440, width: '100%', background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: 16, padding: '32px', textAlign: 'center',
      }}>
        {ok ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
              You've been unsubscribed
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              We've stopped all outreach emails to you and won't contact you again.
              You can close this window.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
              This link is invalid
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              We couldn't process this unsubscribe request. The link may be broken or
              expired. Please reply to the email directly and ask to be removed.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
