import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Offer, OfferInsert } from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export interface CreateOfferInput {
  applicationId: string
  candidateId: string
  hiringRequestId: string
  positionTitle: string
  baseSalary?: number | null
  bonus?: number | null
  equity?: string | null
  startDate?: string | null
  expiryDate?: string | null
  notes?: string | null
  offerLetterText?: string | null
}

/**
 * Insert a new offer (status 'draft') scoped to the org and return the row.
 * Side-effects (application_events, candidate status) stay in the caller.
 */
export async function createOfferRow(
  supabase: Supabase,
  orgId: string,
  input: CreateOfferInput,
): Promise<Offer> {
  const row: OfferInsert = {
    org_id: orgId,
    application_id: input.applicationId,
    candidate_id: input.candidateId,
    hiring_request_id: input.hiringRequestId,
    position_title: input.positionTitle,
    base_salary: input.baseSalary ?? null,
    bonus: input.bonus ?? null,
    equity: input.equity ?? null,
    start_date: input.startDate ?? null,
    expiry_date: input.expiryDate ?? null,
    notes: input.notes ?? null,
    offer_letter_text: input.offerLetterText ?? null,
    status: 'draft',
  }

  const { data, error } = await supabase
    .from('offers')
    .insert(row as never)
    .select()
    .single()

  if (error) throw error
  return data as Offer
}

export async function updateOfferRow(
  supabase: Supabase,
  orgId: string,
  offerId: string,
  payload: Record<string, unknown>,
): Promise<Offer> {
  const { data, error } = await supabase
    .from('offers')
    .update(payload as never)
    .eq('id', offerId)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) throw error
  return data as Offer
}

export interface ListOffersFilter {
  applicationId?: string
  candidateId?: string
  status?: string
}

export async function listOffers(
  supabase: Supabase,
  orgId: string,
  filter: ListOffersFilter = {},
): Promise<Offer[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('offers')
    .select('*')
    .eq('org_id', orgId)

  if (filter.applicationId) q = q.eq('application_id', filter.applicationId)
  if (filter.candidateId)   q = q.eq('candidate_id', filter.candidateId)
  if (filter.status)        q = q.eq('status', filter.status)

  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Offer[]
}
