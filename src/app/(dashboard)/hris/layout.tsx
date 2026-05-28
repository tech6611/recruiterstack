import { AdminOnlyGuard } from '@/components/hris/AdminOnlyGuard'

// Gates the entire admin-side `/hris/*` route group to org admins. Employees
// (and other non-admins) get redirected to /me. Self-service pages live at
// /me/* and are not affected.
export default function HrisLayout({ children }: { children: React.ReactNode }) {
  return <AdminOnlyGuard>{children}</AdminOnlyGuard>
}
