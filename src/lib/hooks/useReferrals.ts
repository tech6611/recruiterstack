import { useState, useEffect, useCallback } from 'react'
import type { CandidateReferral } from '@/lib/types/database'

export function useReferrals(candidateId: string) {
  const [referrals, setReferrals] = useState<CandidateReferral[]>([])

  const loadReferrals = useCallback(async () => {
    const res = await fetch(`/api/candidates/${candidateId}/referrals`)
    if (res.ok) {
      const json = await res.json()
      setReferrals(json.data ?? [])
    }
  }, [candidateId])

  useEffect(() => { loadReferrals() }, [loadReferrals])

  const addReferral = useCallback((referral: CandidateReferral) => {
    setReferrals(prev => [...prev, referral])
  }, [])

  return { referrals, addReferral }
}
