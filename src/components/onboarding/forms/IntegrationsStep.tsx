'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { IntegrationCard } from '@/components/onboarding/IntegrationCard'

interface Props {
  isAdmin:          boolean
  google:           { connected: boolean; email: string | null }
  microsoft:        { connected: boolean; email: string | null }
  zoom:             { connected: boolean; email: string | null }
  slack:            { connected: boolean; teamName: string | null }
  nextHref:         string
}

export function IntegrationsStep({ isAdmin, google, microsoft, zoom, slack, nextHref }: Props) {
  const router = useRouter()
  const [finishing, setFinishing] = useState(false)

  async function onContinue() {
    setFinishing(true)
    // Integrations step has no POST — the OAuth already persisted. Just move on.
    router.push(nextHref)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <IntegrationCard
          title="Google Calendar"
          description="Your personal Google Calendar for scheduling interviews."
          connected={google.connected}
          connectedEmail={google.email}
          connectHref="/api/google/connect"
        />
        <IntegrationCard
          title="Microsoft Outlook"
          description="Your personal Outlook / Teams for scheduling interviews."
          connected={microsoft.connected}
          connectedEmail={microsoft.email}
          connectHref="/api/microsoft/connect"
        />
        <IntegrationCard
          title="Zoom"
          description="Your personal Zoom for hosting interviews."
          connected={zoom.connected}
          connectedEmail={zoom.email}
          connectHref="/api/zoom/connect"
        />
        <IntegrationCard
          title="Slack"
          description="Org-wide Slack for teammate notifications."
          connected={slack.connected}
          connectedEmail={slack.teamName}
          connectHref="/api/slack/install"
          locked={!isAdmin}
          lockedMessage={!isAdmin && !slack.connected ? "Ask your admin to connect Slack for the whole workspace." : undefined}
        />
      </div>
      <p className="text-xs text-slate-500">All optional — you can connect these anytime from Settings.</p>
      <div className="flex justify-end">
        <Button onClick={onContinue} loading={finishing}>Continue</Button>
      </div>
    </div>
  )
}
