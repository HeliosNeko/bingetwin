const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const BASE_URL = 'https://api.themoviedb.org/3'
export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

async function tmdbFetch(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`)
  url.searchParams.set('api_key', API_KEY)
  url.searchParams.set('language', 'fr-FR')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`)
  return res.json()
}

export async function searchMovies(query: string, page = 1) {
  return tmdbFetch('/search/movie', { query, page: String(page) })
}

export async function searchSeries(query: string, page = 1) {
  return tmdbFetch('/search/tv', { query, page: String(page) })
}

export async function getTrendingMovies() {
  return tmdbFetch('/trending/movie/week')
}

export async function getTrendingSeries() {
  return tmdbFetch('/trending/tv/week')
}

export async function getMovieDetails(id: number) {
  return tmdbFetch(`/movie/${id}`)
}

export async function getSeriesDetails(id: number) {
  return tmdbFetch(`/tv/${id}`)
}

export function getPosterUrl(path: string | null, size: 'w185' | 'w342' | 'w500' | 'original' = 'w342') {
  if (!path) return null
  return `${IMAGE_BASE_URL}/${size}${path}`
}
