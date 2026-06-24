import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'

// GET /api/org-settings/company — returns company info fields only.
// Read-available to any org member; write happens via PATCH /api/org-settings
// (admin-only there).
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('org_settings')
    .select(
      'company_name, company_size, industry, website, ' +
      'careers_slug, careers_public, logo_url, hero_image_url, ' +
      'brand_color, accent_color, brand_font, tagline, about'
    )
    .eq('org_id', orgId)
    .maybeSingle()

  return NextResponse.json({
    data: data ?? {
      company_name: null, company_size: null, industry: null, website: null,
      careers_slug: null, careers_public: false, logo_url: null, hero_image_url: null,
      brand_color: null, accent_color: null, brand_font: null, tagline: null, about: null,
    },
  })
}
