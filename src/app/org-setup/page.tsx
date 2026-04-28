'use client'

import { OrganizationList } from '@clerk/nextjs'
import { Zap } from 'lucide-react'

export default function OrgSetupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-emerald-50/30 px-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500">
          <Zap className="h-5 w-5 text-slate-900" />
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900">RecruiterStack</span>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Set up your workspace</h1>
      <p className="mb-8 text-sm text-slate-600">
        Create a new workspace for your company, or join an existing one.
      </p>

      {/*
       * <OrganizationList> shows existing memberships AND a "Create organization"
       * button when the user has none. We previously rendered <CreateOrganization>
       * separately below, which duplicated the create form for new users. Removed.
       *
       * Note: afterCreateOrganizationUrl points at /onboarding/profile so a brand
       * new org flows through the 7-step onboarding. Members selecting an existing
       * org go straight to /dashboard, where (dashboard)/layout.tsx will redirect
       * them into onboarding if their member row hasn't been onboarded yet.
       */}
      <div className="w-full max-w-md">
        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/onboarding/profile"
        />
      </div>
    </div>
  )
}
