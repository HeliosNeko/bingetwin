'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Film, Tv, BookOpen, Search, Star, X, RefreshCw, SlidersHorizontal, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { MediaType } from '@/types'
import MediaDrawer from '@/components/discover/MediaDrawer'

type Tab = MediaType

export interface MediaItem {
  id: string
  title: string
  poster: string | null
  year: string
  overview?: string
  rating?: number
  genres: string[]
  mediaType: MediaType
}

interface Prefs {
  genres:          number[]
  periods:         string[]
  language_groups: string[]
}

const RATING_EMOJI: Record<number, string> = {
  5: '😍', 4: '🙂', 3: '😶', 2: '😬', 1: '🤮',
}

const tabs: { id: Tab; label: string; icon: typeof Film }[] = [
  { id: 'movie',  label: 'Films',  icon: Film },
  { id: 'series', label: 'Séries', icon: Tv },
  { id: 'book',   label: 'Livres', icon: BookOpen },
]

const TARGET   = 12   // suggestions à afficher
const MAX_PAGE = 10   // pages TMDB disponibles (1-10)

export default function DiscoverPage() {
  const [activeTab, setActiveTab]       = useState<Tab>('movie')
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<MediaItem[]>([])
  const [loading, setLoading]           = useState(false)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [suggestions, setSuggestions]   = useState<MediaItem[]>([])
  const [suggLoading, setSuggLoading]   = useState(false)
  const [suggError, setSuggError]       = useState<string | null>(null)
  const [prefsLoaded, setPrefsLoaded]   = useState(false)

  // Map external_id → rating (pour afficher l'emoji sur les résultats de recherche)
  const ratingMap   = useRef<Map<string, number>>(new Map())
  // Set des ids déjà notés (pour filtrer les suggestions)
  const ratedIds    = useRef<Set<string>>(new Set())
  // Suggestions déjà proposées dans cette session (reset à chaque refresh manuel)
  const shownIds    = useRef<Set<string>>(new Set())
  const currentPage = useRef(1)
  const prefsRef    = useRef<Prefs>({ genres: [], periods: [], language_groups: [] })

  // ── Charger favoris + préférences au montage ─────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('favorites')
        .select('external_id, rating')
        .eq('user_id', user.id)
        .not('rating', 'is', null)
        .limit(5000)
        .then(({ data }) => {
          if (!data) return
          const newMap = new Map<string, number>()
          const newSet = new Set<string>()
          for (const f of data) {
            const key = String(f.external_id)
            if (f.rating != null) newMap.set(key, f.rating)
            newSet.add(key)
          }
          ratingMap.current = newMap
          ratedIds.current  = newSet
        })
    })

    fetch('/api/suggestion-preferences')
      .then(r => r.ok ? r.json() : null)
      .then((data: Prefs | null) => {
        if (data) prefsRef.current = data
        console.log('[prefs] Préférences chargées :', data ?? 'défauts')
      })
      .catch(err => console.error('[prefs] Erreur :', err))
      .finally(() => setPrefsLoaded(true))
  }, [])

  // ── Construit l'URL TMDB avec préférences ────────────────────────────────
  function buildApiUrl(page: number): string {
    const p = new URLSearchParams({ page: String(page) })
    const prefs = prefsRef.current
    if (prefs.genres.length)          p.set('genres',  prefs.genres.join(','))
    if (prefs.periods.length)         p.set('periods', prefs.periods.join(','))
    if (prefs.language_groups.length) p.set('langs',   prefs.language_groups.join(','))
    return `/api/suggestions?${p.toString()}`
  }

  // ── Cœur de la logique : collecter TARGET items ──────────────────────────
  const loadSuggestions = useCallback(async (startPage: number, resetShown: boolean) => {
    setSuggLoading(true)
    setSuggError(null)

    if (resetShown) shownIds.current = new Set()

    const activePrefs = prefsRef.current
    console.log('[suggestions] ── Début chargement ──────────────────────')
    console.log('[suggestions] Préférences actives :', JSON.stringify(activePrefs))
    console.log('[suggestions] ratedIds.size =', ratedIds.current.size, '| shownIds.size =', shownIds.current.size)

    // Construit une URL TMDB brute, sans préférences (fallback garanti)
    function buildDefaultUrl(page: number) {
      return `/api/suggestions?page=${page}`
    }

    async function tryCollect(useShownFilter: boolean, noPrefs = false): Promise<MediaItem[]> {
      const collected: MediaItem[] = []
      const seenInBatch = new Set<string>()
      let p = startPage

      for (let attempt = 0; attempt < MAX_PAGE; attempt++) {
        const url = noPrefs ? buildDefaultUrl(p) : buildApiUrl(p)
        console.log(`[suggestions] Appel page ${p} (attempt ${attempt + 1}) :`, url)

        let res: Response
        try {
          res = await fetch(url)
        } catch (err) {
          console.error('[suggestions] Erreur réseau page', p, err)
          break
        }
        if (!res.ok) {
          console.error('[suggestions] HTTP', res.status, 'page', p)
          break
        }

        let parsed: { items?: MediaItem[] }
        try {
          parsed = await res.json()
        } catch (err) {
          console.error('[suggestions] JSON invalide page', p, err)
          break
        }

        const items = parsed.items ?? []
        const nRated = items.filter((i: MediaItem) => ratedIds.current.has(String(i.id))).length
        const nShown = items.filter((i: MediaItem) => shownIds.current.has(String(i.id))).length
        const before = collected.length

        for (const item of items) {
          const key = String(item.id)
          if (seenInBatch.has(key))                         continue
          if (ratedIds.current.has(key))                    continue
          if (useShownFilter && shownIds.current.has(key))  continue
          seenInBatch.add(key)
          collected.push(item)
          if (collected.length >= TARGET) {
            console.log(`[suggestions] ✓ TARGET atteint page ${p} : ${collected.length} items`)
            return collected
          }
        }

        console.log(
          `[suggestions] Page ${p} : ${items.length} reçus`,
          `| rated=${nRated} shown=${nShown}`,
          `| retenus ce tour=${collected.length - before}`,
          `| total collecté=${collected.length}`
        )

        if (!items.length) break
        p = (p % MAX_PAGE) + 1
      }

      return collected
    }

    try {
      // 1er essai : avec filtre shownIds
      let items = await tryCollect(true)

      // 2e essai : sans filtre shownIds
      if (items.length < TARGET) {
        console.log('[suggestions] < TARGET — reset shownIds, 2e tentative sans filtre shownIds')
        shownIds.current = new Set()
        items = await tryCollect(false)
      }

      // 3e essai (fallback) : sans aucune préférence, appel TMDB par défaut
      if (items.length < TARGET) {
        console.warn('[suggestions] Toujours < TARGET — fallback sans préférences')
        const fallback = await tryCollect(false, true)
        if (fallback.length > items.length) items = fallback
      }

      const final = items.slice(0, TARGET)
      console.log(`[suggestions] ── Résultat final : ${final.length} items ─────────────`)

      if (final.length > 0) {
        setSuggestions(final)
        for (const item of final) shownIds.current.add(String(item.id))
      } else {
        console.error('[suggestions] Aucun item après 3 tentatives — vérifier TMDB_KEY et préférences')
        setSuggError('Aucune suggestion disponible. Modifie tes préférences ou réessaie.')
      }
    } catch (err) {
      console.error('[suggestions] Erreur inattendue :', err)
      setSuggError('Impossible de charger les suggestions. Réessaie.')
    } finally {
      setSuggLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chargement initial après que les prefs soient disponibles
  useEffect(() => {
    if (!prefsLoaded) return
    currentPage.current = 1
    loadSuggestions(1, false)
  }, [prefsLoaded, loadSuggestions])

  // ── Refresh manuel : nouvelle page + reset shownIds ──────────────────────
  function handleRefresh() {
    let next = currentPage.current
    let attempts = 0
    while (next === currentPage.current && attempts < 20) {
      next = Math.floor(Math.random() * MAX_PAGE) + 1
      attempts++
    }
    currentPage.current = next
    loadSuggestions(next, true)   // ← resetShown=true
  }

  const search = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    try {
      const res = await fetch(`/api/search?type=${activeTab}&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch (err) {
      console.error('[search] Erreur :', err)
    } finally {
      setLoading(false)
    }
  }, [query, activeTab])

  const showSuggestions = !query && results.length === 0 && prefsLoaded

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Découvrir</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setResults([]) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === id
                ? 'bg-violet-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder={`Rechercher ${activeTab === 'movie' ? 'un film' : activeTab === 'series' ? 'une série' : 'un livre'}...`}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-10 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              aria-label="Effacer"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={search}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-lg px-5 font-medium transition-colors"
        >
          {loading ? 'Recherche...' : 'Chercher'}
        </button>
      </div>

      {/* ── Mosaïque de suggestions ────────────────────────────────────── */}
      {showSuggestions && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-400">Voici quelques idées :</p>
            <button
              onClick={handleRefresh}
              disabled={suggLoading}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-400 disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={13} className={suggLoading ? 'animate-spin' : ''} />
              Propose-moi autre chose
            </button>
          </div>

          <div className="flex justify-end mb-3">
            <Link
              href="/discover/settings"
              className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-violet-400 transition-colors"
            >
              <SlidersHorizontal size={11} />
              Configurer mes suggestions
            </Link>
          </div>

          {/* Loader avant le premier lot */}
          {suggLoading && suggestions.length === 0 && (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-violet-400" size={28} />
            </div>
          )}

          {/* Message d'erreur */}
          {suggError && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">{suggError}</p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-xs text-violet-400 hover:text-violet-300 underline"
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Grille — reste visible pendant le refresh, overlay spinner par-dessus */}
          {suggestions.length > 0 && (
            <div className="relative">
              {suggLoading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-gray-950/50 backdrop-blur-[1px]">
                  <Loader2 className="animate-spin text-violet-400" size={28} />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {suggestions.map(item => (
                  <button
                    key={`${item.mediaType}-${item.id}`}
                    onClick={() => !suggLoading && setSelectedItem(item)}
                    className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-violet-500/60 transition-colors text-left w-full focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <div className="h-24 bg-gray-800 relative overflow-hidden">
                      {item.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.poster}
                          alt={item.title}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          {item.mediaType === 'book' ? <BookOpen size={20} /> : <Film size={20} />}
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-[11px] font-medium line-clamp-1 leading-tight">{item.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{item.year}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Résultats de recherche ──────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {results.map(item => {
            const userRating = ratingMap.current.get(String(item.id))
            return (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-hover text-left w-full focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <div className="aspect-[2/3] bg-gray-800 relative">
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      {activeTab === 'book' ? <BookOpen size={32} /> : <Film size={32} />}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  {/* Ligne 1 : titre + emoji de note à droite */}
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-sm font-medium line-clamp-2 flex-1">{item.title}</p>
                    {userRating != null && (
                      <span className="text-base leading-none flex-shrink-0 mt-0.5" title={`Ta note : ${RATING_EMOJI[userRating]}`}>
                        {RATING_EMOJI[userRating]}
                      </span>
                    )}
                  </div>
                  {/* Ligne 2 : année · type · note TMDB */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {item.year && <span className="text-xs text-gray-500">{item.year}</span>}
                    <span className="text-xs text-gray-600">·</span>
                    <span className="text-xs text-gray-500">
                      {item.mediaType === 'movie' ? 'Film' : item.mediaType === 'series' ? 'Série' : 'Livre'}
                    </span>
                    {item.rating != null && item.rating > 0 && (
                      <>
                        <span className="text-xs text-gray-600">·</span>
                        <Star size={10} className="text-yellow-400 fill-yellow-400" />
                        <span className="text-xs text-gray-400">{item.rating.toFixed(1)}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {results.length === 0 && !loading && query && (
        <div className="text-center py-16 text-gray-500">
          Aucun résultat pour &quot;{query}&quot;
        </div>
      )}

      <MediaDrawer item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  )
}
