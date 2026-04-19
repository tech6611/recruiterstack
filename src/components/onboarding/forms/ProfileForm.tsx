'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { profileSchema, type ProfileInput } from '@/lib/validations/onboarding'
import { submitOnboardingStep } from '@/lib/onboarding/client'

interface ProfileFormProps {
  defaults: Partial<ProfileInput>
}

export function ProfileForm({ defaults }: ProfileFormProps) {
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: defaults.first_name ?? '', last_name: defaults.last_name ?? '' },
  })

  async function onSubmit(values: ProfileInput) {
    const res = await submitOnboardingStep('/api/onboarding/profile', values)
    if (res) router.push(res.next)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" autoFocus {...register('first_name')} />
          {errors.first_name && <p className="text-xs text-red-600">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" {...register('last_name')} />
          {errors.last_name && <p className="text-xs text-red-600">{errors.last_name.message}</p>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>Continue</Button>
      </div>
    </form>
  )
}
