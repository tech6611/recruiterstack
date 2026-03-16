'use client'
import type { ApplicationEvent } from '@/lib/types/database'

interface InterviewProgressTableProps {
  events: ApplicationEvent[]
}

export default function InterviewProgressTable({ events }: InterviewProgressTableProps) {
  const stageMoves = events
    .filter(e => e.event_type === 'stage_moved')
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (stageMoves.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Interview Progress</h4>
      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Stage</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">Entered</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-500">By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {stageMoves.map(e => (
              <tr key={e.id} className="hover:bg-slate-50/50">
                <td className="px-3 py-2 text-slate-700 font-medium">{e.to_stage ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">
                  {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="px-3 py-2 text-slate-400">{e.created_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
