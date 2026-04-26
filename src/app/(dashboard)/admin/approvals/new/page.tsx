import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ChainBuilder } from '@/components/approvals/ChainBuilder'

export default function NewChainPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/admin/approvals" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to chains
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">New approval chain</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Sequential steps. Add as many as you need.</p>
      <ChainBuilder mode="new" />
    </div>
  )
}
