import { NextRequest, NextResponse } from 'next/server'

const TMDB_KEY  = (process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim()
const TMDB_BASE = 'https://api.themoviedb.org/3'

/**
 * GET /api/genres?type=movie|series|book&id=<external_id>
 *
 * Returns genres + extra details for movies/series (director, creator,
 * country, runtime, seasons). Used by the drawer.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as 'movie' | 'series' | 'book' | null
  const id   = searchParams.get('id')

  if (!type || !id) return NextResponse.json({ genres: [] })

  try {
    if (type === 'movie') {
      const res = await fetch(
        `${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=fr-FR&append_to_response=credits`,
        { next: { revalidate: 86400 } }
      )
      if (!res.ok) return NextResponse.json({ genres: [] })
      const data = await res.json()

      const genres = (data.genres as { name: string }[] ?? []).map(g => g.name.toLowerCase())
      const crew   = (data.credits?.crew ?? []) as { job: string; name: string }[]
      const director = crew.find(c => c.job === 'Director')?.name
      const country  = (data.production_countries as { iso_3166_1: string }[] ?? [])[0]?.iso_3166_1
      const runtime  = typeof data.runtime === 'number' && data.runtime > 0 ? data.runtime : undefined

      return NextResponse.json({ genres, director, country, runtime })
    }

    if (type === 'series') {
      const res = await fetch(
        `${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=fr-FR`,
        { next: { revalidate: 86400 } }
      )
      if (!res.ok) return NextResponse.json({ genres: [] })
      const data = await res.json()

      const genres  = (data.genres as { name: string }[] ?? []).map(g => g.name.toLowerCase())
      const creator = (data.created_by as { name: string }[] ?? [])[0]?.name
      const country = (data.origin_country as string[] ?? [])[0]
      const seasons = typeof data.number_of_seasons === 'number' ? data.number_of_seasons : undefined

      return NextResponse.json({ genres, creator, country, seasons })
    }

    // Book → Open Library
    const res = await fetch(
      `https://openlibrary.org/works/${id}.json`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return NextResponse.json({ genres: [] })
    const data    = await res.json()
    const genres  = (data.subjects as string[] ?? []).slice(0, 8).map((s: string) => s.toLowerCase())
    return NextResponse.json({ genres })

  } catch {
    return NextResponse.json({ genres: [] })
  }
}
