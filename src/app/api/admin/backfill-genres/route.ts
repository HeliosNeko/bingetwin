import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const TMDB_KEY  = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const TMDB_BASE = 'https://api.themoviedb.org/3'

// Admin client bypasses RLS — can read/write all users' rows
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

async function fetchTMDBGenres(type: 'movie' | 'series', id: string): Promise<string[]> {
  const endpoint = type === 'movie' ? 'movie' : 'tv'
  const res = await fetch(
    `${TMDB_BASE}/${endpoint}/${id}?api_key=${TMDB_KEY}&language=fr-FR`
  )
  if (!res.ok) return []
  const data = await res.json()
  return (data.genres as { name: string }[] ?? []).map(g => g.name.toLowerCase())
}

async function fetchOLGenres(id: string): Promise<string[]> {
  const res = await fetch(`https://openlibrary.org/works/${id}.json`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.subjects as string[] ?? []).slice(0, 8).map((s: string) => s.toLowerCase())
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST() {
  // Auth check via session client
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Use admin client (service role) for cross-user reads + writes
  let admin: ReturnType<typeof getAdminClient>
  try {
    admin = getAdminClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Service role key manquant' },
      { status: 500 }
    )
  }

  // Fetch all favorites with empty genres (across all users)
  const { data: items, error } = await admin
    .from('favorites')
    .select('external_id, media_type')
    .or('genres.eq.{},genres.is.null')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) {
    return NextResponse.json({ updated: 0, total: 0, message: 'Aucun item à traiter' })
  }

  // Deduplicate by (external_id, media_type)
  const seen = new Set<string>()
  const unique = items.filter(({ external_id, media_type }) => {
    const key = `${media_type}:${external_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  let updated = 0
  let failed  = 0
  const total  = unique.length

  for (let i = 0; i < unique.length; i++) {
    const { external_id, media_type } = unique[i]
    let genres: string[] = []

    try {
      if (media_type === 'movie' || media_type === 'series') {
        genres = await fetchTMDBGenres(media_type as 'movie' | 'series', external_id)
        if ((i + 1) % 20 === 0) await sleep(600)
      } else {
        genres = await fetchOLGenres(external_id)
        if ((i + 1) % 10 === 0) await sleep(300)
      }

      if (genres.length > 0) {
        const { error: upErr } = await admin
          .from('favorites')
          .update({ genres })
          .eq('external_id', external_id)
          .eq('media_type', media_type)
          .or('genres.eq.{},genres.is.null')

        if (!upErr) updated++
        else failed++
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({ updated, failed, total, message: 'Backfill terminé' })
}
