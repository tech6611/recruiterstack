import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NewOpeningForm } from '@/components/openings/NewOpeningForm'

export default function NewOpeningPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/openings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to openings
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">New opening</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Create a draft. Submit for approval when ready.</p>
      <NewOpeningForm />
    </div>
  )
}
