import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TMDB_KEY  = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const TMDB_BASE = 'https://api.themoviedb.org/3'

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

// Pause entre requêtes pour respecter les limites TMDB (40 req/10s)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Vérification admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Récupérer tous les items sans genres
  const { data: items, error } = await supabase.rpc('get_items_missing_genres')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!items || items.length === 0) {
    return NextResponse.json({ updated: 0, total: 0, message: 'Aucun item à traiter' })
  }

  let updated = 0
  let failed  = 0
  const total = items.length

  for (let i = 0; i < items.length; i++) {
    const { external_id, media_type } = items[i]
    let genres: string[] = []

    try {
      if (media_type === 'movie' || media_type === 'series') {
        genres = await fetchTMDBGenres(media_type as 'movie' | 'series', external_id)
        // Respecter la limite TMDB : 40 req/10s → pause toutes les 20 requêtes
        if ((i + 1) % 20 === 0) await sleep(600)
      } else {
        genres = await fetchOLGenres(external_id)
        if ((i + 1) % 10 === 0) await sleep(300)
      }

      if (genres.length > 0) {
        const { error: rpcErr } = await supabase.rpc('update_favorite_genres', {
          p_external_id: external_id,
          p_media_type:  media_type,
          p_genres:      genres,
        })
        if (!rpcErr) updated++
        else failed++
      } else {
        // Pas de genres disponibles → on ne touche pas l'enregistrement
      }
    } catch {
      failed++
    }
  }

  return NextResponse.json({ updated, failed, total, message: 'Backfill terminé' })
}
