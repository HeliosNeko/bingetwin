import { NextRequest, NextResponse } from 'next/server'

const TMDB_KEY  = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const TMDB_BASE = 'https://api.themoviedb.org/3'

/**
 * GET /api/genres?type=movie|series|book&id=<external_id>
 *
 * Retourne les genres d'un item depuis TMDB (films/séries)
 * ou les sujets Open Library (livres).
 * Utilisé par le drawer quand genre_ids est vide dans le résultat de recherche.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as 'movie' | 'series' | 'book' | null
  const id   = searchParams.get('id')

  if (!type || !id) {
    return NextResponse.json({ genres: [] })
  }

  try {
    if (type === 'movie' || type === 'series') {
      const endpoint = type === 'movie' ? 'movie' : 'tv'
      const res  = await fetch(
        `${TMDB_BASE}/${endpoint}/${id}?api_key=${TMDB_KEY}&language=fr-FR`,
        { next: { revalidate: 86400 } }   // cache 24 h
      )
      if (!res.ok) return NextResponse.json({ genres: [] })
      const data = await res.json()
      const genres = (data.genres as { name: string }[] ?? [])
        .map(g => g.name.toLowerCase())
      return NextResponse.json({ genres })
    }

    // Livre → Open Library /works/{key}.json
    const res  = await fetch(
      `https://openlibrary.org/works/${id}.json`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return NextResponse.json({ genres: [] })
    const data    = await res.json()
    const subjects = (data.subjects as string[] ?? [])
      .slice(0, 8)
      .map((s: string) => s.toLowerCase())
    return NextResponse.json({ genres: subjects })

  } catch {
    return NextResponse.json({ genres: [] })
  }
}
