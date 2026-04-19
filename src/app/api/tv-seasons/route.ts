import { NextRequest, NextResponse } from 'next/server'

const TMDB_KEY  = (process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim()
const TMDB_BASE = 'https://api.themoviedb.org/3'

export interface TvSeason {
  season_number: number
  name:          string
  episode_count: number
  year:          string
  poster_path:   string | null
}

/**
 * GET /api/tv-seasons?id=<tmdb_series_id>
 * Returns the list of seasons for a TV series (from TMDB /tv/{id}).
 * Season 0 (Specials) is included only if it has episodes.
 */
export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ seasons: [] })

  try {
    const res = await fetch(
      `${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=fr-FR`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return NextResponse.json({ seasons: [] })

    const data = await res.json()
    const raw: {
      season_number: number
      name: string
      episode_count: number
      air_date: string | null
      poster_path: string | null
    }[] = data.seasons ?? []

    const seasons: TvSeason[] = raw
      .filter(s => s.season_number > 0 || s.episode_count > 0)
      .map(s => ({
        season_number: s.season_number,
        name:          s.name || `Saison ${s.season_number}`,
        episode_count: s.episode_count,
        year:          s.air_date ? s.air_date.slice(0, 4) : '',
        poster_path:   s.poster_path,
      }))

    return NextResponse.json({ seasons })
  } catch {
    return NextResponse.json({ seasons: [] })
  }
}
