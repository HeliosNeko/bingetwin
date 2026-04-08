'use client'

import { useState, useEffect } from 'react'
import { X, Film, BookOpen, Tv, Star, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { MediaType } from '@/types'

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

const RATINGS = [
  { value: 1, label: "J'ai détesté",    emoji: '😤', color: 'hover:bg-red-900/60 hover:border-red-600',     active: 'bg-red-900/60 border-red-600 text-red-300' },
  { value: 2, label: "Je n'ai pas aimé", emoji: '😕', color: 'hover:bg-orange-900/60 hover:border-orange-600', active: 'bg-orange-900/60 border-orange-600 text-orange-300' },
  { value: 3, label: "Pas d'avis",       emoji: '😐', color: 'hover:bg-gray-700/60 hover:border-gray-500',    active: 'bg-gray-700/60 border-gray-500 text-gray-300' },
  { value: 4, label: "J'ai aimé",        emoji: '😊', color: 'hover:bg-violet-900/60 hover:border-violet-500', active: 'bg-violet-900/60 border-violet-500 text-violet-300' },
  { value: 5, label: "J'ai adoré",       emoji: '🤩', color: 'hover:bg-yellow-900/60 hover:border-yellow-500', active: 'bg-yellow-900/60 border-yellow-500 text-yellow-300' },
]

interface Props {
  item: MediaItem | null
  onClose: () => void
}

export default function MediaDrawer({ item, onClose }: Props) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reset state when item changes
  useEffect(() => {
    if (item) {
      setSelectedRating(null)
      setSaved(false)

      // Load existing rating if any
      async function loadExisting() {
        if (!item) return
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
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
      }
      loadExisting()
    }
  }, [item])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleRate(value: number) {
    if (!item) return
    setSelectedRating(value)
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('favorites').upsert({
      user_id: user.id,
      media_type: item.mediaType,
      external_id: item.id,
      title: item.title,
      poster_url: item.poster,
      year: item.year,
      rating: value,
      genres: item.genres ?? [],
    }, { onConflict: 'user_id,media_type,external_id' })

    await supabase.rpc('compute_matches', { target_user_id: user.id })

    setSaving(false)
    setSaved(true)
  }

  const MediaIcon = item?.mediaType === 'book' ? BookOpen : item?.mediaType === 'series' ? Tv : Film

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
                {item.rating != null && (
                  <div className="flex items-center gap-1 mt-2">
                    <Star size={13} className="text-yellow-400 fill-yellow-400" />
                    <span className="text-sm text-gray-300">{item.rating.toFixed(1)}</span>
                    <span className="text-xs text-gray-500 ml-1">TMDB</span>
                  </div>
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
            {item.genres && item.genres.length > 0 && (
              <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap gap-1.5">
                {item.genres.map(g => (
                  <span key={g} className="text-xs bg-gray-800 text-gray-400 rounded-full px-2.5 py-1 capitalize">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Rating section */}
            <div className="px-5 py-5">
              <p className="text-sm font-semibold text-gray-300 mb-4">
                {saved ? 'Ta note' : 'Qu\'en as-tu pensé ?'}
              </p>

              <div className="space-y-2">
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
                      <span className="text-xl w-7 text-center">{emoji}</span>
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

              {saved && !saving && (
                <p className="text-xs text-emerald-400 mt-4 text-center">
                  Ajouté à tes favoris ✓
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
