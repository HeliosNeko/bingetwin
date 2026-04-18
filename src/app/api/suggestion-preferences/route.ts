import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEFAULT = { genres: [] as number[], period: 'all', language_group: 'all' }

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(DEFAULT)

  const { data } = await supabase
    .from('suggestion_preferences')
    .select('genres, period, language_group')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data ?? DEFAULT)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const genres: number[]    = Array.isArray(body.genres) ? body.genres : []
  const period: string      = ['year', '5years', '20years', 'all'].includes(body.period) ? body.period : 'all'
  const language_group: string = ['en', 'fr', 'european', 'asian', 'all'].includes(body.language_group) ? body.language_group : 'all'

  await supabase.from('suggestion_preferences').upsert(
    { user_id: user.id, genres, period, language_group, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  return NextResponse.json({ ok: true })
}
