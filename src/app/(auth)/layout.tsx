export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50/30">
      {children}
    </div>
  )
}
