'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Film, Tv, BookOpen, Search, Star, X, RefreshCw } from 'lucide-react'
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

const tabs: { id: Tab; label: string; icon: typeof Film }[] = [
  { id: 'movie',  label: 'Films',  icon: Film },
  { id: 'series', label: 'Séries', icon: Tv },
  { id: 'book',   label: 'Livres', icon: BookOpen },
]

const TARGET   = 12   // suggestions à afficher
const MIN_KEEP = 8    // seuil bas → compléter automatiquement
const MAX_PAGE = 10   // pages TMDB disponibles (1-10)

export default function DiscoverPage() {
  const [activeTab, setActiveTab]       = useState<Tab>('movie')
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<MediaItem[]>([])
  const [loading, setLoading]           = useState(false)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [suggestions, setSuggestions]   = useState<MediaItem[]>([])
  const [suggLoading, setSuggLoading]   = useState(false)
  const [suggVisible, setSuggVisible]   = useState(true)

  // Favoris déjà notés — chargés une fois, jamais proposés
  const ratedIds  = useRef<Set<string>>(new Set())
  // Suggestions déjà proposées dans cette session — pour éviter les répétitions
  const shownIds  = useRef<Set<string>>(new Set())
  // Page courante (pour garantir une page différente au prochain refresh)
  const currentPage = useRef(1)

  // ── Charger les favoris notés au montage ────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('favorites')
        .select('external_id')
        .eq('user_id', user.id)
        .not('rating', 'is', null)
        .then(({ data }) => {
          if (data) ratedIds.current = new Set(data.map(f => String(f.external_id)))
        })
    })
  }, [])

  // ── Cœur de la logique : collecter TARGET items sans répétition ─────────
  const loadSuggestions = useCallback(async (startPage: number) => {
    setSuggLoading(true)
    setSuggVisible(false)

    // Tente de collecter TARGET items non notés / non déjà proposés.
    // useShownFilter=false → on accepte des doublons de session (fallback).
    async function tryCollect(useShownFilter: boolean): Promise<MediaItem[]> {
      const collected: MediaItem[] = []
      const seenInBatch = new Set<string>()  // déduplique entre pages de la même requête
      let p = startPage

      for (let attempt = 0; attempt < MAX_PAGE; attempt++) {
        let res: Response
        try { res = await fetch(`/api/suggestions?page=${p}`) }
        catch { break }
        if (!res.ok) break
        const { items }: { items: MediaItem[] } = await res.json()
        if (!items?.length) break

        for (const item of items) {
          const key = String(item.id)
          if (seenInBatch.has(key))                         continue  // doublon dans le batch
          if (ratedIds.current.has(key))                    continue  // déjà noté
          if (useShownFilter && shownIds.current.has(key))  continue  // déjà proposé
          seenInBatch.add(key)
          collected.push(item)
          if (collected.length >= TARGET) return collected
        }

        if (collected.length >= MIN_KEEP) break  // assez, on s'arrête

        // Pas assez → page suivante en bouclant dans 1-MAX_PAGE
        p = (p % MAX_PAGE) + 1
      }

      return collected
    }

    try {
      let items = await tryCollect(true)

      // Épuisé les pages sans remplir MIN_KEEP → réinitialise la liste "déjà vu"
      if (items.length < MIN_KEEP) {
        shownIds.current = new Set()
        items = await tryCollect(false)
      }

      const final = items.slice(0, TARGET)
      setSuggestions(final)
      // Mémoriser ce qu'on vient de proposer
      for (const item of final) shownIds.current.add(String(item.id))
    } catch {
      // réseau indisponible → garde les suggestions précédentes
    } finally {
      setSuggLoading(false)
      setTimeout(() => setSuggVisible(true), 100)  // délai pour que le fade-out soit visible
    }
  }, [])

  // Chargement initial page 1
  useEffect(() => {
    currentPage.current = 1
    loadSuggestions(1)
  }, [loadSuggestions])

  // ── "Propose-moi autre chose" ────────────────────────────────────────────
  function handleRefresh() {
    let next = currentPage.current
    while (next === currentPage.current) {
      next = Math.floor(Math.random() * MAX_PAGE) + 1
    }
    currentPage.current = next
    loadSuggestions(next)
  }

  const search = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setResults([])
    try {
      const res = await fetch(`/api/search?type=${activeTab}&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      console.error('Search failed')
    } finally {
      setLoading(false)
    }
  }, [query, activeTab])

  const showSuggestions = !query && results.length === 0 && (suggestions.length > 0 || suggLoading)

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

      {/* ── Mosaïque 3×4 — tient dans l'écran sans scroller ───────────── */}
      {showSuggestions && (
        <div>
          <div className="flex items-center justify-between mb-3">
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

          {/* Grille 3 colonnes × 4 lignes avec vignettes compactes */}
          <div
            className="grid grid-cols-3 gap-2 transition-opacity duration-300"
            style={{ opacity: suggVisible ? 1 : 0 }}
          >
            {suggestions.map(item => (
              <button
                key={`${item.mediaType}-${item.id}`}
                onClick={() => setSelectedItem(item)}
                className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden hover:border-violet-500/60 transition-colors text-left w-full focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {/* Hauteur fixe de l'affiche pour que 4 lignes tiennent à l'écran */}
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

      {/* ── Résultats de recherche ──────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {results.map(item => (
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
                <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                <p className="text-xs text-gray-500 mt-1">{item.year}</p>
                {item.rating != null && item.rating > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={12} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-gray-400">{item.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </button>
          ))}
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
