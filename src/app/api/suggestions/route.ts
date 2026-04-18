import { NextRequest, NextResponse } from 'next/server'
import type { MediaItem } from '@/app/(app)/discover/page'

const TMDB_KEY  = (process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '').trim()
const TMDB_BASE = 'https://api.themoviedb.org/3'
const IMG       = 'https://image.tmdb.org/t/p/w342'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Prefs {
  dateGte?:  string     // ISO date, undefined = pas de filtre de date
  genres:    number[]   // IDs TMDB movie, vide = tous
  languages: string[]   // codes ISO 639-1, vide = toutes langues
}

type TmdbResult = Record<string, unknown>

// Mapping genres films → TV (IDs qui diffèrent)
const MOVIE_TO_TV: Record<number, number> = {
  28:  10759,  // Action → Action & Adventure
  12:  10759,  // Aventure → Action & Adventure
  878: 10765,  // Science-Fiction → Sci-Fi & Fantasy
  14:  10765,  // Fantastique → Sci-Fi & Fantasy
}
function tvGenres(ids: number[]): number[] {
  return [...new Set(ids.map(id => MOVIE_TO_TV[id] ?? id))]
}

// Groupes de langues
const EUROPEAN_LANGS = ['es', 'de', 'it', 'pt', 'nl', 'pl', 'sv', 'da']
const ASIAN_LANGS    = ['ja', 'ko', 'zh', 'hi', 'th', 'id']

function expandLanguages(group: string): string[] {
  if (group === 'en')       return ['en']
  if (group === 'fr')       return ['fr']
  if (group === 'european') return EUROPEAN_LANGS
  if (group === 'asian')    return ASIAN_LANGS
  return []
}

// ── Preferences parsing ───────────────────────────────────────────────────────

function parsePrefs(sp: URLSearchParams): Prefs {
  // genres
  const raw = sp.get('genres') ?? ''
  const genres = raw ? raw.split(',').map(Number).filter(Boolean) : []

  // periods (comma-separated) → dateGte: on prend la fenêtre la plus large
  const periodsRaw = sp.get('periods') ?? ''
  const periods = periodsRaw ? periodsRaw.split(',').filter(Boolean) : []
  let dateGte: string | undefined
  if (periods.length > 0) {
    const d = new Date()
    if (periods.includes('20years'))     d.setFullYear(d.getFullYear() - 20)
    else if (periods.includes('5years')) d.setFullYear(d.getFullYear() - 5)
    else if (periods.includes('year'))   d.setFullYear(d.getFullYear() - 1)
    dateGte = d.toISOString().slice(0, 10)
  }

  // langs (comma-separated group names) → liste de codes ISO
  const langsRaw = sp.get('langs') ?? ''
  const langGroups = langsRaw ? langsRaw.split(',').filter(Boolean) : []
  const languages = langGroups.length
    ? [...new Set(langGroups.flatMap(expandLanguages))]
    : []

  return { dateGte, genres, languages }
}

// ── TMDB fetch helpers ────────────────────────────────────────────────────────

function buildUrl(
  type: 'movie' | 'tv',
  sort: 'popularity.desc' | 'vote_average.desc',
  page: number,
  opts: { dateGte?: string; genres?: number[]; lang?: string; minVoteAvg?: number; minVoteCount?: number }
): string {
  const p = new URLSearchParams({
    api_key:          TMDB_KEY,
    language:         'fr-FR',
    sort_by:          sort,
    page:             String(page),
    'vote_count.gte': String(opts.minVoteCount ?? 10),
  })
  if (opts.dateGte) {
    p.set(type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte', opts.dateGte)
  }
  if (opts.genres?.length) {
    const ids = type === 'tv' ? tvGenres(opts.genres) : opts.genres
    p.set('with_genres', ids.join(','))
  }
  if (opts.lang) p.set('with_original_language', opts.lang)
  if (opts.minVoteAvg) p.set('vote_average.gte', String(opts.minVoteAvg))
  return `${TMDB_BASE}/discover/${type}?${p.toString()}`
}

function toItem(r: TmdbResult, type: 'movie' | 'series'): MediaItem {
  return {
    id:        String(r.id),
    title:     ((type === 'movie' ? r.title : r.name) ?? r.title ?? r.name) as string,
    poster:    r.poster_path ? `${IMG}${r.poster_path}` : null,
    year:      String(type === 'movie' ? (r.release_date ?? '') : (r.first_air_date ?? '')).slice(0, 4),
    genres:    [],
    mediaType: type,
  }
}

// Fait N appels parallèles (un par langue) et déduplique les résultats
async function fetchCategory(
  type: 'movie' | 'tv',
  sort: 'popularity.desc' | 'vote_average.desc',
  page: number,
  prefs: Prefs,
  isClassic: boolean,
): Promise<MediaItem[]> {
  const opts = {
    dateGte:      prefs.dateGte,
    genres:       prefs.genres.length ? prefs.genres : undefined,
    minVoteAvg:   isClassic ? 8.0 : undefined,
    minVoteCount: isClassic ? 5000 : 20,
  }

  const langs = prefs.languages.length ? prefs.languages : ['']

  const responses = await Promise.all(
    langs.map(lang =>
      fetch(buildUrl(type, sort, page, { ...opts, lang: lang || undefined }), { next: { revalidate: 86400 } })
    )
  )

  const all: TmdbResult[] = []
  const seen = new Set<number>()

  for (const res of responses) {
    if (!res.ok) continue
    const data = await res.json()
    for (const item of (data.results ?? []) as TmdbResult[]) {
      if (seen.has(item.id as number)) continue
      seen.add(item.id as number)
      all.push(item)
    }
  }

  const mediaType = type === 'tv' ? 'series' : 'movie'
  return all.slice(0, 10).map(r => toItem(r, mediaType))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sp    = new URL(req.url).searchParams
  const page  = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const prefs = parsePrefs(sp)

  try {
    const [recentMovies, recentSeries, classicMovies, classicSeries] = await Promise.all([
      fetchCategory('movie', 'popularity.desc',   page, prefs, false),
      fetchCategory('tv',    'popularity.desc',   page, prefs, false),
      fetchCategory('movie', 'vote_average.desc', page, prefs, true),
      fetchCategory('tv',    'vote_average.desc', page, prefs, true),
    ])

    const recent  = [...recentMovies,  ...recentSeries]
    const classic = [...classicMovies, ...classicSeries]

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
