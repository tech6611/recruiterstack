'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, MapPin, DollarSign, ChevronRight } from 'lucide-react'
import { SlideOver } from '@/components/ui/SlideOver'
import { RoleForm } from '@/components/roles/RoleForm'
import { StatusBadge } from '@/components/ui/Badge'
import type { Role } from '@/lib/types/database'

export default function RolesPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [slideOpen, setSlideOpen] = useState(false)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/roles')
    if (res.ok) {
      const json = await res.json()
      setRoles(json.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return null
    const fmt = (n: number) =>
      n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`
    if (min && max) return `${fmt(min)} – ${fmt(max)}`
    if (min) return `From ${fmt(min)}`
    return `Up to ${fmt(max!)}`
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roles</h1>
          <p className="text-sm text-slate-500 mt-0.5">Open positions and hiring pipelines</p>
        </div>
        <button
          onClick={() => setSlideOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Role
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          Loading roles…
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Briefcase className="h-10 w-10 text-slate-200" />
          <p className="text-slate-400 text-sm">No roles yet. Add your first role to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {roles.map(role => {
            const salary = formatSalary(role.salary_min, role.salary_max)
            return (
              <button
                key={role.id}
                onClick={() => router.push(`/roles/${role.id}`)}
                className="w-full text-left rounded-2xl border border-slate-200 bg-white shadow-sm p-5 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                        {role.job_title}
                      </h3>
                      <StatusBadge status={role.status} variant="role" />
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      {role.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {role.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {role.min_experience}+ yrs
                      </span>
                      {salary && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {salary}
                        </span>
                      )}
                    </div>

                    {role.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {role.required_skills.slice(0, 5).map(skill => (
                          <span
                            key={skill}
                            className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                        {role.required_skills.length > 5 && (
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                            +{role.required_skills.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <SlideOver open={slideOpen} onClose={() => setSlideOpen(false)} title="Add Role">
        <RoleForm
          onSuccess={() => {
            setSlideOpen(false)
            fetchRoles()
          }}
        />
      </SlideOver>
    </div>
  )
}
