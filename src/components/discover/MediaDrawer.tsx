'use client'

import { useState, useEffect } from 'react'
import { X, Film, BookOpen, Tv, Star, Check, Loader2, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { MediaType } from '@/types'
import type { TvSeason } from '@/app/api/tv-seasons/route'

interface MediaItem {
  id: string
  title: string
  poster: string | null
  year: string
  overview?: string
  rating?: number
  genres: string[]
  mediaType: MediaType
}

interface Details {
  director?: string
  creator?: string
  country?: string
  runtime?: number
  seasons?: number
}

// Ordered: adoré → détesté
const RATINGS = [
  { value: 5, label: "J'ai adoré",        emoji: '😍', color: 'hover:bg-yellow-900/60 hover:border-yellow-500', active: 'bg-yellow-900/60 border-yellow-500 text-yellow-300' },
  { value: 4, label: "J'ai aimé",         emoji: '🙂', color: 'hover:bg-violet-900/60 hover:border-violet-500', active: 'bg-violet-900/60 border-violet-500 text-violet-300' },
  { value: 3, label: "Pas d'avis",        emoji: '😶', color: 'hover:bg-gray-700/60 hover:border-gray-500',     active: 'bg-gray-700/60 border-gray-500 text-gray-300' },
  { value: 2, label: "Je n'ai pas aimé",  emoji: '😬', color: 'hover:bg-orange-900/60 hover:border-orange-600', active: 'bg-orange-900/60 border-orange-600 text-orange-300' },
  { value: 1, label: "J'ai détesté",      emoji: '🤮', color: 'hover:bg-red-900/60 hover:border-red-600',       active: 'bg-red-900/60 border-red-600 text-red-300' },
]

const SEASON_EMOJIS: Record<number, string> = { 5: '😍', 4: '🙂', 3: '😶', 2: '😬', 1: '🤮' }

interface Props {
  item: MediaItem | null
  onClose: () => void
}

function tmdbUrl(mediaType: MediaType, id: string) {
  if (mediaType === 'movie')  return `https://www.themoviedb.org/movie/${id}`
  if (mediaType === 'series') return `https://www.themoviedb.org/tv/${id}`
  return `https://openlibrary.org/works/${id}`
}

export default function MediaDrawer({ item, onClose }: Props) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [resolvedGenres, setResolvedGenres] = useState<string[]>([])
  const [details, setDetails]               = useState<Details>({})

  // Season state
  const [seasons, setSeasons]               = useState<TvSeason[]>([])
  const [seasonRatings, setSeasonRatings]   = useState<Record<number, number>>({})
  const [savingSeasonNum, setSavingSeasonNum] = useState<number | null>(null)

  useEffect(() => {
    if (item) {
      setSelectedRating(null)
      setSaved(false)
      setResolvedGenres(item.genres ?? [])
      setDetails({})
      setSeasons([])
      setSeasonRatings({})

      async function loadExisting() {
        if (!item) return
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Load global rating
        const { data } = await supabase
          .from('favorites')
          .select('rating')
          .eq('user_id', user.id)
          .eq('media_type', item.mediaType)
          .eq('external_id', item.id)
          .single()
        if (data?.rating) {
          setSelectedRating(data.rating)
          setSaved(true)
        }

        // Fetch details + genres
        const needsFetch = item.mediaType !== 'book' || !item.genres || item.genres.length === 0
        if (needsFetch) {
          try {
            const res = await fetch(`/api/genres?type=${item.mediaType}&id=${item.id}`)
            if (res.ok) {
              const json = await res.json()
              if (json.genres?.length > 0) setResolvedGenres(json.genres)
              setDetails({
                director: json.director,
                creator:  json.creator,
                country:  json.country,
                runtime:  json.runtime,
                seasons:  json.seasons,
              })
            }
          } catch { /* ignore */ }
        }

        // For series: load seasons list + existing season ratings
        if (item.mediaType === 'series') {
          try {
            const [seasonsRes, ratingsRes] = await Promise.all([
              fetch(`/api/tv-seasons?id=${item.id}`),
              supabase
                .from('favorites')
                .select('external_id, rating')
                .eq('user_id', user.id)
                .eq('media_type', 'series')
                .like('external_id', `${item.id}_s%`),
            ])

            if (seasonsRes.ok) {
              const { seasons: seasonList } = await seasonsRes.json()
              setSeasons(seasonList ?? [])
            }

            const ratingsMap: Record<number, number> = {}
            for (const row of ratingsRes.data ?? []) {
              const match = String(row.external_id).match(/_s(\d+)$/)
              if (match && row.rating != null) {
                ratingsMap[parseInt(match[1])] = row.rating
              }
            }
            setSeasonRatings(ratingsMap)
          } catch { /* ignore */ }
        }
      }

      loadExisting()
    }
  }, [item])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // ── Global series / movie / book rating ─────────────────────────────────
  async function handleRate(value: number) {
    if (!item) return
    setSelectedRating(value)
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('favorites').upsert({
      user_id:     user.id,
      media_type:  item.mediaType,
      external_id: item.id,
      title:       item.title,
      poster_url:  item.poster,
      year:        item.year,
      rating:      value,
      genres:      resolvedGenres,
    }, { onConflict: 'user_id,media_type,external_id' })

    await supabase.rpc('compute_matches', { target_user_id: user.id })

    setSaving(false)
    setSaved(true)
  }

  async function handleClearRating() {
    if (!item) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('media_type', item.mediaType)
      .eq('external_id', item.id)

    setSelectedRating(null)
    setSaved(false)
    setSaving(false)
  }

  // ── Season rating ────────────────────────────────────────────────────────
  async function handleRateSeason(season: TvSeason, value: number) {
    if (!item) return
    setSavingSeasonNum(season.season_number)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingSeasonNum(null); return }

    const seasonTitle = `${item.title} — ${season.name}`
    const externalId  = `${item.id}_s${season.season_number}`

    await supabase.from('favorites').upsert({
      user_id:     user.id,
      media_type:  'series',
      external_id: externalId,
      title:       seasonTitle,
      poster_url:  item.poster,   // use series poster (season poster not stored separately)
      year:        season.year,
      rating:      value,
      genres:      resolvedGenres,
    }, { onConflict: 'user_id,media_type,external_id' })

    await supabase.rpc('compute_matches', { target_user_id: user.id })

    setSeasonRatings(prev => ({ ...prev, [season.season_number]: value }))
    setSavingSeasonNum(null)
  }

  async function handleClearSeasonRating(seasonNumber: number) {
    if (!item) return
    setSavingSeasonNum(seasonNumber)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingSeasonNum(null); return }

    await supabase.from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('media_type', 'series')
      .eq('external_id', `${item.id}_s${seasonNumber}`)

    setSeasonRatings(prev => {
      const next = { ...prev }
      delete next[seasonNumber]
      return next
    })
    setSavingSeasonNum(null)
  }

  const MediaIcon = item?.mediaType === 'book' ? BookOpen : item?.mediaType === 'series' ? Tv : Film

  function buildMeta(): string[] {
    const parts: string[] = []
    if (details.director) parts.push(`Réalisé par ${details.director}`)
    if (details.creator)  parts.push(`Créé par ${details.creator}`)
    if (details.country)  parts.push(details.country)
    if (details.runtime)  parts.push(`${details.runtime} min`)
    if (details.seasons)  parts.push(`${details.seasons} saison${details.seasons > 1 ? 's' : ''}`)
    return parts
  }
  const metaParts = buildMeta()

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 z-40 transition-opacity duration-300',
          item ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-full sm:w-[420px] bg-gray-900 border-l border-gray-800 z-50',
          'flex flex-col transition-transform duration-300 ease-out',
          item ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <span className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <MediaIcon size={15} />
            {item?.mediaType === 'movie' ? 'Film' : item?.mediaType === 'series' ? 'Série' : 'Livre'}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        {item && (
          <div className="flex-1 overflow-y-auto">
            {/* Poster + title */}
            <div className="flex gap-4 p-5 border-b border-gray-800">
              <div className="w-24 flex-shrink-0 aspect-[2/3] bg-gray-800 rounded-lg overflow-hidden">
                {item.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    <MediaIcon size={28} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-lg leading-snug">{item.title}</h2>
                {item.year && <p className="text-gray-400 text-sm mt-1">{item.year}</p>}

                {metaParts.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {metaParts.map((part, i) => (
                      <p key={i} className="text-xs text-gray-500">{part}</p>
                    ))}
                  </div>
                )}

                {item.rating != null && (
                  <div className="flex items-center gap-1 mt-2">
                    <Star size={13} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-sm text-gray-300">{item.rating.toFixed(1)}</span>
                    <span className="text-xs text-gray-500 ml-1">TMDB</span>
                  </div>
                )}

                {item.mediaType !== 'book' ? (
                  <a
                    href={tmdbUrl(item.mediaType, item.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-gray-500 hover:text-violet-400 transition-colors"
                  >
                    <ExternalLink size={11} />
                    Voir sur TMDB
                  </a>
                ) : (
                  <a
                    href={tmdbUrl(item.mediaType, item.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-gray-500 hover:text-amber-400 transition-colors"
                  >
                    <ExternalLink size={11} />
                    Voir sur Open Library
                  </a>
                )}
              </div>
            </div>

            {/* Overview */}
            {item.overview && (
              <div className="px-5 py-4 border-b border-gray-800">
                <p className="text-sm text-gray-400 leading-relaxed line-clamp-4">{item.overview}</p>
              </div>
            )}

            {/* Genres */}
            {resolvedGenres.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap gap-1.5">
                {resolvedGenres.map(g => (
                  <span key={g} className="text-xs bg-gray-800 text-gray-400 rounded-full px-2.5 py-1 capitalize">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* ── Season ratings (series only) ──────────────────────────── */}
            {item.mediaType === 'series' && seasons.length > 0 && (
              <div className="px-5 py-5 border-b border-gray-800">
                <p className="text-sm font-semibold text-gray-300 mb-4">Notes par saison</p>
                <div className="space-y-3">
                  {seasons.map(season => {
                    const currentRating = seasonRatings[season.season_number]
                    const isSavingSeason = savingSeasonNum === season.season_number
                    return (
                      <div key={season.season_number} className="flex items-center gap-3">
                        {/* Season info */}
                        <div className="w-28 flex-shrink-0">
                          <p className="text-xs font-medium text-gray-300 truncate">{season.name}</p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            {[season.year, season.episode_count ? `${season.episode_count} ép.` : ''].filter(Boolean).join(' · ')}
                          </p>
                        </div>

                        {/* Emoji picker */}
                        <div className="flex items-center gap-1.5 flex-1">
                          {[1, 2, 3, 4, 5].map(v => (
                            <button
                              key={v}
                              onClick={() => handleRateSeason(season, v)}
                              disabled={isSavingSeason}
                              className={cn(
                                'text-xl leading-none transition-all hover:scale-110 disabled:cursor-wait',
                                currentRating === v
                                  ? 'opacity-100 scale-110'
                                  : 'opacity-30 hover:opacity-80'
                              )}
                              title={RATINGS.find(r => r.value === v)?.label}
                            >
                              {SEASON_EMOJIS[v]}
                            </button>
                          ))}

                          {/* Saving indicator or clear button */}
                          {isSavingSeason && (
                            <Loader2 size={13} className="animate-spin text-gray-500 ml-1" />
                          )}
                          {currentRating != null && !isSavingSeason && (
                            <button
                              onClick={() => handleClearSeasonRating(season.season_number)}
                              className="ml-1 text-gray-600 hover:text-red-400 transition-colors"
                              title="Effacer la note de cette saison"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* Selected rating badge */}
                        {currentRating != null && !isSavingSeason && (
                          <Check size={13} className="text-violet-400 flex-shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Global rating ─────────────────────────────────────────── */}
            <div className="px-5 py-5">
              <p className="text-sm font-semibold text-gray-300 mb-4">
                {item.mediaType === 'series'
                  ? saved ? 'Ta note globale' : 'Note globale de la série'
                  : saved ? 'Ta note' : "Qu'en as-tu pensé ?"}
              </p>

              <div className="space-y-3">
                {RATINGS.map(({ value, label, emoji, color, active }) => {
                  const isSelected = selectedRating === value
                  return (
                    <button
                      key={value}
                      onClick={() => handleRate(value)}
                      disabled={saving}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
                        'border-gray-700 text-gray-400 disabled:cursor-wait',
                        isSelected ? active : color
                      )}
                    >
                      <span className="w-10 text-center leading-none" style={{ fontSize: '32px' }}>{emoji}</span>
                      <span className="text-sm font-medium flex-1">{label}</span>
                      {isSelected && (
                        saving
                          ? <Loader2 size={16} className="animate-spin text-current" />
                          : <Check size={16} className="text-current" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Effacer la note globale */}
              {saved && !saving && (
                <button
                  onClick={handleClearRating}
                  className="mt-4 w-full text-xs text-gray-600 hover:text-red-400 transition-colors text-center py-2 border border-transparent hover:border-red-900/40 rounded-lg"
                >
                  Effacer ma note
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
