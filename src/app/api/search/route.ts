import { NextRequest, NextResponse } from 'next/server'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w342'

// ── Mapping statique des genres TMDB (stable dans le temps) ───────────────
const MOVIE_GENRES: Record<number, string> = {
  28: 'action', 12: 'aventure', 16: 'animation', 35: 'comédie',
  80: 'crime', 99: 'documentaire', 18: 'drame', 10751: 'famille',
  14: 'fantastique', 36: 'histoire', 27: 'horreur', 10402: 'musique',
  9648: 'mystère', 10749: 'romance', 878: 'science-fiction',
  10770: 'téléfilm', 53: 'thriller', 10752: 'guerre', 37: 'western',
}
const TV_GENRES: Record<number, string> = {
  10759: 'action & aventure', 16: 'animation', 35: 'comédie',
  80: 'crime', 99: 'documentaire', 18: 'drame', 10751: 'famille',
  10762: 'enfants', 9648: 'mystère', 10763: 'actualités',
  10764: 'télé-réalité', 10765: 'sf & fantastique', 10766: 'soap',
  10767: 'talk-show', 10768: 'guerre & politique', 37: 'western',
}

function mapGenreIds(ids: number[], map: Record<number, string>): string[] {
  return ids.map(id => map[id]).filter(Boolean)
}

async function searchTMDB(type: 'movie' | 'tv', query: string) {
  const url = `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}`
  const res = await fetch(url)
  const data = await res.json()

  const genreMap = type === 'movie' ? MOVIE_GENRES : TV_GENRES

  return (data.results ?? []).slice(0, 20).map((item: Record<string, unknown>) => ({
    id: String(item.id),
    title: (item.title ?? item.name) as string,
    poster: item.poster_path ? `${IMG_BASE}${item.poster_path}` : null,
    year: ((item.release_date ?? item.first_air_date) as string)?.slice(0, 4) ?? '',
    rating: item.vote_average as number,
    genres: mapGenreIds((item.genre_ids as number[]) ?? [], genreMap),
    mediaType: type === 'movie' ? 'movie' : 'series',
  }))
}

async function searchBooks(query: string) {
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,first_publish_year,cover_i,subject`
  )
  const data = await res.json()

  return (data.docs ?? []).slice(0, 20).map((book: Record<string, unknown>) => {
    const subjects = (book.subject as string[] | undefined) ?? []
    // On prend les 5 premiers sujets, normalisés en minuscules
    const genres = subjects.slice(0, 5).map((s: string) => s.toLowerCase())
    return {
      id: (book.key as string).replace('/works/', ''),
      title: book.title as string,
      poster: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
      year: String(book.first_publish_year ?? ''),
      genres,
      mediaType: 'book',
    }
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') as 'movie' | 'series' | 'book' | null
  const query = searchParams.get('q') ?? ''

  if (!type || !query) {
    return NextResponse.json({ results: [] })
  }

  try {
    let results
    if (type === 'movie') results = await searchTMDB('movie', query)
    else if (type === 'series') results = await searchTMDB('tv', query)
    else results = await searchBooks(query)

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
