import { redirect } from 'next/navigation'

// The old "Job pipelines" list duplicated the /jobs board (both read the same
// `jobs` table), so it was removed. This route is kept only as a redirect so old
// links/bookmarks land on the canonical Jobs board. The job-management detail
// view still lives at /req-jobs/[id]; only this list index is retired.
export default function ReqJobsListRedirect() {
  redirect('/jobs')
}
