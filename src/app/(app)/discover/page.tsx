'use client'

import { useState, useCallback, useEffect } from 'react'
import { Film, Tv, BookOpen, Search, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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

export default function DiscoverPage() {
  const [activeTab, setActiveTab]     = useState<Tab>('movie')
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<MediaItem[]>([])
  const [loading, setLoading]         = useState(false)
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const [suggestions, setSuggestions] = useState<MediaItem[]>([])

  // Chargement des suggestions au montage — une seule requête, cache 24h côté serveur
  useEffect(() => {
    fetch('/api/suggestions')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items }) => setSuggestions(items ?? []))
      .catch(() => {})
  }, [])

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

  const showSuggestions = !query && results.length === 0 && suggestions.length > 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Découvrir</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
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
      <div className="flex gap-3 mb-8">
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

      {/* ── Mosaïque de suggestions (query vide) ───────────────────────── */}
      {showSuggestions && (
        <div>
          <p className="text-sm text-gray-400 mb-4">Voici quelques idées :</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {suggestions.map(item => (
              <button
                key={`${item.mediaType}-${item.id}`}
                onClick={() => setSelectedItem(item)}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-violet-500/60 transition-colors text-left w-full focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <div className="aspect-[2/3] bg-gray-800 relative">
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      {item.mediaType === 'book' ? <BookOpen size={24} /> : <Film size={24} />}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium line-clamp-2 leading-tight">{item.title}</p>
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
