import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Tag } from 'lucide-react'
import DeleteFavoriteButton from '@/components/profile/DeleteFavoriteButton'
import InlineRatingPicker from '@/components/profile/InlineRatingPicker'
import RatingProgress from '@/components/profile/RatingProgress'
import type { Favorite } from '@/types'

const RATING_EMOJI: Record<number, string> = {
  5: '😍', 4: '🙂', 3: '😶', 2: '😬', 1: '🤮',
}
const MEDIA_BADGE: Record<string, { label: string; color: string }> = {
  movie:  { label: 'Film',   color: 'bg-violet-900/80 text-violet-300' },
  series: { label: 'Série',  color: 'bg-blue-900/80   text-blue-300'   },
  book:   { label: 'Livre',  color: 'bg-amber-900/80  text-amber-300'  },
}

// ── Season detection helpers ────────────────────────────────────────────────

/**
 * Parse an external_id: "1399_s2" → { baseId: "1399", seasonNum: 2 }
 * Non-season IDs: "1399" → { baseId: "1399", seasonNum: -1 }
 */
function parseId(externalId: string): { baseId: string; seasonNum: number } {
  const m = externalId.match(/^(.+)_s(\d+)$/)
  if (m) return { baseId: m[1], seasonNum: parseInt(m[2]) }
  return { baseId: externalId, seasonNum: -1 }
}

/**
 * Sort favorites so that:
 * 1. Items are grouped by series (global entry first, then seasons in order)
 * 2. Groups are ordered by the best rating in the group (descending)
 */
function sortWithSeasonGrouping(favs: Favorite[]): Favorite[] {
  // Compute the max rating per base series ID
  const groupMaxRating = new Map<string, number>()
  for (const f of favs) {
    const { baseId } = parseId(f.external_id)
    const cur = groupMaxRating.get(baseId) ?? 0
    groupMaxRating.set(baseId, Math.max(cur, f.rating ?? 0))
  }

  return [...favs].sort((a, b) => {
    const pa = parseId(a.external_id)
    const pb = parseId(b.external_id)

    if (pa.baseId !== pb.baseId) {
      // Different groups: sort by group's max rating descending
      const ra = groupMaxRating.get(pa.baseId) ?? 0
      const rb = groupMaxRating.get(pb.baseId) ?? 0
      if (rb !== ra) return rb - ra
      // Tie-break alphabetically by title
      return a.title.localeCompare(b.title)
    }

    // Same series: global (-1) first, then by season number asc
    return pa.seasonNum - pb.seasonNum
  })
}

