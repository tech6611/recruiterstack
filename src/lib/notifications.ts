import { createAdminClient } from '@/lib/supabase/server'

export async function notifySlack(orgId: string, text: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select('slack_webhook_url')
    .eq('org_id', orgId)
    .single()

  const url = data?.slack_webhook_url
  if (!url) return

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (e) {
    console.error('[slack] notification failed:', e)
  }
}
