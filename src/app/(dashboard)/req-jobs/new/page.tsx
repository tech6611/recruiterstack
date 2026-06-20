import { redirect } from 'next/navigation'

// Single job-creation front door: the rich New Job drawer on /jobs. This route
// is kept only so old links/bookmarks land on the canonical flow.
export default function NewJobPage() {
  redirect('/jobs?new')
}
