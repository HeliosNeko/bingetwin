import { NextRequest, NextResponse } from 'next/server'
import type { MediaItem } from '@/app/(app)/discover/page'

const TMDB_KEY  = (process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim()
const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMG       = 'https://image.tmdb.org/t/p/w342'

function twelveMonthsAgo(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

type TmdbResult = Record<string, unknown>

function toItem(r: TmdbResult, type: 'movie' | 'series'): MediaItem {
  return {
    id:        String(r.id),
    title:     (type === 'movie' ? r.title : r.name) as string,
    poster:    r.poster_path ? `${IMG}${r.poster_path}` : null,
    year:      String(type === 'movie' ? (r.release_date ?? '') : (r.first_air_date ?? '')).slice(0, 4),
    genres:    [],
    mediaType: type,
  }
}

// 5 films + 5 séries récents (sortis il y a moins de 12 mois, popularity ≥ 50)
async function fetchRecent(page: number): Promise<MediaItem[]> {
  const since = twelveMonthsAgo()
  // cache par page : Next.js ne rappelle TMDB qu'une fois par jour par page
  const cache = { next: { revalidate: 86400 } } as const
  const [mRes, sRes] = await Promise.all([
    fetch(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=fr-FR&sort_by=popularity.desc&primary_release_date.gte=${since}&vote_count.gte=20&popularity.gte=50&page=${page}`, cache),
    fetch(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=fr-FR&sort_by=popularity.desc&first_air_date.gte=${since}&vote_count.gte=20&popularity.gte=50&page=${page}`, cache),
  ])
  if (!mRes.ok || !sRes.ok) return []
  const [md, sd] = await Promise.all([mRes.json(), sRes.json()])
  return [
    ...((md.results ?? []) as TmdbResult[]).slice(0, 5).map(r => toItem(r, 'movie')),
    ...((sd.results ?? []) as TmdbResult[]).slice(0, 5).map(r => toItem(r, 'series')),
  ]
}

// 5 films + 5 séries intemporels (vote_average ≥ 8.0, vote_count ≥ 5000)
async function fetchClassic(page: number): Promise<MediaItem[]> {
  const cache = { next: { revalidate: 86400 } } as const
  const [mRes, sRes] = await Promise.all([
    fetch(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=fr-FR&sort_by=vote_average.desc&vote_average.gte=8.0&vote_count.gte=5000&page=${page}`, cache),
    fetch(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=fr-FR&sort_by=vote_average.desc&vote_average.gte=8.0&vote_count.gte=5000&page=${page}`, cache),
  ])
  if (!mRes.ok || !sRes.ok) return []
  const [md, sd] = await Promise.all([mRes.json(), sRes.json()])
  return [
    ...((md.results ?? []) as TmdbResult[]).slice(0, 5).map(r => toItem(r, 'movie')),
    ...((sd.results ?? []) as TmdbResult[]).slice(0, 5).map(r => toItem(r, 'series')),
  ]
}

// GET /api/suggestions?page=1
// Retourne 20 items (10 récents + 10 classiques, interleaved).
// Le client filtre les déjà-notés et complète si besoin avec page+1.
export async function GET(req: NextRequest) {
  const page = Math.max(1, parseInt(new URL(req.url).searchParams.get('page') ?? '1', 10) || 1)

  try {
    const [recent, classic] = await Promise.all([fetchRecent(page), fetchClassic(page)])

    const items: MediaItem[] = []
    const len = Math.max(recent.length, classic.length)
    for (let i = 0; i < len; i++) {
      if (i < recent.length)  items.push(recent[i])
      if (i < classic.length) items.push(classic[i])
    }

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
