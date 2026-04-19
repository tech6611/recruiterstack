'use client'

import { toast } from 'sonner'

/** Minimal fetch wrapper — POSTs JSON and surfaces errors via sonner. */
export async function submitOnboardingStep(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; next: string } | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'Something went wrong. Please try again.')
      return null
    }
    return data as { ok: true; next: string }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Network error')
    return null
  }
}
