'use client'

import { createContext, useContext, useMemo, useEffect } from 'react'
import { useCandidate } from '@/lib/hooks/useCandidate'
import { useScorecards } from '@/lib/hooks/useScorecards'
import { useTags } from '@/lib/hooks/useTags'
import { useTasks } from '@/lib/hooks/useTasks'
import { useReferrals } from '@/lib/hooks/useReferrals'
import { useModals } from '@/lib/hooks/useModals'
import type { CandidateWithPipeline } from '@/lib/hooks/useCandidate'
import type { CandidateTag, CandidateTask, CandidateReferral, Scorecard } from '@/lib/types/database'
import type { JobOption } from '@/lib/hooks/useModals'

interface CandidateProfileContextValue {
  // useCandidate
  candidate: CandidateWithPipeline | null
  loading: boolean
  selectedAppId: string | null
  setSelectedAppId: (id: string | null) => void
  setCandidate: React.Dispatch<React.SetStateAction<CandidateWithPipeline | null>>
  activeApps: CandidateWithPipeline['applications']
  reload: () => Promise<void>

  // useScorecards
  scorecards: Map<string, Scorecard[]>
  scorecardsLoading: boolean
  loadScorecards: (activeApps: CandidateWithPipeline['applications']) => Promise<void>
  handleScorecardDeleted: (scorecardId: string, appId: string) => void

  // useTags
  tags: CandidateTag[]
  addTag: (tag: CandidateTag) => void
  removeTag: (tagId: string) => void

  // useTasks
  tasks: CandidateTask[]
  addTask: (task: CandidateTask) => void
  updateTask: (task: CandidateTask) => void
  deleteTask: (taskId: string) => void

  // useReferrals
  referrals: CandidateReferral[]
  addReferral: (referral: CandidateReferral) => void

  // useModals
  emailDraftAppId: string | null
  openEmailDraft: (appId: string | null) => void
  closeEmailDraft: () => void
  showScorecardDrawer: boolean
  drawerDefaultAppId: string
  openScorecardDrawer: (appId: string) => void
  closeScorecardDrawer: () => void
  showScheduleDrawer: boolean
  openScheduleDrawer: () => void
  closeScheduleDrawer: () => void
  showOfferDrawer: boolean
  offerDefaultAppId: string
  openOfferDrawer: (appId: string) => void
  closeOfferDrawer: () => void
  showVoiceCallModal: boolean
  openVoiceCallModal: () => void
  closeVoiceCallModal: () => void
  showEnrollDrawer: boolean
  openEnrollDrawer: () => void
  closeEnrollDrawer: () => void
  showAddToJob: boolean
  jobs: JobOption[]
  addingToJob: string | null
  jobsLoading: boolean
  openAddToJob: () => Promise<void>
  closeAddToJob: () => void
  addToJob: (hiringRequestId: string, reload: () => Promise<void>) => Promise<void>
}

const CandidateProfileContext = createContext<CandidateProfileContextValue | null>(null)

export function CandidateProfileProvider({ candidateId, children }: { candidateId: string; children: React.ReactNode }) {
  const candidateHook = useCandidate(candidateId)
  const scorecardsHook = useScorecards()
  const tagsHook = useTags(candidateId)
  const tasksHook = useTasks(candidateId)
  const referralsHook = useReferrals(candidateId)
  const modalsHook = useModals(candidateId)

  // Load scorecards when candidate changes
  useEffect(() => {
    if (!candidateHook.candidate) return
    scorecardsHook.loadScorecards(candidateHook.activeApps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateHook.candidate, candidateHook.activeApps, scorecardsHook.loadScorecards])

  const value = useMemo<CandidateProfileContextValue>(() => ({
    ...candidateHook,
    ...scorecardsHook,
    ...tagsHook,
    ...tasksHook,
    ...referralsHook,
    ...modalsHook,
  }), [candidateHook, scorecardsHook, tagsHook, tasksHook, referralsHook, modalsHook])

  return <CandidateProfileContext.Provider value={value}>{children}</CandidateProfileContext.Provider>
}

export function useCandidateProfile() {
  const ctx = useContext(CandidateProfileContext)
  if (!ctx) throw new Error('useCandidateProfile must be used inside CandidateProfileProvider')
  return ctx
}
