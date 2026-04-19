'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  title:            string
  description:      string
  connected:        boolean
  connectedEmail:   string | null
  connectHref:      string
  locked?:          boolean       // e.g. non-admin viewing Slack
  lockedMessage?:   string
}

export function IntegrationCard({
  title, description, connected, connectedEmail, connectHref, locked, lockedMessage,
}: Props) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {connected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              <Check className="h-3 w-3" /> Connected
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">{description}</p>
        {connected && connectedEmail && (
          <p className="text-xs text-slate-600 mt-1">{connectedEmail}</p>
        )}
        {locked && lockedMessage && (
          <p className="text-xs text-amber-700 mt-1">{lockedMessage}</p>
        )}
      </div>
      {!locked && (
        <a href={connectHref}>
          <Button variant={connected ? 'outline' : 'primary'} size="sm">
            {connected ? 'Reconnect' : 'Connect'}
          </Button>
        </a>
      )}
    </div>
  )
}
