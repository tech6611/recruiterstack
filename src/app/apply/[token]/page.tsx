'use client'

import { useParams } from 'next/navigation'
import { ApplyExperience } from '../ApplyPage'

// Job-level apply link (/apply/<job apply_token>). The experience itself lives
// in ../ApplyPage.tsx so the per-posting link (/apply/p/<token>) can reuse it.
export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()
  return <ApplyExperience token={token} />
}
