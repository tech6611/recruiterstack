'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { submitOnboardingStep } from '@/lib/onboarding/client'

export function DoneStep() {
  const router = useRouter()
  const [completing, setCompleting] = useState(true)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    // Auto-mark complete when this page mounts.
    let cancelled = false
    ;(async () => {
      const res = await submitOnboardingStep('/api/onboarding/complete', {})
      if (cancelled) return
      setCompleting(false)
      if (res) setFinished(true)
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-900">
          {completing ? 'Finishing up…' : finished ? "You're all set" : 'Almost there'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {finished
            ? 'Your workspace is ready. Head to the dashboard to start.'
            : 'Finalizing your workspace…'}
        </p>
      </div>
      <Button
        onClick={() => router.push('/dashboard')}
        disabled={!finished}
        loading={completing}
      >
        Go to dashboard
      </Button>
    </div>
  )
}
