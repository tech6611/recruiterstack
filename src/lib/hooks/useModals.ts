import { useState, useCallback } from 'react'

export type JobOption = { id: string; position_title: string; department: string | null; ticket_number: string | null }

export function useModals(candidateId: string) {
  // Email draft drawer
  const [emailDraftAppId, setEmailDraftAppId] = useState<string | null>(null)

  // Scorecard drawer
  const [showScorecardDrawer, setShowScorecardDrawer] = useState(false)
  const [drawerDefaultAppId, setDrawerDefaultAppId] = useState('')

  // Schedule interview
  const [showScheduleDrawer, setShowScheduleDrawer] = useState(false)

  // Offer drawer
  const [showOfferDrawer, setShowOfferDrawer] = useState(false)
  const [offerDefaultAppId, setOfferDefaultAppId] = useState('')

  // Voice call
  const [showVoiceCallModal, setShowVoiceCallModal] = useState(false)

  // Sequence enrollment
  const [showEnrollDrawer, setShowEnrollDrawer] = useState(false)

  // Add to job
  const [showAddToJob, setShowAddToJob] = useState(false)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [addingToJob, setAddingToJob] = useState<string | null>(null)
  const [jobsLoading, setJobsLoading] = useState(false)

  // ── Email draft ──────────────────────────────────────────────────────────

  const openEmailDraft = useCallback((appId: string | null) => {
    setEmailDraftAppId(appId)
  }, [])

  const closeEmailDraft = useCallback(() => {
    setEmailDraftAppId(null)
  }, [])

  // ── Scorecard ────────────────────────────────────────────────────────────

  const openScorecardDrawer = useCallback((appId: string) => {
    setDrawerDefaultAppId(appId)
    setShowScorecardDrawer(true)
  }, [])

  const closeScorecardDrawer = useCallback(() => {
    setShowScorecardDrawer(false)
  }, [])

  // ── Schedule ─────────────────────────────────────────────────────────────

  const openScheduleDrawer = useCallback(() => {
    setShowScheduleDrawer(true)
  }, [])

  const closeScheduleDrawer = useCallback(() => {
    setShowScheduleDrawer(false)
  }, [])

  // ── Offer ────────────────────────────────────────────────────────────────

  const openOfferDrawer = useCallback((appId: string) => {
    setOfferDefaultAppId(appId)
    setShowOfferDrawer(true)
  }, [])

  const closeOfferDrawer = useCallback(() => {
    setShowOfferDrawer(false)
  }, [])

  // ── Voice call ───────────────────────────────────────────────────────────

  const openVoiceCallModal = useCallback(() => {
    setShowVoiceCallModal(true)
  }, [])

  const closeVoiceCallModal = useCallback(() => {
    setShowVoiceCallModal(false)
  }, [])

  // ── Enroll ───────────────────────────────────────────────────────────────

  const openEnrollDrawer = useCallback(() => {
    setShowEnrollDrawer(true)
  }, [])

  const closeEnrollDrawer = useCallback(() => {
    setShowEnrollDrawer(false)
  }, [])

  // ── Add to Job ───────────────────────────────────────────────────────────

  const openAddToJob = useCallback(async () => {
    setShowAddToJob(true)
    setJobsLoading(true)
    const res = await fetch('/api/jobs')
    if (res.ok) {
      const json = await res.json()
      setJobs(json.data ?? [])
    }
    setJobsLoading(false)
  }, [])

  const closeAddToJob = useCallback(() => {
    setShowAddToJob(false)
  }, [])

  const addToJob = useCallback(async (hiringRequestId: string, reload: () => Promise<void>) => {
    setAddingToJob(hiringRequestId)
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_id: candidateId, hiring_request_id: hiringRequestId, source: 'manual' }),
    })
    setAddingToJob(null)
    if (res.ok || res.status === 409) {
      setShowAddToJob(false)
      await reload()
    }
  }, [candidateId])

  return {
    // Email draft
    emailDraftAppId, openEmailDraft, closeEmailDraft,
    // Scorecard
    showScorecardDrawer, drawerDefaultAppId, openScorecardDrawer, closeScorecardDrawer,
    // Schedule
    showScheduleDrawer, openScheduleDrawer, closeScheduleDrawer,
    // Offer
    showOfferDrawer, offerDefaultAppId, openOfferDrawer, closeOfferDrawer,
    // Voice call
    showVoiceCallModal, openVoiceCallModal, closeVoiceCallModal,
    // Enroll
    showEnrollDrawer, openEnrollDrawer, closeEnrollDrawer,
    // Add to job
    showAddToJob, jobs, addingToJob, jobsLoading, openAddToJob, closeAddToJob, addToJob,
  }
}
