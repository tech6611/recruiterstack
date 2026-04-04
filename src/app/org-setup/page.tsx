'use client'

import { CreateOrganization, OrganizationList } from '@clerk/nextjs'
import { Zap } from 'lucide-react'

export default function OrgSetupPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#061D46] px-4">
      {/* Logo */}
      <div className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">RecruiterStack</span>
      </div>

      <h1 className="mb-2 text-2xl font-semibold text-white">Set up your workspace</h1>
      <p className="mb-8 text-sm text-blue-100/60">
        Create a new workspace for your company, or join an existing one.
      </p>

      {/* Show org list if user might already belong to orgs */}
      <div className="mb-6 w-full max-w-md">
        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl="/dashboard"
          afterCreateOrganizationUrl="/dashboard"
        />
      </div>

      <div className="w-full max-w-md">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-blue-100/60">
          Or create a new workspace
        </p>
        <CreateOrganization afterCreateOrganizationUrl="/dashboard" />
      </div>
    </div>
  )
}
