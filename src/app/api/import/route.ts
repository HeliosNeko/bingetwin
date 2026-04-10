import { NextRequest, NextResponse } from 'next/server'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedItem {
  cleanTitle: string
  year: string
  importedRating: number | null
  preferredType: 'movie' | 'series' | 'book'
}

interface MatchedItem extends ParsedItem {
  externalId: string
  displayTitle: string
  poster: string | null
  userRating: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY!
const IMG = 'https://image.tmdb.org/t/p/w154'

async function searchTMDB(
  type: 'movie' | 'tv',
  query: string,
  year?: string,
  lang = 'fr-FR',
): Promise<{ id: string; title: string; poster: string | null; year: string } | null> {
  const url = new URL(`https://api.themoviedb.org/3/search/${type}`)
  url.searchParams.set('api_key', TMDB_KEY)
  url.searchParams.set('query', query)
  url.searchParams.set('language', lang)
  if (year) url.searchParams.set(type === 'movie' ? 'year' : 'first_air_date_year', year)
  try {
    const res = await fetch(url.toString())  // pas d'option next/cache — identique à /api/search
    if (!res.ok) {
      console.error('[import] TMDB error', res.status, query, lang, 'key_set:', !!TMDB_KEY)
      return null
    }
    const data = await res.json()
    const results: Record<string, unknown>[] = data.results ?? []
    if (!results.length) return null
    let best = results[0]
    if (year) {
      const match = results.find(r => String(r.release_date ?? r.first_air_date ?? '').startsWith(year))
      if (match) best = match
    }
    return {
      id: String(best.id),
      title: (best.title ?? best.name) as string,
      poster: best.poster_path ? `${IMG}${best.poster_path}` : null,
      year: String(best.release_date ?? best.first_air_date ?? '').slice(0, 4),
    }
  } catch (e) {
    console.error('[import] TMDB fetch failed', query, e)
    return null
  }
}

async function findTMDB(type: 'movie' | 'tv', query: string, year?: string) {
  return (await searchTMDB(type, query, year, 'fr-FR')) ??
         (await searchTMDB(type, query, year, 'en-US'))
}

async function searchOL(query: string): Promise<{ id: string; title: string; poster: string | null; year: string } | null> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3&fields=key,title,first_publish_year,cover_i`
    )
    if (!res.ok) return null
    const data = await res.json()
    const docs: Record<string, unknown>[] = data.docs ?? []
    if (!docs.length) return null
    const item = docs[0]
    return {
      id: (item.key as string).replace('/works/', ''),
      title: item.title as string,
      poster: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-S.jpg` : null,
      year: String(item.first_publish_year ?? ''),
    }
  } catch { return null }
}

async function findItem(parsed: ParsedItem): Promise<MatchedItem | null> {
  let found: { id: string; title: string; poster: string | null; year: string } | null = null
  const title = parsed.cleanTitle
  const year  = parsed.year || undefined

  if (parsed.preferredType === 'book') {
    found = await searchOL(title)
  } else {
    const primary  = parsed.preferredType === 'series' ? 'tv'    : 'movie'
    const fallback = parsed.preferredType === 'series' ? 'movie' : 'tv'

    // Étape 1 — titre complet, fr-FR puis en-US, type préféré
    found = await findTMDB(primary, title, year)
    // Étape 2 — titre complet, fr-FR puis en-US, type alternatif
    if (!found) found = await findTMDB(fallback, title, year)

    // Étape 3 — si le titre contient ': ', extraire la partie avant et chercher comme série TV
    if (!found && title.includes(': ')) {
      const short = title.split(': ')[0].trim()
      if (short && short !== title) {
        found = await findTMDB('tv',    short, undefined)
        if (!found) found = await findTMDB('movie', short, undefined)
      }
    }
  }

  if (!found) return null
  return {
    ...parsed,
    externalId:   found.id,
    displayTitle: found.title,
    poster:       found.poster,
    year:         found.year || parsed.year,
    userRating:   parsed.importedRating,
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { titles }: { titles: ParsedItem[] } = await request.json()

  if (!titles || !Array.isArray(titles) || titles.length === 0) {
    return NextResponse.json({ matched: [], notFound: [] })
  }

  // Run all lookups in parallel (server-side, no browser cache issues)
  const results = await Promise.all(titles.map(findItem))

  const matched: MatchedItem[] = []
  const notFound: string[]     = []

  results.forEach((r, i) => {
    if (r) matched.push(r)
    else   notFound.push(titles[i].cleanTitle)
  })

  return NextResponse.json({ matched, notFound })
}
