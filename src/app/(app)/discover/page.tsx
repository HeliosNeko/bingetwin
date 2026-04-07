'use client'

import { useState, useCallback } from 'react'
import { Film, Tv, BookOpen, Search, Star, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getPosterUrl, getCoverUrl } from '@/lib/discover-helpers'
import type { MediaType } from '@/types'

type Tab = MediaType

interface MediaItem {
  id: string
  title: string
  poster: string | null
  year: string
  overview?: string
  rating?: number
  mediaType: MediaType
}

const tabs: { id: Tab; label: string; icon: typeof Film }[] = [
  { id: 'movie', label: 'Films', icon: Film },
  { id: 'series', label: 'Séries', icon: Tv },
  { id: 'book', label: 'Livres', icon: BookOpen },
]

export default function DiscoverPage() {
  const [activeTab, setActiveTab] = useState<Tab>('movie')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState<Set<string>>(new Set())

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

  async function addToFavorites(item: MediaItem) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('favorites').upsert({
      user_id: user.id,
      media_type: item.mediaType,
      external_id: item.id,
      title: item.title,
      poster_url: item.poster,
      year: item.year,
    })

    if (!error) {
      setSaved(prev => new Set([...prev, item.id]))
      // Recalculate matches in background
      await supabase.rpc('compute_matches', { target_user_id: user.id })
    }
  }

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

      {/* Search */}
      <div className="flex gap-3 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder={`Rechercher un ${activeTab === 'movie' ? 'film' : activeTab === 'series' ? 'série' : 'livre'}...`}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>
        <button
          onClick={search}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-lg px-5 font-medium transition-colors"
        >
          {loading ? 'Recherche...' : 'Chercher'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {results.map(item => (
            <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden card-hover group">
              <div className="aspect-[2/3] bg-gray-800 relative">
                {item.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600">
                    {activeTab === 'book' ? <BookOpen size={32} /> : <Film size={32} />}
                  </div>
                )}
                <button
                  onClick={() => addToFavorites(item)}
                  className={cn(
                    'absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                    saved.has(item.id)
                      ? 'bg-emerald-600'
                      : 'bg-gray-900/80 hover:bg-violet-600 opacity-0 group-hover:opacity-100'
                  )}
                >
                  {saved.has(item.id) ? <Check size={14} /> : <Plus size={14} />}
                </button>
              </div>
              <div className="p-3">
                <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                <p className="text-xs text-gray-500 mt-1">{item.year}</p>
                {item.rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={12} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-xs text-gray-400">{item.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !loading && query && (
        <div className="text-center py-16 text-gray-500">
          Aucun résultat pour &quot;{query}&quot;
        </div>
      )}
    </div>
  )
}
