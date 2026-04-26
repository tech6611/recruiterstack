import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewJobForm } from '@/components/req-jobs/NewJobForm'

export default function NewJobPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/req-jobs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to pipelines
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">New pipeline</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Create a draft. Link openings and submit for approval next.</p>
      <NewJobForm />
    </div>
  )
}
