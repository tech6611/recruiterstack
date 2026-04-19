'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { orgInfoSchema, type OrgInfoInput } from '@/lib/validations/onboarding'
import { submitOnboardingStep } from '@/lib/onboarding/client'

interface OrgInfoFormProps {
  defaults: Partial<OrgInfoInput>
}

export function OrgInfoForm({ defaults }: OrgInfoFormProps) {
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OrgInfoInput>({
    resolver: zodResolver(orgInfoSchema),
    defaultValues: {
      company_name: defaults.company_name ?? '',
      company_size: defaults.company_size,
      industry:     defaults.industry ?? '',
      website:      defaults.website ?? '',
    },
  })

  async function onSubmit(values: OrgInfoInput) {
    const res = await submitOnboardingStep('/api/onboarding/org-info', values)
    if (res) router.push(res.next)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="company_name">Company name</Label>
        <Input id="company_name" autoFocus placeholder="Acme Inc." {...register('company_name')} />
        {errors.company_name && <p className="text-xs text-red-600">{errors.company_name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company_size">Company size</Label>
        <Select id="company_size" {...register('company_size')}>
          <option value="">Pick a range…</option>
          <option value="1-10">1–10</option>
          <option value="11-50">11–50</option>
          <option value="51-200">51–200</option>
          <option value="201-1000">201–1,000</option>
          <option value="1000+">1,000+</option>
        </Select>
        {errors.company_size && <p className="text-xs text-red-600">{errors.company_size.message}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" placeholder="e.g. SaaS, Fintech" {...register('industry')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" placeholder="https://acme.com" {...register('website')} />
          {errors.website && <p className="text-xs text-red-600">{errors.website.message}</p>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting}>Continue</Button>
      </div>
    </form>
  )
}
