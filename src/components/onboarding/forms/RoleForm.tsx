'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { roleSchema, type RoleInput } from '@/lib/validations/onboarding'
import { submitOnboardingStep } from '@/lib/onboarding/client'
import { cn } from '@/lib/utils'

interface RoleFormProps {
  forceAdmin: boolean                     // true when no admin exists yet in the org
  defaultRole?: RoleInput['role']
  /**
   * Role chosen by the inviter (carried via Clerk invitation public_metadata).
   * When set, the user can't pick a different role — the form is read-only.
   */
  lockedRole?: RoleInput['role']
}

const OPTIONS: Array<{ value: RoleInput['role']; title: string; subtitle: string }> = [
  { value: 'admin',           title: 'Admin',           subtitle: 'Configure the workspace, manage users, billing.' },
  { value: 'recruiter',       title: 'Recruiter',       subtitle: 'Source candidates, run pipelines, own interviews.' },
  { value: 'hiring_manager',  title: 'Hiring Manager',  subtitle: 'Own hiring needs, review shortlists, make decisions.' },
  { value: 'interviewer',     title: 'Interviewer',     subtitle: 'Just interview and submit scorecards.' },
]

export function RoleForm({ forceAdmin, defaultRole, lockedRole }: RoleFormProps) {
  const router = useRouter()
  const initialRole = lockedRole ?? (forceAdmin ? 'admin' : (defaultRole ?? 'recruiter'))
  const { handleSubmit, watch, setValue, formState: { isSubmitting } } = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: { role: initialRole },
  })
  const current = watch('role')
  const lockedLabel = lockedRole && OPTIONS.find(o => o.value === lockedRole)?.title

  async function onSubmit(values: RoleInput) {
    // Server is the source of truth — even if someone tampers with the
    // payload, /api/onboarding/role re-checks the invite's preferred_role
    // and overrides this value when locked.
    const res = await submitOnboardingStep('/api/onboarding/role', values)
    if (res) router.push(res.next)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {lockedRole ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div>
            Your role was set to <span className="font-semibold">{lockedLabel}</span> by the teammate
            who invited you. Ask an admin if this needs to change.
          </div>
        </div>
      ) : forceAdmin ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          You&rsquo;re the first member here, so you&rsquo;ll be set up as admin. You can invite teammates and set their roles next.
        </div>
      ) : null}
      <div className="space-y-2">
        {OPTIONS.map(opt => {
          const isLocked = !!lockedRole
          const disabled =
            isLocked
              ? opt.value !== lockedRole
              : forceAdmin && opt.value !== 'admin'
          const selected = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (isLocked) return
                setValue('role', opt.value, { shouldValidate: true })
              }}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50',
                disabled && 'opacity-40 cursor-not-allowed hover:bg-white',
                isLocked && selected && 'cursor-default',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{opt.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</div>
                </div>
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full border-2',
                    selected ? 'border-emerald-600' : 'border-slate-300',
                  )}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>Continue</Button>
      </div>
    </form>
  )
}
