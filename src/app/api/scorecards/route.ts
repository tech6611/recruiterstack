import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const application_id = req.nextUrl.searchParams.get('application_id')
  if (!application_id) {
    return NextResponse.json({ error: 'application_id required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('scorecards')
    .select('*')
    .eq('application_id', application_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { application_id, interviewer_name, stage_name, recommendation, scores, overall_notes } = body

  if (!application_id || !interviewer_name?.trim() || !recommendation) {
    return NextResponse.json(
      { error: 'application_id, interviewer_name, and recommendation are required' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('scorecards')
    .insert({
      application_id,
      interviewer_name: interviewer_name.trim(),
      stage_name:       stage_name?.trim() || null,
      recommendation,
      scores:           scores ?? [],
      overall_notes:    overall_notes?.trim() || null,
    } as any)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
