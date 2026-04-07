import { NextRequest, NextResponse } from 'next/server'

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w342'

async function searchTMDB(type: 'movie' | 'tv', query: string) {
  const url = `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(query)}`
  const res = await fetch(url)
  const data = await res.json()

  return (data.results ?? []).slice(0, 20).map((item: Record<string, unknown>) => ({
    id: String(item.id),
    title: (item.title ?? item.name) as string,
    poster: item.poster_path ? `${IMG_BASE}${item.poster_path}` : null,
    year: ((item.release_date ?? item.first_air_date) as string)?.slice(0, 4) ?? '',
    rating: item.vote_average as number,
    mediaType: type === 'movie' ? 'movie' : 'series',
  }))
}

async function searchBooks(query: string) {
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,first_publish_year,cover_i`
  )
  const data = await res.json()

  return (data.docs ?? []).slice(0, 20).map((book: Record<string, unknown>) => ({
    id: (book.key as string).replace('/works/', ''),
    title: book.title as string,
    poster: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg` : null,
    year: String(book.first_publish_year ?? ''),
    mediaType: 'book',
  }))
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
