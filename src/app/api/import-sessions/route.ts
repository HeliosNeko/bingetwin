import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/import-sessions
// Returns all pending import sessions for the current user.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ sessions: [] }, { status: 401 })

  const { data } = await supabase
    .from('import_sessions')
    .select('source, items, total_parsed, not_found, saved_at')
    .eq('user_id', user.id)

  return NextResponse.json({ sessions: data ?? [] })
}

// POST /api/import-sessions
// Body: { source, items, totalParsed, notFound }
// Upserts a session (one per user+source).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { source, items, totalParsed, notFound } = await req.json()
  if (!source || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  await supabase.from('import_sessions').upsert(
    {
      user_id:      user.id,
      source,
      items,
      total_parsed: totalParsed ?? items.length,
      not_found:    notFound ?? [],
      saved_at:     new Date().toISOString(),
    },
    { onConflict: 'user_id,source' }
  )

  return NextResponse.json({ ok: true })
}

// DELETE /api/import-sessions?source=netflix
// Removes a specific session for the current user.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const source = new URL(req.url).searchParams.get('source')
  if (!source) return NextResponse.json({ error: 'Missing source' }, { status: 400 })

  await supabase
    .from('import_sessions')
    .delete()
    .eq('user_id', user.id)
    .eq('source', source)

  return NextResponse.json({ ok: true })
}
