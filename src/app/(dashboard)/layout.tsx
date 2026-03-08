import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = auth()

  if (!userId) redirect('/sign-in')

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
