'use client'

import { useParams } from 'next/navigation'
import CandidateProfileErrorBoundary from '@/components/candidates/CandidateProfileErrorBoundary'
import { CandidateProfileProvider } from '@/components/candidates/CandidateProfileContext'
import CandidateProfileContent from '@/components/candidates/CandidateProfileContent'

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>()
  return (
    <CandidateProfileErrorBoundary>
      <CandidateProfileProvider candidateId={id}>
        <CandidateProfileContent />
      </CandidateProfileProvider>
    </CandidateProfileErrorBoundary>
  )
}
