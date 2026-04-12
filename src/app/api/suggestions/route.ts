import { NextResponse } from 'next/server'
import type { MediaItem } from '@/app/(app)/discover/page'

const TMDB_KEY  = (process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim()
const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMG       = 'https://image.tmdb.org/t/p/w342'

// Revalidation : Vercel/Next.js ne rappelle TMDB qu'une fois par jour
const CACHE = { next: { revalidate: 86400 } } as const

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

// 3 films + 3 séries récents (sortis il y a moins de 12 mois, popularity ≥ 50)
async function fetchRecent(): Promise<MediaItem[]> {
  const since = twelveMonthsAgo()
  const [mRes, sRes] = await Promise.all([
    fetch(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=fr-FR&sort_by=popularity.desc&primary_release_date.gte=${since}&vote_count.gte=20&popularity.gte=50`, CACHE),
    fetch(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=fr-FR&sort_by=popularity.desc&first_air_date.gte=${since}&vote_count.gte=20&popularity.gte=50`, CACHE),
  ])
  if (!mRes.ok || !sRes.ok) return []
  const [md, sd] = await Promise.all([mRes.json(), sRes.json()])
  return [
    ...((md.results ?? []) as TmdbResult[]).slice(0, 3).map(r => toItem(r, 'movie')),
    ...((sd.results ?? []) as TmdbResult[]).slice(0, 3).map(r => toItem(r, 'series')),
  ]
}

// 3 films + 3 séries intemporels (vote_average ≥ 8.0, vote_count ≥ 5000)
async function fetchClassic(): Promise<MediaItem[]> {
  const [mRes, sRes] = await Promise.all([
    fetch(`${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=fr-FR&sort_by=vote_average.desc&vote_average.gte=8.0&vote_count.gte=5000`, CACHE),
    fetch(`${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&language=fr-FR&sort_by=vote_average.desc&vote_average.gte=8.0&vote_count.gte=5000`, CACHE),
  ])
  if (!mRes.ok || !sRes.ok) return []
  const [md, sd] = await Promise.all([mRes.json(), sRes.json()])
  return [
    ...((md.results ?? []) as TmdbResult[]).slice(0, 3).map(r => toItem(r, 'movie')),
    ...((sd.results ?? []) as TmdbResult[]).slice(0, 3).map(r => toItem(r, 'series')),
  ]
}

export async function GET() {
  try {
    const [recent, classic] = await Promise.all([fetchRecent(), fetchClassic()])

    // Mélange interleaved : récent, classique, récent, classique…
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
