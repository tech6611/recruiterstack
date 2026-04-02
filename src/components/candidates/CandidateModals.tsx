'use client'

import { useCandidateProfile } from './CandidateProfileContext'
import EmailDraftDrawer from './EmailDraftDrawer'
import ScorecardDrawer from './ScorecardDrawer'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import CreateOfferDrawer from './CreateOfferDrawer'
import VoiceCallModal from './VoiceCallModal'
import EnrollCandidateDrawer from '@/components/sequences/EnrollCandidateDrawer'
import AddToJobModal from './AddToJobModal'

export default function CandidateModals() {
  const ctx = useCandidateProfile()

  if (!ctx.candidate) return null

  const { candidate, activeApps, reload } = ctx

  return (
    <>
      {/* Email Draft Drawer */}
      {ctx.emailDraftAppId && (
        <EmailDraftDrawer
          appId={ctx.emailDraftAppId}
          candidateEmail={candidate.email}
          candidateName={candidate.name}
          positionTitle={activeApps[0]?.hiring_requests?.position_title ?? ''}
          onClose={ctx.closeEmailDraft}
          onSent={reload}
        />
      )}

      {/* Scorecard Drawer */}
      {ctx.showScorecardDrawer && (
        <ScorecardDrawer
          activeApps={activeApps}
          defaultAppId={ctx.drawerDefaultAppId}
          onClose={ctx.closeScorecardDrawer}
          onSaved={async () => {
            await ctx.loadScorecards(activeApps)
          }}
        />
      )}

      {/* Schedule Interview Modal */}
      {ctx.showScheduleDrawer && activeApps.length > 0 && (
        <ScheduleInterviewModal
          apps={activeApps.map(a => ({
            id:                 a.id,
            candidate_id:       a.candidate_id,
            stage_id:           a.stage_id ?? null,
            hiring_request_id:  a.hiring_request_id,
            candidate:          { name: candidate.name },
          }))}
          positionTitle={activeApps[0].hiring_requests?.position_title ?? 'Interview'}
          hmName={activeApps[0].hiring_requests?.hiring_manager_name ?? ''}
          hmEmail={activeApps[0].hiring_requests?.hiring_manager_email ?? ''}
          onClose={ctx.closeScheduleDrawer}
          onScheduled={reload}
        />
      )}

      {/* Create Offer Drawer */}
      {ctx.showOfferDrawer && activeApps.length > 0 && (
        <CreateOfferDrawer
          activeApps={activeApps}
          defaultAppId={ctx.offerDefaultAppId || activeApps[0].id}
          candidateId={candidate.id}
          onClose={ctx.closeOfferDrawer}
          onSaved={reload}
        />
      )}

      {/* Voice Call Modal */}
      {ctx.showVoiceCallModal && activeApps.length > 0 && (
        <VoiceCallModal
          candidateId={candidate.id}
          candidateName={candidate.name}
          candidatePhone={candidate.phone}
          applicationId={activeApps[0].id}
          hiringRequestId={activeApps[0].hiring_request_id}
          positionTitle={activeApps[0].hiring_requests?.position_title ?? 'Open Role'}
          onClose={ctx.closeVoiceCallModal}
        />
      )}

      {/* Enroll in Sequence Drawer */}
      {ctx.showEnrollDrawer && (
        <EnrollCandidateDrawer
          candidateIds={[candidate.id]}
          candidateNames={[candidate.name]}
          applicationId={activeApps[0]?.id}
          onClose={ctx.closeEnrollDrawer}
          onEnrolled={reload}
        />
      )}

      {/* Add to Job Modal */}
      <AddToJobModal />
    </>
  )
}
