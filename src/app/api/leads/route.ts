import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { logger } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const rateLimited = await checkRateLimit(req)
  if (rateLimited) return rateLimited

  try {
    const { email, source = 'homepage' } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { error } = await supabase
      .from('leads')
      .insert({ email: email.toLowerCase().trim(), source })

    if (error) {
      // Duplicate email — treat as success so we don't leak which emails are registered
      if (error.code === '23505') {
        return NextResponse.json({ success: true })
      }
      logger.error('[leads] insert error', error)
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('[leads] unexpected error', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
