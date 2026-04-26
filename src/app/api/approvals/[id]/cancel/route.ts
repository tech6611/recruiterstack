import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAndUser } from '@/lib/auth'
import { cancelApproval, ApprovalError } from '@/lib/approvals/engine'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  try {
    await cancelApproval(params.id, auth.userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof ApprovalError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
