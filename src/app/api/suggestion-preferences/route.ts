import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_PERIODS = ['year', '5years', '20years']
const VALID_LANGS   = ['en', 'fr', 'european', 'asian']

const DEFAULT = {
  genres:          [] as number[],
  periods:         [] as string[],
  language_groups: [] as string[],
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(DEFAULT)

  const { data } = await supabase
    .from('suggestion_preferences')
    .select('genres, periods, language_groups')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json(data ?? DEFAULT)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const genres: number[]  = Array.isArray(body.genres) ? body.genres.filter(Number.isInteger) : []
  const periods: string[] = Array.isArray(body.periods)
    ? body.periods.filter((v: unknown) => typeof v === 'string' && VALID_PERIODS.includes(v))
    : []
  const language_groups: string[] = Array.isArray(body.language_groups)
    ? body.language_groups.filter((v: unknown) => typeof v === 'string' && VALID_LANGS.includes(v))
    : []

  await supabase.from('suggestion_preferences').upsert(
    { user_id: user.id, genres, periods, language_groups, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )

  return NextResponse.json({ ok: true })
}