function buildGenreSections(favorites: Favorite[]): [string, Favorite[]][] {
  const rated = favorites.filter(f => f.rating !== null)
  const map = new Map<string, Favorite[]>()
  const noGenre: Favorite[] = []

  for (const fav of rated) {
    const genres = (fav.genres ?? []).map(g => g.toLowerCase().trim()).filter(Boolean)
    if (genres.length === 0) {
      noGenre.push(fav)
    } else {
      for (const genre of genres) {
        if (!map.has(genre)) map.set(genre, [])
        map.get(genre)!.push(fav)
      }
    }
  }

  for (const items of map.values()) sortWithSeasonGrouping(items).forEach((item, i) => { items[i] = item })
  sortWithSeasonGrouping(noGenre).forEach((item, i) => { noGenre[i] = item })

  const sections = [...map.entries()].sort(([, a], [, b]) => b.length - a.length)
  if (noGenre.length > 0) sections.push(['__no_genre__', noGenre])
  return sections
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Build the external link URL for a favorite.
 * Season entries ("1399_s2") link to the season page on TMDB.
 */
function getMediaUrl(mediaType: string, externalId: string): string | null {
  if (mediaType === 'series') {
    const m = externalId.match(/^(.+)_s(\d+)$/)
    if (m) return `https://www.themoviedb.org/tv/${m[1]}/season/${m[2]}`
    return `https://www.themoviedb.org/tv/${externalId}`
  }
  if (mediaType === 'movie') return `https://www.themoviedb.org/movie/${externalId}`
  if (mediaType === 'book') {
    const path = externalId.startsWith('/') ? externalId : `/works/${externalId}`
    return `https://openlibrary.org${path}`
  }
  return null
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: profile },
    { data: favorites },
    { data: settingRow },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('favorites').select('*').eq('user_id', user.id),
    supabase.from('app_settings').select('value').eq('key', 'minimum_ratings_required').single(),
  ])

  const all = favorites ?? []
  const threshold  = Number(settingRow?.value ?? 500)
  const ratedCount = all.filter(f => f.rating !== null).length

  const genreSet = new Set(
    all.flatMap(f => (f.genres ?? []).map((g: string) => g.toLowerCase().trim())).filter(Boolean)
  )

  const sections = buildGenreSections(all)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-4 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-2xl font-bold flex-shrink-0">
          {profile?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{profile?.username}</h1>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <p className="text-gray-500 text-sm mt-1">
            {ratedCount} produit{ratedCount > 1 ? 's' : ''} noté{ratedCount > 1 ? 's' : ''}
            {genreSet.size > 0 && <> · {genreSet.size} genre{genreSet.size > 1 ? 's' : ''}</>}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <RatingProgress ratedCount={ratedCount} threshold={threshold} />
      </div>

      {/* Empty state */}
      {ratedCount === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Tag className="mx-auto mb-3 text-gray-700" size={40} />
          <p className="font-medium">Aucun produit noté</p>
          <p className="text-sm mt-1">Note des films, séries ou livres pour voir ta collection par genre</p>
        </div>
      )}

      {/* Sections by genre */}
      {sections.map(([genre, items]) => {
        const isNoGenre = genre === '__no_genre__'
        const label = isNoGenre ? 'Sans genre' : capitalize(genre)

        return (
          <section key={genre} className="mb-8">
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-800">
              <h2 className="text-sm font-semibold">{label}</h2>
              <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
                {items.length}
              </span>
              <div className="ml-2 flex items-center gap-0.5 text-sm">
                {[5, 4, 3, 2, 1].map(r => {
                  const count = items.filter(f => f.rating === r).length
                  if (count === 0) return null
                  return (
                    <span key={r} className="opacity-70" title={`${count} × ${RATING_EMOJI[r]}`}>
                      {RATING_EMOJI[r]}
                      <span className="text-[10px] text-gray-500 ml-0.5">{count}</span>
                    </span>
                  )
                })}
              </div>
            </div>

            {/* List rows */}
            <div className="divide-y divide-gray-800/50">
              {items.map(fav => {
                const badge = MEDIA_BADGE[fav.media_type]
                const { seasonNum } = parseId(fav.external_id)
                const isSeason = seasonNum >= 0

                // For season rows, don't repeat the genre tag (already visible from parent)
                const primaryGenre = isSeason
                  ? undefined
                  : (fav.genres ?? []).map(g => g.toLowerCase().trim()).filter(Boolean)[0]

                return (
                  <div
                    key={`${genre}-${fav.id}`}
                    className={`flex items-center gap-3 py-2.5 group ${isSeason ? 'pl-4 border-l-2 border-gray-800' : ''}`}
                  >
                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      {(() => {
                        const url = getMediaUrl(fav.media_type, fav.external_id)
                        return url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium truncate block hover:text-violet-400 transition-colors"
                          >
                            {fav.title}
                          </a>
                        ) : (
                          <p className="text-sm font-medium truncate">{fav.title}</p>
                        )
                      })()}
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {!isSeason && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.color}`}>
                            {badge.label}
                          </span>
                        )}
                        {fav.year && (
                          <span className="text-xs text-gray-500">{fav.year}</span>
                        )}
                        {primaryGenre && (
                          <span className="text-xs text-gray-500 capitalize">· {primaryGenre}</span>
                        )}
                      </div>
                    </div>

                    {/* Inline rating picker */}
                    {fav.rating !== null && (
                      <InlineRatingPicker
                        favoriteId={fav.id}
                        initialRating={fav.rating}
                      />
                    )}

                    {/* Delete (visible on hover) */}
                    <DeleteFavoriteButton favoriteId={fav.id} />
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
